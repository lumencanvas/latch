import { describe, it, expect, beforeEach } from 'vitest'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import { springExecutor, disposeAllSpringState } from '@/engine/executors/spring'

function ctx(
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
  dt = 1 / 60,
  nodeId = 'spring-test'
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    getInputNode: () => null,
    deltaTime: dt,
    totalTime: 0,
    frameCount: 0,
  } as unknown as ExecutionContext
}

// Run the spring for `frames` steps toward a fixed target, return the last output.
function settle(
  target: number,
  controls: Record<string, unknown>,
  frames: number,
  nodeId = 'spring-test'
): Map<string, unknown> {
  let out = new Map<string, unknown>()
  for (let i = 0; i < frames; i++) out = springExecutor(ctx({ target }, controls, 1 / 60, nodeId)) as Map<string, unknown>
  return out
}

describe('springExecutor', () => {
  beforeEach(() => disposeAllSpringState())

  it('initialises at the target with no startup lurch', () => {
    const out = springExecutor(ctx({ target: 5 })) as Map<string, unknown>
    expect(out.get('value')).toBe(5)
    expect(out.get('velocity')).toBe(0)
  })

  it('converges to a new target and comes to rest', () => {
    springExecutor(ctx({ target: 0 })) // init at 0
    const out = settle(1, { tension: 120, friction: 14, mass: 1 }, 600)
    expect(out.get('value')).toBeCloseTo(1, 3)
    expect(out.get('velocity') as number).toBeCloseTo(0, 3)
    expect(out.get('atRest')).toBe(true)
  })

  it('overshoots past the target when underdamped', () => {
    springExecutor(ctx({ target: 0 }))
    let maxV = -Infinity
    for (let i = 0; i < 300; i++) {
      const v = (springExecutor(ctx({ target: 1 }, { tension: 200, friction: 5, mass: 1 })) as Map<string, unknown>).get('value') as number
      maxV = Math.max(maxV, v)
    }
    expect(maxV).toBeGreaterThan(1) // bounced past the target
  })

  it('does not overshoot when heavily damped', () => {
    springExecutor(ctx({ target: 0 }))
    let maxV = -Infinity
    for (let i = 0; i < 600; i++) {
      const v = (springExecutor(ctx({ target: 1 }, { tension: 120, friction: 60, mass: 1 })) as Map<string, unknown>).get('value') as number
      maxV = Math.max(maxV, v)
    }
    expect(maxV).toBeLessThanOrEqual(1 + 1e-6) // monotonic approach
  })

  it('reset snaps to the target with zero velocity', () => {
    springExecutor(ctx({ target: 0 }))
    // get it moving toward 1
    for (let i = 0; i < 5; i++) springExecutor(ctx({ target: 1 }, { tension: 120, friction: 14 }))
    const out = springExecutor(ctx({ target: 1, reset: true })) as Map<string, unknown>
    expect(out.get('value')).toBe(1)
    expect(out.get('velocity')).toBe(0)
  })

  it('stays finite under a huge delta time (dt is clamped)', () => {
    springExecutor(ctx({ target: 0 }))
    const out = springExecutor(ctx({ target: 1000 }, { tension: 500, friction: 1 }, 5)) as Map<string, unknown>
    expect(Number.isFinite(out.get('value') as number)).toBe(true)
  })

  it('keeps separate state per node id', () => {
    springExecutor(ctx({ target: 0 }, {}, 1 / 60, 'a'))
    springExecutor(ctx({ target: 100 }, {}, 1 / 60, 'b'))
    const a = settle(0, {}, 1, 'a').get('value') as number
    const b = settle(100, {}, 1, 'b').get('value') as number
    expect(a).toBeCloseTo(0, 3)
    expect(b).toBeCloseTo(100, 1)
  })
})
