import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// BaseAdapter resolves the message-buffer manager in its constructor.
vi.mock('@/services/connections/MessageBuffer', () => ({
  getMessageBufferManager: () => ({
    enqueue: vi.fn(() => 'msg-1'),
    flush: vi.fn(() => []),
    markSent: vi.fn(),
    markFailed: vi.fn(() => true),
    clear: vi.fn(),
    removeBuffer: vi.fn(),
    getStats: vi.fn(() => ({ queued: 0, oldest: null, estimatedBytes: 0, byPriority: {} })),
  }),
}))

import { BaseAdapter } from '@/services/connections/adapters/BaseAdapter'
import type { BaseConnectionConfig, SendOptions } from '@/services/connections/types'

/**
 * Minimal concrete adapter so we can drive BaseAdapter's reconnection path directly.
 * doConnect can be scripted to fail a set number of times before succeeding.
 */
class TestAdapter extends BaseAdapter {
  doConnectCalls = 0
  failuresRemaining = 0

  constructor(config: BaseConnectionConfig) {
    super(config.id, 'test', config)
  }

  protected async doConnect(): Promise<void> {
    this.doConnectCalls++
    if (this.failuresRemaining > 0) {
      this.failuresRemaining--
      throw new Error('doConnect boom')
    }
  }

  protected async doDisconnect(): Promise<void> {}
  protected async doSend(_data: unknown, _options?: SendOptions): Promise<void> {}

  // Expose the protected drop hook a subclass would call on an unexpected disconnect.
  simulateDrop(reason = 'link lost'): void {
    (this as unknown as { handleUnexpectedDisconnect: (e?: string) => void }).handleUnexpectedDisconnect(reason)
  }
}

function makeConfig(over: Partial<BaseConnectionConfig> = {}): BaseConnectionConfig {
  return {
    id: 'test-adapter',
    name: 'Test',
    protocol: 'test',
    autoConnect: false,
    autoReconnect: true,
    reconnectDelay: 100,
    maxReconnectAttempts: 0, // infinite
    ...over,
  } as BaseConnectionConfig
}

/**
 * Regression for the reconnect blocker: scheduleReconnect() moved the machine to
 * `connecting` (RECONNECT_START) and then called connect(), which rejects because
 * CONNECT is invalid from `connecting` — so doConnect() was NEVER reached and the
 * adapter spun error<->reconnecting forever (a dropped Muse never recovered). The
 * fix routes the reconnect through performConnect() directly.
 */
describe('BaseAdapter auto-reconnect', () => {
  let adapter: TestAdapter

  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('re-establishes the link after an unexpected drop (reaches doConnect + connected)', async () => {
    adapter = new TestAdapter(makeConfig())
    await adapter.connect()
    expect(adapter.status).toBe('connected')
    expect(adapter.doConnectCalls).toBe(1)

    adapter.simulateDrop()
    // The drop lands the machine in reconnecting; the scheduled timer must run the
    // connect body and get back to connected.
    await vi.advanceTimersByTimeAsync(1000)

    expect(adapter.doConnectCalls).toBe(2) // reconnect actually invoked doConnect
    expect(adapter.status).toBe('connected')
  })

  it('keeps retrying across a transient failure and eventually reconnects', async () => {
    adapter = new TestAdapter(makeConfig())
    await adapter.connect()
    adapter.failuresRemaining = 1 // first reconnect attempt fails, second succeeds

    adapter.simulateDrop()
    await vi.advanceTimersByTimeAsync(2000)

    expect(adapter.doConnectCalls).toBeGreaterThanOrEqual(3) // initial + failed + success
    expect(adapter.status).toBe('connected')
  })

  it('does not schedule a reconnect when autoReconnect is off (executor-owned nodes)', async () => {
    adapter = new TestAdapter(makeConfig({ autoReconnect: false }))
    await adapter.connect()

    adapter.simulateDrop()
    await vi.advanceTimersByTimeAsync(1000)

    // Left in a connectable state (error) with no adapter-driven retry — the node
    // executor re-dials via connect() from here.
    expect(adapter.doConnectCalls).toBe(1)
    expect(adapter.canConnect()).toBe(true)
  })

  it('gives up after maxReconnectAttempts and does not retry forever', async () => {
    // The reconnect loop is self-recursive (performConnect failure -> scheduleReconnect); the
    // finite cap in scheduleReconnect is the ONLY thing preventing an infinite retry storm.
    adapter = new TestAdapter(makeConfig({ maxReconnectAttempts: 2 }))
    await adapter.connect()
    expect(adapter.doConnectCalls).toBe(1)
    adapter.failuresRemaining = 999 // every reconnect attempt fails

    adapter.simulateDrop()
    await vi.advanceTimersByTimeAsync(10_000) // well past every capped backoff delay

    // Initial connect + exactly maxReconnectAttempts reconnect tries, then it stops.
    expect(adapter.doConnectCalls).toBe(3)
    expect(adapter.status).toBe('error')

    // Terminal: advancing more time schedules no further attempts (no runaway loop).
    const settled = adapter.doConnectCalls
    await vi.advanceTimersByTimeAsync(10_000)
    expect(adapter.doConnectCalls).toBe(settled)
  })
})
