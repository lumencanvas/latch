import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BaseAdapter } from '@/services/connections/adapters/BaseAdapter'
import type { BaseConnectionConfig } from '@/services/connections/types'

// Concrete implementation for testing abstract BaseAdapter
class TestAdapter extends BaseAdapter {
  connectCalled = false
  disconnectCalled = false
  sendCalled = false
  lastSentData: unknown = null

  constructor(config: BaseConnectionConfig) {
    super(config.id, 'test', config)
  }

  async connect(): Promise<void> {
    this.connectCalled = true
    this.setStatus('connected')
  }

  async disconnect(): Promise<void> {
    this.disconnectCalled = true
    this.setStatus('disconnected')
  }

  async send(data: unknown): Promise<void> {
    this.sendCalled = true
    this.lastSentData = data
  }

  // Expose protected methods for testing
  public testSetStatus(status: 'disconnected' | 'connecting' | 'connected' | 'error', error?: string) {
    this.setStatus(status, error)
  }

  public testEmitMessage(message: { topic?: string; data: unknown }) {
    this.emitMessage(message)
  }

  public testEmitError(error: Error) {
    this.emitError(error)
  }

  public testScheduleReconnect() {
    this.scheduleReconnect()
  }

  public testCancelReconnect() {
    this.cancelReconnect()
  }

  public getReconnectAttempts() {
    return this._reconnectAttempts
  }
}

const createConfig = (overrides: Partial<BaseConnectionConfig> = {}): BaseConnectionConfig => ({
  id: 'test-adapter',
  name: 'Test Adapter',
  protocol: 'test',
  autoConnect: false,
  autoReconnect: false,
  reconnectDelay: 100, // Short delay for tests
  maxReconnectAttempts: 3,
  ...overrides,
})

