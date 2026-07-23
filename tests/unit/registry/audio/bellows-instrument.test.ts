import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeContext } from '../../_helpers/executionContext'

// The real manager boots an AudioWorklet kernel, which happy-dom can't provide — mock
// it so this exercises the node's per-frame note/gate/param logic deterministically.
// (Kernel boot + master routing are covered by the browser smoke + the maintainer's
// audible check, not unit-testable here.)
const acquireVoice = vi.fn()
const setVoiceEngine = vi.fn()
const queueNote = vi.fn()
let voiceRecord: {
  instrument: ReturnType<typeof makeInstrument> | null
  engine: string
  heldId: number | null
  gateHigh: boolean
  prevGain: number
  prevPan: number
  error: string | null
} | null = null

vi.mock('@/registry/audio/bellows-instrument/bellowsManager', () => ({
  acquireVoice: (...a: unknown[]) => acquireVoice(...a),
  setVoiceEngine: (...a: unknown[]) => setVoiceEngine(...a),
  getVoice: () => (voiceRecord?.instrument ? voiceRecord : null),
  queueNote: (...a: unknown[]) => queueNote(...a),
}))

function makeInstrument() {
  return {
    note: vi.fn(),
    on: vi.fn(() => 42),
    off: vi.fn(),
    gain: vi.fn(),
    pan: vi.fn(),
    allOff: vi.fn(),
  }
}

// Import AFTER the mock is registered (vi.mock is hoisted, so this is fine).
import node from '@/registry/audio/bellows-instrument/node'

const def = node.definition
const run = node.executor

beforeEach(() => {
  acquireVoice.mockClear()
  setVoiceEngine.mockClear()
  queueNote.mockClear()
  voiceRecord = null
})

describe('bellows-instrument definition', () => {
  it('is an audio node with note/velocity/gate/trigger inputs and no audio output', () => {
    expect(def.id).toBe('bellows-instrument')
    expect(def.category).toBe('audio')
    expect(def.inputs.map((p) => p.id)).toEqual(['note', 'velocity', 'gate', 'trigger'])
    // Shared kernel routes straight to master — the node exposes no wireable audio out.
    expect(def.outputs).toEqual([])
  })

  it('exposes engine (select), gain and pan controls', () => {
    const engine = def.controls.find((c) => c.id === 'engine')
    expect(engine?.type).toBe('select')
    expect((engine?.props?.options as string[])).toContain('va')
    expect((engine?.props?.options as string[])).toContain('granular')
    expect(def.controls.map((c) => c.id).sort()).toEqual(['engine', 'gain', 'pan'])
  })
})

describe('bellows-instrument executor', () => {
  it('acquires + selects the engine every frame and returns no outputs', () => {
    const out = run(makeContext({}, { engine: 'fm' }))
    expect(acquireVoice).toHaveBeenCalledWith('test-node', 'fm')
    expect(setVoiceEngine).toHaveBeenCalledWith('test-node', 'fm')
    expect(out).toBeInstanceOf(Map)
    expect((out as Map<string, unknown>).size).toBe(0)
  })

  it('does nothing to a voice that has not booted yet', () => {
    voiceRecord = null // getVoice → null
    expect(() => run(makeContext({ trigger: true }, { engine: 'va' }))).not.toThrow()
  })

  it('fires a one-shot note on the trigger rising edge (via boot-safe queueNote)', () => {
    const inst = makeInstrument()
    voiceRecord = { instrument: inst, engine: 'va', heldId: null, gateHigh: false, prevGain: NaN, prevPan: NaN, error: null }

    run(makeContext({ note: 64, velocity: 0.5, trigger: true }, { engine: 'va' }, { nodeId: 'trig-node' }))
    expect(queueNote).toHaveBeenCalledWith('trig-node', 64, 0.5)
  })

  it('queues the trigger even while the voice is still booting (not dropped)', () => {
    voiceRecord = null // getVoice → null (kernel still booting)
    run(makeContext({ note: 67, velocity: 0.8, trigger: true }, {}, { nodeId: 'boot-node' }))
    expect(queueNote).toHaveBeenCalledWith('boot-node', 67, 0.8)
  })

  it('normalizes a 0–127 velocity to 0–1', () => {
    run(makeContext({ note: 60, velocity: 127, trigger: true }, {}, { nodeId: 'vel-node' }))
    expect(queueNote).toHaveBeenCalledWith('vel-node', 60, 1)
  })

  it('sustains on the gate rising edge and releases on the falling edge', () => {
    const inst = makeInstrument()
    voiceRecord = { instrument: inst, engine: 'va', heldId: null, gateHigh: false, prevGain: NaN, prevPan: NaN, error: null }

    // Rising: gate true (was false) → on(), storing the held id.
    run(makeContext({ note: 62, velocity: 0.8, gate: true }, {}, { nodeId: 'gate-node' }))
    expect(inst.on).toHaveBeenCalledWith(62, 0.8)
    expect(voiceRecord.heldId).toBe(42)

    // Falling: gate false → off() with the stored id.
    run(makeContext({ gate: false }, {}, { nodeId: 'gate-node' }))
    expect(inst.off).toHaveBeenCalledWith(42)
    expect(voiceRecord.heldId).toBeNull()
  })

  it('applies gain/pan once and skips re-applying an unchanged value', () => {
    const inst = makeInstrument()
    voiceRecord = { instrument: inst, engine: 'va', heldId: null, gateHigh: false, prevGain: NaN, prevPan: NaN, error: null }

    run(makeContext({}, { engine: 'va', gain: 0.5, pan: -0.3 }, { nodeId: 'p-node' }))
    expect(inst.gain).toHaveBeenCalledWith(0.5)
    expect(inst.pan).toHaveBeenCalledWith(-0.3)

    // Same values next frame → no redundant kernel writes.
    run(makeContext({}, { engine: 'va', gain: 0.5, pan: -0.3 }, { nodeId: 'p-node' }))
    expect(inst.gain).toHaveBeenCalledTimes(1)
    expect(inst.pan).toHaveBeenCalledTimes(1)
  })
})
