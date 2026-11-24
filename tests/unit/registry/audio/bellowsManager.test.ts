import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  configureVoice,
  queueNote,
  setMonoGate,
  setPolyGate,
  getVoiceError,
  registerKernelClient,
  releaseKernelIfIdle,
  RETIRE_RELEASE_SECONDS,
  PARAM_RAMP_SECONDS,
  __setKernelForTest,
  __resetBellowsForTest,
  __disposeAllForTest,
  __gcForTest,
} from '@/registry/audio/bellows-instrument/bellowsManager'
import type { VoiceConfig } from '@/registry/audio/bellows-instrument/engineParams'

// The real kernel needs an AudioWorklet (no happy-dom). These fakes let us drive the
// manager's apply/diff/gate/swap logic — the part with the historically subtle bugs —
// without booting anything. (Boot-race behaviour lives in bellowsBoot.test.ts.)
function makeInstrument() {
  return {
    note: vi.fn(),
    on: vi.fn((n: number) => 1000 + n), // deterministic held id per note
    off: vi.fn(),
    param: vi.fn(),
    rampParam: vi.fn(),
    fx: vi.fn(),
    fxParam: vi.fn(),
    send: vi.fn(),
    gain: vi.fn(),
    pan: vi.fn(),
    allOff: vi.fn(),
    dispose: vi.fn(),
  }
}
type FakeInstrument = ReturnType<typeof makeInstrument>

function makeKernel() {
  const created: { engine: string; params: Record<string, number>; inst: FakeInstrument }[] = []
  const bus = { id: 1 }
  const b = {
    voice: vi.fn((engine: string, params: Record<string, number> = {}) => {
      const inst = makeInstrument()
      created.push({ engine, params, inst })
      return inst
    }),
    bus: vi.fn(() => bus),
    dispose: vi.fn(),
  }
  return { b, created, bus }
}

const PRESETS: Record<string, unknown> = {
  'acid-bass': {
    id: 'acid-bass', engineId: 'va', params: { cutoff: 500, resonance: 0.7 },
    fx: [{ effectId: 'saturator', params: { drive: 0.5 } }],
  },
  'analog-lead': { id: 'analog-lead', engineId: 'va', params: { detune: 12 }, fx: [] },
  'double-bass': { id: 'double-bass', engineId: 'string', params: { damp: 0.5 }, gain: 0.66 },
}
const mod = {
  getPreset: vi.fn((id: string) => {
    if (!PRESETS[id]) throw new Error('unknown preset')
    return PRESETS[id]
  }),
  listEngines: () => [
    { id: 'fm', params: [{ name: 'ratio2', default: 1 }, { name: 'algorithm', default: 1 }] },
    { id: 'va', params: [{ name: 'cutoff', default: 9000 }] },
  ],
}

const cfg = (over: Partial<VoiceConfig> = {}): VoiceConfig => ({
  preset: '',
  engine: 'va',
  params: {},
  insertFx: null,
  fxParams: {},
  send: 0,
  gain: 0.8,
  pan: 0,
  ...over,
})

function booted() {
  const k = makeKernel()
  __setKernelForTest(k.b, mod)
  return k
}

beforeEach(() => {
  __resetBellowsForTest()
  mod.getPreset.mockClear()
})

describe('bellowsManager — channel allocation', () => {
  it('creates the channel on its engine WITH its params, then a steady frame is a no-op', () => {
    const { b, created } = booted()
    configureVoice('n1', cfg({ params: { cutoff: 800, resonance: 0.4 }, gain: 0.5, pan: -0.2 }))
    expect(b.voice).toHaveBeenCalledWith('va', { cutoff: 800, resonance: 0.4 })
    const inst = created[0].inst
    expect(inst.gain).toHaveBeenCalledWith(0.5)
    expect(inst.pan).toHaveBeenCalledWith(-0.2)

    configureVoice('n1', cfg({ params: { cutoff: 800, resonance: 0.4 }, gain: 0.5, pan: -0.2 }))
    expect(b.voice).toHaveBeenCalledTimes(1)
    expect(inst.param).not.toHaveBeenCalled()
    expect(inst.rampParam).not.toHaveBeenCalled()
    expect(inst.gain).toHaveBeenCalledTimes(1)
  })

  it('glides a changed continuous param (rampParam) and steps a mode-index param', () => {
    const { created } = booted()
    configureVoice('n2', cfg({ params: { cutoff: 800, shape: 0 } }))
    const inst = created[0].inst
    configureVoice('n2', cfg({ params: { cutoff: 900, shape: 2 } }))
    expect(inst.rampParam).toHaveBeenCalledWith('cutoff', 900, { seconds: PARAM_RAMP_SECONDS })
    expect(inst.param).toHaveBeenCalledWith('shape', 2) // a half-way waveform index is meaningless
    expect(inst.rampParam).toHaveBeenCalledTimes(1)
  })

  it('resets a deleted raw param to the engine default (it no longer lingers on the kernel)', () => {
    const { created } = booted()
    configureVoice('n3', cfg({ engine: 'fm', params: { algorithm: 1, ratio2: 3.5 } }))
    const inst = created[0].inst
    configureVoice('n3', cfg({ engine: 'fm', params: { algorithm: 1 } }))
    expect(inst.param).toHaveBeenCalledWith('ratio2', 1) // catalog default
  })
})

