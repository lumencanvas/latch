/**
 * Connectivity Node Executors
 *
 * These executors handle external communication protocols:
 * - HTTP/REST requests
 * - WebSocket connections
 * - MIDI (Web MIDI API)
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'

// Cache for WebSocket connections and state
const wsConnections = new Map<string, WebSocket>()
const wsState = new Map<string, unknown>()

// Cache for HTTP request state
const httpCache = new Map<string, unknown>()

// MIDI state
const midiInputs = new Map<string, MIDIInput>()
const midiOutputs = new Map<string, MIDIOutput>()
const midiState = new Map<string, unknown>()

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
        console.log(`[WebSocket] Connected to ${url}`)
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
        console.log(`[WebSocket] Disconnected from ${url}`)
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
        console.log(`[MIDI] Connected to ${input.name}`)
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
        console.log(`[MIDI] Output connected to ${output.name}`)
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

    // Schedule Note Off after 100ms
    setTimeout(() => {
      output.send([noteOffStatus, note, 0])
    }, 100)
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
        console.log(`[MQTT] Connected to ${brokerUrl}`)

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
          console.log('[MQTT] Connection acknowledged')
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
        console.log(`[OSC] Connected to ${host}:${port}`)
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
      console.log(`[Serial] Connected at ${baudRate} baud`)

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
        console.log(`[BLE] Connected to ${device.name}`)

        // Setup notifications if characteristic UUID provided
        if (characteristicUUID) {
          try {
            const service = await server.getPrimaryService(serviceUUID)
            const characteristic = await service.getCharacteristic(characteristicUUID)

            // Enable notifications
            await characteristic.startNotifications()
            characteristic.addEventListener('characteristicvaluechanged', (event) => {
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
            })
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
// Cleanup helpers
// ============================================================================

export function disposeConnectivityNode(nodeId: string): void {
  // Close WebSocket
  const wsKey = `${nodeId}:ws`
  const ws = wsConnections.get(wsKey)
  if (ws) {
    ws.close()
    wsConnections.delete(wsKey)
  }

  // Close MQTT connection
  const mqttKey = `${nodeId}:mqtt`
  const mqtt = mqttConnections.get(mqttKey)
  if (mqtt) {
    mqtt.client.close()
    mqttConnections.delete(mqttKey)
  }

  // Close OSC connection
  const oscKey = `${nodeId}:osc`
  const osc = oscConnections.get(oscKey)
  if (osc) {
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

  // Disconnect BLE
  const bleKey = `${nodeId}:ble`
  const ble = bleDevices.get(bleKey)
  if (ble) {
    ble.server?.disconnect()
    bleDevices.delete(bleKey)
  }

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
  // Close all WebSockets
  wsConnections.forEach(ws => ws.close())
  wsConnections.clear()

  // Close all MQTT connections
  mqttConnections.forEach(conn => conn.client.close())
  mqttConnections.clear()

  // Close all OSC connections
  oscConnections.forEach(ws => ws.close())
  oscConnections.clear()

  // Close all Serial connections
  serialPorts.forEach(conn => {
    conn.reader?.cancel()
    conn.port.close().catch(() => {})
  })
  serialPorts.clear()

  // Disconnect all BLE devices
  bleDevices.forEach(conn => conn.server?.disconnect())
  bleDevices.clear()

  // Clear all caches
  httpCache.clear()
  wsState.clear()
  midiState.clear()
  midiInputs.clear()
  midiOutputs.clear()
  mqttState.clear()
  oscState.clear()
  serialState.clear()
  bleState.clear()
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
}