describe('BaseAdapter', () => {
  let adapter: TestAdapter

  beforeEach(() => {
    adapter = new TestAdapter(createConfig())
  })

  afterEach(() => {
    adapter.dispose()
  })

  describe('Status Management', () => {
    it('should start with disconnected status', () => {
      expect(adapter.status).toBe('disconnected')
    })

    it('should update status when connected', async () => {
      await adapter.connect()
      expect(adapter.status).toBe('connected')
    })

    it('should update status when disconnected', async () => {
      await adapter.connect()
      await adapter.disconnect()
      expect(adapter.status).toBe('disconnected')
    })

    it('should set error status with message', () => {
      adapter.testSetStatus('error', 'Connection failed')
      expect(adapter.status).toBe('error')
    })
  })

  describe('Event Subscriptions', () => {
    it('should emit status change events', async () => {
      const handler = vi.fn()
      adapter.onStatusChange(handler)

      await adapter.connect()

      expect(handler).toHaveBeenCalled()
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ status: 'connected' }))
    })

    it('should emit message events', () => {
      const handler = vi.fn()
      adapter.onMessage(handler)

      adapter.testEmitMessage({ topic: 'test', data: { foo: 'bar' } })

      expect(handler).toHaveBeenCalledWith({ topic: 'test', data: { foo: 'bar' } })
    })

    it('should emit error events', () => {
      const handler = vi.fn()
      adapter.onError(handler)

      const error = new Error('Test error')
      adapter.testEmitError(error)

      expect(handler).toHaveBeenCalledWith(error)
    })

    it('should unsubscribe from status events', async () => {
      const handler = vi.fn()
      const unsubscribe = adapter.onStatusChange(handler)

      unsubscribe()
      await adapter.connect()

      expect(handler).not.toHaveBeenCalled()
    })

    it('should unsubscribe from message events', () => {
      const handler = vi.fn()
      const unsubscribe = adapter.onMessage(handler)

      unsubscribe()
      adapter.testEmitMessage({ data: 'test' })

      expect(handler).not.toHaveBeenCalled()
    })

    it('should unsubscribe from error events', () => {
      const handler = vi.fn()
      const unsubscribe = adapter.onError(handler)

      unsubscribe()
      adapter.testEmitError(new Error('test'))

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('Reconnection', () => {
    it('should not reconnect if autoReconnect is false', () => {
      vi.useFakeTimers()

      adapter.testScheduleReconnect()

      vi.advanceTimersByTime(1000)

      expect(adapter.getReconnectAttempts()).toBe(0)

      vi.useRealTimers()
    })

    it('should schedule reconnect if autoReconnect is true', async () => {
      vi.useFakeTimers()

      const autoReconnectAdapter = new TestAdapter(createConfig({ autoReconnect: true }))
      const statusHandler = vi.fn()
      autoReconnectAdapter.onStatusChange(statusHandler)

      autoReconnectAdapter.testScheduleReconnect()

      expect(autoReconnectAdapter.getReconnectAttempts()).toBe(1)

      // Wait for reconnect delay
      await vi.advanceTimersByTimeAsync(100)

      expect(autoReconnectAdapter.connectCalled).toBe(true)

      autoReconnectAdapter.dispose()
      vi.useRealTimers()
    })

    it('should respect maxReconnectAttempts', () => {
      vi.useFakeTimers()

      const autoReconnectAdapter = new TestAdapter(
        createConfig({ autoReconnect: true, maxReconnectAttempts: 2 })
      )

      // Manually set attempts to max
      autoReconnectAdapter.testScheduleReconnect() // 1
      autoReconnectAdapter.testScheduleReconnect() // 2
      autoReconnectAdapter.testScheduleReconnect() // Should not schedule more

      // The third call should set error status
      expect(autoReconnectAdapter.status).toBe('error')

      autoReconnectAdapter.dispose()
      vi.useRealTimers()
    })

    it('should cancel reconnect', () => {
      vi.useFakeTimers()

      const autoReconnectAdapter = new TestAdapter(createConfig({ autoReconnect: true }))

      autoReconnectAdapter.testScheduleReconnect()
      autoReconnectAdapter.testCancelReconnect()

      vi.advanceTimersByTime(1000)

      // Connect should not have been called because we cancelled
      expect(autoReconnectAdapter.connectCalled).toBe(false)

      autoReconnectAdapter.dispose()
      vi.useRealTimers()
    })

    it('should reset reconnect attempts on successful connect', async () => {
      const autoReconnectAdapter = new TestAdapter(createConfig({ autoReconnect: true }))

      // Simulate some reconnect attempts
      autoReconnectAdapter.testScheduleReconnect()
      expect(autoReconnectAdapter.getReconnectAttempts()).toBe(1)

      // Connect successfully
      await autoReconnectAdapter.connect()

      // Attempts should be reset
      expect(autoReconnectAdapter.getReconnectAttempts()).toBe(0)

      autoReconnectAdapter.dispose()
    })
  })

  describe('Dispose', () => {
    it('should clear all listeners on dispose', () => {
      const statusHandler = vi.fn()
      const messageHandler = vi.fn()
      const errorHandler = vi.fn()

      adapter.onStatusChange(statusHandler)
      adapter.onMessage(messageHandler)
      adapter.onError(errorHandler)

      adapter.dispose()

      // Try to emit events
      adapter.testSetStatus('connected')
      adapter.testEmitMessage({ data: 'test' })
      adapter.testEmitError(new Error('test'))

      // Handlers should not be called
      expect(statusHandler).not.toHaveBeenCalled()
      expect(messageHandler).not.toHaveBeenCalled()
      expect(errorHandler).not.toHaveBeenCalled()
    })

    it('should cancel reconnect on dispose', () => {
      vi.useFakeTimers()

      const autoReconnectAdapter = new TestAdapter(createConfig({ autoReconnect: true }))

      autoReconnectAdapter.testScheduleReconnect()
      autoReconnectAdapter.dispose()

      vi.advanceTimersByTime(1000)

      expect(autoReconnectAdapter.connectCalled).toBe(false)

      vi.useRealTimers()
    })
  })

  describe('Properties', () => {
    it('should expose connectionId', () => {
      expect(adapter.connectionId).toBe('test-adapter')
    })

    it('should expose protocol', () => {
      expect(adapter.protocol).toBe('test')
    })
  })
})

describe('WebSocketAdapter', () => {
  // WebSocket tests would require mocking WebSocket, skipping for now
  it.todo('should connect to WebSocket server')
  it.todo('should send messages')
  it.todo('should receive messages')
  it.todo('should handle disconnection')
})

describe('ClaspAdapter', () => {
  // CLASP adapter tests would require mocking WebSocket and the protocol
  it.todo('should connect with CLASP protocol')
  it.todo('should send HELLO on connect')
  it.todo('should handle WELCOME response')
  it.todo('should set params')
  it.todo('should subscribe to patterns')
  it.todo('should emit events')
  it.todo('should stream data')
})
