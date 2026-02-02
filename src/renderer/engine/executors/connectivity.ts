/**
 * Connectivity Node Executors
 *
 * These executors handle external communication protocols:
 * - HTTP/REST requests
 * - WebSocket connections
 * - MIDI (Web MIDI API)
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { BleAdapter, type BleDataFormat, type BleServiceInfo } from '@/services/connections/adapters/BleAdapter'
import { parseCharacteristicValue, getServiceName, getCharacteristicName } from '@/services/ble/BleProfileRegistry'

// Cache for WebSocket connections and state
const wsConnections = new Map<string, WebSocket>()
const wsState = new Map<string, unknown>()

// Cache for HTTP request state
const httpCache = new Map<string, unknown>()

// MIDI state
const midiInputs = new Map<string, MIDIInput>()
const midiOutputs = new Map<string, MIDIOutput>()
const midiState = new Map<string, unknown>()
const midiNoteOffTimeouts = new Map<string, ReturnType<typeof setTimeout>[]>()

// Pre-compiled regex patterns for performance
const JSON_PATH_SPLIT_REGEX = /[.[\]]/

/**
 * Helper to get cached value
 */
function getCached<T>(key: string, defaultValue: T): T {
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
function setCached(cache: Map<string, unknown>, key: string, value: unknown): void {
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
// MIDI Input Node
// ============================================================================

export const midiInputExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true
  const channel = (ctx.controls.get('channel') as number) ?? -1 // -1 = all channels

  const outputs = new Map<string, unknown>()

  if (!enabled) {
    outputs.set('note', null)
    outputs.set('velocity', 0)
    outputs.set('cc', null)
    outputs.set('ccValue', 0)
    outputs.set('connected', false)
    return outputs
  }

  // Request MIDI access if not already done
  const midiKey = `${ctx.nodeId}:midi`
  if (!midiInputs.has(midiKey) && navigator.requestMIDIAccess) {
    try {
      const access = await navigator.requestMIDIAccess()

      // Get first available input
      const inputs = Array.from(access.inputs.values())
      if (inputs.length > 0) {
        const input = inputs[0]
        midiInputs.set(midiKey, input)

        input.onmidimessage = (event: MIDIMessageEvent) => {
          const [status, data1, data2] = event.data!
          const messageChannel = status & 0x0f
          const messageType = status & 0xf0

          // Filter by channel if specified
          if (channel !== -1 && messageChannel !== channel) return

          if (messageType === 0x90 && data2 > 0) {
            // Note On
            setCached(midiState, `${ctx.nodeId}:note`, data1)
            setCached(midiState, `${ctx.nodeId}:velocity`, data2 / 127)
            setCached(midiState, `${ctx.nodeId}:noteOn`, true)
          } else if (messageType === 0x80 || (messageType === 0x90 && data2 === 0)) {
            // Note Off
            setCached(midiState, `${ctx.nodeId}:noteOn`, false)
            setCached(midiState, `${ctx.nodeId}:velocity`, 0)
          } else if (messageType === 0xb0) {
            // Control Change
            setCached(midiState, `${ctx.nodeId}:cc`, data1)
            setCached(midiState, `${ctx.nodeId}:ccValue`, data2 / 127)
          }
        }

        setCached(midiState, `${ctx.nodeId}:connected`, true)
      }
    } catch (error) {
      console.error('[MIDI] Access denied:', error)
      setCached(midiState, `${ctx.nodeId}:connected`, false)
    }
  }

  outputs.set('note', getCached(`${ctx.nodeId}:note`, null))
  outputs.set('velocity', getCached(`${ctx.nodeId}:velocity`, 0))
  outputs.set('noteOn', getCached(`${ctx.nodeId}:noteOn`, false))
  outputs.set('cc', getCached(`${ctx.nodeId}:cc`, null))
  outputs.set('ccValue', getCached(`${ctx.nodeId}:ccValue`, 0))
  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))

  return outputs
}

// ============================================================================
// MIDI Output Node
// ============================================================================

