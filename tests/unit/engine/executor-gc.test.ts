import { describe, it, expect, beforeEach, vi } from 'vitest'
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
  gcMqttState,
  gcWebSocketState,
  gcHttpState,
} from '@/engine/executors'
import { gcClaspState } from '@/engine/executors/clasp'
import { changedExecutor, gcUtilityState, disposeAllUtilityState } from '@/engine/executors/utility'
import {
  subflowOutputExecutor,
  gcSubflowState,
  clearAllSubflowContexts,
  subflowContextCount,
} from '@/engine/executors/subflow'
import { sendExecutor, gcMessagingState, disposeAllMessagingState } from '@/engine/executors/messaging'
import { messageBus } from '@/services/messaging/MessageBus'
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

describe('gcUtilityState', () => {
  beforeEach(() => disposeAllUtilityState())

  it('drops change-tracking state for removed nodes but keeps valid ones', () => {
    // Seed prev-value for both nodes (first call always reports changed).
    changedExecutor(ctx('keep', { value: 5 }))
    changedExecutor(ctx('drop', { value: 5 }))
    // Same value again → unchanged (state retained).
    expect((changedExecutor(ctx('keep', { value: 5 })) as Map<string, unknown>).get('changed')).toBe(0)
    expect((changedExecutor(ctx('drop', { value: 5 })) as Map<string, unknown>).get('changed')).toBe(0)

    gcUtilityState(new Set(['keep'])) // 'drop' removed

    // 'drop' lost its prev → the same value now reads as changed again.
    expect((changedExecutor(ctx('drop', { value: 5 })) as Map<string, unknown>).get('changed')).toBe(1)
    // 'keep' retained its prev → still unchanged.
    expect((changedExecutor(ctx('keep', { value: 5 })) as Map<string, unknown>).get('changed')).toBe(0)
  })
})

describe('gcMessagingState', () => {
  beforeEach(() => disposeAllMessagingState())

  it('drops send change-detection state for removed nodes', () => {
    const sendSpy = vi.spyOn(messageBus, 'send')
    const send = (value: unknown) =>
      sendExecutor(ctx('drop', { value }, { channel: 'c', sendOnChange: true }))

    send(1) // new value → sends
    send(1) // unchanged → no send
    expect(sendSpy).toHaveBeenCalledTimes(1)

    gcMessagingState(new Set([])) // 'drop' removed → prevValue cleared

    send(1) // prev gone → sends again
    expect(sendSpy).toHaveBeenCalledTimes(2)
    sendSpy.mockRestore()
  })
})

describe('gcSubflowState / clearAllSubflowContexts', () => {
  beforeEach(() => clearAllSubflowContexts())

  // A subflow instance's context is keyed by its node id; subflow-output writes
  // into that context, creating it. gc must drop contexts for deleted instances.
  it('drops contexts for removed subflow instances but keeps valid ones', () => {
    subflowOutputExecutor(ctx('outA', { value: 1 }, { _subflowInstanceId: 'A', portId: 'p' }))
    subflowOutputExecutor(ctx('outB', { value: 2 }, { _subflowInstanceId: 'B', portId: 'p' }))
    expect(subflowContextCount()).toBe(2)

    gcSubflowState(new Set(['A'])) // 'B' instance removed
    expect(subflowContextCount()).toBe(1)

    clearAllSubflowContexts() // stop() teardown
    expect(subflowContextCount()).toBe(0)
  })

  it('is a no-op when nothing leaked', () => {
    expect(() => gcSubflowState(new Set(['x']))).not.toThrow()
    expect(subflowContextCount()).toBe(0)
  })
})

describe('connection executor GC (mqtt / websocket / http)', () => {
  // These executors override the legacy connectivity ones for their node types,
  // so their GC must be wired separately into the engine. Pin that the functions
  // exist on the index the engine imports and tolerate empty state.
  it('gc functions are callable and do not throw with no state', () => {
    expect(() => gcMqttState(new Set(['x']))).not.toThrow()
    expect(() => gcWebSocketState(new Set(['x']))).not.toThrow()
    expect(() => gcHttpState(new Set(['x']))).not.toThrow()
  })
})
