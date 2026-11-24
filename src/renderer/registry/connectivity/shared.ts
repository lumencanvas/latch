/**
 * Connectivity shared state, helpers & lifecycle (Workstream B co-location).
 *
 * The per-node connection state Maps (BLE / MIDI / OSC / serial), the shared helpers (getCached/
 * setCached, OSC encode/decode, BLE profile lookups), and the gc/dispose lifecycle live here so each
 * connectivity node's executor can co-locate in its own registry/connectivity/<id>/node.ts. Moved
 * verbatim from engine/executors/connectivity.ts (now deleted). Store-free leaf.
 *
 * The old httpRequest/websocket/mqtt executor duplicates that lived here (no importer — the live
 * http/websocket/mqtt nodes use engine/executors/{http,websocket,mqtt}.ts) have been removed, along
 * with their per-node Maps and teardown.
 */

import { defineLifecycle } from '@/engine/nodeState'
import { BleAdapter, type BleServiceInfo, type BleCharacteristicProperties } from '@/services/connections/adapters/BleAdapter'


// MIDI state
export const midiInputs = new Map<string, MIDIInput>()
export const midiOutputs = new Map<string, MIDIOutput>()
export const midiState = new Map<string, unknown>()
/** Scheduled Note Offs per node. `flush` sends the Note Off now — teardown calls it instead of
 *  just clearing the timer, which left the note STUCK ON at the synth on delete/Stop. */
export interface PendingNoteOff { id: ReturnType<typeof setTimeout>; flush: () => void }
export const midiNoteOffTimeouts = new Map<string, PendingNoteOff[]>()

/** Clear each pending Note Off timer and send its Note Off immediately. */
export function flushNoteOffs(pending: PendingNoteOff[]): void {
  for (const p of pending) {
    clearTimeout(p.id)
    try { p.flush() } catch { /* port may be gone */ }
  }
  pending.length = 0
}

/**
 * Helper to get cached value
 */
export function getCached<T>(key: string, defaultValue: T): T {
  // Every cache a node `setCached`s into must be listed here — osc/serial/ble were missing, so
  // those nodes' outputs (connected/value/text/line/…) always read back their defaults.
  const caches = [midiState, oscState, serialState, bleState]
  for (const cache of caches) {
    if (cache.has(key)) {
      return cache.get(key) as T
    }
  }
  return defaultValue
}

/**
 * Helper to set cached value
 */
export function setCached(cache: Map<string, unknown>, key: string, value: unknown): void {
  cache.set(key, value)
}

// ============================================================================
// OSC Node (Open Sound Control over WebSocket)
// ============================================================================

export const oscConnections = new Map<string, WebSocket>()
export const oscState = new Map<string, unknown>()

// OSC message encoding/decoding helpers
export function encodeOSCString(str: string): Uint8Array {
  const bytes = new TextEncoder().encode(str)
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / 4) * 4)
  padded.set(bytes)
  return padded
}

export function encodeOSCMessage(address: string, args: unknown[]): Uint8Array {
  const addressBytes = encodeOSCString(address)

  // Build type tag string
  let typeTag = ','
  for (const arg of args) {
    if (typeof arg === 'number') {
      typeTag += Number.isInteger(arg) ? 'i' : 'f'
    } else if (typeof arg === 'string') {
      typeTag += 's'
    } else if (typeof arg === 'boolean') {
      typeTag += arg ? 'T' : 'F'
    }
  }
  const typeTagBytes = encodeOSCString(typeTag)

  // Build argument data
  const argBuffers: Uint8Array[] = []
  for (const arg of args) {
    if (typeof arg === 'number') {
      const buffer = new ArrayBuffer(4)
      const view = new DataView(buffer)
      if (Number.isInteger(arg)) {
        view.setInt32(0, arg, false)
      } else {
        view.setFloat32(0, arg, false)
      }
      argBuffers.push(new Uint8Array(buffer))
    } else if (typeof arg === 'string') {
      argBuffers.push(encodeOSCString(arg))
    }
    // Booleans don't need data, just type tag
  }

  // Combine all parts
  const totalLength = addressBytes.length + typeTagBytes.length + argBuffers.reduce((sum, b) => sum + b.length, 0)
  const message = new Uint8Array(totalLength)
  let offset = 0
  message.set(addressBytes, offset)
  offset += addressBytes.length
  message.set(typeTagBytes, offset)
  offset += typeTagBytes.length
  for (const buf of argBuffers) {
    message.set(buf, offset)
    offset += buf.length
  }

  return message
}

