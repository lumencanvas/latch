/**
 * CLASP Protocol Executors
 *
 * Full-featured CLASP connectivity nodes for clasp-flow.
 * Implements connection management with named connections that can be shared
 * across multiple nodes, similar to Node-RED's config node pattern.
 *
 * Node Types:
 * - clasp-connection: Manages a named connection (can be shared)
 * - clasp-subscribe: Subscribes to address patterns
 * - clasp-set: Sets parameter values
 * - clasp-emit: Emits events
 * - clasp-get: Gets current parameter value
 * - clasp-stream: Sends high-rate stream data
 * - clasp-bundle: Sends atomic bundles
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'

// ============================================================================
// CLASP Protocol Constants
// ============================================================================

const PROTOCOL_VERSION = 2
const WS_SUBPROTOCOL = 'clasp.v2'
const MAGIC_BYTE = 0x53 // 'S'

/** Quality of Service levels */
enum QoS {
  Fire = 0,
  Confirm = 1,
  Commit = 2,
}

/** Signal types (reserved for future filtering support) */
// type SignalType = 'param' | 'event' | 'stream' | 'gesture' | 'timeline'

/** Value type */
type Value =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | Value[]
  | { [key: string]: Value }

// ============================================================================
// Simple MessagePack Implementation (subset needed for CLASP)
// ============================================================================

function msgpackEncode(value: unknown): Uint8Array {
  const parts: number[] = []

  function encode(v: unknown): void {
    if (v === null) {
      parts.push(0xc0)
    } else if (v === true) {
      parts.push(0xc3)
    } else if (v === false) {
      parts.push(0xc2)
    } else if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        if (v >= 0 && v <= 127) {
          parts.push(v)
        } else if (v >= -32 && v < 0) {
          parts.push(v & 0xff)
        } else if (v >= 0 && v <= 0xff) {
          parts.push(0xcc, v)
        } else if (v >= 0 && v <= 0xffff) {
          parts.push(0xcd, (v >> 8) & 0xff, v & 0xff)
        } else if (v >= 0 && v <= 0xffffffff) {
          parts.push(0xce, (v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff)
        } else if (v >= -128 && v <= 127) {
          parts.push(0xd0, v & 0xff)
        } else if (v >= -32768 && v <= 32767) {
          parts.push(0xd1, (v >> 8) & 0xff, v & 0xff)
        } else if (v >= -2147483648 && v <= 2147483647) {
          parts.push(0xd2, (v >> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff)
        } else {
          // Fall back to float64
          const buf = new ArrayBuffer(9)
          const view = new DataView(buf)
          view.setUint8(0, 0xcb)
          view.setFloat64(1, v, false)
          for (let i = 0; i < 9; i++) parts.push(view.getUint8(i))
        }
      } else {
        // Float64
        const buf = new ArrayBuffer(9)
        const view = new DataView(buf)
        view.setUint8(0, 0xcb)
        view.setFloat64(1, v, false)
        for (let i = 0; i < 9; i++) parts.push(view.getUint8(i))
      }
    } else if (typeof v === 'string') {
      const bytes = new TextEncoder().encode(v)
      if (bytes.length <= 31) {
        parts.push(0xa0 | bytes.length)
      } else if (bytes.length <= 0xff) {
        parts.push(0xd9, bytes.length)
      } else if (bytes.length <= 0xffff) {
        parts.push(0xda, (bytes.length >> 8) & 0xff, bytes.length & 0xff)
      } else {
        parts.push(0xdb, (bytes.length >> 24) & 0xff, (bytes.length >> 16) & 0xff, (bytes.length >> 8) & 0xff, bytes.length & 0xff)
      }
      for (const b of bytes) parts.push(b)
    } else if (Array.isArray(v)) {
      if (v.length <= 15) {
        parts.push(0x90 | v.length)
      } else if (v.length <= 0xffff) {
        parts.push(0xdc, (v.length >> 8) & 0xff, v.length & 0xff)
      } else {
        parts.push(0xdd, (v.length >> 24) & 0xff, (v.length >> 16) & 0xff, (v.length >> 8) & 0xff, v.length & 0xff)
      }
      for (const item of v) encode(item)
    } else if (v instanceof Uint8Array) {
      if (v.length <= 0xff) {
        parts.push(0xc4, v.length)
      } else if (v.length <= 0xffff) {
        parts.push(0xc5, (v.length >> 8) & 0xff, v.length & 0xff)
      } else {
        parts.push(0xc6, (v.length >> 24) & 0xff, (v.length >> 16) & 0xff, (v.length >> 8) & 0xff, v.length & 0xff)
      }
      for (const b of v) parts.push(b)
    } else if (typeof v === 'object') {
      const keys = Object.keys(v as object)
      if (keys.length <= 15) {
        parts.push(0x80 | keys.length)
      } else if (keys.length <= 0xffff) {
        parts.push(0xde, (keys.length >> 8) & 0xff, keys.length & 0xff)
      } else {
        parts.push(0xdf, (keys.length >> 24) & 0xff, (keys.length >> 16) & 0xff, (keys.length >> 8) & 0xff, keys.length & 0xff)
      }
      for (const key of keys) {
        encode(key)
        encode((v as Record<string, unknown>)[key])
      }
    }
  }

  encode(value)
  return new Uint8Array(parts)
}

