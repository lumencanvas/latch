/**
 * WebSocket auto-connect throttle
 *
 * The executor calls ensureConnected() every frame. For a connection that is
 * down, it must NOT re-dial ~60×/s — RECONNECT_THROTTLE_MS gates retries to at
 * most once per 2s, and a successful connect resets the gate. This is timing
 * logic with no other coverage, so it's tested through the public executor.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Stable singleton mock store so connect() call-counts persist across calls.
vi.mock('@/stores/connections', () => {
  const adapter = {
    protocol: 'websocket',
    status: 'disconnected' as string,
    onMessage: () => () => {},
  }
  const store = {
    getAdapter: () => adapter,
    connect: vi.fn(() => Promise.resolve()),
    __adapter: adapter,
  }
  return { useConnectionsStore: () => store }
})

import { websocketExecutor, disposeAllWebSocketNodes } from '@/engine/executors/websocket'
import { useConnectionsStore } from '@/stores/connections'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = useConnectionsStore() as any

function frame(connectionId: string): ExecutionContext {
  return {
    nodeId: `ws-${connectionId}`,
    nodeType: 'websocket',
    inputs: new Map(),
    controls: new Map([['connectionId', connectionId]]),
    totalTime: 0,
    deltaTime: 16,
    frame: 0,
  } as unknown as ExecutionContext
}

describe('WebSocket auto-connect throttle', () => {
  beforeEach(() => {
    disposeAllWebSocketNodes()
    vi.useFakeTimers()
    // A realistic epoch — the first-attempt-fires logic relies on Date.now()
    // being large relative to the map default of 0.
    vi.setSystemTime(1_700_000_000_000)
    store.connect.mockClear()
    store.__adapter.status = 'disconnected'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dials at most once per 2s while the connection stays down', async () => {
    await websocketExecutor(frame('c1'))
    expect(store.connect).toHaveBeenCalledTimes(1) // first frame dials immediately

    await websocketExecutor(frame('c1'))
    await websocketExecutor(frame('c1'))
    expect(store.connect).toHaveBeenCalledTimes(1) // subsequent frames throttled

    vi.advanceTimersByTime(1999)
    await websocketExecutor(frame('c1'))
    expect(store.connect).toHaveBeenCalledTimes(1) // still inside the window

    vi.advanceTimersByTime(1)
    await websocketExecutor(frame('c1'))
    expect(store.connect).toHaveBeenCalledTimes(2) // retried once the window elapses
  })

  it('stops dialing once connected', async () => {
    await websocketExecutor(frame('c2'))
    expect(store.connect).toHaveBeenCalledTimes(1)

    store.__adapter.status = 'connected'
    await websocketExecutor(frame('c2'))
    await websocketExecutor(frame('c2'))
    expect(store.connect).toHaveBeenCalledTimes(1) // no dials while connected
  })
})