export function decodeOSCMessage(data: Uint8Array): { address: string; args: unknown[] } | null {
  try {
    let offset = 0

    // Read address
    let addressEnd = offset
    while (data[addressEnd] !== 0) addressEnd++
    const address = new TextDecoder().decode(data.slice(offset, addressEnd))
    offset = Math.ceil((addressEnd + 1) / 4) * 4

    // Read type tag
    let typeTagEnd = offset
    while (data[typeTagEnd] !== 0) typeTagEnd++
    const typeTag = new TextDecoder().decode(data.slice(offset + 1, typeTagEnd)) // Skip ','
    offset = Math.ceil((typeTagEnd + 1) / 4) * 4

    // Read arguments
    const args: unknown[] = []
    const view = new DataView(data.buffer, data.byteOffset)

    for (const type of typeTag) {
      switch (type) {
        case 'i':
          args.push(view.getInt32(offset, false))
          offset += 4
          break
        case 'f':
          args.push(view.getFloat32(offset, false))
          offset += 4
          break
        case 's': {
          let strEnd = offset
          while (data[strEnd] !== 0) strEnd++
          args.push(new TextDecoder().decode(data.slice(offset, strEnd)))
          offset = Math.ceil((strEnd + 1) / 4) * 4
          break
        }
        case 'T':
          args.push(true)
          break
        case 'F':
          args.push(false)
          break
      }
    }

    return { address, args }
  } catch {
    return null
  }
}

// ============================================================================
// Serial Port Node (Web Serial API)
// ============================================================================

// Web Serial API types (not in standard lib.dom.d.ts)
export interface SerialPortOptions {
  baudRate: number
  dataBits?: number
  stopBits?: number
  parity?: 'none' | 'even' | 'odd'
  bufferSize?: number
  flowControl?: 'none' | 'hardware'
}

export interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

export interface WebSerialPort {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  getInfo(): SerialPortInfo
  open(options: SerialPortOptions): Promise<void>
  close(): Promise<void>
}

export interface WebSerial {
  requestPort(options?: { filters?: { usbVendorId?: number; usbProductId?: number }[] }): Promise<WebSerialPort>
  getPorts(): Promise<WebSerialPort[]>
}

export const serialPorts = new Map<string, { port: WebSerialPort; reader: ReadableStreamDefaultReader<Uint8Array> | null }>()
export const serialState = new Map<string, unknown>()

/**
 * Release a serial connection: cancel the reader (releasing its lock — port.close() rejects while
 * a reader holds the stream), then close the port. Both promises are caught: they reject once
 * the device is unplugged, which would otherwise surface as an unhandled rejection.
 */
export function closeSerialConnection(conn: { port: WebSerialPort; reader: ReadableStreamDefaultReader<Uint8Array> | null }): void {
  const reader = conn.reader
  conn.reader = null
  const cancelled = reader ? reader.cancel().catch(() => {}).then(() => { try { reader.releaseLock() } catch { /* ignore */ } }) : Promise.resolve()
  cancelled.then(() => conn.port.close()).catch(() => {})
}

// ============================================================================
// BLE Node (Web Bluetooth API)
// ============================================================================

export const bleDevices = new Map<string, { device: BluetoothDevice; server: BluetoothRemoteGATTServer | null }>()
export const bleState = new Map<string, unknown>()
// Store BLE characteristic handlers for cleanup
export const bleCharacteristicHandlers = new Map<string, { characteristic: BluetoothRemoteGATTCharacteristic; handler: (event: Event) => void }>()

