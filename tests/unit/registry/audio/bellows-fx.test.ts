import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as bellows from 'bellowsjs'
import { makeContext } from '../../_helpers/executionContext'
import {
  EFFECT_SPECS,
  buildFxControls,
  resolveFxConfig,
  fxControlId,
  isSteppedFxParam,
} from '@/registry/audio/bellows-fx/fxParams'

// ── Catalog drift guard ──────────────────────────────────────────────────────
describe('bellows-fx param table', () => {
  it('matches the installed bellowsjs effect catalog exactly (ids, names, ranges, defaults)', () => {
    const live = bellows.listEffects()
    expect(Object.keys(EFFECT_SPECS).sort()).toEqual(live.map((e) => e.id).sort())
    for (const e of live) {
      const ours = EFFECT_SPECS[e.id]
      expect(ours.map((p) => p.name), e.id).toEqual(e.params.map((p) => p.name))
      for (const p of e.params) {
        const o = ours.find((x) => x.name === p.name)!
        expect([o.min, o.max, o.default], `${e.id}.${p.name}`).toEqual([p.min, p.max, p.default])
      }
    }
  })

  it('every effect node family member offers only real effects, and together they cover all of them', async () => {
    const ids = ['filter', 'reverb', 'delay', 'dynamics', 'modulation', 'saturator', 'eq', 'spectral']
    const covered = new Set<string>()
    for (const id of ids) {
      const mod = (await import(`@/registry/audio/bellows-${id}/node.ts`)).default
      const def = mod.definition
      expect(def.inputs[0]).toEqual({ id: 'audio', type: 'audio', label: 'Audio' })
      expect(def.outputs).toEqual([{ id: 'audio', type: 'audio', label: 'Audio' }])
      const effectCtl = def.controls.find((c: { id: string }) => c.id === 'effect')
      const effects = effectCtl
        ? (effectCtl.props.options as { value: string }[]).map((o) => o.value)
        : [def.controls[0].id.split('_')[1]]
      for (const e of effects) {
        expect(EFFECT_SPECS[e], e).toBeDefined()
        covered.add(e)
      }
      // a mod input shares its control's id, so wiring it overrides the knob
      for (const inp of def.inputs.slice(1)) {
        expect(def.controls.some((c: { id: string }) => c.id === inp.id), inp.id).toBe(true)
      }
    }
    expect([...covered].sort()).toEqual(Object.keys(EFFECT_SPECS).sort())
  })
})

describe('buildFxControls / resolveFxConfig', () => {
  it('gates each effect\'s params to that effect when there is a choice', () => {
    const ctls = buildFxControls(['fdn', 'plate'])
    expect(ctls[0]).toMatchObject({ id: 'effect', type: 'select', default: 'fdn' })
    expect(ctls.find((c) => c.id === fxControlId('plate', 'decay'))?.when).toEqual({ effect: 'plate' })
    const single = buildFxControls(['filter'])
    expect(single.some((c) => c.id === 'effect')).toBe(false)
    expect(single.find((c) => c.id === 'fx_filter_type')).toMatchObject({ type: 'select', default: 0 })
  })

  it('defaults, clamps, rounds stepped params, and maps toggles to 0/1', () => {
    const vals: Record<string, unknown> = {
      effect: 'freeze',
      fx_freeze_freeze: true,
      fx_freeze_mix: 7,
      level: -3,
    }
    const cfg = resolveFxConfig(['pitchshift', 'freeze'], (id) => vals[id])
    expect(cfg).toEqual({ effect: 'freeze', params: { freeze: 1, mix: 1 }, level: 0 })
    const f = resolveFxConfig(['filter'], (id) => ({ fx_filter_type: 2.6, fx_filter_cutoff: 'nope' } as Record<string, unknown>)[id])
    expect(f.params.type).toBe(3)
    expect(f.params.cutoff).toBe(1000)
    expect(isSteppedFxParam('filter', 'type')).toBe(true)
    expect(isSteppedFxParam('filter', 'cutoff')).toBe(false)
  })

  it('an unknown effect choice falls back to the node\'s first effect', () => {
    expect(resolveFxConfig(['delay', 'tapeDelay'], (id) => (id === 'effect' ? 'bogus' : undefined)).effect).toBe('delay')
  })
})

// ── Manager against a fake kernel ────────────────────────────────────────────
const { made, FakeGain } = vi.hoisted(() => {
  const made = { gains: [] as { disposed: boolean }[] }
  class FakeGain {
    disposed = false
    constructor() { made.gains.push(this) }
    connect() { return this }
    disconnect() {}
    dispose() { this.disposed = true }
  }
  return { made, FakeGain }
})
vi.mock('@/services/audio/AudioManager', () => ({
  audioManager: { initialize: vi.fn(async () => {}), getMasterOutput: vi.fn(() => ({})) },
  Tone: {
    Gain: FakeGain,
    Signal: class { connect() { return this } dispose() {} },
    connect: vi.fn(),
  },
}))

import { runFx, getFxError, __resetFxForTest, __gcFxForTest } from '@/registry/audio/bellows-fx/fxManager'
import { __resetBellowsForTest, __setKernelForTest } from '@/registry/audio/bellows-instrument/bellowsManager'
import filterNode from '@/registry/audio/bellows-filter/node'

