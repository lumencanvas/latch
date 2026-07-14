/**
 * Connectivity shared state, helpers & lifecycle (Workstream B co-location).
 *
 * The per-node connection state Maps (BLE / MIDI / OSC / serial), the shared helpers (getCached/
 * setCached, OSC encode/decode, BLE profile lookups), and the gc/dispose lifecycle live here so each
 * connectivity node's executor can co-locate in its own registry/connectivity/<id>/node.ts. Moved
 * verbatim from engine/executors/connectivity.ts (now deleted). Store-free leaf.
 *
 * NOTE: the httpRequest/websocket/mqtt executors below are DEAD duplicates (no importer — the live
 * websocket/mqtt nodes use engine/executors/{websocket,mqtt}.ts); kept byte-faithful here, to be pruned
 * in a separate cleanup.
 */

import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineLifecycle } from '@/engine/nodeState'
import { BleAdapter, type BleServiceInfo } from '@/services/connections/adapters/BleAdapter'



// Cache for WebSocket connections and state
export const wsConnections = new Map<string, WebSocket>()
export const wsState = new Map<string, unknown>()

// Cache for HTTP request state
export const httpCache = new Map<string, unknown>()

// MIDI state
export const midiInputs = new Map<string, MIDIInput>()
export const midiOutputs = new Map<string, MIDIOutput>()
export const midiState = new Map<string, unknown>()
export const midiNoteOffTimeouts = new Map<string, ReturnType<typeof setTimeout>[]>()

/**
 * Helper to get cached value
 */
export function getCached<T>(key: string, defaultValue: T): T {
  const caches = [httpCache, wsState, midiState]
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
// HTTP Request Node
// ============================================================================

export const httpRequestExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const url = (ctx.inputs.get('url') as string) ?? (ctx.controls.get('url') as string) ?? ''
  const method = (ctx.controls.get('method') as string) ?? 'GET'
  const headers = (ctx.inputs.get('headers') as Record<string, string>) ?? {}
  const body = ctx.inputs.get('body')
  const trigger = ctx.inputs.get('trigger') as boolean | undefined

  const outputs = new Map<string, unknown>()

  if (!url.trim()) {
    outputs.set('response', null)
    outputs.set('status', 0)
    outputs.set('error', 'No URL provided')
    outputs.set('loading', false)
    return outputs
  }

  // Only fetch when triggered or URL changed
  const cacheKey = `${ctx.nodeId}:lastUrl`
  const lastUrl = getCached<string>(cacheKey, '')
  const shouldFetch = trigger === true || (trigger === undefined && url !== lastUrl)

  if (!shouldFetch) {
    outputs.set('response', getCached(`${ctx.nodeId}:response`, null))
    outputs.set('status', getCached(`${ctx.nodeId}:status`, 0))
    outputs.set('error', getCached(`${ctx.nodeId}:error`, null))
    outputs.set('loading', getCached(`${ctx.nodeId}:loading`, false))
    return outputs
  }

  setCached(httpCache, cacheKey, url)
  setCached(httpCache, `${ctx.nodeId}:loading`, true)

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }

    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
    }

    const response = await fetch(url, fetchOptions)
    const contentType = response.headers.get('content-type') || ''

    let data: unknown
    if (contentType.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }

    setCached(httpCache, `${ctx.nodeId}:response`, data)
    setCached(httpCache, `${ctx.nodeId}:status`, response.status)
    setCached(httpCache, `${ctx.nodeId}:error`, null)
    setCached(httpCache, `${ctx.nodeId}:loading`, false)

    outputs.set('response', data)
    outputs.set('status', response.status)
    outputs.set('error', null)
    outputs.set('loading', false)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    setCached(httpCache, `${ctx.nodeId}:response`, null)
    setCached(httpCache, `${ctx.nodeId}:status`, 0)
    setCached(httpCache, `${ctx.nodeId}:error`, errorMsg)
    setCached(httpCache, `${ctx.nodeId}:loading`, false)

    outputs.set('response', null)
    outputs.set('status', 0)
    outputs.set('error', errorMsg)
    outputs.set('loading', false)
  }

  return outputs
}

// ============================================================================
// WebSocket Node
// ============================================================================