function msgpackDecode(data: Uint8Array): unknown {
  let offset = 0

  function decode(): unknown {
    const byte = data[offset++]

    // Positive fixint
    if (byte <= 0x7f) return byte
    // Fixmap
    if ((byte & 0xf0) === 0x80) {
      const len = byte & 0x0f
      const obj: Record<string, unknown> = {}
      for (let i = 0; i < len; i++) {
        const key = decode() as string
        obj[key] = decode()
      }
      return obj
    }
    // Fixarray
    if ((byte & 0xf0) === 0x90) {
      const len = byte & 0x0f
      const arr: unknown[] = []
      for (let i = 0; i < len; i++) arr.push(decode())
      return arr
    }
    // Fixstr
    if ((byte & 0xe0) === 0xa0) {
      const len = byte & 0x1f
      const str = new TextDecoder().decode(data.slice(offset, offset + len))
      offset += len
      return str
    }
    // Negative fixint
    if ((byte & 0xe0) === 0xe0) return byte - 256

    switch (byte) {
      case 0xc0: return null
      case 0xc2: return false
      case 0xc3: return true
      case 0xc4: { // bin8
        const len = data[offset++]
        const bin = data.slice(offset, offset + len)
        offset += len
        return bin
      }
      case 0xc5: { // bin16
        const len = (data[offset++] << 8) | data[offset++]
        const bin = data.slice(offset, offset + len)
        offset += len
        return bin
      }
      case 0xc6: { // bin32
        const len = (data[offset++] << 24) | (data[offset++] << 16) | (data[offset++] << 8) | data[offset++]
        const bin = data.slice(offset, offset + len)
        offset += len
        return bin
      }
      case 0xca: { // float32
        const view = new DataView(data.buffer, data.byteOffset + offset, 4)
        offset += 4
        return view.getFloat32(0, false)
      }
      case 0xcb: { // float64
        const view = new DataView(data.buffer, data.byteOffset + offset, 8)
        offset += 8
        return view.getFloat64(0, false)
      }
      case 0xcc: return data[offset++] // uint8
      case 0xcd: { // uint16
        const v = (data[offset++] << 8) | data[offset++]
        return v
      }
      case 0xce: { // uint32
        const v = (data[offset++] << 24) | (data[offset++] << 16) | (data[offset++] << 8) | data[offset++]
        return v >>> 0
      }
      case 0xcf: { // uint64
        const hi = (data[offset++] << 24) | (data[offset++] << 16) | (data[offset++] << 8) | data[offset++]
        const lo = (data[offset++] << 24) | (data[offset++] << 16) | (data[offset++] << 8) | data[offset++]
        return hi * 0x100000000 + (lo >>> 0)
      }
      case 0xd0: { // int8
        const v = data[offset++]
        return v > 127 ? v - 256 : v
      }
      case 0xd1: { // int16
        const v = (data[offset++] << 8) | data[offset++]
        return v > 32767 ? v - 65536 : v
      }
      case 0xd2: { // int32
        const v = (data[offset++] << 24) | (data[offset++] << 16) | (data[offset++] << 8) | data[offset++]
        return v | 0
      }
      case 0xd9: { // str8
        const len = data[offset++]
        const str = new TextDecoder().decode(data.slice(offset, offset + len))
        offset += len
        return str
      }
      case 0xda: { // str16
        const len = (data[offset++] << 8) | data[offset++]
        const str = new TextDecoder().decode(data.slice(offset, offset + len))
        offset += len
        return str
      }
      case 0xdb: { // str32
        const len = (data[offset++] << 24) | (data[offset++] << 16) | (data[offset++] << 8) | data[offset++]
        const str = new TextDecoder().decode(data.slice(offset, offset + len))
        offset += len
        return str
      }
      case 0xdc: { // array16
        const len = (data[offset++] << 8) | data[offset++]
        const arr: unknown[] = []
        for (let i = 0; i < len; i++) arr.push(decode())
        return arr
      }
      case 0xdd: { // array32
        const len = (data[offset++] << 24) | (data[offset++] << 16) | (data[offset++] << 8) | data[offset++]
        const arr: unknown[] = []
        for (let i = 0; i < len; i++) arr.push(decode())
        return arr
      }
      case 0xde: { // map16
        const len = (data[offset++] << 8) | data[offset++]
        const obj: Record<string, unknown> = {}
        for (let i = 0; i < len; i++) {
          const key = decode() as string
          obj[key] = decode()
        }
        return obj
      }
      case 0xdf: { // map32
        const len = (data[offset++] << 24) | (data[offset++] << 16) | (data[offset++] << 8) | data[offset++]
        const obj: Record<string, unknown> = {}
        for (let i = 0; i < len; i++) {
          const key = decode() as string
          obj[key] = decode()
        }
        return obj
      }
      default:
        throw new Error(`Unknown msgpack type: 0x${byte.toString(16)}`)
    }
  }

  return decode()
}