// Enhanced BLE state for new nodes
export const bleAdapters = new Map<string, BleAdapter>()
export const bleScannerState = new Map<string, {
  device: BluetoothDevice | null
  scanning: boolean
  status: string
  error: string | null
  /** Last `getDevices()` attempt (ms) when resolving a bound `deviceId`; throttles the per-frame retry. */
  lastBindAttempt?: number
  /** The `deviceId` the throttle is keyed to — a change resets the throttle so a rebind resolves at once. */
  boundAttemptId?: string
}>()
export const bleDeviceState = new Map<string, {
  adapter: BleAdapter | null
  services: BleServiceInfo[]
  connected: boolean
  status: string
  error: string | null
  /** autoConnect is edge-triggered: fires the initial connect once, then the adapter owns retries. */
  autoConnectFired?: boolean
}>()
export const bleCharacteristicState = new Map<string, {
  subscribed: boolean
  value: unknown
  rawValue: Uint8Array | null
  text: string
  formatted: string
  notified: boolean
  properties: BleCharacteristicProperties | null
  error: string | null
  /** Discovered GATT services (captured on connect) — the panel's dropdowns pick from these. */
  services: BleServiceInfo[]
  /** Set by the panel's Read button; the executor performs one read next frame and clears it. */
  readRequested: boolean
  /** The characteristic UUID currently subscribed — so switching characteristics unsubscribes the old one. */
  subscribedChar: string
  /** Device resolved gesture-free from the `deviceId` control (direct-pairing path, no upstream node). */
  boundDevice: BluetoothDevice | null
  /** Throttle + retarget bookkeeping for the gesture-free `deviceId` resolve (mirrors ble-scanner). */
  lastBindAttempt?: number
  boundAttemptId?: string
  /** Last connect() attempt (ms) — the executor owns reconnect (throttled), so a drop re-dials + re-discovers. */
  lastConnectAt: number
  /** connect()+discoverServices() in flight (run off-frame so a 1–3 s GATT connect doesn't freeze the graph). */
  connecting?: boolean
  /** A GATT read is in flight (continuous mode must not queue one read per frame). */
  reading?: boolean
  /** Last failed subscribe attempt (ms) — throttles retries instead of a GATT call every frame. */
  lastSubscribeAttempt?: number
}>()

/** Called by the BLE Characteristic panel's Read button — the executor reads once next frame. */
export function requestBleRead(nodeId: string): void {
  const s = bleCharacteristicState.get(nodeId)
  if (s) s.readRequested = true
}

// ============================================================================
// Cleanup helpers
// ============================================================================