export const websocketExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const url = (ctx.inputs.get('url') as string) ?? (ctx.controls.get('url') as string) ?? ''
  const sendData = ctx.inputs.get('send')
  const connect = (ctx.inputs.get('connect') as boolean) ?? (ctx.controls.get('autoConnect') as boolean) ?? false

  const outputs = new Map<string, unknown>()

  if (!url.trim()) {
    outputs.set('message', null)
    outputs.set('connected', false)
    outputs.set('error', null)
    return outputs
  }

  const wsKey = `${ctx.nodeId}:ws`
  let ws = wsConnections.get(wsKey)

  // Handle connection
  if (connect && !ws) {
    try {
      ws = new WebSocket(url)

      ws.onopen = () => {
        setCached(wsState, `${ctx.nodeId}:connected`, true)
        setCached(wsState, `${ctx.nodeId}:error`, null)
      }

      ws.onmessage = (event) => {
        let data = event.data
        try {
          data = JSON.parse(event.data)
        } catch {
          // Keep as string if not JSON
        }
        setCached(wsState, `${ctx.nodeId}:message`, data)
        setCached(wsState, `${ctx.nodeId}:lastMessageTime`, Date.now())
      }

      ws.onerror = (event) => {
        setCached(wsState, `${ctx.nodeId}:error`, 'WebSocket error')
        console.error('[WebSocket] Error:', event)
      }

      ws.onclose = () => {
        setCached(wsState, `${ctx.nodeId}:connected`, false)
        wsConnections.delete(wsKey)
      }

      wsConnections.set(wsKey, ws)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setCached(wsState, `${ctx.nodeId}:error`, errorMsg)
    }
  }

  // Handle disconnect
  if (!connect && ws) {
    ws.close()
    wsConnections.delete(wsKey)
    setCached(wsState, `${ctx.nodeId}:connected`, false)
  }

  // Send data if connected
  if (sendData !== undefined && ws && ws.readyState === WebSocket.OPEN) {
    const dataToSend = typeof sendData === 'string' ? sendData : JSON.stringify(sendData)
    ws.send(dataToSend)
  }

  outputs.set('message', getCached(`${ctx.nodeId}:message`, null))
  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))
  outputs.set('error', getCached(`${ctx.nodeId}:error`, null))

  return outputs
}

// ============================================================================
// MQTT Node (uses WebSocket-based MQTT)
// ============================================================================

export const mqttConnections = new Map<string, { client: WebSocket; subscriptions: Set<string> }>()
export const mqttState = new Map<string, unknown>()

