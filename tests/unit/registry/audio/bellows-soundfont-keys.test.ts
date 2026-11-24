import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeContext } from '../../_helpers/executionContext'

// SoundFont + Voice Keys against a fake kernel / fake voice plugin (no AudioWorklet in happy-dom).

vi.mock('@/services/audio/AudioManager', () => ({
  audioManager: { initialize: vi.fn(async () => {}), getMasterOutput: vi.fn(() => ({})) },
  Tone: {
    Gain: class { connect() { return this } disconnect() {} dispose() {} },
    Signal: class { connect() { return this } dispose() {} },
    connect: vi.fn(),
  },
}))
vi.mock('@/services/assets', () => ({ assetStorageManager: { getAssetUrl: vi.fn(async () => null) } }))
vi.mock('bellowsjs', () => ({
  samplerBankFromSf2: vi.fn((_sf: unknown, bank: number, program: number) => ({ zones: [{ bank, program }] })),
}))

import {
  configureSoundfont,
  sfTrigger,
  sfGate,
  sfStatus,
  __resetSoundfontsForTest,
  __setFontForTest,
  __gcSoundfontsForTest,
} from '@/registry/audio/bellows-soundfont/soundfontManager'
import { __resetBellowsForTest, __setKernelForTest } from '@/registry/audio/bellows-instrument/bellowsManager'
import {
  __resetSingersForTest,
  __setVoiceHandleForTest,
  configureSinger,
  vocalSyllables,
  vocalKeyDown,
  vocalKeyUp,
  vocalHeld,
} from '@/registry/audio/bellows-singer/singerManager'
import keysNode from '@/registry/audio/bellows-vocal-keys/node'

function makeInst() {
  return {
    note: vi.fn(), on: vi.fn(() => 7), off: vi.fn(), param: vi.fn(), gain: vi.fn(), pan: vi.fn(),
    send: vi.fn(), dispose: vi.fn(), route: vi.fn(),
  }
}

function makeKernel() {
  const insts: ReturnType<typeof makeInst>[] = []
  return {
    insts,
    outputs: 1, inputs: 1,
    ctx: { currentTime: 10 },
    outputNode: vi.fn(), inputNode: vi.fn(),
    samplerInstrument: vi.fn(() => { const i = makeInst(); insts.push(i); return i }),
    voice: vi.fn(() => { const i = makeInst(); insts.push(i); return i }),
    bus: vi.fn(() => ({ id: 1 })),
    dispose: vi.fn(),
  }
}

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)) }

const sfCfg = (over = {}) => ({ source: 'font-a', preset: 0, gain: 0.8, pan: 0, send: 0, attack: 0.002, release: 0.25, ...over })

let k: ReturnType<typeof makeKernel>
beforeEach(() => {
  __resetBellowsForTest()
  __resetSoundfontsForTest()
  __resetSingersForTest()
  k = makeKernel()
  __setKernelForTest(k)
})

