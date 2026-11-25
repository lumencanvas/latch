import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeContext } from '../../_helpers/executionContext'

const configureVoice = vi.fn()
const queueNote = vi.fn()
const setMonoGate = vi.fn()
const routeChannel = vi.fn((_id: string, _inst: unknown, wired: boolean) => (wired ? 'PORT' : null))

vi.mock('@/registry/audio/bellows-instrument/bellowsManager', () => ({
  configureVoice: (...a: unknown[]) => configureVoice(...a),
  queueNote: (...a: unknown[]) => queueNote(...a),
  setMonoGate: (...a: unknown[]) => setMonoGate(...a),
  routeChannel: (...a: unknown[]) => routeChannel(...a),
  getVoice: () => null,
}))

import '@/stores/nodes'
import '@/stores/flows'
import node, { synthVoiceConfig, SYNTH_SOUNDS } from '@/registry/audio/synth/node'
import { isPreset } from '@/registry/audio/bellows-instrument/engineParams'

const cfgOf = (c: Record<string, unknown>) => synthVoiceConfig(new Map(Object.entries(c)))

beforeEach(() => {
  configureVoice.mockClear()
  queueNote.mockClear()
  setMonoGate.mockClear()
})

describe('synth on bellows', () => {
  it('keeps the old inputs, output and control ids so saved flows still load', () => {
    expect(node.definition.inputs.map((p) => p.id)).toEqual(['note', 'velocity', 'gate', 'trigger'])
    expect(node.definition.outputs.map((p) => p.id)).toEqual(['audio'])
    for (const id of ['instrument', 'volume', 'attack', 'decay', 'sustain', 'release', 'cutoff', 'resonance', 'filterEnv', 'brightness', 'damping', 'detune']) {
      expect(node.definition.controls.find((c) => c.id === id)).toBeDefined()
    }
  })

  it('every old instrument value still resolves, and every preset sound names a real bellows preset', () => {
    for (const v of ['sine', 'moog', 'piano', 'organ', 'pluck', 'pad']) expect(SYNTH_SOUNDS.some((s) => s.value === v)).toBe(true)
    for (const s of SYNTH_SOUNDS) if (s.preset) expect(isPreset(s.preset)).toBe(true)
  })

  it('shaped sounds carry the envelope knobs into the engine', () => {
    const c = cfgOf({ instrument: 'moog', attack: 0.02, decay: 0.3, sustain: 0.4, release: 1.5, cutoff: 600 })
    expect(c.preset).toBe('')
    expect(c.engine).toBe('va')
    expect(c.params).toMatchObject({ shape: 0, attack: 0.02, decay: 0.3, sustain: 0.4, release: 1.5, cutoff: 600 })
    expect(cfgOf({ instrument: 'sine' }).params.shape).toBe(3)
    expect(cfgOf({ instrument: 'pluck' }).engine).toBe('pluck')
  })

  it('preset sounds go to the preset; unknown instruments fall back to sine; nothing is sent to the shared reverb', () => {
    expect(cfgOf({ instrument: 'piano' }).preset).toBe('dx-epiano')
    expect(cfgOf({ instrument: 'nope' }).params.shape).toBe(3)
    expect(cfgOf({ instrument: 'organ' }).send).toBe(0)
  })

  it('gate goes through the manager (which tracks and releases the held note)', () => {
    node.executor(makeContext({ note: 62, velocity: 127, gate: true }, {}, { nodeId: 's' }))
    expect(setMonoGate).toHaveBeenLastCalledWith('s', true, 62, 1)
    node.executor(makeContext({ note: 65, gate: false }, {}, { nodeId: 's' }))
    expect(setMonoGate).toHaveBeenLastCalledWith('s', false, 65, expect.any(Number))
  })
})

import { presetMacroParams, macrosForEngine, presetEngine, MACRO_MAP, PARAM_SPECS } from '@/registry/audio/bellows-instrument/engineParams'

describe('preset dials (macros)', () => {
  it('every mapped param exists on its engine', () => {
    for (const [engine, map] of Object.entries(MACRO_MAP)) {
      const names = new Set(PARAM_SPECS[engine].map((p) => p.name))
      for (const targets of Object.values(map)) for (const [param] of targets ?? []) expect(names.has(param), `${engine}.${param}`).toBe(true)
    }
  })

  it('centred dials leave the preset untouched; turned dials shade its own values within range', () => {
    const base = (n: string) => ({ damp: 0.5, decay: 2 } as Record<string, number>)[n]
    expect(presetMacroParams('pluck', base, {})).toEqual({})
    const p = presetMacroParams('pluck', base, { tone: 1, length: -1 })
    expect(p.damp).toBeLessThan(0.5)
    expect(p.decay).toBeCloseTo(0.5, 5)
    expect(presetMacroParams('pluck', base, { tone: 5 }).damp).toBeGreaterThanOrEqual(0)
  })

  it('a preset sound shows only the dials its engine responds to', () => {
    expect(presetEngine('cello')).toBe('string')
    expect(macrosForEngine('string')).toContain('vibrato')
    expect(SYNTH_SOUNDS.find((s) => s.value === 'strings')!.knobs).toContain('m_vibrato')
    expect(SYNTH_SOUNDS.find((s) => s.value === 'marimba')!.knobs).not.toContain('m_vibrato')
    expect(cfgOf({ instrument: 'piano', m_tone: 0.5 }).macros).toEqual({ tone: 0.5 })
  })
})
