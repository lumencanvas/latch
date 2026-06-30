/**
 * MQTT subscription teardown across the three paths that release a subscription.
 *
 * The `defineNodeState` migration moved the full teardown (message-listener
 * unsubscribe + adapter.unsubscribe(topic)) into the store's dispose callback. These
 * tests pin that each path keeps its intended semantics:
 *   - rewire to a new topic → release the OLD message listener only (NOT adapter.unsubscribe)
 *   - topic cleared          → full teardown (unsubscribe + adapter.unsubscribe)
 *   - node removed (gc)      → full teardown
 * There was no prior mqtt executor test; this is also its first behavioral coverage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Per-test list of message-listener unsubscribe spies handed out by adapter.onMessage.
const unsubs: Array<ReturnType<typeof vi.fn>> = []

vi.mock('@/stores/connections', () => {
  const adapter = {
    protocol: 'mqtt',
    status: 'connected' as string,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    publish: vi.fn(),
    onMessage: vi.fn(() => {
      const u = vi.fn()
      unsubs.push(u)
      return u
    }),
  }
  const store = { getAdapter: () => adapter, connect: vi.fn(() => Promise.resolve()), __adapter: adapter }
  return { useConnectionsStore: () => store }
})

import { mqttExecutor, disposeAllMqttNodes, gcMqttState, nodeSubscriptions } from '@/engine/executors/mqtt'
import { useConnectionsStore } from '@/stores/connections'
import { createExecutionContext } from '@/engine/ExecutionEngine'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = (useConnectionsStore() as any).__adapter

// Build the context through the real factory so `ctx.connection()` resolves the mocked
// store → mocked adapter → no-secret MqttHandle (exercises the step-6b wiring end to end).
function frame(nodeId: string, topic: string): ExecutionContext {
  return createExecutionContext({
    nodeId,
    inputs: new Map(),
    controls: new Map<string, unknown>([['connectionId', 'conn-1'], ['topic', topic], ['qos', 0]]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    definition: { inputs: [], outputs: [], controls: [] } as any,
    deltaTime: 16,
    totalTime: 0,
    frameCount: 0,
  })
}

describe('MQTT subscription teardown', () => {
  beforeEach(() => {
    disposeAllMqttNodes()
    unsubs.length = 0
    adapter.subscribe.mockClear()
    adapter.unsubscribe.mockClear()
    adapter.onMessage.mockClear()
    adapter.status = 'connected'
  })

  it('rewire to a new topic releases only the old message listener (no adapter.unsubscribe)', async () => {
    await mqttExecutor(frame('n1', 'topic/a'))
    expect(adapter.subscribe).toHaveBeenCalledWith('topic/a', 0)
    expect(unsubs).toHaveLength(1)

    await mqttExecutor(frame('n1', 'topic/b')) // same node, new topic

    expect(unsubs[0]).toHaveBeenCalledTimes(1) // old listener released once
    expect(adapter.subscribe).toHaveBeenCalledWith('topic/b', 0)
    expect(adapter.unsubscribe).not.toHaveBeenCalled() // rewire does NOT adapter.unsubscribe
    expect(unsubs).toHaveLength(2)
    expect(unsubs[1]).not.toHaveBeenCalled()
  })

  it('clearing the topic does a full teardown (unsubscribe + adapter.unsubscribe)', async () => {
    await mqttExecutor(frame('n1', 'topic/a'))
    expect(unsubs).toHaveLength(1)

    await mqttExecutor(frame('n1', '')) // topic cleared

    expect(unsubs[0]).toHaveBeenCalledTimes(1)
    expect(adapter.unsubscribe).toHaveBeenCalledWith('topic/a')
  })

  it('gc / node removal does a full teardown', async () => {
    await mqttExecutor(frame('n1', 'topic/a'))
    expect(unsubs).toHaveLength(1)

    gcMqttState(new Set()) // n1 removed

    expect(unsubs[0]).toHaveBeenCalledTimes(1)
    expect(adapter.unsubscribe).toHaveBeenCalledWith('topic/a')
    expect(nodeSubscriptions.size).toBe(0) // no residual subscription left behind
  })
})
