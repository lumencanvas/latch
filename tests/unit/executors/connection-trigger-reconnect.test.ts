/**
 * Trigger edge state across a disconnect (MQTT publish / WebSocket send).
 *
 * The rising-edge detector used to run AFTER the "not connected" early return, so its
 * wasHigh state froze while offline. A trigger that was high when the link dropped and
 * low while it was down therefore still read as "was high" on the first connected
 * frame — the first press after reconnect was swallowed. The edge is now computed on
 * every frame before any early return.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/stores/connections', () => {
  const make = (protocol: string) => ({
    protocol,
    status: 'connected' as string,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    publish: vi.fn(),
    send: vi.fn(() => Promise.resolve()),
    onMessage: vi.fn(() => vi.fn()),
    onStatusChange: vi.fn(() => vi.fn()),
  })
  // One adapter per connection id (handles are cached per adapter, so protocols can't share one).
  const adapters: Record<string, ReturnType<typeof make>> = { 'conn-1': make('mqtt'), 'conn-ws': make('websocket') }
  const store = { getAdapter: (id: string) => adapters[id], connect: vi.fn(() => Promise.resolve()), __adapters: adapters }
  return { useConnectionsStore: () => store }
})

import { mqttExecutor, disposeAllMqttNodes } from '@/engine/executors/mqtt'
import { websocketExecutor, disposeAllWebSocketNodes } from '@/engine/executors/websocket'
import { useConnectionsStore } from '@/stores/connections'
import { createExecutionContext } from '@/engine/ExecutionEngine'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapters = (useConnectionsStore() as any).__adapters

function frame(nodeId: string, inputs: Record<string, unknown>, controls: Record<string, unknown>): ExecutionContext {
  return createExecutionContext({
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries({ connectionId: 'conn-1', ...controls })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    definition: { inputs: [], outputs: [], controls: [] } as any,
    deltaTime: 16,
    totalTime: 0,
    frameCount: 0,
  })
}

describe('MQTT publish trigger across a disconnect', () => {
  const adapter = adapters['conn-1']
  beforeEach(() => {
    disposeAllMqttNodes()
    adapter.status = 'connected'
    adapter.publish.mockClear()
  })

  it('the first press after reconnect publishes (edge state tracked while offline)', async () => {
    const run = (trigger: number) => mqttExecutor(frame('mq-edge', { trigger, publish: 'hi' }, { topic: 't/a' }))
    await run(1) // press while connected → publish #1
    expect(adapter.publish).toHaveBeenCalledTimes(1)

    adapter.status = 'disconnected'
    await run(0) // released while offline

    adapter.status = 'connected'
    await run(1) // NEW press after reconnect
    expect(adapter.publish).toHaveBeenCalledTimes(2)
  })

  it('a trigger held through the outage does NOT fire late on reconnect', async () => {
    const run = (trigger: number) => mqttExecutor(frame('mq-held', { trigger, publish: 'hi' }, { topic: 't/a' }))
    adapter.status = 'disconnected'
    await run(1) // pressed while offline (nothing sent)
    adapter.status = 'connected'
    await run(1) // still held — not a new edge
    expect(adapter.publish).not.toHaveBeenCalled()
  })
})

describe('WebSocket send trigger across a disconnect', () => {
  const adapter = adapters['conn-ws']
  beforeEach(() => {
    disposeAllWebSocketNodes()
    adapter.status = 'connected'
    adapter.send.mockClear()
  })

  it('the first press after reconnect sends', async () => {
    const run = (trigger: number) => websocketExecutor(frame('ws-edge', { trigger, send: 'x' }, { connectionId: 'conn-ws' }))
    await run(1)
    expect(adapter.send).toHaveBeenCalledTimes(1)
    adapter.status = 'disconnected'
    await run(0)
    adapter.status = 'connected'
    await run(1)
    expect(adapter.send).toHaveBeenCalledTimes(2)
  })
})