// ============================================================================
// Frame Encoding/Decoding
// ============================================================================

function encodeFlags(qos: QoS, hasTimestamp: boolean): number {
  let byte = 0
  byte |= (qos & 0x03) << 6
  if (hasTimestamp) byte |= 0x20
  return byte
}

function decodeFlags(byte: number): { qos: QoS; hasTimestamp: boolean } {
  return {
    qos: ((byte >> 6) & 0x03) as QoS,
    hasTimestamp: (byte & 0x20) !== 0,
  }
}

function encodeFrame(message: unknown, qos: QoS = QoS.Fire): Uint8Array {
  const payload = msgpackEncode(message)
  const frame = new Uint8Array(4 + payload.length)
  frame[0] = MAGIC_BYTE
  frame[1] = encodeFlags(qos, false)
  frame[2] = (payload.length >> 8) & 0xff
  frame[3] = payload.length & 0xff
  frame.set(payload, 4)
  return frame
}

function decodeFrame(data: Uint8Array): unknown {
  if (data.length < 4) throw new Error('Frame too small')
  if (data[0] !== MAGIC_BYTE) throw new Error('Invalid magic byte')

  const flags = decodeFlags(data[1])
  const payloadLength = (data[2] << 8) | data[3]
  const headerSize = flags.hasTimestamp ? 12 : 4

  if (data.length < headerSize + payloadLength) throw new Error('Frame incomplete')

  const payload = data.slice(headerSize, headerSize + payloadLength)
  return msgpackDecode(payload)
}

// ============================================================================
// CLASP Client Implementation
// ============================================================================