function makeKernel(inputs = 2) {
  const channels: { input: number; fx: ReturnType<typeof vi.fn>; fxParam: ReturnType<typeof vi.fn>; gain: ReturnType<typeof vi.fn>; route: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] = []
  return {
    channels,
    outputs: 2,
    inputs,
    outputNode: vi.fn((k: number) => ({ out: k })),
    inputNode: vi.fn((k: number) => ({ in: k })),
    inputChannel: vi.fn((k: number) => {
      const ch = { input: k, fx: vi.fn(), fxParam: vi.fn(), gain: vi.fn(), route: vi.fn(), dispose: vi.fn() }
      channels.push(ch)
      return ch
    }),
    bus: vi.fn(),
    dispose: vi.fn(),
  }
}

let k: ReturnType<typeof makeKernel>
beforeEach(() => {
  __resetBellowsForTest()
  __resetFxForTest()
  made.gains.length = 0
  k = makeKernel()
  __setKernelForTest(k)
})

const cfg = (params: Record<string, number>, effect = 'filter', level = 1) => ({ effect, params, level })

describe('fxManager', () => {
  it('builds one input channel with the effect, feeds it upstream audio, and stays on master unwired', () => {
    const src = { connect: vi.fn(), disconnect: vi.fn() }
    const out = runFx('f', cfg({ cutoff: 500 }), src, false)
    expect(out).toBeNull()
    expect(k.inputChannel).toHaveBeenCalledWith(1)
    const ch = k.channels[0]
    expect(ch.fx).toHaveBeenCalledWith(['filter', { cutoff: 500 }])
    expect(src.connect).toHaveBeenCalledTimes(1)
    expect(ch.route).not.toHaveBeenCalled()
    runFx('f', cfg({ cutoff: 500 }), src, false)
    expect(k.inputChannel).toHaveBeenCalledTimes(1)
    expect(src.connect).toHaveBeenCalledTimes(1)
  })

  it('a param change is an fxParam on the live effect (no rebuild); an effect change rebuilds', () => {
    runFx('f', cfg({ cutoff: 500, mix: 1 }), null, false)
    const ch = k.channels[0]
    runFx('f', cfg({ cutoff: 900, mix: 1 }), null, false)
    expect(ch.fxParam).toHaveBeenCalledWith(0, 'cutoff', 900)
    expect(ch.fxParam).toHaveBeenCalledTimes(1)
    expect(ch.fx).toHaveBeenCalledTimes(1)
    runFx('f', cfg({ mix: 0.5 }, 'plate'), null, false)
    expect(ch.fx).toHaveBeenLastCalledWith(['plate', { mix: 0.5 }])
    runFx('f', cfg({ mix: 0.5 }, 'plate', 0.4), null, false)
    expect(ch.gain).toHaveBeenLastCalledWith(0.4)
  })

  it('wired output routes the channel to a direct output and returns its Tone node', () => {
    const out = runFx('f', cfg({}), null, true)
    expect(out).toBeInstanceOf(FakeGain)
    expect(k.channels[0].route).toHaveBeenCalledWith(1)
  })

  it('reports an error (once, no rebuild storm) when every input is taken', () => {
    k = makeKernel(1)
    __setKernelForTest(k)
    runFx('a', cfg({}), null, false)
    runFx('b', cfg({}), null, false)
    runFx('b', cfg({}), null, false)
    expect(getFxError('b')).toMatch(/No free bellows input/)
    expect(k.inputChannel).toHaveBeenCalledTimes(1)
  })

  it('GC disposes the channel and frees its input for another node', () => {
    const src = { connect: vi.fn(), disconnect: vi.fn() }
    runFx('a', cfg({}), src, false)
    __gcFxForTest(new Set())
    expect(k.channels[0].dispose).toHaveBeenCalled()
    expect(src.disconnect).toHaveBeenCalled()
    __setKernelForTest(k) // GC of the last user disposed the kernel
    runFx('b', cfg({}), null, false)
    expect(k.inputChannel).toHaveBeenLastCalledWith(1)
  })

  it('the node executor wires cutoff input over the control and passes upstream audio', () => {
    const src = { connect: vi.fn(), disconnect: vi.fn() }
    filterNode.executor(makeContext({ audio: src, fx_filter_cutoff: 3000 }, { fx_filter_cutoff: 200 }, { nodeId: 'n' }))
    expect(k.channels[0].fx).toHaveBeenCalledWith(['filter', expect.objectContaining({ cutoff: 3000 })])
    expect(src.connect).toHaveBeenCalled()
  })
})

// ── Data transcribed from bellows packages: drift guards ─────────────────────
describe('bellows data tables match the installed packages', () => {
  it('beatbox patterns equal bellows-voice BEAT_PRESETS', async () => {
    const { BEAT_PRESETS } = await import('bellows-voice')
    const { BEAT_PATTERNS } = await import('@/registry/audio/bellows-beatbox/node')
    expect(BEAT_PATTERNS).toEqual(BEAT_PRESETS.map((p) => ({ id: p.id, name: p.name, bpm: p.bpm, swing: p.swing, text: p.text })))
  })

  it('granular params equal the bellowsjs granular engine catalog', async () => {
    const { GRANULAR_PARAMS } = await import('@/registry/audio/bellows-granular/node')
    const live = bellows.listEngines().find((e) => e.id === 'granular')!
    expect(GRANULAR_PARAMS.map((p) => [p.name, p.min, p.max, p.default])).toEqual(
      live.params.map((p) => [p.name, p.min, p.max, p.default]),
    )
  })
})
