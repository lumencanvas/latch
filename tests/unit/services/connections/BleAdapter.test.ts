import { describe, it, expect, vi, beforeEach } from 'vitest'

// BLE adapters disable buffering, but BaseAdapter still resolves the manager.
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

import { BleAdapter } from '@/services/connections/adapters/BleAdapter'
import type { BleConnectionConfig } from '@/services/connections/types'

function makeConfig(): BleConnectionConfig {
  return {
    id: 'ble-test',
    name: 'BLE Test',
    protocol: 'ble',
    autoConnect: false,
    autoReconnect: false,
    reconnectDelay: 1000,
    maxReconnectAttempts: 0,
    serviceUUID: '0000180d-0000-1000-8000-00805f9b34fb',
  }
}

function makeCharacteristic() {
  return {
    properties: { notify: true, indicate: false },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    startNotifications: vi.fn().mockResolvedValue(undefined),
    stopNotifications: vi.fn().mockResolvedValue(undefined),
    value: null as DataView | null,
  }
}

const UUID = 'char-uuid'

/**
 * Regression: the handler added as the `characteristicvaluechanged` listener used
 * to differ from the closure stored in `notificationHandlers`, so it could never be
 * removed — listeners (each retaining `this`) stacked on every reconnect. These pin
 * that the exact attached handler is the one stored and removed.
 */
describe('BleAdapter notification listener lifecycle', () => {
  let adapter: BleAdapter
  let char: ReturnType<typeof makeCharacteristic>

  beforeEach(() => {
    adapter = new BleAdapter('ble-test', makeConfig())
    char = makeCharacteristic()
    ;(adapter as unknown as { characteristics: Map<string, unknown> }).characteristics.set(UUID, char)
  })

  it('removes the exact handler it added on unsubscribe (no leak)', async () => {
    await adapter.subscribeToNotifications(UUID, vi.fn())
    expect(char.addEventListener).toHaveBeenCalledTimes(1)
    const [evt, handler] = char.addEventListener.mock.calls[0]
    expect(evt).toBe('characteristicvaluechanged')

    await adapter.unsubscribeFromNotifications(UUID)
    expect(char.removeEventListener).toHaveBeenCalledTimes(1)
    expect(char.removeEventListener).toHaveBeenCalledWith('characteristicvaluechanged', handler)
  })

  it('stores the functional handler — firing it invokes the callback', async () => {
    const cb = vi.fn()
    await adapter.subscribeToNotifications(UUID, cb)
    const handler = char.addEventListener.mock.calls[0][1] as (e: Event) => void
    handler({ target: { value: new DataView(new ArrayBuffer(4)) } } as unknown as Event)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('does not stack listeners when re-subscribing the same characteristic', async () => {
    await adapter.subscribeToNotifications(UUID, vi.fn())
    const first = char.addEventListener.mock.calls[0][1]
    await adapter.subscribeToNotifications(UUID, vi.fn())
    // the previous listener must be removed before the new one is attached
    expect(char.removeEventListener).toHaveBeenCalledWith('characteristicvaluechanged', first)
    expect(char.addEventListener).toHaveBeenCalledTimes(2)
  })

  it('detaches the listener on disconnect', async () => {
    await adapter.subscribeToNotifications(UUID, vi.fn())
    const handler = char.addEventListener.mock.calls[0][1]
    await (adapter as unknown as { doDisconnect: () => Promise<void> }).doDisconnect()
    expect(char.removeEventListener).toHaveBeenCalledWith('characteristicvaluechanged', handler)
  })

  it('detaches the listener on dispose', async () => {
    await adapter.subscribeToNotifications(UUID, vi.fn())
    const handler = char.addEventListener.mock.calls[0][1]
    adapter.dispose()
    expect(char.removeEventListener).toHaveBeenCalledWith('characteristicvaluechanged', handler)
  })
})
