import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeContext } from '../../_helpers/executionContext'

// Mock the shared kernel manager (happy-dom can't boot an AudioWorklet). This exercises the
// node's chord fan-out / gate logic deterministically.
const acquireVoice = vi.fn()
const setVoiceEngine = vi.fn()
const queueNote = vi.fn()
let voiceRecord: { instrument: ReturnType<typeof makeInstrument> | null } | null = null

vi.mock('@/registry/audio/bellows-instrument/bellowsManager', () => ({
  acquireVoice: (...a: unknown[]) => acquireVoice(...a),
  setVoiceEngine: (...a: unknown[]) => setVoiceEngine(...a),
  getVoice: () => (voiceRecord?.instrument ? voiceRecord : null),
  queueNote: (...a: unknown[]) => queueNote(...a),
}))

function makeInstrument() {
  return {
    note: vi.fn(),
    on: vi.fn((n: number) => n), // return the note as a stand-in held id
    off: vi.fn(),
    gain: vi.fn(),
    pan: vi.fn(),
    allOff: vi.fn(),
  }
}

import node from '@/registry/audio/poly-voice/node'

const def = node.definition
const run = node.executor

beforeEach(() => {
  acquireVoice.mockClear()
  setVoiceEngine.mockClear()
  queueNote.mockClear()
  voiceRecord = null
})

describe('poly-voice definition', () => {
  it('is an audio node taking a notes array + gate/trigger, no audio output', () => {
    expect(def.id).toBe('poly-voice')
    expect(def.category).toBe('audio')
    expect(def.inputs.map((p) => p.id)).toEqual(['notes', 'velocity', 'gate', 'trigger'])
    expect(def.outputs).toEqual([])
    expect(def.controls.map((c) => c.id).sort()).toEqual(['engine', 'gain', 'pan'])
  })
})

describe('poly-voice executor', () => {
  it('fires every note of the chord on the trigger edge (boot-safe queueNote)', () => {
    voiceRecord = { instrument: makeInstrument() }
    run(makeContext({ notes: [60, 64, 67], velocity: 0.5, trigger: true }, {}, { nodeId: 'p-trig' }))
    expect(queueNote).toHaveBeenCalledTimes(3)
    expect(queueNote).toHaveBeenCalledWith('p-trig', 60, 0.5)
    expect(queueNote).toHaveBeenCalledWith('p-trig', 64, 0.5)
    expect(queueNote).toHaveBeenCalledWith('p-trig', 67, 0.5)
  })

  it('queues the chord even while the voice is still booting', () => {
    voiceRecord = null // getVoice → null
    run(makeContext({ notes: [48, 52], velocity: 0.8, trigger: true }, {}, { nodeId: 'p-boot' }))
    expect(queueNote).toHaveBeenCalledTimes(2)
  })

  it('normalizes 0–127 velocity and clamps/rounds out-of-range notes', () => {
    voiceRecord = { instrument: makeInstrument() }
    run(makeContext({ notes: [60.4, 200, -5], velocity: 127, trigger: true }, {}, { nodeId: 'p-clamp' }))
    expect(queueNote).toHaveBeenCalledWith('p-clamp', 60, 1)
    expect(queueNote).toHaveBeenCalledWith('p-clamp', 127, 1)
    expect(queueNote).toHaveBeenCalledWith('p-clamp', 0, 1)
  })

  it('sustains the whole chord on gate high and releases every voice on gate low', () => {
    const inst = makeInstrument()
    voiceRecord = { instrument: inst }
    run(makeContext({ notes: [60, 64, 67], velocity: 0.8, gate: true }, {}, { nodeId: 'p-gate' }))
    expect(inst.on).toHaveBeenCalledTimes(3)
    expect(inst.on).toHaveBeenCalledWith(60, 0.8)

    run(makeContext({ notes: [60, 64, 67], gate: false }, {}, { nodeId: 'p-gate' }))
    expect(inst.off).toHaveBeenCalledTimes(3)
    expect(inst.off).toHaveBeenCalledWith(60)
  })

  it('does not re-trigger the held chord while gate stays high', () => {
    const inst = makeInstrument()
    voiceRecord = { instrument: inst }
    run(makeContext({ notes: [60, 64], gate: true }, {}, { nodeId: 'p-hold' }))
    run(makeContext({ notes: [60, 64], gate: true }, {}, { nodeId: 'p-hold' }))
    expect(inst.on).toHaveBeenCalledTimes(2) // once per note, not re-fired on frame 2
  })

  it('applies gain/pan once and skips an unchanged value', () => {
    const inst = makeInstrument()
    voiceRecord = { instrument: inst }
    run(makeContext({}, { engine: 'additive', gain: 0.5, pan: -0.3 }, { nodeId: 'p-param' }))
    run(makeContext({}, { engine: 'additive', gain: 0.5, pan: -0.3 }, { nodeId: 'p-param' }))
    expect(inst.gain).toHaveBeenCalledTimes(1)
    expect(inst.pan).toHaveBeenCalledTimes(1)
  })
})
