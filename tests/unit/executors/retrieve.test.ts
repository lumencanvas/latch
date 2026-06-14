import { describe, it, expect } from 'vitest'
import { retrieveExecutor } from '@/engine/executors'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

function ctx(inputs: Record<string, unknown>, controls: Record<string, unknown> = {}): ExecutionContext {
  return {
    nodeId: 'r',
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 0,
    totalTime: 0,
    frameCount: 0,
  }
}

const corpus = [
  { id: 'a', vector: [1, 0], text: 'east' },
  { id: 'b', vector: [0.9, 0.1], text: 'east-ish' },
  { id: 'c', vector: [0, 1], text: 'north' },
]

type Match = { id: string; score: number; text: string }

describe('retrieveExecutor', () => {
  it('returns top-K matches by cosine similarity, highest first', () => {
    const out = retrieveExecutor(ctx({ corpus, query: [1, 0] }, { topK: 2 })) as Map<string, unknown>
    const matches = out.get('matches') as Match[]
    expect(matches.map((m) => m.id)).toEqual(['a', 'b'])
    expect(matches[0].score).toBeGreaterThan(matches[1].score)
  })

  it('builds a newline-joined context and bestText from the matches', () => {
    const out = retrieveExecutor(ctx({ corpus, query: [1, 0] }, { topK: 2 })) as Map<string, unknown>
    expect(out.get('context')).toBe('east\neast-ish')
    expect(out.get('bestText')).toBe('east')
  })

  it('defaults topK to 3', () => {
    const out = retrieveExecutor(ctx({ corpus, query: [1, 0] })) as Map<string, unknown>
    expect((out.get('matches') as Match[]).length).toBe(3)
  })

  it('returns empty results for missing / empty / invalid inputs', () => {
    const cases = [
      ctx({}),
      ctx({ corpus, query: [] }),
      ctx({ corpus: 'nope', query: [1, 0] }),
      ctx({ query: [1, 0] }),
    ]
    for (const c of cases) {
      const out = retrieveExecutor(c) as Map<string, unknown>
      expect(out.get('matches')).toEqual([])
      expect(out.get('context')).toBe('')
      expect(out.get('bestText')).toBe('')
    }
  })

  it('scores malformed corpus entries 0 without throwing (dim mismatch / no vector)', () => {
    const mixed = [
      { id: 'good', vector: [1, 0], text: 'ok' },
      { id: 'baddim', vector: [1, 0, 0], text: 'mismatch' },
      { id: 'novec', text: 'missing vector' },
    ]
    const out = retrieveExecutor(ctx({ corpus: mixed, query: [1, 0] }, { topK: 3 })) as Map<string, unknown>
    const matches = out.get('matches') as Match[]
    expect(matches[0].id).toBe('good')
    expect(matches.find((m) => m.id === 'baddim')!.score).toBe(0)
    expect(matches.find((m) => m.id === 'novec')!.score).toBe(0)
  })

  it('uses the array index as id when id is absent', () => {
    const out = retrieveExecutor(ctx({ corpus: [{ vector: [1, 0], text: 'x' }], query: [1, 0] })) as Map<string, unknown>
    expect((out.get('matches') as Match[])[0].id).toBe('0')
  })
})
