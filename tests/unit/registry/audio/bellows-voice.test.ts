import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as bellowsVoice from 'bellows-voice'
import { makeContext } from '../../_helpers/executionContext'
import {
  configureSinger,
  performLine,
  stopLine,
  readSinger,
  __setVoiceHandleForTest,
  __resetSingersForTest,
  __gcSingersForTest,
  __disposeAllSingersForTest,
  type SingerConfig,
} from '@/registry/audio/bellows-singer/singerManager'
import { __resetBellowsForTest, __setKernelForTest } from '@/registry/audio/bellows-instrument/bellowsManager'
import {
  parseMelody,
  resolveSingerConfig,
  writeVoiceOutputs,
} from '@/registry/audio/bellows-singer/voiceNodeShared'
import {
  VOICE_PRESET_OPTIONS,
  ACCENTS,
  SHAPE_OPTIONS,
} from '@/registry/audio/bellows-singer/voiceData'
import singerNode from '@/registry/audio/bellows-singer/node'
import speakNode from '@/registry/audio/bellows-speak/node'
import { resetNodeState } from '../../../helpers/testNode'

// ── Fakes: a bellows kernel + the bellows-voice module surface the manager uses ──
function makeVoiceModule() {
  const singers: ReturnType<typeof makeSinger>[] = []
  const probes: { stop: ReturnType<typeof vi.fn>; heard: ReturnType<typeof vi.fn> }[] = []
  function makeSinger(voice: string, opts: { accent?: string }) {
    return {
      voice,
      accent: opts.accent ?? 'general-american',
      channel: singers.length + 1,
      sing: vi.fn(() => ({ phrases: [{ start: 0, end: 2.5 }], leadIn: 0.1, unknown: [], trimmed: 0 })),
      speak: vi.fn(() => ({ phrases: [{ start: 0, end: 1.5 }], leadIn: 0.1, unknown: [], trimmed: 0 })),
      shape: vi.fn(),
      gain: vi.fn(),
      pan: vi.fn(),
      send: vi.fn(),
      param: vi.fn(),
      dispose: vi.fn(),
    }
  }
  const mod = {
    singer: vi.fn((_b: unknown, voice: string, opts: { accent?: string }) => {
      const s = makeSinger(voice, opts)
      singers.push(s)
      return s
    }),
    articulatorProbe: vi.fn(() => {
      const p = {
        stop: vi.fn(),
        heard: vi.fn(() => ({
          time: 0, sounding: true, phoneme: 'a', phonemeIndex: 1, glottal: 0.7,
          jaw: 1.3, lipAperture: 1, lipProtrusion: 0.7, lipWidth: 0.5, labiodental: 0,
          tongueBodyX: 4.2, tongueBodyY: 6.1, tongueTipX: 0, tongueTipY: 0, velum: 0.6,
        })),
      }
      probes.push(p)
      return p
    }),
    toIPA: vi.fn((text: string) => `/${text}/`),
  }
  return { mod, singers, probes }
}

const b = { ctx: { currentTime: 0 }, bus: vi.fn(() => ({ id: 9 })), dispose: vi.fn() }

const cfg = (over: Partial<SingerConfig> = {}): SingerConfig => ({
  voice: 'soprano', accent: 'scottish', shape: 'neutral', gain: 0.8, pan: 0, send: 0, mouth: true, ...over,
})

let voice: ReturnType<typeof makeVoiceModule>
beforeEach(() => {
  __resetBellowsForTest()
  __resetSingersForTest()
  resetNodeState()
  b.ctx.currentTime = 0
  __setKernelForTest(b)
  voice = makeVoiceModule()
  __setVoiceHandleForTest({ b, mod: voice.mod })
})