export const mqttExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const brokerUrl = (ctx.inputs.get('url') as string) ?? (ctx.controls.get('url') as string) ?? ''
  const topic = (ctx.inputs.get('topic') as string) ?? (ctx.controls.get('topic') as string) ?? ''
  const publishData = ctx.inputs.get('publish')
  const connect = (ctx.controls.get('connect') as boolean) ?? true

  const outputs = new Map<string, unknown>()

  if (!brokerUrl.trim()) {
    outputs.set('message', null)
    outputs.set('topic', null)
    outputs.set('connected', false)
    outputs.set('error', 'No broker URL provided')
    return outputs
  }

  const mqttKey = `${ctx.nodeId}:mqtt`
  let connection = mqttConnections.get(mqttKey)

  // Handle connection (MQTT over WebSocket)
  if (connect && !connection) {
    try {
      // Convert mqtt:// to ws:// for WebSocket connection
      let wsUrl = brokerUrl
      if (brokerUrl.startsWith('mqtt://')) {
        wsUrl = brokerUrl.replace('mqtt://', 'ws://') + ':8083/mqtt'
      } else if (brokerUrl.startsWith('mqtts://')) {
        wsUrl = brokerUrl.replace('mqtts://', 'wss://') + ':8084/mqtt'
      }

      const ws = new WebSocket(wsUrl, ['mqtt'])

      connection = { client: ws, subscriptions: new Set() }
      mqttConnections.set(mqttKey, connection)

      ws.onopen = () => {
        setCached(mqttState, `${ctx.nodeId}:connected`, true)
        setCached(mqttState, `${ctx.nodeId}:error`, null)

        // Send MQTT CONNECT packet (simplified)
        const connectPacket = new Uint8Array([
          0x10, // CONNECT packet type
          0x12, // Remaining length
          0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // Protocol name "MQTT"
          0x04, // Protocol level 4 (MQTT 3.1.1)
          0x02, // Connect flags (Clean session)
          0x00, 0x3c, // Keep alive 60 seconds
          0x00, 0x06, // Client ID length
          0x63, 0x6c, 0x61, 0x73, 0x70, 0x31, // Client ID "clasp1"
        ])
        ws.send(connectPacket)
      }

      ws.onmessage = async (event) => {
        const data = event.data instanceof Blob
          ? new Uint8Array(await event.data.arrayBuffer())
          : new Uint8Array(event.data)

        if (data[0] === 0x20) { // CONNACK
        } else if ((data[0] & 0xf0) === 0x30) { // PUBLISH
          // Parse PUBLISH packet
          let offset = 1
          let remainingLength = data[offset++]
          if (remainingLength > 127) {
            remainingLength = (remainingLength & 0x7f) | ((data[offset++] & 0x7f) << 7)
          }

          const topicLength = (data[offset] << 8) | data[offset + 1]
          offset += 2
          const receivedTopic = new TextDecoder().decode(data.slice(offset, offset + topicLength))
          offset += topicLength

          const payload = new TextDecoder().decode(data.slice(offset))

          let parsedPayload: unknown = payload
          try {
            parsedPayload = JSON.parse(payload)
          } catch {
            // Keep as string
          }

          setCached(mqttState, `${ctx.nodeId}:message`, parsedPayload)
          setCached(mqttState, `${ctx.nodeId}:topic`, receivedTopic)
        }
      }

      ws.onerror = () => {
        setCached(mqttState, `${ctx.nodeId}:error`, 'MQTT connection error')
        setCached(mqttState, `${ctx.nodeId}:connected`, false)
      }

      ws.onclose = () => {
        setCached(mqttState, `${ctx.nodeId}:connected`, false)
        mqttConnections.delete(mqttKey)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setCached(mqttState, `${ctx.nodeId}:error`, errorMsg)
    }
  }

  // Handle disconnect
  if (!connect && connection) {
    connection.client.close()
    mqttConnections.delete(mqttKey)
    setCached(mqttState, `${ctx.nodeId}:connected`, false)
  }

  // Subscribe to topic
  if (connection && connection.client.readyState === WebSocket.OPEN && topic && !connection.subscriptions.has(topic)) {
    const topicBytes = new TextEncoder().encode(topic)
    const subscribePacket = new Uint8Array([
      0x82, // SUBSCRIBE packet
      topicBytes.length + 5, // Remaining length
      0x00, 0x01, // Packet identifier
      0x00, topicBytes.length, // Topic length
      ...topicBytes,
      0x00, // QoS 0
    ])
    connection.client.send(subscribePacket)
    connection.subscriptions.add(topic)
  }

  // Publish message
  if (connection && connection.client.readyState === WebSocket.OPEN && publishData !== undefined && topic) {
    const topicBytes = new TextEncoder().encode(topic)
    const payload = typeof publishData === 'string' ? publishData : JSON.stringify(publishData)
    const payloadBytes = new TextEncoder().encode(payload)

    const publishPacket = new Uint8Array([
      0x30, // PUBLISH packet (QoS 0)
      topicBytes.length + payloadBytes.length + 2,
      0x00, topicBytes.length,
      ...topicBytes,
      ...payloadBytes,
    ])
    connection.client.send(publishPacket)
  }

  outputs.set('message', getCached(`${ctx.nodeId}:message`, null))
  outputs.set('topic', getCached(`${ctx.nodeId}:topic`, null))
  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))
  outputs.set('error', getCached(`${ctx.nodeId}:error`, null))

  return outputs
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
  properties: Record<string, boolean> | null
  error: string | null
}>()

// ============================================================================
// Cleanup helpers
// ============================================================================

