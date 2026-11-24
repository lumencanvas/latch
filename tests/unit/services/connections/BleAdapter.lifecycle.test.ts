/**
 * BleAdapter D6–D8 (Nov 2026 device audit):
 *  D6 dispose ordering — maps were cleared mid-way through doDisconnect's stopNotifications loop,
 *     so on a sibling-shared link only the first subscribed characteristic was ever stopped.
 *  D7 setDevice to a different device orphaned the old device's GATT ref + server (radio stayed up).
 *  D8 getCharacteristic swallowed every error, masking NetworkError/SecurityError as "not found".
 */
import { describe, it, expect, vi } from 'vitest'

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

const cfg = (): BleConnectionConfig => ({
  id: 'ble-life',
  name: 'BLE',
  protocol: 'ble',
  autoConnect: false,
  autoReconnect: false,
  reconnectDelay: 1000,
  maxReconnectAttempts: 0,
  serviceUUID: '',
})
const flush = () => new Promise((r) => setTimeout(r, 0))

function makeServer() {
  const server = {
    connected: false,
    disconnect: vi.fn(() => { server.connected = false }),
    getPrimaryServices: vi.fn().mockResolvedValue([]),
  }
  return server
}
function makeDevice(id: string, server: ReturnType<typeof makeServer>): BluetoothDevice {
  return {
    id,
    name: id,
    gatt: { connect: vi.fn(async () => { server.connected = true; return server }) },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as BluetoothDevice
}
function makeChar() {
  return {
    properties: { notify: true },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    startNotifications: vi.fn().mockResolvedValue(undefined),
    stopNotifications: vi.fn().mockResolvedValue(undefined),
  }
}
const chars = (a: BleAdapter) => (a as unknown as { characteristics: Map<string, unknown> }).characteristics

describe('BleAdapter dispose on a sibling-shared link (D6)', () => {
  it('stops EVERY characteristic this adapter subscribed, and keeps the link for the sibling', async () => {
    const server = makeServer()
    const dev = makeDevice('dev-d6', server)
    const a = new BleAdapter('a', cfg())
    const b = new BleAdapter('b', cfg())
    a.setDevice(dev)
    b.setDevice(dev)
    await a.connect()
    await b.connect()
    const c1 = makeChar()
    const c2 = makeChar()
    chars(a).set('u1', c1)
    chars(a).set('u2', c2)
    await a.subscribeToNotifications('u1', vi.fn())
    await a.subscribeToNotifications('u2', vi.fn())

    a.dispose()
    await flush()
    expect(c1.stopNotifications).toHaveBeenCalled()
    expect(c2.stopNotifications).toHaveBeenCalled()
    expect(c1.removeEventListener).toHaveBeenCalled()
    expect(server.disconnect).not.toHaveBeenCalled()
    b.dispose()
    await flush()
    expect(server.disconnect).toHaveBeenCalledTimes(1)
  })
})

describe('BleAdapter.setDevice to a different device (D7)', () => {
  it('releases the old device link (drops its radio when last holder)', async () => {
    const s1 = makeServer()
    const a = new BleAdapter('a', cfg())
    a.setDevice(makeDevice('dev-old', s1))
    await a.connect()
    expect(s1.connected).toBe(true)

    a.setDevice(makeDevice('dev-new', makeServer()))
    expect(s1.disconnect).toHaveBeenCalledTimes(1)
    expect(a.status).not.toBe('connected')
    a.dispose()
  })

  it('a same-id swap (fresh object for the same device) keeps the link', async () => {
    const s1 = makeServer()
    const a = new BleAdapter('a', cfg())
    a.setDevice(makeDevice('dev-same', s1))
    await a.connect()
    a.setDevice(makeDevice('dev-same', s1))
    expect(s1.disconnect).not.toHaveBeenCalled()
    a.dispose()
  })
})

describe('BleAdapter characteristic lookup errors (D8)', () => {
  it('surfaces a real GATT error instead of "not found"', async () => {
    const a = new BleAdapter('a', cfg())
    const services = (a as unknown as { services: Map<string, unknown> }).services
    const netErr = Object.assign(new Error('GATT Server is disconnected.'), { name: 'NetworkError' })
    services.set('s1', { getCharacteristic: vi.fn().mockRejectedValue(netErr) })
    await expect(a.readCharacteristic('u-x')).rejects.toThrow('GATT Server is disconnected.')
  })

  it('NotFoundError in one service keeps searching the others', async () => {
    const a = new BleAdapter('a', cfg())
    const services = (a as unknown as { services: Map<string, unknown> }).services
    const nf = Object.assign(new Error('nope'), { name: 'NotFoundError' })
    const ch = { ...makeChar(), properties: { notify: true, read: true }, readValue: vi.fn().mockResolvedValue(new DataView(new ArrayBuffer(1))) }
    services.set('s1', { getCharacteristic: vi.fn().mockRejectedValue(nf) })
    services.set('s2', { getCharacteristic: vi.fn().mockResolvedValue(ch) })
    await a.readCharacteristic('u-y')
    expect(ch.readValue).toHaveBeenCalled()
  })
})