export const midiOutputExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const note = ctx.inputs.get('note') as number | null
  const velocity = (ctx.inputs.get('velocity') as number) ?? 0.8
  const channel = (ctx.controls.get('channel') as number) ?? 0
  const trigger = ctx.inputs.get('trigger') as boolean | undefined

  const outputs = new Map<string, unknown>()

  // Request MIDI access if not already done
  const midiKey = `${ctx.nodeId}:midi`
  if (!midiOutputs.has(midiKey) && navigator.requestMIDIAccess) {
    try {
      const access = await navigator.requestMIDIAccess()

      // Get first available output
      const outputList = Array.from(access.outputs.values())
      if (outputList.length > 0) {
        const output = outputList[0]
        midiOutputs.set(midiKey, output)
        setCached(midiState, `${ctx.nodeId}:connected`, true)
      }
    } catch (error) {
      console.error('[MIDI] Access denied:', error)
      setCached(midiState, `${ctx.nodeId}:connected`, false)
    }
  }

  const output = midiOutputs.get(midiKey)

  // Send note if triggered
  if (trigger && note !== null && output) {
    const velocityByte = Math.round(velocity * 127)
    const noteOnStatus = 0x90 | channel
    const noteOffStatus = 0x80 | channel

    // Send Note On
    output.send([noteOnStatus, note, velocityByte])

    // Schedule Note Off after 100ms - track for cleanup
    const timeoutId = setTimeout(() => {
      output.send([noteOffStatus, note, 0])
      // Remove from tracking after execution
      const timeouts = midiNoteOffTimeouts.get(ctx.nodeId)
      if (timeouts) {
        const idx = timeouts.indexOf(timeoutId)
        if (idx >= 0) timeouts.splice(idx, 1)
      }
    }, 100)

    // Track the timeout for cleanup
    if (!midiNoteOffTimeouts.has(ctx.nodeId)) {
      midiNoteOffTimeouts.set(ctx.nodeId, [])
    }
    midiNoteOffTimeouts.get(ctx.nodeId)!.push(timeoutId)
  }

  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))

  return outputs
}

// ============================================================================
// JSON Parse Node
// ============================================================================

export const jsonParseExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = ctx.inputs.get('input') as string | undefined
  const path = (ctx.controls.get('path') as string) ?? ''

  const outputs = new Map<string, unknown>()

  if (!input) {
    outputs.set('output', null)
    outputs.set('error', null)
    return outputs
  }

  try {
    let parsed: unknown
    if (typeof input === 'string') {
      parsed = JSON.parse(input)
    } else {
      parsed = input
    }

    // Navigate path if provided (e.g., "data.items[0].name")
    if (path.trim()) {
      const parts = path.split(JSON_PATH_SPLIT_REGEX).filter(Boolean)
      let current: unknown = parsed
      for (const part of parts) {
        if (current && typeof current === 'object') {
          current = (current as Record<string, unknown>)[part]
        } else {
          current = undefined
          break
        }
      }
      outputs.set('output', current)
    } else {
      outputs.set('output', parsed)
    }
    outputs.set('error', null)
  } catch (error) {
    outputs.set('output', null)
    outputs.set('error', error instanceof Error ? error.message : 'Parse error')
  }

  return outputs
}

// ============================================================================
// JSON Stringify Node
// ============================================================================

export const jsonStringifyExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = ctx.inputs.get('input')
  const pretty = (ctx.controls.get('pretty') as boolean) ?? false

  const outputs = new Map<string, unknown>()

  if (input === undefined) {
    outputs.set('output', '')
    return outputs
  }

  try {
    const result = pretty ? JSON.stringify(input, null, 2) : JSON.stringify(input)
    outputs.set('output', result)
  } catch {
    outputs.set('output', String(input))
  }

  return outputs
}

// ============================================================================
// MQTT Node (uses WebSocket-based MQTT)
// ============================================================================

const mqttConnections = new Map<string, { client: WebSocket; subscriptions: Set<string> }>()
const mqttState = new Map<string, unknown>()

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

const oscConnections = new Map<string, WebSocket>()
const oscState = new Map<string, unknown>()

// OSC message encoding/decoding helpers
function encodeOSCString(str: string): Uint8Array {
  const bytes = new TextEncoder().encode(str)
  const padded = new Uint8Array(Math.ceil((bytes.length + 1) / 4) * 4)
  padded.set(bytes)
  return padded
}

