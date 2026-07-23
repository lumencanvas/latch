import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

/**
 * Regression: the read path bypassed the profile parser (so a read and a notification
 * of the same characteristic decoded differently), and the `properties` port was
 * always null. readCharacteristicRaw exposes the raw DataView so callers can run the
 * same parser; getCharacteristicProperties surfaces the discovered flags.
 */
describe('BleAdapter raw read + characteristic properties', () => {
  it('readCharacteristicRaw resolves the raw DataView from readValue()', async () => {
    const adapter = new BleAdapter('ble-test', makeConfig())
    const dv = new DataView(new Uint8Array([1, 2, 3]).buffer)
    const char = { properties: { read: true }, readValue: vi.fn().mockResolvedValue(dv) }
    ;(adapter as unknown as { characteristics: Map<string, unknown> }).characteristics.set('c', char)

    await expect(adapter.readCharacteristicRaw('c')).resolves.toBe(dv)
  })

  it('readCharacteristicRaw rejects when the characteristic does not support read', async () => {
    const adapter = new BleAdapter('ble-test', makeConfig())
    const char = { properties: { read: false }, readValue: vi.fn() }
    ;(adapter as unknown as { characteristics: Map<string, unknown> }).characteristics.set('c', char)

    await expect(adapter.readCharacteristicRaw('c')).rejects.toThrow(/does not support read/)
  })

  it('getCharacteristicProperties returns the discovered flags, or null when unknown', () => {
    const adapter = new BleAdapter('ble-test', makeConfig())
    const char = {
      properties: {
        read: true, write: false, writeWithoutResponse: true, notify: true,
        indicate: false, broadcast: false, authenticatedSignedWrites: false,
      },
    }
    ;(adapter as unknown as { characteristics: Map<string, unknown> }).characteristics.set('c', char)

    expect(adapter.getCharacteristicProperties('c')).toMatchObject({ read: true, notify: true, writeWithoutResponse: true })
    expect(adapter.getCharacteristicProperties('missing')).toBeNull()
  })
})

/**
 * Regression: on the no-injected-device path, doConnect built the requestDevice() filters
 * from a possibly-bare-short serviceUUID (the old `length<=4 ? uuid : uuid` no-op ternary),
 * and pushed characteristicUUIDs in raw. requestDevice() rejects a bare 4-hex string
 * ('180d') — it needs a full 128-bit UUID or a numeric alias. These pin that both are
 * normalized to the canonical full UUID (same class as the SIG-profile fix, later-111).
 */