describe('bellowsManager — engine swap frees the old channel', () => {
  it('disposes the old channel with a release tail and builds the new engine fresh', () => {
    const { b, created } = booted()
    configureVoice('s1', cfg({ engine: 'va', params: { cutoff: 800 } }))
    configureVoice('s1', cfg({ engine: 'fm', params: { algorithm: 3 } }))
    expect(created[0].inst.dispose).toHaveBeenCalledWith({ releaseSeconds: RETIRE_RELEASE_SECONDS })
    expect(b.voice).toHaveBeenLastCalledWith('fm', { algorithm: 3 })
  })

  it('releases held notes before the swap; the fresh channel starts with none held', () => {
    const { created } = booted()
    configureVoice('s2', cfg())
    setMonoGate('s2', true, 60, 0.8) // id 1060
    configureVoice('s2', cfg({ engine: 'fm' }))
    expect(created[0].inst.off).toHaveBeenCalledWith(1060)
    setMonoGate('s2', true, 64, 0.8)
    expect(created[1].inst.on).toHaveBeenCalledWith(64, 0.8)
  })
})

describe('bellowsManager — preset mode', () => {
  it('boots a preset straight onto ITS engine with its params + fx (no throwaway va channel)', () => {
    const { b, created } = booted()
    configureVoice('p1', cfg({ preset: 'double-bass' }))
    expect(b.voice).toHaveBeenCalledTimes(1)
    expect(b.voice).toHaveBeenCalledWith('string', { damp: 0.5 })
    // Level 0.8 = the preset as voiced (its own 0.66 trim).
    expect(created[0].inst.gain).toHaveBeenCalledWith(expect.closeTo(0.66, 6))
  })

  it('applies a preset insert chain once', () => {
    const { created } = booted()
    configureVoice('p2', cfg({ preset: 'acid-bass' }))
    configureVoice('p2', cfg({ preset: 'acid-bass' }))
    expect(created[0].inst.fx).toHaveBeenCalledTimes(1)
    expect(created[0].inst.fx).toHaveBeenCalledWith(['saturator', { drive: 0.5 }])
  })

  it('a same-engine preset change starts fresh — no stale params from the previous sound', () => {
    const { b, created } = booted()
    configureVoice('p3', cfg({ engine: 'va', params: { cutoff: 200, resonance: 0.95 } })) // manual
    configureVoice('p3', cfg({ preset: 'acid-bass' }))
    configureVoice('p3', cfg({ preset: 'analog-lead' })) // also va
    expect(b.voice).toHaveBeenCalledTimes(3)
    expect(b.voice).toHaveBeenLastCalledWith('va', { detune: 12 }) // ONLY its own params
    expect(created[0].inst.dispose).toHaveBeenCalled()
    expect(created[1].inst.dispose).toHaveBeenCalled()
  })

  it('leaving preset mode on the same engine rebuilds with the manual params', () => {
    const { b } = booted()
    configureVoice('p4', cfg({ engine: 'va', params: { cutoff: 800 } }))
    configureVoice('p4', cfg({ preset: 'acid-bass' }))
    configureVoice('p4', cfg({ engine: 'va', params: { cutoff: 800 } }))
    expect(b.voice).toHaveBeenLastCalledWith('va', { cutoff: 800 })
  })
})

