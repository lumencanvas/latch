import { describe, it, expect } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import { easingExecutor, EASINGS } from '@/engine/executors/easing'
import { easingNode } from '@/registry/math/easing'

function createContext(
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
  nodeId = 'easing-test'
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

const ease = (t: number, curve: string, clampInput = true) =>
  (easingExecutor(createContext({ t }, { curve, clampInput })) as Map<string, unknown>).get('value') as number

describe('easingExecutor', () => {
  it('every curve anchors at f(0)=0 and f(1)=1', () => {
    for (const curve of Object.keys(EASINGS)) {
      expect(ease(0, curve), `${curve} f(0)`).toBeCloseTo(0, 5)
      expect(ease(1, curve), `${curve} f(1)`).toBeCloseTo(1, 5)
    }
  })

  it('linear is the identity', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(ease(t, 'linear')).toBeCloseTo(t, 10)
    }
  })

  it('smooth (non-overshoot) curves are monotonic and stay within [0,1]', () => {
    const smooth = ['in-quad', 'out-quad', 'in-out-quad', 'in-cubic', 'out-cubic', 'in-out-cubic',
      'in-sine', 'out-sine', 'in-out-sine', 'in-expo', 'out-expo', 'in-out-expo']
    for (const curve of smooth) {
      let prev = -Infinity
      for (let i = 0; i <= 20; i++) {
        const v = ease(i / 20, curve)
        expect(v).toBeGreaterThanOrEqual(-1e-6)
        expect(v).toBeLessThanOrEqual(1 + 1e-6)
        expect(v).toBeGreaterThanOrEqual(prev - 1e-6) // non-decreasing
        prev = v
      }
    }
  })

  it('in-out curves are symmetric about the midpoint', () => {
    for (const curve of ['in-out-quad', 'in-out-cubic', 'in-out-sine']) {
      expect(ease(0.5, curve)).toBeCloseTo(0.5, 5)
      // f(t) + f(1-t) == 1 for symmetric in-out curves
      expect(ease(0.3, curve) + ease(0.7, curve)).toBeCloseTo(1, 5)
    }
  })

  it('out-quad eases out faster than linear early on', () => {
    expect(ease(0.25, 'out-quad')).toBeGreaterThan(0.25)
    expect(ease(0.25, 'in-quad')).toBeLessThan(0.25)
  })

  it('back/elastic overshoot the [0,1] range mid-curve', () => {
    // out-back overshoots above 1 before settling
    let overshoot = false
    for (let i = 1; i < 20; i++) if (ease(i / 20, 'out-back') > 1.0001) overshoot = true
    expect(overshoot).toBe(true)
    // in-back dips below 0 early
    expect(ease(0.2, 'in-back')).toBeLessThan(0)
  })

  it('clamps the input to [0,1] by default, but extrapolates when disabled', () => {
    expect(ease(2, 'linear', true)).toBeCloseTo(1, 5) // clamped
    expect(ease(-1, 'linear', true)).toBeCloseTo(0, 5)
    expect(ease(2, 'linear', false)).toBeCloseTo(2, 5) // extrapolated
  })

  it('falls back to linear for an unknown curve', () => {
    expect(ease(0.42, 'bogus')).toBeCloseTo(0.42, 6)
  })

  it('every curve option in the definition exists in EASINGS', () => {
    const curve = easingNode.controls.find(c => c.id === 'curve')
    const options = (curve?.props as { options?: string[] } | undefined)?.options ?? []
    expect(options.length).toBeGreaterThan(0)
    for (const opt of options) {
      expect(EASINGS[opt], `easing "${opt}" missing`).toBeDefined()
    }
  })
})