interface ClaspConnection {
  ws: WebSocket | null
  sessionId: string | null
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error: string | null
  serverTimeOffset: number
  params: Map<string, Value>
  subscriptions: Map<number, { pattern: string; nodeId: string }>
  nextSubId: number
  config: {
    url: string
    name: string
    token: string
    autoConnect: boolean
    autoReconnect: boolean
    reconnectDelay: number
  }
  subscribers: Set<string> // Node IDs using this connection
  reconnectTimer: ReturnType<typeof setTimeout> | null
}

// Global connection manager
const claspConnections = new Map<string, ClaspConnection>()

// State cache for subscribed values
const claspState = new Map<string, unknown>()

/**
 * Pattern matching for CLASP addresses
 */
function matchPattern(pattern: string, address: string): boolean {
  const regex = pattern
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]+')
    .replace(/§§/g, '.*')
  return new RegExp(`^${regex}$`).test(address)
}

/**
 * Get or create a connection
 */
function getConnection(connectionId: string): ClaspConnection | undefined {
  return claspConnections.get(connectionId)
}

/**
 * Create a new connection configuration
 */
function createConnection(connectionId: string, config: ClaspConnection['config']): ClaspConnection {
  const connection: ClaspConnection = {
    ws: null,
    sessionId: null,
    status: 'disconnected',
    error: null,
    serverTimeOffset: 0,
    params: new Map(),
    subscriptions: new Map(),
    nextSubId: 1,
    config,
    subscribers: new Set(),
    reconnectTimer: null,
  }
  claspConnections.set(connectionId, connection)
  return connection
}

/**
 * Connect to CLASP server
 */
async function connect(connection: ClaspConnection): Promise<void> {
  if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
    return // Already connected
  }

  connection.status = 'connecting'
  connection.error = null

  return new Promise((resolve, reject) => {
    try {
      const ws = new WebSocket(connection.config.url, WS_SUBPROTOCOL)
      ws.binaryType = 'arraybuffer'
      connection.ws = ws

      ws.onopen = () => {
        // Send HELLO
        const hello = {
          type: 'HELLO',
          version: PROTOCOL_VERSION,
          name: connection.config.name,
          features: ['param', 'event', 'stream'],
          token: connection.config.token || undefined,
        }
        ws.send(encodeFrame(hello))
      }

      ws.onmessage = (event) => {
        try {
          const message = decodeFrame(new Uint8Array(event.data as ArrayBuffer)) as Record<string, unknown>
          handleMessage(connection, message)

          if (message.type === 'WELCOME') {
            connection.status = 'connected'
            connection.sessionId = message.session as string
            connection.serverTimeOffset = (message.time as number) - Date.now() * 1000
            console.log(`[CLASP] Connected to ${connection.config.url}, session: ${connection.sessionId}`)
            resolve()
          }
        } catch (e) {
          console.warn('[CLASP] Decode error:', e)
        }
      }

      ws.onerror = () => {
        connection.status = 'error'
        connection.error = 'Connection error'
        reject(new Error('WebSocket error'))
      }

      ws.onclose = () => {
        connection.status = 'disconnected'
        connection.ws = null
        console.log(`[CLASP] Disconnected from ${connection.config.url}`)

        // Auto-reconnect if enabled
        if (connection.config.autoReconnect && connection.subscribers.size > 0) {
          connection.reconnectTimer = setTimeout(() => {
            connect(connection).catch(() => {})
          }, connection.config.reconnectDelay)
        }
      }
    } catch (e) {
      connection.status = 'error'
      connection.error = e instanceof Error ? e.message : String(e)
      reject(e)
    }
  })
}

/**
 * Handle incoming CLASP messages
 */