function encodeOSCMessage(address: string, args: unknown[]): Uint8Array {
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

function decodeOSCMessage(data: Uint8Array): { address: string; args: unknown[] } | null {
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

export const oscExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const host = (ctx.inputs.get('host') as string) ?? (ctx.controls.get('host') as string) ?? 'localhost'
  const port = (ctx.inputs.get('port') as number) ?? (ctx.controls.get('port') as number) ?? 8080
  const address = (ctx.inputs.get('address') as string) ?? (ctx.controls.get('address') as string) ?? '/clasp'
  const sendValue = ctx.inputs.get('send')
  const connect = (ctx.controls.get('connect') as boolean) ?? true

  const outputs = new Map<string, unknown>()

  const oscKey = `${ctx.nodeId}:osc`
  let ws = oscConnections.get(oscKey)

  // Handle connection (OSC over WebSocket)
  if (connect && !ws) {
    try {
      ws = new WebSocket(`ws://${host}:${port}`)
      ws.binaryType = 'arraybuffer'
      oscConnections.set(oscKey, ws)

      ws.onopen = () => {
        setCached(oscState, `${ctx.nodeId}:connected`, true)
        setCached(oscState, `${ctx.nodeId}:error`, null)
      }

      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data)
        const message = decodeOSCMessage(data)
        if (message) {
          setCached(oscState, `${ctx.nodeId}:address`, message.address)
          setCached(oscState, `${ctx.nodeId}:args`, message.args)
          setCached(oscState, `${ctx.nodeId}:value`, message.args[0] ?? null)
        }
      }

      ws.onerror = () => {
        setCached(oscState, `${ctx.nodeId}:error`, 'OSC connection error')
        setCached(oscState, `${ctx.nodeId}:connected`, false)
      }

      ws.onclose = () => {
        setCached(oscState, `${ctx.nodeId}:connected`, false)
        oscConnections.delete(oscKey)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setCached(oscState, `${ctx.nodeId}:error`, errorMsg)
    }
  }

  // Handle disconnect
  if (!connect && ws) {
    ws.close()
    oscConnections.delete(oscKey)
    setCached(oscState, `${ctx.nodeId}:connected`, false)
  }

  // Send OSC message
  if (ws && ws.readyState === WebSocket.OPEN && sendValue !== undefined) {
    const args = Array.isArray(sendValue) ? sendValue : [sendValue]
    const message = encodeOSCMessage(address, args)
    ws.send(message)
  }

  outputs.set('address', getCached(`${ctx.nodeId}:address`, address))
  outputs.set('args', getCached(`${ctx.nodeId}:args`, []))
  outputs.set('value', getCached(`${ctx.nodeId}:value`, null))
  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))
  outputs.set('error', getCached(`${ctx.nodeId}:error`, null))

  return outputs
}

// ============================================================================
// Serial Port Node (Web Serial API)
// ============================================================================

// Web Serial API types (not in standard lib.dom.d.ts)
interface SerialPortOptions {
  baudRate: number
  dataBits?: number
  stopBits?: number
  parity?: 'none' | 'even' | 'odd'
  bufferSize?: number
  flowControl?: 'none' | 'hardware'
}

interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

interface WebSerialPort {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  getInfo(): SerialPortInfo
  open(options: SerialPortOptions): Promise<void>
  close(): Promise<void>
}

interface WebSerial {
  requestPort(options?: { filters?: { usbVendorId?: number; usbProductId?: number }[] }): Promise<WebSerialPort>
  getPorts(): Promise<WebSerialPort[]>
}

const serialPorts = new Map<string, { port: WebSerialPort; reader: ReadableStreamDefaultReader<Uint8Array> | null }>()
const serialState = new Map<string, unknown>()

