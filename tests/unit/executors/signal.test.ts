import { describe, it, expect } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import {
  slewLimiterExecutor,
  derivativeExecutor,
  integralExecutor,
  tweenToTargetExecutor,
  disposeAllSignalState,
} from '@/engine/executors/signal'

function ctx(
  nodeId: string,
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
  deltaTime = 0.05 // below the executors' MAX_DT (1/15) so dt passes through unclamped
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    getInputNode: () => null,
    deltaTime,
    totalTime: 0,
    frameCount: 0,
  } as unknown as ExecutionContext
}

const out = (m: unknown, key: string) => (m as Map<string, unknown>).get(key) as number

describe('slewLimiterExecutor', () => {
  it('initializes at the first input (no startup lurch) then limits the rate', () => {
    disposeAllSignalState()
    const id = 'slew-1'
    expect(out(slewLimiterExecutor(ctx(id, { value: 0 }, { rise: 10, fall: 10 })), 'value')).toBe(0)
    // rise 10/s × dt 0.05 = max step of 0.5 toward the new target of 10
    expect(out(slewLimiterExecutor(ctx(id, { value: 10 }, { rise: 10, fall: 10 })), 'value')).toBeCloseTo(0.5, 6)
    expect(out(slewLimiterExecutor(ctx(id, { value: 10 }, { rise: 10, fall: 10 })), 'value')).toBeCloseTo(1, 6)
  })

  it('honors asymmetric fall rate and reset', () => {
    disposeAllSignalState()
    const id = 'slew-2'
    slewLimiterExecutor(ctx(id, { value: 10 }, { rise: 100, fall: 1 })) // init at 10
    // fall 1/s × 0.05 = 0.05 step down toward 0
    expect(out(slewLimiterExecutor(ctx(id, { value: 0 }, { rise: 100, fall: 1 })), 'value')).toBeCloseTo(9.95, 6)
    // reset snaps straight to the target
    expect(out(slewLimiterExecutor(ctx(id, { value: 0, reset: true }, { rise: 100, fall: 1 })), 'value')).toBe(0)
  })
})

describe('derivativeExecutor', () => {
  it('is zero on the first frame, then reports rate of change per second', () => {
    disposeAllSignalState()
    const id = 'deriv-1'
    expect(out(derivativeExecutor(ctx(id, { value: 5 })), 'derivative')).toBe(0)
    // (6 - 5) / 0.05 = 20
    expect(out(derivativeExecutor(ctx(id, { value: 6 })), 'derivative')).toBeCloseTo(20, 6)
    // falling input → negative: (4 - 6) / 0.05 = -40
    expect(out(derivativeExecutor(ctx(id, { value: 4 })), 'derivative')).toBeCloseTo(-40, 6)
  })
})

describe('integralExecutor', () => {
  it('accumulates value·dt over time and resets', () => {
    disposeAllSignalState()
    const id = 'int-1'
    expect(out(integralExecutor(ctx(id, { value: 2 })), 'integral')).toBeCloseTo(0.1, 6)
    expect(out(integralExecutor(ctx(id, { value: 2 })), 'integral')).toBeCloseTo(0.2, 6)
    expect(out(integralExecutor(ctx(id, { value: 0, reset: true })), 'integral')).toBe(0)
  })

  it('clamps only when max > min', () => {
    disposeAllSignalState()
    const id = 'int-2'
    integralExecutor(ctx(id, { value: 10 }, { min: 0, max: 0.5 })) // 1.0 → clamped to 0.5
    expect(out(integralExecutor(ctx(id, { value: 10 }, { min: 0, max: 0.5 })), 'integral')).toBeCloseTo(0.5, 6)
  })
})

describe('tweenToTargetExecutor', () => {
  it('eases toward a moving target and flags arrival', () => {
    disposeAllSignalState()
    const id = 'tween-1'
    tweenToTargetExecutor(ctx(id, { target: 0 }, { speed: 5 })) // init at 0
    const first = tweenToTargetExecutor(ctx(id, { target: 10 }, { speed: 5 }))
    const v1 = out(first, 'value')
    expect(v1).toBeGreaterThan(0)
    expect(v1).toBeLessThan(10)
    expect((first as Map<string, unknown>).get('arrived')).toBe(false)
    // converges to the target after many frames
    let last = v1
    for (let i = 0; i < 500; i++) last = out(tweenToTargetExecutor(ctx(id, { target: 10 }, { speed: 5 })), 'value')
    expect(last).toBeCloseTo(10, 4)
  })

  it('reset snaps instantly to the target', () => {
    disposeAllSignalState()
    const id = 'tween-2'
    tweenToTargetExecutor(ctx(id, { target: 0 }, { speed: 1 }))
    const m = tweenToTargetExecutor(ctx(id, { target: 42, reset: true }, { speed: 1 }))
    expect(out(m, 'value')).toBe(42)
    expect((m as Map<string, unknown>).get('arrived')).toBe(true)
  })
})