describe('singerManager', () => {
  it('builds one singer per node on the requested voice + accent, with a probe', () => {
    configureSinger('s', cfg())
    configureSinger('s', cfg())
    expect(voice.mod.singer).toHaveBeenCalledTimes(1)
    expect(voice.mod.singer).toHaveBeenCalledWith(b, 'soprano', { accent: 'scottish' })
    expect(voice.mod.articulatorProbe).toHaveBeenCalledTimes(1)
    expect(voice.singers[0].shape).toHaveBeenCalledWith('neutral')
  })

  it('a voice change disposes the old singer (probe first) and builds the new one', () => {
    configureSinger('s', cfg())
    configureSinger('s', cfg({ voice: 'tenor' }))
    expect(voice.probes[0].stop).toHaveBeenCalled()
    expect(voice.singers[0].dispose).toHaveBeenCalled()
    expect(voice.singers[1].voice).toBe('tenor')
  })

  it('accent / posture / mix changes apply in place (no rebuild)', () => {
    configureSinger('s', cfg())
    configureSinger('s', cfg({ accent: 'indian', shape: 'smile', gain: 0.5 }))
    expect(voice.mod.singer).toHaveBeenCalledTimes(1)
    expect(voice.singers[0].accent).toBe('indian')
    expect(voice.singers[0].shape).toHaveBeenLastCalledWith('smile')
    expect(voice.singers[0].gain).toHaveBeenLastCalledWith(0.5)
  })

  it('sings / speaks, tracks busy, and pulses done once when the line ends', () => {
    configureSinger('s', cfg())
    performLine('s', { kind: 'speak', text: 'hello there', rate: 1, breath: 'between' })
    expect(voice.singers[0].speak).toHaveBeenCalledWith('hello there', expect.objectContaining({ accent: 'scottish', rate: 1 }))
    let r = readSinger('s')
    expect(r.busy).toBe(true)
    expect(r.ipa).toBe('/hello there/')
    b.ctx.currentTime = 2
    r = readSinger('s')
    expect(r.busy).toBe(false)
    expect(r.done).toBe(true)
    expect(readSinger('s').done).toBe(false) // one frame only
  })

  it('stop frees the channel and rebuilds a fresh singer (posted phonemes die with it)', () => {
    configureSinger('s', cfg())
    performLine('s', { kind: 'sing', lyrics: 'la', notes: [{ note: 60, dur: { seconds: 1 } }] })
    stopLine('s', cfg())
    expect(voice.singers[0].dispose).toHaveBeenCalled()
    expect(voice.singers).toHaveLength(2)
    expect(readSinger('s').busy).toBe(false)
  })

  it('mouth off stops the probe; a probe failure (8-slot cap) keeps the voice singing', () => {
    configureSinger('s', cfg())
    configureSinger('s', cfg({ mouth: false }))
    expect(voice.probes[0].stop).toHaveBeenCalled()
    voice.mod.articulatorProbe.mockImplementationOnce(() => { throw new Error('8 probes are running') })
    configureSinger('t', cfg())
    expect(voice.singers).toHaveLength(2)
    expect(readSinger('t').error).toMatch(/8 probes/)
  })

  it('surfaces singer() failure (e.g. two bellowsjs copies) as an error instead of throwing', () => {
    voice.mod.singer.mockImplementationOnce(() => { throw new Error('the voice plugin is not loaded') })
    expect(() => configureSinger('s', cfg())).not.toThrow()
    expect(readSinger('s').error).toMatch(/not loaded/)
  })

  it('done does not pulse when a line is cancelled (stop / voice change), only on a finish', () => {
    const line = { kind: 'speak', text: 'hi', rate: 1, breath: 'between' } as const
    configureSinger('s', cfg())
    performLine('s', line)
    expect(readSinger('s').busy).toBe(true)
    stopLine('s', cfg())
    expect(readSinger('s').done).toBe(false)
    performLine('s', line)
    expect(readSinger('s').busy).toBe(true)
    configureSinger('s', cfg({ voice: 'tenor' }))
    expect(readSinger('s').done).toBe(false)
    performLine('s', line)
    expect(readSinger('s').busy).toBe(true)
    b.ctx.currentTime = 2
    expect(readSinger('s').done).toBe(true)
  })

  it('a failed probe is not retried every frame — only on a mouth/voice change or a freed slot', () => {
    configureSinger('a', cfg())
    voice.mod.articulatorProbe.mockImplementation(() => { throw new Error('8 probes are running') })
    configureSinger('t', cfg())
    configureSinger('t', cfg())
    configureSinger('t', cfg())
    expect(voice.mod.articulatorProbe).toHaveBeenCalledTimes(2)
    configureSinger('t', cfg({ mouth: false }))
    configureSinger('t', cfg())
    expect(voice.mod.articulatorProbe).toHaveBeenCalledTimes(3) // mouth toggled back on
    configureSinger('t', cfg({ voice: 'tenor' }))
    expect(voice.mod.articulatorProbe).toHaveBeenCalledTimes(4) // voice change
    configureSinger('t', cfg({ voice: 'tenor' }))
    expect(voice.mod.articulatorProbe).toHaveBeenCalledTimes(4)
    voice.mod.articulatorProbe.mockReset()
    __gcSingersForTest(new Set(['t'])) // 'a' frees its probe slot
    configureSinger('t', cfg({ voice: 'tenor' }))
    expect(voice.mod.articulatorProbe).toHaveBeenCalledTimes(1)
    expect(readSinger('t').error).toBeNull()
  })

  it('a failed singer() is not retried every frame — only on a voice/accent change', () => {
    voice.mod.singer.mockImplementationOnce(() => { throw new Error('the voice plugin is not loaded') })
    configureSinger('s', cfg())
    configureSinger('s', cfg())
    configureSinger('s', cfg())
    expect(voice.mod.singer).toHaveBeenCalledTimes(1)
    configureSinger('s', cfg({ voice: 'tenor' }))
    expect(voice.mod.singer).toHaveBeenCalledTimes(2)
    expect(voice.singers).toHaveLength(1)
  })

  it('GC frees a deleted node’s singer + probe; stop disposes all', () => {
    configureSinger('keep', cfg())
    configureSinger('gone', cfg())
    __gcSingersForTest(new Set(['keep']))
    expect(voice.singers[1].dispose).toHaveBeenCalled()
    expect(voice.probes[1].stop).toHaveBeenCalled()
    expect(voice.singers[0].dispose).not.toHaveBeenCalled()
    expect(b.dispose).not.toHaveBeenCalled() // a live singer keeps the shared kernel
    __disposeAllSingersForTest()
    expect(voice.singers[0].dispose).toHaveBeenCalledWith({ releaseSeconds: 0 })
  })
})