function handleMessage(connection: ClaspConnection, message: Record<string, unknown>): void {
  switch (message.type) {
    case 'SET': {
      const address = message.address as string
      const value = message.value as Value
      connection.params.set(address, value)
      // Store in state cache for subscriber nodes
      notifySubscribers(connection, address, value, message)
      break
    }

    case 'SNAPSHOT': {
      const params = message.params as Array<{ address: string; value: Value; revision: number }>
      for (const param of params) {
        connection.params.set(param.address, param.value)
        notifySubscribers(connection, param.address, param.value, param)
      }
      break
    }

    case 'PUBLISH': {
      const address = message.address as string
      const value = (message.value ?? message.payload ?? null) as Value
      notifySubscribers(connection, address, value, message)
      break
    }

    case 'PING':
      send(connection, { type: 'PONG' })
      break

    case 'ERROR':
      console.error('[CLASP] Error:', message)
      break
  }
}

/**
 * Notify subscriber nodes of value changes
 */
function notifySubscribers(
  connection: ClaspConnection,
  address: string,
  value: Value,
  meta: Record<string, unknown>
): void {
  for (const [_subId, sub] of connection.subscriptions) {
    if (matchPattern(sub.pattern, address)) {
      // Store in state cache with node-specific key
      const stateKey = `${sub.nodeId}:${address}`
      claspState.set(stateKey, {
        value,
        address,
        type: meta.signal ?? 'param',
        revision: meta.revision ?? 0,
        timestamp: Date.now(),
      })
      // Mark that this node has new data
      claspState.set(`${sub.nodeId}:_hasUpdate`, true)
      claspState.set(`${sub.nodeId}:_lastAddress`, address)
      claspState.set(`${sub.nodeId}:_lastValue`, value)
      claspState.set(`${sub.nodeId}:_lastType`, meta.signal ?? 'param')
      claspState.set(`${sub.nodeId}:_lastRevision`, meta.revision ?? 0)
    }
  }
}

/**
 * Send a message
 */
function send(connection: ClaspConnection, message: unknown, qos: QoS = QoS.Fire): boolean {
  if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
    connection.ws.send(encodeFrame(message, qos))
    return true
  }
  return false
}

/**
 * Subscribe to a pattern
 */
function subscribe(
  connection: ClaspConnection,
  pattern: string,
  nodeId: string,
  options?: { maxRate?: number; epsilon?: number }
): number {
  const id = connection.nextSubId++
  connection.subscriptions.set(id, { pattern, nodeId })

  const msg = {
    type: 'SUBSCRIBE',
    id,
    pattern,
    options: options ?? undefined,
  }
  send(connection, msg, QoS.Confirm)

  return id
}

/**
 * Unsubscribe
 */
function unsubscribe(connection: ClaspConnection, subId: number): void {
  connection.subscriptions.delete(subId)
  send(connection, { type: 'UNSUBSCRIBE', id: subId })
}

/**
 * Set a parameter
 */
function setParam(connection: ClaspConnection, address: string, value: Value): boolean {
  return send(connection, { type: 'SET', address, value }, QoS.Confirm)
}

/**
 * Emit an event
 */
function emitEvent(connection: ClaspConnection, address: string, payload: Value): boolean {
  const timestamp = Date.now() * 1000 + connection.serverTimeOffset
  return send(connection, {
    type: 'PUBLISH',
    address,
    signal: 'event',
    payload,
    timestamp,
  }, QoS.Confirm)
}

/**
 * Send stream data
 */
function streamData(connection: ClaspConnection, address: string, value: Value): boolean {
  const timestamp = Date.now() * 1000 + connection.serverTimeOffset
  return send(connection, {
    type: 'PUBLISH',
    address,
    signal: 'stream',
    value,
    timestamp,
  }, QoS.Fire)
}

/**
 * Send bundle
 */
function sendBundle(
  connection: ClaspConnection,
  messages: Array<{ set?: [string, Value]; emit?: [string, Value] }>,
  scheduledTime?: number
): boolean {
  const formatted = messages.map((m) => {
    if (m.set) {
      return { type: 'SET', address: m.set[0], value: m.set[1] }
    }
    if (m.emit) {
      return { type: 'PUBLISH', address: m.emit[0], signal: 'event', payload: m.emit[1] }
    }
    throw new Error('Invalid bundle message')
  })

  return send(connection, {
    type: 'BUNDLE',
    timestamp: scheduledTime,
    messages: formatted,
  }, QoS.Commit)
}