describe('BleAdapter.doConnect requestDevice UUID normalization', () => {
  const FULL_180D = '0000180d-0000-1000-8000-00805f9b34fb'
  const FULL_2A37 = '00002a37-0000-1000-8000-00805f9b34fb'
  const runDoConnect = (adapter: BleAdapter) =>
    (adapter as unknown as { doConnect: () => Promise<void> }).doConnect()

  it('normalizes a bare short serviceUUID + characteristicUUIDs to full 128-bit UUIDs', async () => {
    const adapter = new BleAdapter('ble-test', { ...makeConfig(), serviceUUID: '180d', characteristicUUIDs: ['2a37'] })
    const spy = vi.spyOn(BleAdapter, 'scanDevices').mockResolvedValue(null)

    await expect(runDoConnect(adapter)).rejects.toThrow(/No device selected/)
    expect(spy).toHaveBeenCalledTimes(1)
    const opts = spy.mock.calls[0][0] as { filters?: { services: string[] }[]; optionalServices: string[] }
    expect(opts.filters).toEqual([{ services: [FULL_180D] }])
    expect(opts.optionalServices).toContain(FULL_180D)
    expect(opts.optionalServices).toContain(FULL_2A37)
    spy.mockRestore()
  })

  it('leaves an already-full serviceUUID unchanged', async () => {
    const adapter = new BleAdapter('ble-test', makeConfig()) // serviceUUID is already full
    const spy = vi.spyOn(BleAdapter, 'scanDevices').mockResolvedValue(null)

    await expect(runDoConnect(adapter)).rejects.toThrow(/No device selected/)
    const opts = spy.mock.calls[0][0] as { filters?: { services: string[] }[] }
    expect(opts.filters).toEqual([{ services: [FULL_180D] }])
    spy.mockRestore()
  })

  it('normalizes a bare-short serviceUUID before getPrimaryService on the pre-injected setDevice() path', async () => {
    // Regression: discoverServices() passed serviceUUID RAW to getPrimaryService, which (like
    // requestDevice) rejects a bare 4-hex string. On the gesture-free setDevice() path the scan-path
    // normalization is skipped, so a hand-typed short UUID reached discovery unnormalized and threw.
    const adapter = new BleAdapter('ble-test', { ...makeConfig(), serviceUUID: '180d' })
    const getPrimaryService = vi.fn().mockRejectedValue(new Error('stop-after-capture'))
    const server = { connected: true, getPrimaryService, getPrimaryServices: vi.fn(), disconnect: vi.fn() }
    const device = {
      id: 'dev-inject',
      gatt: { connect: vi.fn().mockResolvedValue(server) },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as BluetoothDevice
    adapter.setDevice(device) // pre-inject → doConnect skips scan and goes straight to discovery

    await runDoConnect(adapter).catch(() => {}) // discoverServices rejects at our spy after capturing the arg
    expect(getPrimaryService).toHaveBeenCalledWith(FULL_180D) // full UUID, NOT the bare '180d'
  })
})

/**
 * Per-deviceId GATT refcount: `getDeviceById` hands the SAME BluetoothDevice (one GATTServer) to
 * every adapter bound to that id, so disposing one adapter must NOT drop the radio link a sibling
 * still uses. These pin that the physical `server.disconnect()` fires only when the LAST holder
 * disposes — while a lone adapter still disconnects exactly as before.
 */
describe('BleAdapter shared-GATT refcount (per-deviceId dispose)', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0))

  interface MockServer {
    connected: boolean
    disconnect: ReturnType<typeof vi.fn>
    getPrimaryServices: ReturnType<typeof vi.fn>
  }

  function makeServer(): MockServer {
    const server: MockServer = {
      connected: false,
      disconnect: vi.fn(() => {
        server.connected = false
      }),
      getPrimaryServices: vi.fn().mockResolvedValue([]),
    }
    return server
  }

  function makeDevice(id: string, server: MockServer): BluetoothDevice {
    return {
      id,
      name: id,
      gatt: {
        connect: vi.fn(async () => {
          server.connected = true
          return server
        }),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as BluetoothDevice
  }

  // serviceUUID '' → doConnect skips discoverServices (we only exercise connect/dispose).
  const cfg = () => ({ ...makeConfig(), serviceUUID: '' })

  it('lone holder: dispose disconnects the shared server (unchanged behavior)', async () => {
    const server = makeServer()
    const a = new BleAdapter('a', cfg())
    a.setDevice(makeDevice('dev-solo', server))
    await a.connect()
    expect(server.connected).toBe(true)

    a.dispose()
    await flush()
    expect(server.disconnect).toHaveBeenCalledTimes(1)
  })

  it('two holders on one device: first dispose keeps the link, last dispose drops it', async () => {
    const server = makeServer()
    const dev = makeDevice('dev-shared', server)
    const a = new BleAdapter('a', cfg())
    const b = new BleAdapter('b', cfg())
    a.setDevice(dev)
    b.setDevice(dev)
    await a.connect()
    await b.connect()
    expect(server.connected).toBe(true)

    a.dispose()
    await flush()
    expect(server.disconnect).not.toHaveBeenCalled() // sibling b still holds the link

    b.dispose()
    await flush()
    expect(server.disconnect).toHaveBeenCalledTimes(1) // last holder drops it
  })

  it('lone adapter disposed MID-CONNECT still disconnects the just-opened server (no leak)', async () => {
    // Regression: dispose() nulls this.device synchronously, so acquire/release must use the id
    // captured before the gatt.connect() await — else the just-opened radio is never disconnected.
    const server = makeServer()
    let resolveConnect = () => {}
    const dev = {
      id: 'dev-midconnect',
      name: 'x',
      gatt: {
        connect: vi.fn(
          () =>
            new Promise<MockServer>((res) => {
              resolveConnect = () => {
                server.connected = true
                res(server)
              }
            })
        ),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as BluetoothDevice

    const a = new BleAdapter('a', cfg())
    a.setDevice(dev)
    const connecting = a.connect() // suspends inside doConnect at `await gatt.connect()`
    a.dispose() // disposed while connecting (nulls this.device)
    resolveConnect() // now gatt.connect resolves; doConnect resumes into the _disposed branch
    await connecting.catch(() => {})
    await flush()
    expect(server.disconnect).toHaveBeenCalledTimes(1)
  })

  it('re-dispose / never-connected adapter never disconnects a shared server', async () => {
    const server = makeServer()
    const dev = makeDevice('dev-x', server)
    const holder = new BleAdapter('holder', cfg())
    holder.setDevice(dev)
    await holder.connect() // holds the only ref

    // An adapter bound to the same device but never connected must not release the holder's link.
    const ghost = new BleAdapter('ghost', cfg())
    ghost.setDevice(dev)
    ghost.dispose()
    await flush()
    expect(server.disconnect).not.toHaveBeenCalled()

    holder.dispose()
    await flush()
    expect(server.disconnect).toHaveBeenCalledTimes(1)
  })
})

/**
 * listKnownDevices() / forgetDevice() — power the device-manager "Paired devices" list + Forget.
 * They unify the session grant cache with getDevices(), and revoke a grant (cache eviction +
 * BluetoothDevice.forget() where the browser supports it — closes the "cache never evicted" gap).
 */
describe('BleAdapter.listKnownDevices / forgetDevice', () => {
  const granted = () =>
    (BleAdapter as unknown as { grantedDevices: Map<string, BluetoothDevice> }).grantedDevices
  beforeEach(() => granted().clear())
  afterEach(() => {
    granted().clear()
    vi.restoreAllMocks()
  })

  const dev = (id: string, opts: { name?: string; connected?: boolean; forget?: () => Promise<void> } = {}) =>
    ({ id, name: opts.name, gatt: { connected: opts.connected ?? false }, forget: opts.forget } as unknown as BluetoothDevice)

  it('unions the session cache with getDevices(), de-duped by id, with live connection state', async () => {
    granted().set('a', dev('a', { name: 'Cached A', connected: true }))
    vi.spyOn(BleAdapter, 'getPairedDevices').mockResolvedValue([
      dev('a', { name: 'A again', connected: false }), // same id → one entry, not two
      dev('b', { name: '', connected: false }),
    ])
    const list = await BleAdapter.listKnownDevices()
    expect(list).toHaveLength(2)
    const byId = Object.fromEntries(list.map((d) => [d.id, d]))
    expect(byId.a).toBeDefined()
    expect(byId.b.name).toBe('(unnamed device)') // empty name → placeholder
    expect(byId.b.connected).toBe(false)
  })

  it('forgetDevice evicts the cache AND calls BluetoothDevice.forget() when supported', async () => {
    const forget = vi.fn().mockResolvedValue(undefined)
    granted().set('x', dev('x', { forget }))
    vi.spyOn(BleAdapter, 'getPairedDevices').mockResolvedValue([])
    await BleAdapter.forgetDevice('x')
    expect(granted().has('x')).toBe(false)
    expect(forget).toHaveBeenCalledTimes(1)
  })

  it('forgetDevice still evicts when the browser lacks BluetoothDevice.forget()', async () => {
    granted().set('y', dev('y')) // no forget()
    vi.spyOn(BleAdapter, 'getPairedDevices').mockResolvedValue([])
    await expect(BleAdapter.forgetDevice('y')).resolves.toBeUndefined()
    expect(granted().has('y')).toBe(false)
  })
})
