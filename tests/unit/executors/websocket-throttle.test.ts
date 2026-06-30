/**
 * WebSocket auto-connect throttle
 *
 * The executor calls ctx.connection() every frame. For a connection that is down,
 * it must NOT re-dial ~60×/s — the shared throttle in engine/connection.ts gates
 * retries to at most once per 2s, and a successful connect resets the gate. This is
 * timing logic with no other coverage, so it's tested through the public executor
 * (which now resolves the handle via the real ctx.connection wiring).
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
import { createExecutionContext } from '@/engine/ExecutionEngine'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = useConnectionsStore() as any

// Build via the real factory so ctx.connection() drives the shared throttle.
function frame(connectionId: string): ExecutionContext {
  return createExecutionContext({
    nodeId: `ws-${connectionId}`,
    inputs: new Map(),
    controls: new Map<string, unknown>([['connectionId', connectionId]]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    definition: { inputs: [], outputs: [], controls: [] } as any,
    deltaTime: 16,
    totalTime: 0,
    frameCount: 0,
  })
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

  it('unsubscribes the old listener exactly once when the connection is rewired', async () => {
    // Regression guard for the defineNodeState migration: the rewire path used to
    // unsubscribe manually AND .delete(); now .delete() disposes (unsubscribes), so a
    // manual unsubscribe too would double-fire. The old listener must release once.
    const unsubs: Array<ReturnType<typeof vi.fn>> = []
    store.__adapter.status = 'connected'
    store.__adapter.onMessage = vi.fn(() => {
      const u = vi.fn()
      unsubs.push(u)
      return u
    })

    const f = frame('rewire-a') // node id is stable; only the connectionId changes
    f.controls.set('connectionId', 'conn-A')
    await websocketExecutor(f)
    expect(unsubs).toHaveLength(1) // first listener registered, not yet released

    f.controls.set('connectionId', 'conn-B') // rewire same node to a new connection
    await websocketExecutor(f)

    expect(unsubs[0]).toHaveBeenCalledTimes(1) // old listener released exactly once
    expect(unsubs).toHaveLength(2) // new listener registered
    expect(unsubs[1]).not.toHaveBeenCalled()
  })
})