export function disposeConnectivityNode(nodeId: string): void {
  // Close OSC connection - nullify handlers first
  const oscKey = `${nodeId}:osc`
  const osc = oscConnections.get(oscKey)
  if (osc) {
    osc.onopen = null
    osc.onmessage = null
    osc.onerror = null
    osc.onclose = null
    osc.close()
    oscConnections.delete(oscKey)
  }

  // Close Serial connection
  const serialKey = `${nodeId}:serial`
  const serial = serialPorts.get(serialKey)
  if (serial) {
    closeSerialConnection(serial)
    serialPorts.delete(serialKey)
  }

  // Clear MIDI note-off timeouts
  const midiTimeouts = midiNoteOffTimeouts.get(nodeId)
  if (midiTimeouts) {
    flushNoteOffs(midiTimeouts)
    midiNoteOffTimeouts.delete(nodeId)
  }

  // Remove MIDI input listener
  const midiKey = `${nodeId}:midi`
  const midiInput = midiInputs.get(midiKey)
  if (midiInput) {
    midiInput.onmidimessage = null
    midiInputs.delete(midiKey)
  }

  // Remove MIDI output reference
  midiOutputs.delete(midiKey)

  // Clean up BLE characteristic event listener before disconnect
  const bleCharHandler = bleCharacteristicHandlers.get(nodeId)
  if (bleCharHandler) {
    try {
      bleCharHandler.characteristic.removeEventListener('characteristicvaluechanged', bleCharHandler.handler)
      // stopNotifications() returns a promise that rejects once the device is gone — the
      // try/catch alone can't catch that (unhandled rejection on every delete/stop).
      bleCharHandler.characteristic.stopNotifications().catch(() => {})
    } catch {
      // Ignore errors during cleanup - device may already be disconnected
    }
    bleCharacteristicHandlers.delete(nodeId)
  }

  // Disconnect BLE (legacy)
  const bleKey = `${nodeId}:ble`
  const ble = bleDevices.get(bleKey)
  if (ble) {
    ble.server?.disconnect()
    bleDevices.delete(bleKey)
  }

  // Disconnect enhanced BLE adapters
  const bleAdapter = bleAdapters.get(nodeId)
  if (bleAdapter) {
    bleAdapter.dispose()
    bleAdapters.delete(nodeId)
  }
  const charAdapterKey = `char_${nodeId}`
  const charAdapter = bleAdapters.get(charAdapterKey)
  if (charAdapter) {
    charAdapter.dispose()
    bleAdapters.delete(charAdapterKey)
  }

  // Clear enhanced BLE state
  bleScannerState.delete(nodeId)
  bleDeviceState.delete(nodeId)
  bleCharacteristicState.delete(nodeId)

  // Clear caches. Match `${nodeId}:` exactly — a bare startsWith(nodeId) also wiped any OTHER
  // node whose id merely begins with this one's.
  const prefix = `${nodeId}:`
  for (const cache of [midiState, oscState, serialState, bleState]) {
    for (const k of Array.from(cache.keys())) if (k.startsWith(prefix)) cache.delete(k)
  }
}

export function disposeAllConnectivityNodes(): void {
  // Close all OSC connections - nullify handlers first
  oscConnections.forEach(ws => {
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
    ws.close()
  })
  oscConnections.clear()

  // Close all Serial connections
  serialPorts.forEach(conn => closeSerialConnection(conn))
  serialPorts.clear()

  // Clear all MIDI note-off timeouts
  midiNoteOffTimeouts.forEach(timeouts => {
    flushNoteOffs(timeouts)
  })
  midiNoteOffTimeouts.clear()

  // Clear MIDI input listeners
  midiInputs.forEach(input => {
    input.onmidimessage = null
  })
  midiInputs.clear()
  midiOutputs.clear()

  // Clean up all BLE characteristic handlers before disconnect
  bleCharacteristicHandlers.forEach(({ characteristic, handler }) => {
    try {
      characteristic.removeEventListener('characteristicvaluechanged', handler)
      characteristic.stopNotifications().catch(() => {})
    } catch {
      // Ignore errors during cleanup
    }
  })
  bleCharacteristicHandlers.clear()

  // Disconnect all BLE devices (legacy)
  bleDevices.forEach(conn => conn.server?.disconnect())
  bleDevices.clear()

  // Disconnect all enhanced BLE adapters
  bleAdapters.forEach(adapter => adapter.dispose())
  bleAdapters.clear()

  // Clear all caches
  midiState.clear()
  oscState.clear()
  serialState.clear()
  bleState.clear()

  // Clear enhanced BLE state
  bleScannerState.clear()
  bleDeviceState.clear()
  bleCharacteristicState.clear()
}