describe('bellows-soundfont manager', () => {
  const PRESETS = [
    { bank: 0, program: 0, name: 'Grand Piano' },
    { bank: 0, program: 40, name: 'Violin' },
    { bank: 128, program: 0, name: 'Standard Kit' },
  ]

  it('builds a sampler channel for the chosen preset, registering its bank once per kernel', async () => {
    __setFontForTest('font-a', {}, PRESETS)
    configureSoundfont('n', sfCfg({ preset: 1 }))
    await settle()
    expect(k.samplerInstrument).toHaveBeenCalledWith([{ bank: 0, program: 40 }], 'sf2-ftest-0-40')
    expect(sfStatus('n').presetName).toBe('Violin')
    // switch away and back: the bank is reused by id (no second registerBank of the samples)
    configureSoundfont('n', sfCfg({ preset: 0 }))
    await settle()
    configureSoundfont('n', sfCfg({ preset: 1 }))
    await settle()
    expect(k.samplerInstrument).toHaveBeenCalledTimes(2)
    expect(k.voice).toHaveBeenCalledWith('sampler:sf2-ftest-0-40')
    expect(k.insts[0].dispose).toHaveBeenCalled() // the old preset rings out and is freed
  })

  it('clamps the preset index, plays triggers and holds/releases a gated chord', async () => {
    __setFontForTest('font-a', {}, PRESETS)
    configureSoundfont('n', sfCfg({ preset: 99 }))
    await settle()
    expect(sfStatus('n').presetName).toBe('Standard Kit')
    const inst = k.insts[0]
    sfTrigger('n', [60, 64], 0.5)
    expect(inst.note).toHaveBeenCalledTimes(2)
    sfGate('n', true, [60, 64, 67], 0.7)
    sfGate('n', true, [60, 64, 67], 0.7)
    expect(inst.on).toHaveBeenCalledTimes(3)
    sfGate('n', false, [], 0)
    expect(inst.off).toHaveBeenCalledTimes(3)
  })

  it('no source: nothing is built; GC frees the channel', async () => {
    configureSoundfont('a', sfCfg({ source: '' }))
    expect(k.samplerInstrument).not.toHaveBeenCalled()
    __setFontForTest('font-a', {}, PRESETS)
    configureSoundfont('b', sfCfg())
    await settle()
    __gcSoundfontsForTest(new Set())
    expect(k.insts[0].dispose).toHaveBeenCalled()
  })
})

// ── Voice Keys ───────────────────────────────────────────────────────────────
const IDX: Record<string, number> = { 'ɑ': 1, 'ɪ': 7, 'i': 8, 'ə': 14, a: 13, 'ʊ': 9, h: 26, l: 35, w: 37, t: 17, 'ɹ': 36, d: 18, 'ɫ': 41 }
function makeVoiceMod() {
  const singers: (ReturnType<typeof makeInst> & { accent: string; dictionary: unknown })[] = []
  return {
    singers,
    mod: {
      singer: vi.fn(() => { const s = { ...makeInst(), accent: 'general-american', dictionary: null, shape: vi.fn(), instrument: makeInst() }; singers.push(s); return s }),
      articulatorProbe: vi.fn(() => ({ stop: vi.fn(), heard: vi.fn(() => null) })),
      toIPA: vi.fn(() => ''),
      vocalPhonemeIndex: (ipa: string) => IDX[ipa] ?? -1,
      lyricsToSyllables: vi.fn((text: string) => text.split(/[\s-]+/).filter(Boolean).map((w) => {
        if (w === 'how') return { text: w, onset: [{ ipa: 'h' }], nucleus: { ipa: 'aʊ' }, coda: [] }
        if (w === 'world') return { text: w, onset: [{ ipa: 'w' }], nucleus: { ipa: 'ɝ' }, coda: [{ ipa: 'ɫ' }, { ipa: 'd' }] }
        return { text: w, onset: [{ ipa: 'l' }], nucleus: { ipa: 'ə' }, coda: [] }
      })),
    },
  }
}

const singerCfg = { voice: 'pop-female', accent: 'general-american', shape: 'neutral', gain: 0.8, pan: 0, send: 0, mouth: false, dictionary: false }