/**
 * Disconnect
 */
function disconnect(connection: ClaspConnection): void {
  if (connection.reconnectTimer) {
    clearTimeout(connection.reconnectTimer)
    connection.reconnectTimer = null
  }
  connection.config.autoReconnect = false
  connection.ws?.close()
  connection.ws = null
  connection.status = 'disconnected'
}

// ============================================================================
// CLASP Connection Node Executor
// ============================================================================

export const claspConnectionExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.controls.get('connectionId') as string) ?? 'default'
  const url = (ctx.inputs.get('url') as string) ?? (ctx.controls.get('url') as string) ?? 'ws://localhost:7330'
  const name = (ctx.controls.get('name') as string) ?? 'clasp-flow'
  const token = (ctx.controls.get('token') as string) ?? ''
  const autoConnect = (ctx.controls.get('autoConnect') as boolean) ?? true
  const autoReconnect = (ctx.controls.get('autoReconnect') as boolean) ?? true
  const reconnectDelay = (ctx.controls.get('reconnectDelay') as number) ?? 5000

  const connectTrigger = ctx.inputs.get('connect') as boolean
  const disconnectTrigger = ctx.inputs.get('disconnect') as boolean

  const outputs = new Map<string, unknown>()

  // Get or create connection
  let connection = getConnection(connectionId)

  if (!connection) {
    connection = createConnection(connectionId, {
      url,
      name,
      token,
      autoConnect,
      autoReconnect,
      reconnectDelay,
    })
  } else {
    // Update config if changed
    connection.config = { url, name, token, autoConnect, autoReconnect, reconnectDelay }
  }

  // Track this node as a subscriber
  connection.subscribers.add(ctx.nodeId)

  // Handle connect trigger
  if (connectTrigger || (autoConnect && connection.status === 'disconnected' && !connection.reconnectTimer)) {
    try {
      await connect(connection)
    } catch (e) {
      connection.error = e instanceof Error ? e.message : String(e)
    }
  }

  // Handle disconnect trigger
  if (disconnectTrigger) {
    disconnect(connection)
  }

  outputs.set('connected', connection.status === 'connected')
  outputs.set('status', connection.status)
  outputs.set('error', connection.error)
  outputs.set('session', connection.sessionId)
  outputs.set('connectionId', connectionId)

  return outputs
}

// ============================================================================
// CLASP Subscribe Node Executor
// ============================================================================

// Track active subscriptions per node
const nodeSubscriptions = new Map<string, { connectionId: string; subId: number; pattern: string }>()

export const claspSubscribeExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? 'default'
  const pattern = (ctx.inputs.get('pattern') as string) ?? (ctx.controls.get('pattern') as string) ?? '/**'
  // TODO: Implement signal type filtering
  // const signalTypes = (ctx.controls.get('types') as string) ?? 'all'
  const maxRate = (ctx.controls.get('maxRate') as number) ?? 0
  const epsilon = (ctx.controls.get('epsilon') as number) ?? 0

  const outputs = new Map<string, unknown>()

  const connection = getConnection(connectionId)

  if (!connection || connection.status !== 'connected') {
    outputs.set('value', null)
    outputs.set('address', null)
    outputs.set('type', null)
    outputs.set('revision', null)
    outputs.set('subscribed', false)
    return outputs
  }

  // Check if we need to update subscription
  const existingSub = nodeSubscriptions.get(ctx.nodeId)
  if (!existingSub || existingSub.connectionId !== connectionId || existingSub.pattern !== pattern) {
    // Unsubscribe from old
    if (existingSub) {
      const oldConn = getConnection(existingSub.connectionId)
      if (oldConn) {
        unsubscribe(oldConn, existingSub.subId)
      }
    }

    // Subscribe to new
    const options = maxRate > 0 || epsilon > 0 ? { maxRate, epsilon } : undefined
    const subId = subscribe(connection, pattern, ctx.nodeId, options)
    nodeSubscriptions.set(ctx.nodeId, { connectionId, subId, pattern })
  }

  // Get latest value from state cache
  const hasUpdate = claspState.get(`${ctx.nodeId}:_hasUpdate`) as boolean
  const lastValue = claspState.get(`${ctx.nodeId}:_lastValue`)
  const lastAddress = claspState.get(`${ctx.nodeId}:_lastAddress`) as string | undefined
  const lastType = claspState.get(`${ctx.nodeId}:_lastType`) as string | undefined
  const lastRevision = claspState.get(`${ctx.nodeId}:_lastRevision`) as number | undefined

  // Clear update flag
  claspState.set(`${ctx.nodeId}:_hasUpdate`, false)

  outputs.set('value', lastValue ?? null)
  outputs.set('address', lastAddress ?? null)
  outputs.set('type', lastType ?? null)
  outputs.set('revision', lastRevision ?? null)
  outputs.set('subscribed', true)
  outputs.set('updated', hasUpdate ?? false)

  return outputs
}

