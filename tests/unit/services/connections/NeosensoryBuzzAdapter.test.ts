import { describe, it, expect, vi, afterEach } from 'vitest'
import { BleAdapter } from '@/services/connections/adapters/BleAdapter'

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

import { NeosensoryBuzzAdapter } from '@/services/connections/adapters/NeosensoryBuzzAdapter'

const CFG = {
  id: 'buzz',
  name: 'Buzz',
  protocol: 'ble' as const,
  deviceId: 'dev-1',
  autoConnect: false,
  autoReconnect: false,
  reconnectDelay: 2000,
  maxReconnectAttempts: 0,
}

function mkChar(props: { write?: boolean; writeWithoutResponse?: boolean }) {
  return {
    properties: {
      read: false,
      write: false,
      writeWithoutResponse: false,
      notify: false,
      indicate: false,
      broadcast: false,
      authenticatedSignedWrites: false,
      ...props,
    },
    writeValue: vi.fn().mockResolvedValue(undefined),
    writeValueWithoutResponse: vi.fn().mockResolvedValue(undefined),
  }
}

function poke(adapter: NeosensoryBuzzAdapter, uuid: string, char: ReturnType<typeof mkChar>) {
  (adapter as unknown as { characteristics: Map<string, unknown> }).characteristics.set(uuid, char)
  ;(adapter as unknown as { writeCharUuid: string | null }).writeCharUuid = uuid
}

describe('NeosensoryBuzzAdapter.sendCommand — adaptive write mode', () => {
  it('uses write-without-response when the RX char supports it (NUS default)', async () => {
    const a = new NeosensoryBuzzAdapter('buzz', CFG)
    const char = mkChar({ write: true, writeWithoutResponse: true })
    poke(a, 'w', char)
    await a.sendCommand('motors start')
    expect(char.writeValueWithoutResponse).toHaveBeenCalledTimes(1)
    expect(char.writeValue).not.toHaveBeenCalled()
  })

  it('falls back to write-with-response when the char lacks writeWithoutResponse (clones)', async () => {
    const a = new NeosensoryBuzzAdapter('buzz', CFG)
    const char = mkChar({ write: true, writeWithoutResponse: false })
    poke(a, 'w', char)
    await a.sendCommand('accept')
    expect(char.writeValue).toHaveBeenCalledTimes(1)
    expect(char.writeValueWithoutResponse).not.toHaveBeenCalled()
  })

  it('appends a newline terminator to the command', async () => {
    const a = new NeosensoryBuzzAdapter('buzz', CFG)
    const char = mkChar({ writeWithoutResponse: true })
    poke(a, 'w', char)
    await a.sendCommand('device battery_soc')
    const buf = char.writeValueWithoutResponse.mock.calls[0][0] as ArrayBuffer
    expect(new TextDecoder().decode(buf)).toBe('device battery_soc\n')
  })
})

// ── Full connect integration: NUS discovery → auth handshake → notify telemetry → vibrate streaming ──
const NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_WRITE = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
const NUS_NOTIFY = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'

function gattChar(uuid: string, props: Record<string, boolean>) {
  return {
    uuid,
    properties: {
      read: false, write: false, writeWithoutResponse: false, notify: false, indicate: false,
      broadcast: false, authenticatedSignedWrites: false, ...props,
    },
    writeValue: vi.fn().mockResolvedValue(undefined),
    writeValueWithoutResponse: vi.fn().mockResolvedValue(undefined),
    startNotifications: vi.fn().mockResolvedValue(undefined),
    stopNotifications: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
}

function gattDevice() {
  const writeChar = gattChar(NUS_WRITE, { write: true, writeWithoutResponse: true })
  const notifyChar = gattChar(NUS_NOTIFY, { notify: true })
  const service = { uuid: NUS_SERVICE, isPrimary: true, getCharacteristics: vi.fn().mockResolvedValue([writeChar, notifyChar]) }
  const server = { connected: false, disconnect: vi.fn(() => { server.connected = false }), getPrimaryServices: vi.fn().mockResolvedValue([service]) }
  const device = {
    id: 'buzz-int', name: 'Buzz',
    gatt: { connect: vi.fn(async () => { server.connected = true; return server }) },
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  } as unknown as BluetoothDevice
  return { device, writeChar, notifyChar }
}

const sentTo = (char: ReturnType<typeof gattChar>) =>
  char.writeValueWithoutResponse.mock.calls.map((c) => new TextDecoder().decode(c[0] as ArrayBuffer))

describe('NeosensoryBuzzAdapter — connect handshake + telemetry + vibrate (integration)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('runs the auth/init handshake on connect, then streams deduped motor frames', async () => {
    const { device, writeChar } = gattDevice()
    vi.spyOn(BleAdapter, 'getDeviceById').mockResolvedValue(device)
    const a = new NeosensoryBuzzAdapter('buzz-int', { ...CFG, deviceId: 'buzz-int' })
    await a.connect()
    expect(a.ready).toBe(true)

    // Developer auth/init handshake, in order, on the NUS write char.
    const handshake = sentTo(writeChar)
    expect(handshake.slice(0, 4)).toEqual(['auth as developer\n', 'accept\n', 'audio stop\n', 'motors start\n'])
    expect(handshake).toContain('device battery_soc\n')

    // Live streaming: identical frames dedupe, a changed frame sends.
    writeChar.writeValueWithoutResponse.mockClear()
    await a.vibrate([1, 0, 0, 0], 30, 255)
    await a.vibrate([1, 0, 0, 0], 30, 255) // identical → skipped
    await a.vibrate([0, 0, 0, 0], 30, 255) // changed → sent
    const frames = sentTo(writeChar)
    expect(frames).toHaveLength(2)
    expect(frames[0].startsWith('motors vibrate ')).toBe(true)
    // motor 1 at full → byte 255; the base64 payload decodes to [255,0,0,0].
    const b64 = frames[0].replace('motors vibrate ', '').trim()
    expect([...Buffer.from(b64, 'base64')]).toEqual([255, 0, 0, 0])

    a.dispose()
  })

  it('parses battery + button telemetry from TX notifications', async () => {
    const { device, notifyChar } = gattDevice()
    vi.spyOn(BleAdapter, 'getDeviceById').mockResolvedValue(device)
    const a = new NeosensoryBuzzAdapter('buzz-tel', { ...CFG, deviceId: 'buzz-tel' })
    await a.connect()

    // The subscribe wired a characteristicvaluechanged handler on the TX char; drive it with CLI JSON.
    const call = notifyChar.addEventListener.mock.calls.find((c) => c[0] === 'characteristicvaluechanged')
    expect(call).toBeDefined()
    const handler = call![1] as (e: { target: { value: DataView } }) => void
    const dv = (s: string) => { const b = new TextEncoder().encode(s); return new DataView(b.buffer) }

    handler({ target: { value: dv('{"battery_soc":77}') } })
    expect(a.batteryPct).toBe(77)

    handler({ target: { value: dv('{"button":1}') } })
    expect(a.takeButtonEvents()).toBe(1)
    expect(a.takeButtonEvents()).toBe(0) // drained

    a.dispose()
  })
})
