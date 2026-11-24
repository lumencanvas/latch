import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeContext } from '../../_helpers/executionContext'

// The real manager boots an AudioWorklet kernel, which happy-dom can't provide — mock it so
// this exercises the NODE's per-frame responsibility (resolve config, delegate note/gate to
// the manager). The manager's own apply/gate/diff logic is covered by bellowsManager.test.ts
// against a fake kernel; kernel boot + master routing by the browser smoke + audible check.
const configureVoice = vi.fn()
const queueNote = vi.fn()
const setMonoGate = vi.fn()

vi.mock('@/registry/audio/bellows-instrument/bellowsManager', () => ({
  configureVoice: (...a: unknown[]) => configureVoice(...a),
  queueNote: (...a: unknown[]) => queueNote(...a),
  setMonoGate: (...a: unknown[]) => setMonoGate(...a),
}))

// Import AFTER the mock is registered (vi.mock is hoisted, so this is fine).
import node from '@/registry/audio/bellows-instrument/node'

const def = node.definition
const run = node.executor

beforeEach(() => {
  configureVoice.mockClear()
  queueNote.mockClear()
  setMonoGate.mockClear()
})

describe('bellows-instrument definition', () => {
  it('is an audio node with note/velocity/gate/trigger inputs and no audio output', () => {
    expect(def.id).toBe('bellows-instrument')
    expect(def.category).toBe('audio')
    expect(def.inputs.map((p) => p.id)).toEqual(['note', 'velocity', 'gate', 'trigger'])
    // Shared kernel routes straight to master — the node exposes no wireable audio out.
    expect(def.outputs).toEqual([])
  })

  it('exposes preset, engine, per-engine params, fx, send, gain and pan controls', () => {
    const byId = (id: string) => def.controls.find((c) => c.id === id)
    expect(byId('preset')?.type).toBe('select')
    const engine = byId('engine')
    expect(engine?.type).toBe('select')
    expect(engine?.when).toEqual({ preset: '' })
    expect((engine?.props?.options as { value: string }[]).map((o) => o.value)).toContain('va')
    // A representative per-engine param control, gated to its engine + manual mode.
    const cutoff = byId('p_va_cutoff')
    expect(cutoff?.when).toEqual({ engine: 'va', preset: '' })
    for (const id of ['insertFx', 'sendLevel', 'gain', 'pan']) expect(byId(id)).toBeDefined()
  })
})

describe('bellows-instrument executor', () => {
  it('resolves + pushes the voice config every frame and returns no outputs', () => {
    const out = run(makeContext({}, { engine: 'fm' }))
    expect(configureVoice).toHaveBeenCalledTimes(1)
    const [nodeId, cfg] = configureVoice.mock.calls[0]
    expect(nodeId).toBe('test-node')
    expect(cfg).toMatchObject({ preset: '', engine: 'fm' })
    expect(out).toBeInstanceOf(Map)
    expect((out as Map<string, unknown>).size).toBe(0)
  })

  it('fires a one-shot note on the trigger rising edge (boot-safe queueNote)', () => {
    run(makeContext({ note: 64, velocity: 0.5, trigger: true }, { engine: 'va' }, { nodeId: 'trig-node' }))
    expect(queueNote).toHaveBeenCalledWith('trig-node', 64, 0.5)
    // Held high on the next frame: not a new edge, no second note.
    run(makeContext({ note: 64, velocity: 0.5, trigger: true }, { engine: 'va' }, { nodeId: 'trig-node' }))
    expect(queueNote).toHaveBeenCalledTimes(1)
  })

  it('does not fire a note without a trigger', () => {
    run(makeContext({ note: 64 }, { engine: 'va' }))
    expect(queueNote).not.toHaveBeenCalled()
  })

  it('normalizes a 0–127 velocity to 0–1', () => {
    run(makeContext({ note: 60, velocity: 127, trigger: true }, {}, { nodeId: 'vel-node' }))
    expect(queueNote).toHaveBeenCalledWith('vel-node', 60, 1)
  })

  it('delegates the gate level + note/velocity to the manager every frame', () => {
    run(makeContext({ note: 62, velocity: 0.8, gate: true }, {}, { nodeId: 'gate-node' }))
    expect(setMonoGate).toHaveBeenCalledWith('gate-node', true, 62, 0.8)

    run(makeContext({ note: 62, gate: false }, {}, { nodeId: 'gate-node' }))
    expect(setMonoGate).toHaveBeenLastCalledWith('gate-node', false, 62, expect.any(Number))
  })
})
