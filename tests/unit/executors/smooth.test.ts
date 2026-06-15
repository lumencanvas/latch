import { describe, it, expect, beforeEach } from 'vitest'
import { smoothExecutor, disposeAllInputState } from '@/engine/executors'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

/**
 * The smooth node applies exponential smoothing. It was a no-op: it read `_prev`
 * from controls (where it never exists) and returned it as an *output* (which the
 * engine doesn't feed back), so `prev === target` every frame and the output just
 * tracked the input. These tests pin real smoothing via per-node module state.
 */
function frame(nodeId: string, value: number, factor = 0.3, deltaTime = 1 / 60): number {
  const ctx: ExecutionContext = {
    nodeId,
    inputs: new Map<string, unknown>([['value', value]]),
    controls: new Map<string, unknown>([['factor', factor]]),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime,
    totalTime: 0,
    frameCount: 0,
  }
  return (smoothExecutor(ctx) as Map<string, unknown>).get('result') as number
}

describe('smoothExecutor', () => {
  // State is module-global keyed by nodeId; reset between tests (stop() path).
  beforeEach(() => disposeAllInputState())

  it('initializes to the first target', () => {
    expect(frame('s', 0)).toBe(0)
  })

  it('eases toward a changed target instead of jumping to it', () => {
    frame('s', 0) // init at 0
    const r = frame('s', 1) // target jumps to 1
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(1) // would be exactly 1 with the pass-through bug
  })

  it('converges to the target monotonically over many frames', () => {
    frame('s', 0)
    let prev = 0
    let last = 0
    for (let i = 0; i < 300; i++) {
      last = frame('s', 1)
      expect(last).toBeGreaterThanOrEqual(prev)
      prev = last
    }
    expect(last).toBeCloseTo(1, 3)
  })

  it('keeps per-node state isolated', () => {
    frame('a', 0)
    frame('b', 0)
    frame('a', 1) // a takes one step toward 1
    const a = frame('a', 1) // a's second step
    const b = frame('b', 1) // b's first step
    expect(a).toBeGreaterThan(b)
  })

  it('resets when input state is cleared (stop)', () => {
    frame('s', 0)
    frame('s', 1)
    disposeAllInputState()
    expect(frame('s', 5)).toBe(5) // re-initializes to the new target
  })
})