describe('bellowsManager — insert fx + reverb send', () => {
  it('sets the chain, nudges fx params in place, rebuilds on a removed fx param, clears on None', () => {
    const { created } = booted()
    configureVoice('f1', cfg({ insertFx: 'tapeDelay' }))
    const inst = created[0].inst
    expect(inst.fx).toHaveBeenLastCalledWith('tapeDelay')

    configureVoice('f1', cfg({ insertFx: 'tapeDelay', fxParams: { feedback: 0.7 } }))
    expect(inst.fxParam).toHaveBeenCalledWith(0, 'feedback', 0.7) // no chain rebuild (keeps the tail)
    expect(inst.fx).toHaveBeenCalledTimes(1)

    configureVoice('f1', cfg({ insertFx: 'tapeDelay', fxParams: {} }))
    expect(inst.fx).toHaveBeenLastCalledWith('tapeDelay') // removal → rebuild at defaults

    configureVoice('f1', cfg({ insertFx: null }))
    expect(inst.fx).toHaveBeenLastCalledWith() // cleared
  })

  it('builds the chain with params when both arrive together', () => {
    const { created } = booted()
    configureVoice('f2', cfg({ insertFx: 'pitchshift', fxParams: { semitones: 7 } }))
    expect(created[0].inst.fx).toHaveBeenCalledWith(['pitchshift', { semitones: 7 }])
  })

  it('lazily builds one shared reverb bus and sends into it', () => {
    const { b, created, bus } = booted()
    configureVoice('a', cfg({ send: 0.5 }))
    configureVoice('c', cfg({ send: 0.3 }))
    expect(b.bus).toHaveBeenCalledTimes(1) // shared across nodes
    expect(created[0].inst.send).toHaveBeenCalledWith(bus, 0.5)
    expect(created[1].inst.send).toHaveBeenCalledWith(bus, 0.3)
  })
})

describe('bellowsManager — gates + one-shots', () => {
  it('mono gate holds one note and releases it on the falling edge', () => {
    const { created } = booted()
    configureVoice('m', cfg())
    const inst = created[0].inst
    setMonoGate('m', true, 62, 0.8)
    setMonoGate('m', true, 62, 0.8) // still held → no re-trigger
    expect(inst.on).toHaveBeenCalledTimes(1)
    setMonoGate('m', false, 62, 0.8)
    expect(inst.off).toHaveBeenCalledWith(1062)
  })

  it('poly gate holds the whole chord and releases every voice', () => {
    const { created } = booted()
    configureVoice('p', cfg({ engine: 'additive' }))
    const inst = created[0].inst
    setPolyGate('p', true, [60, 64, 67], 0.8)
    setPolyGate('p', true, [60, 64, 67], 0.8)
    expect(inst.on).toHaveBeenCalledTimes(3)
    setPolyGate('p', false, [], 0.8)
    expect(inst.off).toHaveBeenCalledTimes(3)
  })

  it('plays a one-shot immediately once voiced', () => {
    const { created } = booted()
    configureVoice('o', cfg())
    queueNote('o', 67, 0.6)
    expect(created[0].inst.note).toHaveBeenCalledWith(67, { dur: '8n', vel: 0.6 })
  })

  it('surfaces a channel allocation failure as a node error', () => {
    const { b } = booted()
    b.voice.mockImplementationOnce(() => { throw new Error('no such engine') })
    configureVoice('e', cfg())
    expect(getVoiceError('e')).toMatch(/no such engine/)
  })

  it('does not retry a failed allocation every frame — only when the target changes', () => {
    const { b, created } = booted()
    b.voice.mockImplementationOnce(() => { throw new Error('no such engine') })
    configureVoice('e', cfg())
    configureVoice('e', cfg())
    configureVoice('e', cfg({ gain: 0.5 }))
    expect(b.voice).toHaveBeenCalledTimes(1)
    configureVoice('e', cfg({ engine: 'fm' }))
    expect(b.voice).toHaveBeenCalledTimes(2)
    expect(created[0].engine).toBe('fm')
    expect(getVoiceError('e')).toBeNull()
  })
})

describe('bellowsManager — lifecycle', () => {
  it('GC frees a deleted node’s channel (dispose with tail) and tears the kernel down when idle', () => {
    const { b, created } = booted()
    configureVoice('keep', cfg())
    configureVoice('gone', cfg())
    __gcForTest(new Set(['keep']))
    expect(created[1].inst.dispose).toHaveBeenCalledWith({ releaseSeconds: RETIRE_RELEASE_SECONDS })
    expect(created[0].inst.dispose).not.toHaveBeenCalled()
    expect(b.dispose).not.toHaveBeenCalled()
    __gcForTest(new Set())
    expect(b.dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps the kernel while another client (singer nodes) still has live work', () => {
    const { b } = booted()
    let live = 1
    registerKernelClient('test-singers', () => live)
    configureVoice('x', cfg())
    __gcForTest(new Set())
    expect(b.dispose).not.toHaveBeenCalled()
    live = 0
    releaseKernelIfIdle()
    expect(b.dispose).toHaveBeenCalledTimes(1)
  })

  it('engine stop frees every channel immediately and disposes the kernel', () => {
    const { b, created } = booted()
    configureVoice('a', cfg())
    configureVoice('b', cfg())
    __disposeAllForTest()
    for (const c of created) expect(c.inst.dispose).toHaveBeenCalledWith({ releaseSeconds: 0 })
    expect(b.dispose).toHaveBeenCalledTimes(1)
  })
})
