import { describe, it, expect } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import { noiseExecutor, fbmNoise } from '@/engine/executors/noise'

function createContext(
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
  nodeId = 'noise-test'
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    getInputNode: () => null,
    deltaTime: 0.016,
    totalTime: 0,
    frameCount: 0,
  } as unknown as ExecutionContext
}

const valueAt = (inputs: Record<string, unknown>, controls: Record<string, unknown> = {}) =>
  noiseExecutor(createContext(inputs, controls)) as Map<string, unknown>

describe('noiseExecutor', () => {
  it('is deterministic for the same coordinates', () => {
    const a = valueAt({ x: 1.5, y: -2.25, z: 0.5 })
    const b = valueAt({ x: 1.5, y: -2.25, z: 0.5 })
    expect(a.get('value')).toBe(b.get('value'))
    expect(a.get('normalized')).toBe(b.get('normalized'))
  })

  it('keeps value in [-1,1] and normalized in [0,1] across the field', () => {
    for (let i = 0; i < 400; i++) {
      const x = (i % 20) * 0.37
      const y = Math.floor(i / 20) * 0.53
      const out = valueAt({ x, y, z: i * 0.1 }, { frequency: 1.7, octaves: 3 })
      const value = out.get('value') as number
      const normalized = out.get('normalized') as number
      expect(value).toBeGreaterThanOrEqual(-1)
      expect(value).toBeLessThanOrEqual(1)
      expect(normalized).toBeGreaterThanOrEqual(0)
      expect(normalized).toBeLessThanOrEqual(1)
    }
  })

  it('is coherent — a tiny step in input gives a small change in output', () => {
    const a = valueAt({ x: 4.0 }).get('value') as number
    const b = valueAt({ x: 4.001 }).get('value') as number
    expect(Math.abs(a - b)).toBeLessThan(0.05)
  })

  it('is not constant — varies meaningfully over distance', () => {
    const a = valueAt({ x: 0 }).get('value') as number
    const b = valueAt({ x: 7.3 }).get('value') as number
    expect(Math.abs(a - b)).toBeGreaterThan(0.01)
  })

  it('produces a different field for a different seed', () => {
    const a = valueAt({ x: 2, y: 2 }, { seed: 0 }).get('value') as number
    const b = valueAt({ x: 2, y: 2 }, { seed: 42 }).get('value') as number
    expect(a).not.toBe(b)
  })

  it('normalized is exactly value mapped to 0..1', () => {
    const out = valueAt({ x: 3.3, y: 1.1 })
    const value = out.get('value') as number
    const normalized = out.get('normalized') as number
    expect(normalized).toBeCloseTo(value * 0.5 + 0.5, 10)
  })

  it('defaults to the origin value when no inputs are connected', () => {
    const out = valueAt({})
    expect(typeof out.get('value')).toBe('number')
    expect(Number.isFinite(out.get('value'))).toBe(true)
  })

  it('fbm with more octaves stays within range', () => {
    for (let oct = 1; oct <= 8; oct++) {
      const v = fbmNoise(1.1, 2.2, 3.3, oct)
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
