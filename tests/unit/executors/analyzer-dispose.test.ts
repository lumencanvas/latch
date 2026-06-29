import { describe, it, expect, vi, beforeEach } from 'vitest'

// Track every analyser the executors create so we can assert it gets disposed.
const { created } = vi.hoisted(() => ({
  created: [] as Array<{ disposed: boolean }>,
}))

// Partial-mock Tone: real module except Waveform/FFT, which index.ts is the only
// consumer of here. The stubs record creation + disposal.
vi.mock('tone', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  class MockAnalyzer {
    disposed = false
    constructor() {
      created.push(this)
    }
    getValue() {
      return new Float32Array(8)
    }
    dispose() {
      this.disposed = true
    }
  }
  return { ...actual, Waveform: MockAnalyzer, FFT: MockAnalyzer }
})

import {
  oscilloscopeExecutor,
  equalizerExecutor,
  disposeDebugNode,
  disposeAllDebugState,
  disposeAnalyzer,
} from '@/engine/executors'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

function ctx(nodeId: string, inputs: Record<string, unknown>): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 1 / 60,
    totalTime: 0,
    frameCount: 1,
  }
}

// A stand-in Tone audio node: the executors call audio.connect(analyser) and later
// audio.disconnect(analyser).
function audioSource() {
  return { connect: vi.fn(), disconnect: vi.fn() }
}

describe('Tone analyser disposal (AUDIT §F)', () => {
  beforeEach(() => {
    disposeAllDebugState()
    created.length = 0
  })

  it('disposeAnalyzer disconnects from the source and disposes (null- and error-safe)', () => {
    const node = { dispose: vi.fn() }
    const source = { disconnect: vi.fn() }
    disposeAnalyzer(node, source)
    expect(source.disconnect).toHaveBeenCalledWith(node)
    expect(node.dispose).toHaveBeenCalled()

    expect(() => disposeAnalyzer(null, source)).not.toThrow() // null node is a no-op
    expect(() =>
      disposeAnalyzer({ dispose() { throw new Error('boom') } }, { disconnect() { throw new Error('boom') } }),
    ).not.toThrow() // throwing teardown is swallowed
  })

  it('oscilloscope disposes its waveform analyser when the node is removed', () => {
    const a = audioSource()
    oscilloscopeExecutor(ctx('scope1', { audio: a }))
    expect(created).toHaveLength(1)
    expect(created[0].disposed).toBe(false)

    disposeDebugNode('scope1')
    expect(created[0].disposed).toBe(true)
    expect(a.disconnect).toHaveBeenCalled()
  })

  it('oscilloscope disposes the old analyser when the audio source is rewired', () => {
    oscilloscopeExecutor(ctx('scope2', { audio: audioSource() }))
    oscilloscopeExecutor(ctx('scope2', { audio: audioSource() })) // different source -> rewire
    expect(created).toHaveLength(2)
    expect(created[0].disposed).toBe(true) // old analyser disposed
    expect(created[1].disposed).toBe(false) // new analyser alive
  })

  it('equalizer disposes its FFT analyser when audio is removed mid-session', () => {
    equalizerExecutor(ctx('eq1', { audio: audioSource() }))
    expect(created).toHaveLength(1)
    equalizerExecutor(ctx('eq1', {})) // no audio -> clear
    expect(created[0].disposed).toBe(true)
  })

  it('disposeAllDebugState disposes every analyser on stop', () => {
    oscilloscopeExecutor(ctx('scope3', { audio: audioSource() }))
    equalizerExecutor(ctx('eq2', { audio: audioSource() }))
    expect(created).toHaveLength(2)

    disposeAllDebugState()
    expect(created.every((c) => c.disposed)).toBe(true)
  })
})