export const serialExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const baudRate = (ctx.controls.get('baudRate') as number) ?? 9600
  const connect = (ctx.controls.get('connect') as boolean) ?? false
  const sendData = ctx.inputs.get('send') as string | undefined

  const outputs = new Map<string, unknown>()

  // Check if Web Serial API is available
  if (!('serial' in navigator)) {
    outputs.set('data', null)
    outputs.set('connected', false)
    outputs.set('error', 'Web Serial API not supported')
    return outputs
  }

  const serialKey = `${ctx.nodeId}:serial`
  let connection = serialPorts.get(serialKey)

  // Handle connection
  if (connect && !connection) {
    try {
      // Request port (this will show a browser dialog)
      const port = await (navigator as Navigator & { serial: WebSerial }).serial.requestPort()
      await port.open({ baudRate })

      connection = { port, reader: null }
      serialPorts.set(serialKey, connection)
      setCached(serialState, `${ctx.nodeId}:connected`, true)
      setCached(serialState, `${ctx.nodeId}:error`, null)

      // Start reading
      if (port.readable) {
        const reader = port.readable.getReader()
        connection.reader = reader

        // Maximum buffer size to prevent unbounded memory growth (64KB)
        const MAX_BUFFER_SIZE = 64 * 1024

        // Read loop
        const readLoop = async () => {
          try {
            while (connection && connection.reader) {
              const { value, done } = await connection.reader.read()
              if (done) break
              if (value) {
                const text = new TextDecoder().decode(value)
                let existingData = getCached<string>(`${ctx.nodeId}:data`, '')

                // Cap buffer size to prevent unbounded memory growth
                const newData = existingData + text
                if (newData.length > MAX_BUFFER_SIZE) {
                  // Keep only the most recent data, truncating from the start
                  existingData = newData.slice(-MAX_BUFFER_SIZE)
                } else {
                  existingData = newData
                }
                setCached(serialState, `${ctx.nodeId}:data`, existingData)

                // Parse lines
                const lines = existingData.split('\n')
                if (lines.length > 1) {
                  const lastLine = lines[lines.length - 2] // Last complete line
                  setCached(serialState, `${ctx.nodeId}:line`, lastLine)

                  // Try to parse as number
                  const num = parseFloat(lastLine)
                  if (!isNaN(num)) {
                    setCached(serialState, `${ctx.nodeId}:value`, num)
                  }
                }
              }
            }
          } catch (error) {
            if ((error as Error).name !== 'NetworkError') {
              console.error('[Serial] Read error:', error)
              setCached(serialState, `${ctx.nodeId}:error`, (error as Error).message)
            }
          }
        }
        // Handle promise to prevent unhandled rejection
        readLoop().catch((error) => {
          console.error('[Serial] Unhandled read loop error:', error)
          setCached(serialState, `${ctx.nodeId}:error`, (error as Error).message ?? 'Read loop error')
        })
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setCached(serialState, `${ctx.nodeId}:error`, errorMsg)
      setCached(serialState, `${ctx.nodeId}:connected`, false)
    }
  }

  // Handle disconnect
  if (!connect && connection) {
    try {
      if (connection.reader) {
        await connection.reader.cancel()
        connection.reader = null
      }
      await connection.port.close()
    } catch (e) {
      console.error('[Serial] Close error:', e)
    }
    serialPorts.delete(serialKey)
    setCached(serialState, `${ctx.nodeId}:connected`, false)
  }

  // Send data
  if (connection && sendData && connection.port.writable) {
    try {
      const writer = connection.port.writable.getWriter()
      const data = new TextEncoder().encode(sendData)
      await writer.write(data)
      writer.releaseLock()
    } catch (error) {
      console.error('[Serial] Write error:', error)
    }
  }

  outputs.set('data', getCached(`${ctx.nodeId}:data`, ''))
  outputs.set('line', getCached(`${ctx.nodeId}:line`, ''))
  outputs.set('value', getCached(`${ctx.nodeId}:value`, 0))
  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))
  outputs.set('error', getCached(`${ctx.nodeId}:error`, null))

  return outputs
}

// ============================================================================
// BLE Node (Web Bluetooth API)
// ============================================================================

const bleDevices = new Map<string, { device: BluetoothDevice; server: BluetoothRemoteGATTServer | null }>()
const bleState = new Map<string, unknown>()
// Store BLE characteristic handlers for cleanup
const bleCharacteristicHandlers = new Map<string, { characteristic: BluetoothRemoteGATTCharacteristic; handler: (event: Event) => void }>()

// Enhanced BLE state for new nodes
const bleAdapters = new Map<string, BleAdapter>()
const bleScannerState = new Map<string, {
  device: BluetoothDevice | null
  scanning: boolean
  status: string
  error: string | null
}>()
const bleDeviceState = new Map<string, {
  adapter: BleAdapter | null
  services: BleServiceInfo[]
  connected: boolean
  status: string
  error: string | null
}>()
const bleCharacteristicState = new Map<string, {
  subscribed: boolean
  value: unknown
  rawValue: Uint8Array | null
  text: string
  formatted: string
  notified: boolean
  properties: Record<string, boolean> | null
  error: string | null
}>()