describe('bellows voice keys', () => {
  it('turns lyrics into phoneme indices, splitting a diphthong into its two vowels', () => {
    const v = makeVoiceMod()
    __setVoiceHandleForTest({ b: k, mod: v.mod })
    configureSinger('s', singerCfg)
    const syl = vocalSyllables('s', 'how world')!
    expect(syl[0]).toMatchObject({ text: 'how', onset: [26], nucleus: [13, 9], coda: [] })
    // 'ɝ' is not in the fake engine table → that syllable has no vowel and is dropped
    expect(syl).toHaveLength(1)
  })

  it('key down schedules onset then vowel then notes on; key up sings the coda then releases', () => {
    const v = makeVoiceMod()
    __setVoiceHandleForTest({ b: k, mod: v.mod })
    configureSinger('s', singerCfg)
    const s = v.singers[0]
    vocalKeyDown('s', { text: 'lad', ipa: 'læd', onset: [35], nucleus: [1], coda: [18] }, 62, 0.8, false)
    const t0 = 10.01
    expect(s.param).toHaveBeenCalledWith('phoneme', 35, t0)
    expect(s.param).toHaveBeenCalledWith('phoneme', 1, expect.closeTo(t0 + 0.06, 6))
    expect(s.on).toHaveBeenCalledWith(62, 0.8, t0)
    expect(vocalHeld('s')).toBe(true)
    vocalKeyUp('s')
    expect(s.param).toHaveBeenCalledWith('phoneme', 18, t0)
    expect(s.off).toHaveBeenCalledWith(7, expect.closeTo(t0 + 0.06, 6))
    expect(vocalHeld('s')).toBe(false)
  })

  it('legato re-articulates on the held note and bends instead of a new attack', () => {
    const v = makeVoiceMod()
    __setVoiceHandleForTest({ b: k, mod: v.mod })
    configureSinger('s', singerCfg)
    const s = v.singers[0]
    vocalKeyDown('s', { text: 'la', ipa: 'lɑ', onset: [35], nucleus: [1], coda: [] }, 60, 0.8, false)
    vocalKeyDown('s', { text: 'li', ipa: 'li', onset: [35], nucleus: [8], coda: [] }, 64, 0.8, true)
    expect(s.on).toHaveBeenCalledTimes(1)
    expect(s.param).toHaveBeenCalledWith('bend', 4, expect.any(Number))
  })

  it('the node advances one syllable per gate press and loops; reset goes back to the start', () => {
    const v = makeVoiceMod()
    __setVoiceHandleForTest({ b: k, mod: v.mod })
    const ctrl = { lyrics: 'la la how', mouth: false, dictionary: false }
    const press = (gate: boolean, extra: Record<string, unknown> = {}) =>
      keysNode.executor(makeContext({ gate, note: 60, ...extra }, ctrl, { nodeId: 'kk' })) as Map<string, unknown>
    press(false)
    const seen: unknown[] = []
    for (let i = 0; i < 4; i++) {
      seen.push(press(true).get('syllable'))
      press(false)
    }
    expect(seen).toEqual(['la', 'la', 'how', 'la'])
    press(false, { reset: true })
    expect(press(true).get('syllable')).toBe('la')
    expect(press(true).get('syllableIndex')).toBe(1)
  })
})

// ── Granular ─────────────────────────────────────────────────────────────────
import {
  configureGranular,
  granularGate,
  __resetGranularForTest,
  __setGranularSourceForTest,
} from '@/registry/audio/bellows-granular/granularManager'

describe('bellows-granular manager', () => {
  it('registers a file once per kernel (a second node reuses its engine id) and ramps continuous params', () => {
    __resetGranularForTest()
    const kg = { ...makeKernel(), granular: vi.fn(() => ({ ...makeInst(), rampParam: vi.fn(), engineId: 'granular:grain0' })) }
    __setKernelForTest(kg)
    __setGranularSourceForTest('snd', new Float32Array(480), 48000)
    const cfg = { source: 'snd', params: { position: 0.2, reverse: 0 }, gain: 0.8, pan: 0, send: 0 }
    configureGranular('a', cfg)
    configureGranular('b', cfg)
    expect(kg.granular).toHaveBeenCalledTimes(1)
    expect(kg.voice).toHaveBeenCalledWith('granular:grain0', cfg.params)
    const inst = kg.granular.mock.results[0].value
    configureGranular('a', { ...cfg, params: { position: 0.7, reverse: 1 } })
    expect(inst.rampParam).toHaveBeenCalledWith('position', 0.7, { seconds: 0.03 })
    expect(inst.param).toHaveBeenCalledWith('reverse', 1)
    granularGate('a', true, [60], 0.8)
    expect(inst.on).toHaveBeenCalledWith(60, 0.8)
  })
})