// ============================================================================
// CLASP Set Node Executor
// ============================================================================

export const claspSetExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? 'default'
  const address = (ctx.inputs.get('address') as string) ?? (ctx.controls.get('address') as string) ?? '/param'
  const value = ctx.inputs.get('value')
  const trigger = ctx.inputs.get('trigger') as boolean

  const outputs = new Map<string, unknown>()

  const connection = getConnection(connectionId)

  if (!connection || connection.status !== 'connected') {
    outputs.set('sent', false)
    outputs.set('error', 'Not connected')
    return outputs
  }

  // Only send when triggered (or when value changes if no trigger connected)
  if (trigger && value !== undefined) {
    const sent = setParam(connection, address, value as Value)
    outputs.set('sent', sent)
    outputs.set('error', sent ? null : 'Failed to send')
  } else {
    outputs.set('sent', false)
    outputs.set('error', null)
  }

  return outputs
}

// ============================================================================
// CLASP Emit Node Executor
// ============================================================================

export const claspEmitExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? 'default'
  const address = (ctx.inputs.get('address') as string) ?? (ctx.controls.get('address') as string) ?? '/event'
  const payload = ctx.inputs.get('payload')
  const trigger = ctx.inputs.get('trigger') as boolean

  const outputs = new Map<string, unknown>()

  const connection = getConnection(connectionId)

  if (!connection || connection.status !== 'connected') {
    outputs.set('sent', false)
    outputs.set('error', 'Not connected')
    return outputs
  }

  // Only send when triggered
  if (trigger) {
    const sent = emitEvent(connection, address, (payload ?? null) as Value)
    outputs.set('sent', sent)
    outputs.set('error', sent ? null : 'Failed to send')
  } else {
    outputs.set('sent', false)
    outputs.set('error', null)
  }

  return outputs
}

// ============================================================================
// CLASP Get Node Executor
// ============================================================================

// Cache for pending get requests (reserved for future async get implementation)
// const pendingGets = new Map<string, { resolve: (v: Value) => void; timeout: ReturnType<typeof setTimeout> }>()

export const claspGetExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? 'default'
  const address = (ctx.inputs.get('address') as string) ?? (ctx.controls.get('address') as string) ?? '/param'
  const trigger = ctx.inputs.get('trigger') as boolean

  const outputs = new Map<string, unknown>()

  const connection = getConnection(connectionId)

  if (!connection || connection.status !== 'connected') {
    outputs.set('value', null)
    outputs.set('error', 'Not connected')
    return outputs
  }

  // Check cache first
  const cachedValue = connection.params.get(address)
  if (cachedValue !== undefined) {
    outputs.set('value', cachedValue)
    outputs.set('error', null)
    return outputs
  }

  // Request from server when triggered
  if (trigger) {
    send(connection, { type: 'GET', address })
  }

  outputs.set('value', null)
  outputs.set('error', null)

  return outputs
}

