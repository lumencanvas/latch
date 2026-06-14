import { describe, it, expect } from 'vitest'
import { VectorStore, cosineSimilarity } from '@/services/ai/VectorStore'

describe('cosineSimilarity', () => {
  it('is 1 for identical direction, 0 for orthogonal, -1 for opposite', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1) // magnitude-invariant
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1)
  })

  it('matches a hand-computed value', () => {
    // dot=11, |a|=5, |b|=sqrt(5) -> 11/(5*sqrt5)
    expect(cosineSimilarity([3, 4], [1, 2])).toBeCloseTo(11 / (5 * Math.sqrt(5)))
  })

  it('returns 0 (not NaN) for zero, empty, or mismatched vectors', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
    expect(cosineSimilarity([], [])).toBe(0)
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0)
  })
})

describe('VectorStore', () => {
  it('adds, reports size/dimension, and reads back copies', () => {
    const s = new VectorStore<string>()
    expect(s.size).toBe(0)
    expect(s.dimension).toBeNull()

    s.add('a', [1, 0, 0], 'alpha')
    s.add('b', [0, 1, 0], 'beta')
    expect(s.size).toBe(2)
    expect(s.dimension).toBe(3)
    expect(s.has('a')).toBe(true)
    expect(s.get('a')?.metadata).toBe('alpha')
  })

  it('does not alias the caller\'s array', () => {
    const s = new VectorStore()
    const v = [1, 2, 3]
    s.add('a', v)
    v[0] = 999
    expect(s.get('a')?.vector).toEqual([1, 2, 3])
  })

  it('replaces an existing id', () => {
    const s = new VectorStore()
    s.add('a', [1, 0])
    s.add('a', [0, 1])
    expect(s.size).toBe(1)
    expect(s.get('a')?.vector).toEqual([0, 1])
  })

  it('enforces a consistent dimension and rejects empty vectors', () => {
    const s = new VectorStore()
    s.add('a', [1, 2, 3])
    expect(() => s.add('b', [1, 2])).toThrow(/dimension mismatch/)
    expect(() => s.add('c', [])).toThrow(/empty vector/)
  })

  it('removes records and resets dimension when emptied', () => {
    const s = new VectorStore()
    s.add('a', [1, 2])
    expect(s.remove('a')).toBe(true)
    expect(s.remove('a')).toBe(false)
    expect(s.size).toBe(0)
    expect(s.dimension).toBeNull()
    s.add('b', [1, 2, 3]) // different dim now allowed after emptying
    expect(s.dimension).toBe(3)
  })

  it('queries top-k by cosine similarity, highest first, with metadata', () => {
    const s = new VectorStore<{ text: string }>()
    s.add('x', [1, 0], { text: 'east' })
    s.add('y', [0.9, 0.1], { text: 'east-ish' })
    s.add('z', [0, 1], { text: 'north' })

    const top = s.query([1, 0], 2)
    expect(top.map((m) => m.id)).toEqual(['x', 'y'])
    expect(top[0].score).toBeGreaterThan(top[1].score)
    expect(top[0].metadata).toEqual({ text: 'east' })
  })

  it('handles topK larger than the store, topK<=0, and an empty store', () => {
    const s = new VectorStore()
    expect(s.query([1, 0], 5)).toEqual([])
    s.add('a', [1, 0])
    s.add('b', [0, 1])
    expect(s.query([1, 0], 10)).toHaveLength(2)
    expect(s.query([1, 0], 0)).toEqual([])
    expect(s.query([1, 0], -1)).toEqual([])
  })

  it('round-trips through toJSON / fromJSON', () => {
    const s = new VectorStore<number>()
    s.add('a', [1, 2], 1)
    s.add('b', [3, 4], 2)
    const restored = VectorStore.fromJSON(s.toJSON())
    expect(restored.size).toBe(2)
    expect(restored.dimension).toBe(2)
    expect(restored.query([3, 4], 1)[0].id).toBe('b')
  })

  it('clears everything', () => {
    const s = new VectorStore()
    s.add('a', [1, 2])
    s.clear()
    expect(s.size).toBe(0)
    expect(s.dimension).toBeNull()
    expect(s.query([1, 2], 1)).toEqual([])
  })
})
