import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeContext } from '../../_helpers/executionContext'

// Mock the shared kernel manager (happy-dom can't boot an AudioWorklet). This exercises the
// NODE's chord fan-out + config/gate delegation; the manager's poly-gate/apply logic is
// covered against a fake kernel in bellowsManager.test.ts.
const configureVoice = vi.fn()
const queueNote = vi.fn()
const setPolyGate = vi.fn()
const routeChannel = vi.fn(() => null)

vi.mock('@/registry/audio/bellows-instrument/bellowsManager', () => ({
  configureVoice: (...a: unknown[]) => configureVoice(...a),
  queueNote: (...a: unknown[]) => queueNote(...a),
  setPolyGate: (...a: unknown[]) => setPolyGate(...a),
  routeChannel: (...a: unknown[]) => routeChannel(...a),
  getVoice: () => null,
}))

import node from '@/registry/audio/poly-voice/node'

const def = node.definition
const run = node.executor

beforeEach(() => {
  configureVoice.mockClear()
  queueNote.mockClear()
  setPolyGate.mockClear()
})

describe('poly-voice definition', () => {
  it('is an audio node taking a notes array + gate/trigger, with an audio output', () => {
    expect(def.id).toBe('poly-voice')
    expect(def.category).toBe('audio')
    expect(def.inputs.map((p) => p.id)).toEqual(['notes', 'velocity', 'gate', 'trigger'])
    expect(def.outputs).toEqual([{ id: 'audio', type: 'audio', label: 'Audio' }])
    // Shares the bellows-instrument surface: preset + engine + params + fx + gain/pan.
    expect(def.controls.some((c) => c.id === 'preset')).toBe(true)
    expect(def.controls.find((c) => c.id === 'engine')?.default).toBe('additive')
  })
})

describe('poly-voice executor', () => {
  it('pushes the resolved voice config every frame', () => {
    run(makeContext({}, { engine: 'additive' }, { nodeId: 'p-cfg' }))
    expect(configureVoice).toHaveBeenCalledTimes(1)
    expect(configureVoice.mock.calls[0][0]).toBe('p-cfg')
    expect(configureVoice.mock.calls[0][1]).toMatchObject({ engine: 'additive' })
  })

  it('fires every note of the chord on the trigger edge (boot-safe queueNote)', () => {
    run(makeContext({ notes: [60, 64, 67], velocity: 0.5, trigger: true }, {}, { nodeId: 'p-trig' }))
    expect(queueNote).toHaveBeenCalledTimes(3)
    expect(queueNote).toHaveBeenCalledWith('p-trig', 60, 0.5)
    expect(queueNote).toHaveBeenCalledWith('p-trig', 64, 0.5)
    expect(queueNote).toHaveBeenCalledWith('p-trig', 67, 0.5)
    // Held high on the next frame: not a new edge, no second chord.
    run(makeContext({ notes: [60, 64, 67], velocity: 0.5, trigger: true }, {}, { nodeId: 'p-trig' }))
    expect(queueNote).toHaveBeenCalledTimes(3)
  })

  it('normalizes 0–127 velocity and clamps/rounds out-of-range notes', () => {
    run(makeContext({ notes: [60.4, 200, -5], velocity: 127, trigger: true }, {}, { nodeId: 'p-clamp' }))
    expect(queueNote).toHaveBeenCalledWith('p-clamp', 60, 1)
    expect(queueNote).toHaveBeenCalledWith('p-clamp', 127, 1)
    expect(queueNote).toHaveBeenCalledWith('p-clamp', 0, 1)
  })

  it('does not fire the chord without a trigger', () => {
    run(makeContext({ notes: [60, 64] }, {}, { nodeId: 'p-notrig' }))
    expect(queueNote).not.toHaveBeenCalled()
  })

  it('delegates the gate level + parsed notes to the manager', () => {
    run(makeContext({ notes: [60, 64, 67], velocity: 0.8, gate: true }, {}, { nodeId: 'p-gate' }))
    expect(setPolyGate).toHaveBeenCalledWith('p-gate', true, [60, 64, 67], 0.8)

    run(makeContext({ notes: [60, 64, 67], gate: false }, {}, { nodeId: 'p-gate' }))
    expect(setPolyGate).toHaveBeenLastCalledWith('p-gate', false, [60, 64, 67], expect.any(Number))
  })
})