describe('voice node helpers', () => {
  it('parseMelody: names, MIDI, rests, per-note beats, seconds at the node tempo', () => {
    const n = parseMelody('C4 64 - G#4:2 bogus', 1, 120)
    expect(n.map((x) => x.note)).toEqual(['C4', 64, null, 'G#4'])
    expect(n.map((x) => (x.dur as { seconds: number }).seconds)).toEqual([0.5, 0.5, 0.5, 1])
    expect(parseMelody([60, null, { note: 'E4', beats: 0.5 }], 2, 60).map((x) => x.dur))
      .toEqual([{ seconds: 2 }, { seconds: 2 }, { seconds: 0.5 }])
    expect(parseMelody(62, 1, 100)).toHaveLength(1)
    expect(parseMelody(undefined, 1, 100)).toEqual([])
  })

  it('resolveSingerConfig guards unknown ids', () => {
    const c = resolveSingerConfig(new Map<string, unknown>([['voice', 'nope'], ['accent', 'martian'], ['shape', 'x']]), 'tenor')
    expect(c).toMatchObject({ voice: 'tenor', accent: 'general-american', shape: 'neutral', mouth: true })
  })

  it('writeVoiceOutputs normalizes the probe frame to 0..1', () => {
    const out = new Map<string, unknown>()
    writeVoiceOutputs(out, {
      frame: {
        time: 0, sounding: true, phoneme: 'u', phonemeIndex: 0, glottal: 2, jaw: 1.3, lipAperture: -0.2,
        lipProtrusion: 1.4, lipWidth: 0.25, labiodental: 0, tongueBodyX: 3, tongueBodyY: 5,
        tongueTipX: 0, tongueTipY: 0, velum: 0.6,
      },
      busy: true, done: false, ipa: '/u/', error: null,
    })
    expect(out.get('jaw')).toBeCloseTo(0.5)
    expect(out.get('mouthOpen')).toBe(0) // pressed shut
    expect(out.get('lipRound')).toBe(1)
    expect(out.get('nasal')).toBeCloseTo(0.5)
    expect(out.get('voicing')).toBe(1)
    expect(out.get('phoneme')).toBe('u')
    expect(out.get('sounding')).toBe(true)
    expect(out.get('done')).toBe(0)
  })
})

