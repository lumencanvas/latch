import { describe, it, expect, beforeEach } from 'vitest'
import {
  vectorMemoryExecutor,
  retrieveExecutor,
  disposeVectorMemoryNode,
  disposeAllRAGState,
  gcRAGState,
} from '@/engine/executors'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

function ctx(
  nodeId: string,
  inputs: Record<string, unknown>,
  controls: Record<string, unknown> = {},
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 0,
    totalTime: 0,
    frameCount: 0,
  }
}

type Doc = { id: string; vector: number[]; text: string }

/** Run one frame and read the corpus + count outputs. */
function step(
  nodeId: string,
  inputs: Record<string, unknown>,
  controls: Record<string, unknown> = {},
): { corpus: Doc[]; count: number } {
  const out = vectorMemoryExecutor(ctx(nodeId, inputs, controls)) as Map<string, unknown>
  return { corpus: out.get('corpus') as Doc[], count: out.get('count') as number }
}

describe('vectorMemoryExecutor', () => {
  // Executor state is module-global keyed by nodeId; reset between tests.
  beforeEach(() => disposeAllRAGState())

  it('adds the current vector+text to the corpus on a rising add trigger', () => {
    const r = step('m', { vector: [1, 0], text: 'east', add: true })
    expect(r.count).toBe(1)
    expect(r.corpus).toHaveLength(1)
    expect(r.corpus[0].vector).toEqual([1, 0])
    expect(r.corpus[0].text).toBe('east')
    expect(typeof r.corpus[0].id).toBe('string')
  })

  it('does not add while add is not triggered, even if a vector is present', () => {
    const r = step('m', { vector: [1, 0], text: 'east' })
    expect(r.count).toBe(0)
    expect(r.corpus).toEqual([])
  })

  it('adds only once for a held (non-edge) add signal', () => {
    step('m', { vector: [1, 0], text: 'a', add: true }) // rising edge -> add
    step('m', { vector: [1, 0], text: 'a', add: true }) // still held -> no add
    const r = step('m', { vector: [1, 0], text: 'a', add: true }) // still held -> no add
    expect(r.count).toBe(1)
  })

  it('accumulates distinct embeddings across separate triggers', () => {
    step('m', { vector: [1, 0], text: 'a', add: true })
    step('m', { add: false }) // release so the next true is a fresh edge
    step('m', { vector: [0, 1], text: 'b', add: true })
    step('m', { add: false })
    const r = step('m', { vector: [0.5, 0.5], text: 'c', add: true })
    expect(r.count).toBe(3)
    expect(r.corpus.map((d) => d.text)).toEqual(['a', 'b', 'c'])
  })

  it('empties the store on a rising clear trigger', () => {
    step('m', { vector: [1, 0], text: 'a', add: true })
    step('m', { add: false })
    step('m', { vector: [0, 1], text: 'b', add: true })
    const r = step('m', { clear: true })
    expect(r.count).toBe(0)
    expect(r.corpus).toEqual([])
  })

  it('applies clear before add when both fire on the same frame', () => {
    step('m', { vector: [1, 0], text: 'old', add: true })
    step('m', { add: false })
    // clear empties first, then add captures the current vector -> 1 fresh entry
    const r = step('m', { vector: [0, 1], text: 'new', add: true, clear: true })
    expect(r.count).toBe(1)
    expect(r.corpus.map((d) => d.text)).toEqual(['new'])
  })

  it('accepts new entries again after a clear', () => {
    step('m', { vector: [1, 0], text: 'a', add: true })
    step('m', { clear: true })
    step('m', { clear: false, add: false })
    const r = step('m', { vector: [0, 1], text: 'b', add: true })
    expect(r.count).toBe(1)
    expect(r.corpus[0].text).toBe('b')
  })

  it('produces a corpus directly consumable by the Retrieve node', () => {
    step('m', { vector: [1, 0], text: 'east', add: true })
    step('m', { add: false })
    const { corpus } = step('m', { vector: [0, 1], text: 'north', add: true })

    const out = retrieveExecutor(ctx('r', { corpus, query: [1, 0] }, { topK: 1 })) as Map<string, unknown>
    const matches = out.get('matches') as { id: string; text: string }[]
    expect(matches[0].text).toBe('east')
    expect(out.get('bestText')).toBe('east')
  })

  it('evicts the oldest entries when maxSize is exceeded', () => {
    const controls = { maxSize: 2 }
    step('m', { vector: [1, 0], text: 'a', add: true }, controls)
    step('m', { add: false }, controls)
    step('m', { vector: [0, 1], text: 'b', add: true }, controls)
    step('m', { add: false }, controls)
    const r = step('m', { vector: [1, 1], text: 'c', add: true }, controls)
    expect(r.count).toBe(2)
    expect(r.corpus.map((d) => d.text)).toEqual(['b', 'c'])
  })

  it('ignores an add trigger with a missing or empty vector', () => {
    const a = step('m', { text: 'no vector', add: true })
    expect(a.count).toBe(0)
    step('m', { add: false })
    const b = step('m', { vector: [], text: 'empty', add: true })
    expect(b.count).toBe(0)
  })

  it('does not throw or corrupt the store on a dimension mismatch', () => {
    step('m', { vector: [1, 0], text: 'ok', add: true })
    step('m', { add: false })
    const r = step('m', { vector: [1, 0, 0], text: 'mismatch', add: true })
    expect(r.count).toBe(1)
    expect(r.corpus.map((d) => d.text)).toEqual(['ok'])
  })

  it('coerces a non-string text to a string (empty when absent)', () => {
    const r = step('m', { vector: [1, 0], add: true })
    expect(r.corpus[0].text).toBe('')
  })

  it('keeps a stable corpus reference between frames when nothing changed', () => {
    const first = vectorMemoryExecutor(ctx('m', { vector: [1, 0], text: 'a', add: true })).get('corpus')
    const second = vectorMemoryExecutor(ctx('m', { add: false })).get('corpus')
    expect(second).toBe(first)
  })

  it('isolates state per node id', () => {
    step('a', { vector: [1, 0], text: 'x', add: true })
    const b = step('b', { vector: [0, 1], text: 'y', add: true })
    expect(b.count).toBe(1)
    expect(b.corpus[0].text).toBe('y')
  })

  it('disposeVectorMemoryNode drops only that node’s store', () => {
    step('a', { vector: [1, 0], text: 'x', add: true })
    step('b', { vector: [0, 1], text: 'y', add: true })
    disposeVectorMemoryNode('a')
    expect(step('a', { add: false }).count).toBe(0) // fresh store
    expect(step('b', { add: false }).count).toBe(1) // untouched
  })

  it('gcRAGState removes stores for node ids no longer in the graph', () => {
    step('a', { vector: [1, 0], text: 'x', add: true })
    step('b', { vector: [0, 1], text: 'y', add: true })
    gcRAGState(new Set(['b']))
    expect(step('a', { add: false }).count).toBe(0) // gc'd
    expect(step('b', { add: false }).count).toBe(1) // retained
  })
})