export const bleExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const serviceUUID = (ctx.controls.get('serviceUUID') as string) ?? ''
  const characteristicUUID = (ctx.controls.get('characteristicUUID') as string) ?? ''
  const connect = (ctx.controls.get('connect') as boolean) ?? false
  const sendData = ctx.inputs.get('send') as string | Uint8Array | undefined

  const outputs = new Map<string, unknown>()

  // Check if Web Bluetooth API is available
  if (!('bluetooth' in navigator)) {
    outputs.set('value', null)
    outputs.set('connected', false)
    outputs.set('error', 'Web Bluetooth API not supported')
    return outputs
  }

  const bleKey = `${ctx.nodeId}:ble`
  let connection = bleDevices.get(bleKey)

  // Handle connection
  if (connect && !connection && serviceUUID) {
    try {
      // Request device (this will show a browser dialog)
      const device = await (navigator as Navigator & {
        bluetooth: {
          requestDevice: (options: { filters: { services: string[] }[] }) => Promise<BluetoothDevice>
        }
      }).bluetooth.requestDevice({
        filters: [{ services: [serviceUUID] }]
      })

      const server = await device.gatt?.connect()

      if (server) {
        connection = { device, server }
        bleDevices.set(bleKey, connection)
        setCached(bleState, `${ctx.nodeId}:connected`, true)
        setCached(bleState, `${ctx.nodeId}:deviceName`, device.name ?? 'Unknown')
        setCached(bleState, `${ctx.nodeId}:error`, null)

        // Setup notifications if characteristic UUID provided
        if (characteristicUUID) {
          try {
            const service = await server.getPrimaryService(serviceUUID)
            const characteristic = await service.getCharacteristic(characteristicUUID)

            // Enable notifications
            await characteristic.startNotifications()

            // Store handler reference for cleanup
            const handler = (event: Event) => {
              const value = (event.target as BluetoothRemoteGATTCharacteristic).value
              if (value) {
                const bytes = new Uint8Array(value.buffer)
                setCached(bleState, `${ctx.nodeId}:rawValue`, bytes)

                // Try to interpret as number (first 4 bytes as float)
                if (bytes.length >= 4) {
                  const view = new DataView(bytes.buffer)
                  setCached(bleState, `${ctx.nodeId}:value`, view.getFloat32(0, true))
                } else if (bytes.length >= 1) {
                  setCached(bleState, `${ctx.nodeId}:value`, bytes[0])
                }

                // Also try as string
                const text = new TextDecoder().decode(bytes)
                setCached(bleState, `${ctx.nodeId}:text`, text)
              }
            }
            characteristic.addEventListener('characteristicvaluechanged', handler)
            bleCharacteristicHandlers.set(ctx.nodeId, { characteristic, handler })
          } catch (error) {
            console.error('[BLE] Characteristic setup error:', error)
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setCached(bleState, `${ctx.nodeId}:error`, errorMsg)
      setCached(bleState, `${ctx.nodeId}:connected`, false)
    }
  }

  // Handle disconnect
  if (!connect && connection) {
    try {
      connection.server?.disconnect()
    } catch (e) {
      console.error('[BLE] Disconnect error:', e)
    }
    bleDevices.delete(bleKey)
    setCached(bleState, `${ctx.nodeId}:connected`, false)
  }

  // Send data
  if (connection && connection.server && sendData && characteristicUUID) {
    try {
      const service = await connection.server.getPrimaryService(serviceUUID)
      const characteristic = await service.getCharacteristic(characteristicUUID)

      const data = typeof sendData === 'string'
        ? new TextEncoder().encode(sendData)
        : sendData

      // Convert Uint8Array to ArrayBuffer for writeValue
      const buffer = data instanceof Uint8Array ? data.buffer : data
      await characteristic.writeValue(buffer as ArrayBuffer)
    } catch (error) {
      console.error('[BLE] Write error:', error)
    }
  }

  outputs.set('value', getCached(`${ctx.nodeId}:value`, null))
  outputs.set('text', getCached(`${ctx.nodeId}:text`, ''))
  outputs.set('rawValue', getCached(`${ctx.nodeId}:rawValue`, null))
  outputs.set('deviceName', getCached(`${ctx.nodeId}:deviceName`, ''))
  outputs.set('connected', getCached(`${ctx.nodeId}:connected`, false))
  outputs.set('error', getCached(`${ctx.nodeId}:error`, null))

  return outputs
}

// ============================================================================
// BLE Scanner Node (Enhanced)
// ============================================================================

export const bleScannerExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const trigger = ctx.inputs.get('trigger')
  const serviceFilter = (ctx.controls.get('serviceFilter') as string) ?? 'any'
  const customServiceUUID = (ctx.controls.get('customServiceUUID') as string) ?? ''
  const nameFilter = (ctx.controls.get('nameFilter') as string) ?? ''

  const outputs = new Map<string, unknown>()

  // Initialize state
  let state = bleScannerState.get(ctx.nodeId)
  if (!state) {
    state = { device: null, scanning: false, status: 'idle', error: null }
    bleScannerState.set(ctx.nodeId, state)
  }

  // Check if Web Bluetooth API is available
  if (!('bluetooth' in navigator)) {
    outputs.set('device', null)
    outputs.set('deviceName', '')
    outputs.set('deviceId', '')
    outputs.set('scanning', false)
    outputs.set('status', 'unsupported')
    outputs.set('error', 'Web Bluetooth API not supported')
    return outputs
  }

  // Handle scan trigger
  const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)

  if (hasTrigger && !state.scanning) {
    state.scanning = true
    state.status = 'scanning'
    state.error = null

    try {
      // Build filters
      const filters: BluetoothLEScanFilter[] = []
      const optionalServices: BluetoothServiceUUID[] = []

      // Add service filter
      if (serviceFilter !== 'any' && !serviceFilter.startsWith('---')) {
        const uuid = serviceFilter === 'custom' ? customServiceUUID : serviceFilter
        if (uuid) {
          filters.push({ services: [uuid] })
          optionalServices.push(uuid)
        }
      }

      // Add name filter
      if (nameFilter) {
        if (filters.length > 0) {
          filters[0] = { ...filters[0], namePrefix: nameFilter }
        } else {
          filters.push({ namePrefix: nameFilter })
        }
      }

      // Request device
      const device = await BleAdapter.scanDevices({
        filters: filters.length > 0 ? filters : undefined,
        optionalServices,
        acceptAllDevices: filters.length === 0,
      })

      if (device) {
        state.device = device
        state.status = 'selected'
      } else {
        state.status = 'cancelled'
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Scan failed'
      state.status = 'error'
    } finally {
      state.scanning = false
    }
  }

  outputs.set('device', state.device)
  outputs.set('deviceName', state.device?.name || '')
  outputs.set('deviceId', state.device?.id || '')
  outputs.set('scanning', state.scanning)
  outputs.set('status', state.status)
  outputs.set('error', state.error)

  return outputs
}

// ============================================================================
// BLE Device Node (Enhanced)
// ============================================================================

export const bleDeviceExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const deviceInput = ctx.inputs.get('device') as BluetoothDevice | null
  const connectTrigger = ctx.inputs.get('connect')
  const disconnectTrigger = ctx.inputs.get('disconnect')
  const autoConnect = (ctx.controls.get('autoConnect') as boolean) ?? false
  const autoReconnect = (ctx.controls.get('autoReconnect') as boolean) ?? true
  const serviceUUID = (ctx.controls.get('serviceUUID') as string) ?? ''

  const outputs = new Map<string, unknown>()

  // Initialize state
  let state = bleDeviceState.get(ctx.nodeId)
  if (!state) {
    state = { adapter: null, services: [], connected: false, status: 'idle', error: null }
    bleDeviceState.set(ctx.nodeId, state)
  }

  // Check if we have a device
  if (!deviceInput) {
    outputs.set('services', [])
    outputs.set('characteristics', [])
    outputs.set('deviceName', '')
    outputs.set('deviceId', '')
    outputs.set('connected', false)
    outputs.set('status', 'no device')
    outputs.set('error', null)
    return outputs
  }

  // Create or update adapter if device changed
  const existingAdapter = bleAdapters.get(ctx.nodeId)
  if (!existingAdapter || existingAdapter.getDeviceInfo()?.id !== deviceInput.id) {
    // Dispose old adapter
    if (existingAdapter) {
      existingAdapter.dispose()
    }

    // Create new adapter
    const adapter = new BleAdapter(ctx.nodeId, {
      id: ctx.nodeId,
      name: deviceInput.name || 'BLE Device',
      protocol: 'ble',
      serviceUUID: serviceUUID,
      autoConnect: false,
      autoReconnect: autoReconnect,
      reconnectDelay: 1000,
      maxReconnectAttempts: 5,
    })

    bleAdapters.set(ctx.nodeId, adapter)
    state.adapter = adapter

    // Set up status listener
    adapter.onStatusChange((statusInfo) => {
      const nodeState = bleDeviceState.get(ctx.nodeId)
      if (nodeState) {
        nodeState.connected = statusInfo.status === 'connected'
        nodeState.status = statusInfo.status
        nodeState.error = statusInfo.error || null
      }
    })
  }

  const adapter = state.adapter

  // Handle connect trigger
  const hasConnectTrigger = connectTrigger === true || connectTrigger === 1 || (typeof connectTrigger === 'number' && connectTrigger > 0)
  const hasDisconnectTrigger = disconnectTrigger === true || disconnectTrigger === 1 || (typeof disconnectTrigger === 'number' && disconnectTrigger > 0)

  if (adapter) {
    if (hasDisconnectTrigger && state.connected) {
      try {
        await adapter.disconnect()
        state.connected = false
        state.status = 'disconnected'
        state.services = []
      } catch (error) {
        state.error = error instanceof Error ? error.message : 'Disconnect failed'
      }
    } else if ((hasConnectTrigger || (autoConnect && !state.connected)) && !state.connected) {
      state.status = 'connecting'

      try {
        await adapter.connect()
        state.connected = true
        state.status = 'connected'

        // Enumerate services
        state.services = await adapter.getServices()
      } catch (error) {
        state.error = error instanceof Error ? error.message : 'Connection failed'
        state.status = 'error'
      }
    }
  }

  // Build characteristics list from services
  const characteristics: Array<{ uuid: string; name: string; serviceUuid: string; serviceName: string; properties: Record<string, boolean> }> = []
  for (const service of state.services) {
    for (const char of service.characteristics) {
      characteristics.push({
        uuid: char.uuid,
        name: getCharacteristicName(char.uuid),
        serviceUuid: service.uuid,
        serviceName: getServiceName(service.uuid),
        properties: char.properties as unknown as Record<string, boolean>,
      })
    }
  }

  outputs.set('services', state.services)
  outputs.set('characteristics', characteristics)
  outputs.set('deviceName', deviceInput.name || '')
  outputs.set('deviceId', deviceInput.id)
  outputs.set('connected', state.connected)
  outputs.set('status', state.status)
  outputs.set('error', state.error)

  return outputs
}