describe('bellows-singer / bellows-speak nodes', () => {
  it('singer sings typed lyrics on the typed melody on the Sing edge', () => {
    const ctrl = { voice: 'tenor', lyrics: 'hel-lo', notes: 'C4 E4', noteLength: 1, bpm: 120 }
    singerNode.executor(makeContext({ trigger: false }, ctrl, { nodeId: 'sn' }))
    const out = singerNode.executor(makeContext({ trigger: true }, ctrl, { nodeId: 'sn' })) as Map<string, unknown>
    expect(voice.singers[0].sing).toHaveBeenCalledWith(
      'hel-lo',
      [{ note: 'C4', dur: { seconds: 0.5 } }, { note: 'E4', dur: { seconds: 0.5 } }],
      { accent: 'general-american' },
    )
    expect(out.get('busy')).toBe(true)
    expect(out.get('jaw')).toBeCloseTo(0.5)
  })

  it('a wired melody array wins over the typed one', () => {
    const ctrl = { lyrics: 'la la', notes: 'C4 C4' }
    singerNode.executor(makeContext({ trigger: true, notes: [67, 69] }, ctrl, { nodeId: 'sn2' }))
    const sung = voice.singers[0].sing.mock.calls[0] as unknown[]
    expect((sung[1] as { note: unknown }[]).map((n) => n.note)).toEqual([67, 69])
  })

  it('speak says wired text with rate / pitch / breath', () => {
    const ctrl = { voice: 'narrator-male', accent: 'australian', rate: 1.5, pitch: 120, breath: 'none' }
    speakNode.executor(makeContext({ trigger: true, text: 'G’day?' }, ctrl, { nodeId: 'sp' }))
    expect(voice.singers[0].speak).toHaveBeenCalledWith('G’day?', { accent: 'australian', rate: 1.5, hz: 120, breath: 'none' })
  })

  it('declares the line + mouth outputs and no audio port', () => {
    for (const node of [singerNode, speakNode]) {
      const ids = node.definition.outputs.map((o) => o.id)
      expect(ids).toEqual(expect.arrayContaining(['ipa', 'busy', 'done', 'jaw', 'mouthOpen', 'lipRound', 'phoneme']))
      expect(node.definition.outputs.some((o) => o.type === 'audio')).toBe(false)
    }
  })
})

// ── Drift guard: the static option tables vs the installed bellows-voice ─────
describe('voiceData matches bellows-voice', () => {
  it('voice presets', () => {
    expect(VOICE_PRESET_OPTIONS.map((o) => [o.value, o.label]))
      .toEqual(bellowsVoice.VOICE_PRESETS.map((v) => [v.id, v.name]))
  })
  it('accents (id, region, name)', () => {
    expect(ACCENTS.map(([id, region, name]) => [id, region, name]))
      .toEqual(Object.entries(bellowsVoice.ACCENTS).map(([id, a]) => [id, a.region, a.name]))
  })
  it('mouth postures', () => {
    const shapes = (bellowsVoice.SHAPE_PRESETS as unknown as { id: string }[]).map((s) => s.id)
    expect(SHAPE_OPTIONS.map((o) => o.value)).toEqual(shapes)
  })
})