// ============================================================================
// CLASP Stream Node Executor
// ============================================================================

export const claspStreamExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? 'default'
  const address = (ctx.inputs.get('address') as string) ?? (ctx.controls.get('address') as string) ?? '/stream'
  const value = ctx.inputs.get('value')
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true

  const outputs = new Map<string, unknown>()

  const connection = getConnection(connectionId)

  if (!connection || connection.status !== 'connected' || !enabled) {
    outputs.set('sent', false)
    return outputs
  }

  // Send continuously while enabled and value is provided
  if (value !== undefined) {
    const sent = streamData(connection, address, value as Value)
    outputs.set('sent', sent)
  } else {
    outputs.set('sent', false)
  }

  return outputs
}

// ============================================================================
// CLASP Bundle Node Executor
// ============================================================================

export const claspBundleExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? 'default'
  const messages = ctx.inputs.get('messages') as Array<{ set?: [string, Value]; emit?: [string, Value] }> | undefined
  const trigger = ctx.inputs.get('trigger') as boolean
  const scheduledTime = ctx.inputs.get('at') as number | undefined

  const outputs = new Map<string, unknown>()

  const connection = getConnection(connectionId)

  if (!connection || connection.status !== 'connected') {
    outputs.set('sent', false)
    outputs.set('error', 'Not connected')
    return outputs
  }

  // Only send when triggered
  if (trigger && messages && messages.length > 0) {
    const sent = sendBundle(connection, messages, scheduledTime)
    outputs.set('sent', sent)
    outputs.set('error', sent ? null : 'Failed to send')
  } else {
    outputs.set('sent', false)
    outputs.set('error', null)
  }

  return outputs
}

// ============================================================================
// Cleanup and Disposal
// ============================================================================

/**
 * Dispose a CLASP node and clean up resources
 */
export function disposeClaspNode(nodeId: string): void {
  // Clean up subscriptions
  const sub = nodeSubscriptions.get(nodeId)
  if (sub) {
    const connection = getConnection(sub.connectionId)
    if (connection) {
      unsubscribe(connection, sub.subId)
      connection.subscribers.delete(nodeId)

      // If no more subscribers, disconnect
      if (connection.subscribers.size === 0) {
        disconnect(connection)
        claspConnections.delete(sub.connectionId)
      }
    }
    nodeSubscriptions.delete(nodeId)
  }

  // Clean up state cache entries for this node
  const keysToDelete: string[] = []
  for (const key of claspState.keys()) {
    if (key.startsWith(`${nodeId}:`)) {
      keysToDelete.push(key)
    }
  }
  for (const key of keysToDelete) {
    claspState.delete(key)
  }
}

/**
 * Dispose all CLASP connections
 */
export function disposeAllClaspConnections(): void {
  for (const [_id, connection] of claspConnections) {
    disconnect(connection)
  }
  claspConnections.clear()
  nodeSubscriptions.clear()
  claspState.clear()
}

/**
 * Get connection status for debugging
 */
export function getClaspConnectionStatus(): Map<string, { status: string; session: string | null; subscribers: number }> {
  const status = new Map<string, { status: string; session: string | null; subscribers: number }>()
  for (const [id, connection] of claspConnections) {
    status.set(id, {
      status: connection.status,
      session: connection.sessionId,
      subscribers: connection.subscribers.size,
    })
  }
  return status
}

// ============================================================================
// Export all executors
// ============================================================================

export const claspExecutors: Record<string, NodeExecutorFn> = {
  'clasp-connection': claspConnectionExecutor,
  'clasp-subscribe': claspSubscribeExecutor,
  'clasp-set': claspSetExecutor,
  'clasp-emit': claspEmitExecutor,
  'clasp-get': claspGetExecutor,
  'clasp-stream': claspStreamExecutor,
  'clasp-bundle': claspBundleExecutor,
}
