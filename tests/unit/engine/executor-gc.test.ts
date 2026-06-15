import { describe, it, expect, beforeEach } from 'vitest'
import {
  smoothExecutor,
  gateExecutor,
  startExecutor,
  monitorExecutor,
  gcInputState,
  gcTimingState,
  gcDebugState,
  disposeAllInputState,
  disposeAllTimingState,
  disposeAllDebugState,
} from '@/engine/executors'
import { gcClaspState } from '@/engine/executors/clasp'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

/**
 * Per-node executor state is cleared in two ways: `disposeAll*` on stop(), and
 * `gc*(validNodeIds)` on per-node removal (the engine calls these from
 * updateGraph when a node disappears). Timing/debug/input/clasp groups previously
 * had a `disposeAll*` but no `gc*`, so their per-node state (incl. heavy audio
 * analysers + clasp media) leaked until stop(). These tests pin the new `gc*`.
 */
function ctx(
  nodeId: string,
  inputs: Record<string, unknown> = {},
  controls: Record<string, unknown> = {},
  frameCount = 1,
): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 1 / 60,
    totalTime: 0,
    frameCount,
  }
}

describe('gcInputState', () => {
  beforeEach(() => disposeAllInputState())

  it('drops smooth + gate state for removed nodes but keeps valid ones', () => {
    // Seed state for two nodes.
    smoothExecutor(ctx('keep', { value: 0 }))
    smoothExecutor(ctx('drop', { value: 0 }))
    gateExecutor(ctx('drop', { value: 5, gate: true }))

    gcInputState(new Set(['keep'])) // 'drop' is gone

    // 'drop' smooth re-initializes to its new target (state was cleared)...
    expect((smoothExecutor(ctx('drop', { value: 9 })) as Map<string, unknown>).get('result')).toBe(9)
    // ...and its gate value is gone.
    expect((gateExecutor(ctx('drop', { gate: false })) as Map<string, unknown>).get('result')).toBeUndefined()

    // 'keep' eases from its retained 0 toward 1 (state preserved, no jump).
    const kept = (smoothExecutor(ctx('keep', { value: 1 })) as Map<string, unknown>).get('result') as number
    expect(kept).toBeGreaterThan(0)
    expect(kept).toBeLessThan(1)
  })
})

describe('gcTimingState', () => {
  beforeEach(() => disposeAllTimingState())

  it('lets a removed start node fire again; keeps a valid one latched', () => {
    expect((startExecutor(ctx('s')) as Map<string, unknown>).get('trigger')).toBe(1) // fires
    expect((startExecutor(ctx('s')) as Map<string, unknown>).get('trigger')).toBeUndefined() // latched

    gcTimingState(new Set([])) // 's' removed

    expect((startExecutor(ctx('s')) as Map<string, unknown>).get('trigger')).toBe(1) // re-fires after gc
  })
})

describe('gcDebugState', () => {
  beforeEach(() => disposeAllDebugState())

  it('drops monitor state for removed nodes', () => {
    monitorExecutor(ctx('m', { value: 7 }))
    expect((monitorExecutor(ctx('m', {})) as Map<string, unknown>).get('display')).toBe(7) // retained

    gcDebugState(new Set([])) // 'm' removed

    expect((monitorExecutor(ctx('m', {})) as Map<string, unknown>).get('display')).toBeUndefined()
  })
})

describe('gcClaspState', () => {
  it('is callable and does not throw when there is no state', () => {
    expect(() => gcClaspState(new Set(['x']))).not.toThrow()
  })
})