export function gcConnectivityState(validNodeIds: Set<string>): void {
  // Helper to extract nodeId from keys like "nodeId:suffix"
  const getNodeId = (key: string) => key.split(':')[0]

  // Clean OSC connections - nullify handlers first
  for (const key of oscConnections.keys()) {
    if (!validNodeIds.has(getNodeId(key))) {
      const ws = oscConnections.get(key)
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        ws.close()
      }
      oscConnections.delete(key)
    }
  }

  // Clean Serial connections
  for (const key of serialPorts.keys()) {
    if (!validNodeIds.has(getNodeId(key))) {
      const conn = serialPorts.get(key)
      if (conn) closeSerialConnection(conn)
      serialPorts.delete(key)
    }
  }

  // Clean MIDI note-off timeouts
  for (const nodeId of midiNoteOffTimeouts.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const timeouts = midiNoteOffTimeouts.get(nodeId)
      if (timeouts) {
        flushNoteOffs(timeouts)
      }
      midiNoteOffTimeouts.delete(nodeId)
    }
  }

  // Clean MIDI inputs - remove listeners
  for (const key of midiInputs.keys()) {
    if (!validNodeIds.has(getNodeId(key))) {
      const input = midiInputs.get(key)
      if (input) input.onmidimessage = null
      midiInputs.delete(key)
    }
  }

  // Clean MIDI outputs
  for (const key of midiOutputs.keys()) {
    if (!validNodeIds.has(getNodeId(key))) {
      midiOutputs.delete(key)
    }
  }

  // Clean BLE adapters
  for (const nodeId of bleAdapters.keys()) {
    // Handle both regular adapters and char_ prefixed adapters
    const baseNodeId = nodeId.startsWith('char_') ? nodeId.slice(5) : nodeId
    if (!validNodeIds.has(baseNodeId)) {
      const adapter = bleAdapters.get(nodeId)
      if (adapter) adapter.dispose()
      bleAdapters.delete(nodeId)
    }
  }

  // Clean BLE scanner state
  for (const nodeId of bleScannerState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      bleScannerState.delete(nodeId)
    }
  }

  // Clean BLE device state
  for (const nodeId of bleDeviceState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      bleDeviceState.delete(nodeId)
    }
  }

  // Clean BLE characteristic state
  for (const nodeId of bleCharacteristicState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      bleCharacteristicState.delete(nodeId)
    }
  }

  // Clean BLE characteristic handlers before disconnecting devices
  for (const nodeId of bleCharacteristicHandlers.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const entry = bleCharacteristicHandlers.get(nodeId)
      if (entry) {
        try {
          entry.characteristic.removeEventListener('characteristicvaluechanged', entry.handler)
          entry.characteristic.stopNotifications().catch(() => {})
        } catch {
          // Ignore errors during cleanup
        }
      }
      bleCharacteristicHandlers.delete(nodeId)
    }
  }

  // Clean BLE devices (legacy)
  for (const key of bleDevices.keys()) {
    if (!validNodeIds.has(getNodeId(key))) {
      const conn = bleDevices.get(key)
      if (conn) conn.server?.disconnect()
      bleDevices.delete(key)
    }
  }

  // Clean state caches
  for (const key of midiState.keys()) {
    if (!validNodeIds.has(getNodeId(key))) midiState.delete(key)
  }
  for (const key of oscState.keys()) {
    if (!validNodeIds.has(getNodeId(key))) oscState.delete(key)
  }
  for (const key of serialState.keys()) {
    if (!validNodeIds.has(getNodeId(key))) serialState.delete(key)
  }
  for (const key of bleState.keys()) {
    if (!validNodeIds.has(getNodeId(key))) bleState.delete(key)
  }
}

// ============================================================================
// Registry
// ============================================================================

// All connectivity nodes are co-located (registry/connectivity/<id>/node.ts) and import
// their executors from this module; there is no `connectivityExecutors` map to register.

// Connectivity state cleanup self-registers with the engine's generic lifecycle loop
// (was hand-wired as gcConnectivityState / disposeAllConnectivityNodes calls in
// ExecutionEngine). defineLifecycle-wrap: the OSC/Serial/MIDI/BLE teardown
// (handler-nulling + close) is unchanged, only invoked generically.
defineLifecycle({
  label: 'connectivity',
  gc: gcConnectivityState,
  disposeAll: disposeAllConnectivityNodes,
})