// ============================================================================
// BLE Characteristic Node (Enhanced)
// ============================================================================

export const bleCharacteristicExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const deviceInput = ctx.inputs.get('device') as BluetoothDevice | null
  const readTrigger = ctx.inputs.get('read')
  const writeData = ctx.inputs.get('write')
  const writeTrigger = ctx.inputs.get('writeTrigger')
  const serviceUUID = (ctx.controls.get('serviceUUID') as string) ?? ''
  const characteristicUUID = (ctx.controls.get('characteristicUUID') as string) ?? ''
  const dataFormat = (ctx.controls.get('dataFormat') as string) ?? 'auto'
  const enableNotifications = (ctx.controls.get('enableNotifications') as boolean) ?? true
  const continuous = (ctx.controls.get('continuous') as boolean) ?? false

  const outputs = new Map<string, unknown>()

  // Initialize state
  let state = bleCharacteristicState.get(ctx.nodeId)
  if (!state) {
    state = {
      subscribed: false,
      value: null,
      rawValue: null,
      text: '',
      formatted: '',
      notified: false,
      properties: null,
      error: null,
    }
    bleCharacteristicState.set(ctx.nodeId, state)
  }

  // Reset notified flag each frame
  state.notified = false

  // Check prerequisites
  if (!deviceInput || !serviceUUID || !characteristicUUID) {
    outputs.set('value', state.value)
    outputs.set('rawValue', state.rawValue)
    outputs.set('text', state.text)
    outputs.set('formatted', state.formatted)
    outputs.set('notified', false)
    outputs.set('properties', state.properties)
    outputs.set('error', !deviceInput ? 'No device connected' : 'Service/Characteristic UUID required')
    return outputs
  }

  // Get or create adapter for this device
  const adapterKey = `char_${ctx.nodeId}`
  let adapter = bleAdapters.get(adapterKey)

  if (!adapter || adapter.getDeviceInfo()?.id !== deviceInput.id) {
    // Dispose old adapter
    if (adapter) {
      adapter.dispose()
    }

    // Create adapter for this characteristic node
    adapter = new BleAdapter(adapterKey, {
      id: adapterKey,
      name: `Characteristic ${characteristicUUID}`,
      protocol: 'ble',
      serviceUUID: serviceUUID,
      characteristicUUIDs: [characteristicUUID],
      autoConnect: false,
      autoReconnect: true,
      reconnectDelay: 1000,
      maxReconnectAttempts: 5,
    })

    bleAdapters.set(adapterKey, adapter)

    // Connect if device is already connected
    if (deviceInput.gatt?.connected) {
      try {
        await adapter.connect()
        await adapter.discoverServices()
      } catch (error) {
        state.error = error instanceof Error ? error.message : 'Connection failed'
      }
    }
  }

  // Ensure connected
  if (!adapter.isConnected()) {
    try {
      await adapter.connect()
      await adapter.discoverServices()
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Connection failed'
      outputs.set('value', state.value)
      outputs.set('rawValue', state.rawValue)
      outputs.set('text', state.text)
      outputs.set('formatted', state.formatted)
      outputs.set('notified', false)
      outputs.set('properties', state.properties)
      outputs.set('error', state.error)
      return outputs
    }
  }

  // Determine actual data format
  const format: BleDataFormat = dataFormat === 'auto' ? 'raw' : dataFormat as BleDataFormat

  // Subscribe to notifications if enabled and not yet subscribed
  if (enableNotifications && !state.subscribed) {
    try {
      await adapter.subscribeToNotifications(characteristicUUID, (_value, raw) => {
        const charState = bleCharacteristicState.get(ctx.nodeId)
        if (charState) {
          // Use profile parser if available
          const parsed = parseCharacteristicValue(characteristicUUID, raw)

          charState.value = parsed.value
          charState.rawValue = new Uint8Array(raw.buffer)
          charState.text = typeof parsed.value === 'string' ? parsed.value : JSON.stringify(parsed.value)
          charState.formatted = parsed.formatted
          charState.notified = true
        }
      }, format)
      state.subscribed = true
    } catch (error) {
      // Notifications may not be supported
      console.warn('[BLE Characteristic] Could not subscribe to notifications:', error)
    }
  }

  // Handle read trigger
  const hasReadTrigger = readTrigger === true || readTrigger === 1 || (typeof readTrigger === 'number' && readTrigger > 0) || continuous

  if (hasReadTrigger) {
    try {
      const value = await adapter.readCharacteristic(characteristicUUID, format)

      // Parse with profile
      // Need to get raw DataView for parsing - we'll store last raw value
      state.value = value
      state.text = typeof value === 'string' ? value : JSON.stringify(value)
      state.formatted = state.text
      state.error = null
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Read failed'
    }
  }

  // Handle write trigger
  const hasWriteTrigger = writeTrigger === true || writeTrigger === 1 || (typeof writeTrigger === 'number' && writeTrigger > 0)

  if (hasWriteTrigger && writeData !== undefined) {
    try {
      await adapter.writeCharacteristic(characteristicUUID, writeData as ArrayBuffer | Uint8Array | number | string, format)
      state.error = null
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Write failed'
    }
  }

  outputs.set('value', state.value)
  outputs.set('rawValue', state.rawValue)
  outputs.set('text', state.text)
  outputs.set('formatted', state.formatted)
  outputs.set('notified', state.notified)
  outputs.set('properties', state.properties)
  outputs.set('error', state.error)

  return outputs
}

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

export const connectivityExecutors: Record<string, NodeExecutorFn> = {
  'http-request': httpRequestExecutor,
  'websocket': websocketExecutor,
  'midi-input': midiInputExecutor,
  'midi-output': midiOutputExecutor,
  'json-parse': jsonParseExecutor,
  'json-stringify': jsonStringifyExecutor,
  'mqtt': mqttExecutor,
  'osc': oscExecutor,
  'serial': serialExecutor,
  'ble': bleExecutor,
  'ble-scanner': bleScannerExecutor,
  'ble-device': bleDeviceExecutor,
  'ble-characteristic': bleCharacteristicExecutor,
}