export function disposeConnectivityNode(nodeId: string): void {
  // Close WebSocket - nullify handlers first to prevent stale callbacks
  const wsKey = `${nodeId}:ws`
  const ws = wsConnections.get(wsKey)
  if (ws) {
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
    ws.close()
    wsConnections.delete(wsKey)
  }

  // Close MQTT connection - nullify handlers first
  const mqttKey = `${nodeId}:mqtt`
  const mqtt = mqttConnections.get(mqttKey)
  if (mqtt) {
    mqtt.client.onopen = null
    mqtt.client.onmessage = null
    mqtt.client.onerror = null
    mqtt.client.onclose = null
    mqtt.client.close()
    mqttConnections.delete(mqttKey)
  }

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
    serial.reader?.cancel()
    serial.port.close().catch(() => {})
    serialPorts.delete(serialKey)
  }

  // Clear MIDI note-off timeouts
  const midiTimeouts = midiNoteOffTimeouts.get(nodeId)
  if (midiTimeouts) {
    midiTimeouts.forEach(timeoutId => clearTimeout(timeoutId))
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
      bleCharHandler.characteristic.stopNotifications()
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

  // Clear caches
  const keys = [
    ...Array.from(httpCache.keys()),
    ...Array.from(wsState.keys()),
    ...Array.from(midiState.keys()),
    ...Array.from(mqttState.keys()),
    ...Array.from(oscState.keys()),
    ...Array.from(serialState.keys()),
    ...Array.from(bleState.keys()),
  ].filter(k => k.startsWith(nodeId))
  keys.forEach(k => {
    httpCache.delete(k)
    wsState.delete(k)
    midiState.delete(k)
    mqttState.delete(k)
    oscState.delete(k)
    serialState.delete(k)
    bleState.delete(k)
  })
}

export function disposeAllConnectivityNodes(): void {
  // Close all WebSockets - nullify handlers first
  wsConnections.forEach(ws => {
    ws.onopen = null
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
    ws.close()
  })
  wsConnections.clear()

  // Close all MQTT connections - nullify handlers first
  mqttConnections.forEach(conn => {
    conn.client.onopen = null
    conn.client.onmessage = null
    conn.client.onerror = null
    conn.client.onclose = null
    conn.client.close()
  })
  mqttConnections.clear()

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
  serialPorts.forEach(conn => {
    conn.reader?.cancel()
    conn.port.close().catch(() => {})
  })
  serialPorts.clear()

  // Clear all MIDI note-off timeouts
  midiNoteOffTimeouts.forEach(timeouts => {
    timeouts.forEach(timeoutId => clearTimeout(timeoutId))
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
      characteristic.stopNotifications()
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
  httpCache.clear()
  wsState.clear()
  midiState.clear()
  mqttState.clear()
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

  // Clean WebSocket connections - nullify handlers first
  for (const key of wsConnections.keys()) {
    if (!validNodeIds.has(getNodeId(key))) {
      const ws = wsConnections.get(key)
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        ws.close()
      }
      wsConnections.delete(key)
    }
  }

  // Clean MQTT connections - nullify handlers first
  for (const key of mqttConnections.keys()) {
    if (!validNodeIds.has(getNodeId(key))) {
      const conn = mqttConnections.get(key)
      if (conn) {
        conn.client.onopen = null
        conn.client.onmessage = null
        conn.client.onerror = null
        conn.client.onclose = null
        conn.client.close()
      }
      mqttConnections.delete(key)
    }
  }

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
      if (conn) {
        conn.reader?.cancel()
        conn.port.close().catch(() => {})
      }
      serialPorts.delete(key)
    }
  }

  // Clean MIDI note-off timeouts
  for (const nodeId of midiNoteOffTimeouts.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const timeouts = midiNoteOffTimeouts.get(nodeId)
      if (timeouts) {
        timeouts.forEach(timeoutId => clearTimeout(timeoutId))
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
          entry.characteristic.stopNotifications()
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
  for (const key of httpCache.keys()) {
    if (!validNodeIds.has(getNodeId(key))) httpCache.delete(key)
  }
  for (const key of wsState.keys()) {
    if (!validNodeIds.has(getNodeId(key))) wsState.delete(key)
  }
  for (const key of midiState.keys()) {
    if (!validNodeIds.has(getNodeId(key))) midiState.delete(key)
  }
  for (const key of mqttState.keys()) {
    if (!validNodeIds.has(getNodeId(key))) mqttState.delete(key)
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
// (The old http/websocket/mqtt implementations above are superseded by the
// ConnectionManager-based http/websocket/mqtt.ts executors and no longer registered.)

// Connectivity state cleanup self-registers with the engine's generic lifecycle loop
// (was hand-wired as gcConnectivityState / disposeAllConnectivityNodes calls in
// ExecutionEngine). defineLifecycle-wrap: the OSC/Serial/MIDI/BLE/legacy-WS teardown
// (handler-nulling + close) is unchanged, only invoked generically.
defineLifecycle({
  label: 'connectivity',
  gc: gcConnectivityState,
  disposeAll: disposeAllConnectivityNodes,
})
