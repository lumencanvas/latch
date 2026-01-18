/**
 * CLASP Protocol Adapter
 *
 * Adapter for the CLASP (Creative Low-latency Application Streaming Protocol).
 * Provides connection management and message handling for CLASP servers.
 */

import { BaseAdapter } from './BaseAdapter'
import type {
  ClaspConnectionConfig,
  ClaspAdapter as IClaspAdapter,
  ConnectionTypeDefinition,
} from '../types'

// ============================================================================
// Protocol Constants
// ============================================================================

const PROTOCOL_VERSION = 2
const WS_SUBPROTOCOL = 'clasp.v2'
const MAGIC_BYTE = 0x53 // 'S'

/** Quality of Service levels */
export enum QoS {
  Fire = 0,
  Confirm = 1,
  Commit = 2,
}

/** Value type for CLASP messages */
export type ClaspValue =
  | null
  | boolean
  | number
  | string
  | Uint8Array
  | ClaspValue[]
  | { [key: string]: ClaspValue }

// ============================================================================
// MessagePack Implementation (subset for CLASP)
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
// Pattern Matching
// ============================================================================

function matchPattern(pattern: string, address: string): boolean {
  const regex = pattern
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]+')
    .replace(/§§/g, '.*')
  return new RegExp(`^${regex}$`).test(address)
}

// ============================================================================
// CLASP Adapter Implementation
// ============================================================================

interface Subscription {
  id: number
  pattern: string
  callback?: (address: string, value: ClaspValue, meta: Record<string, unknown>) => void
}

export class ClaspAdapterImpl extends BaseAdapter implements IClaspAdapter {
  protocol = 'clasp' as const

  private ws: WebSocket | null = null
  private sessionId: string | null = null
  private serverTimeOffset = 0
  private params = new Map<string, ClaspValue>()
  private subscriptions = new Map<number, Subscription>()
  private nextSubId = 1
  private claspConfig: ClaspConnectionConfig

  constructor(config: ClaspConnectionConfig) {
    super(config.id, 'clasp', config)
    this.claspConfig = config
  }

  // =========================================================================
  // Connection Lifecycle
  // =========================================================================

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    this.setStatus('connecting')

    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.claspConfig.url, WS_SUBPROTOCOL)
        ws.binaryType = 'arraybuffer'
        this.ws = ws

        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error('Connection timeout'))
        }, 10000)

        ws.onopen = () => {
          // Send HELLO
          const hello = {
            type: 'HELLO',
            version: PROTOCOL_VERSION,
            name: this.config.name,
            features: ['param', 'event', 'stream'],
            token: this.claspConfig.token || undefined,
          }
          ws.send(encodeFrame(hello))
        }

        ws.onmessage = (event) => {
          try {
            const message = decodeFrame(new Uint8Array(event.data as ArrayBuffer)) as Record<string, unknown>
            this.handleMessage(message)

            if (message.type === 'WELCOME') {
              clearTimeout(timeout)
              this.sessionId = message.session as string
              this.serverTimeOffset = (message.time as number) - Date.now() * 1000
              this.setStatus('connected')
              console.log(`[CLASP] Connected to ${this.claspConfig.url}, session: ${this.sessionId}`)
              resolve()
            }
          } catch (e) {
            console.warn('[CLASP] Decode error:', e)
          }
        }

        ws.onerror = () => {
          clearTimeout(timeout)
          const error = new Error('WebSocket error')
          this.setStatus('error', error.message)
          this.emitError(error)
          reject(error)
        }

        ws.onclose = () => {
          clearTimeout(timeout)
          this.ws = null
          this.sessionId = null

          if (this._status !== 'error' && !this._disposed) {
            this.setStatus('disconnected')
            this.scheduleReconnect()
          }
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        this.setStatus('error', error.message)
        reject(error)
      }
    })
  }

  async disconnect(): Promise<void> {
    this.cancelReconnect()
    this.config.autoReconnect = false

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.sessionId = null
    this.setStatus('disconnected')
  }

  // =========================================================================
  // Message Handling
  // =========================================================================

  private handleMessage(message: Record<string, unknown>): void {
    switch (message.type) {
      case 'SET': {
        const address = message.address as string
        const value = message.value as ClaspValue
        this.params.set(address, value)
        this.notifySubscribers(address, value, message)
        this.emitMessage({ topic: address, data: { type: 'SET', value, ...message } })
        break
      }

      case 'SNAPSHOT': {
        const params = message.params as Array<{ address: string; value: ClaspValue; revision: number }>
        for (const param of params) {
          this.params.set(param.address, param.value)
          this.notifySubscribers(param.address, param.value, param)
        }
        this.emitMessage({ data: { type: 'SNAPSHOT', params } })
        break
      }

      case 'PUBLISH': {
        const address = message.address as string
        const value = (message.value ?? message.payload ?? null) as ClaspValue
        this.notifySubscribers(address, value, message)
        this.emitMessage({
          topic: address,
          data: { type: 'PUBLISH', value, signal: message.signal, ...message }
        })
        break
      }

      case 'PING':
        this.sendRaw({ type: 'PONG' })
        break

      case 'ERROR':
        console.error('[CLASP] Error:', message)
        this.emitError(new Error(message.message as string || 'Unknown error'))
        break
    }
  }

  private notifySubscribers(address: string, value: ClaspValue, meta: Record<string, unknown>): void {
    for (const sub of this.subscriptions.values()) {
      if (matchPattern(sub.pattern, address)) {
        if (sub.callback) {
          sub.callback(address, value, meta)
        }
      }
    }
  }

  // =========================================================================
  // Send Methods
  // =========================================================================

  private sendRaw(message: unknown, qos: QoS = QoS.Fire): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encodeFrame(message, qos))
      return true
    }
    return false
  }

  async send(data: unknown, options?: Record<string, unknown>): Promise<void> {
    const qos = (options?.qos as QoS) ?? QoS.Fire
    if (!this.sendRaw(data, qos)) {
      throw new Error('Not connected')
    }
  }

  // =========================================================================
  // CLASP-Specific Methods
  // =========================================================================

  async setParam(key: string, value: unknown): Promise<void> {
    if (!this.sendRaw({ type: 'SET', address: key, value }, QoS.Confirm)) {
      throw new Error('Not connected')
    }
    this.params.set(key, value as ClaspValue)
  }

  getParam(key: string): unknown {
    return this.params.get(key)
  }

  async subscribe(
    pattern: string,
    callback?: (address: string, value: ClaspValue, meta: Record<string, unknown>) => void,
    options?: { maxRate?: number; epsilon?: number }
  ): Promise<number> {
    const id = this.nextSubId++
    this.subscriptions.set(id, { id, pattern, callback })

    const msg = {
      type: 'SUBSCRIBE',
      id,
      pattern,
      options: options ?? undefined,
    }

    if (!this.sendRaw(msg, QoS.Confirm)) {
      this.subscriptions.delete(id)
      throw new Error('Not connected')
    }

    return id
  }

  async unsubscribe(subscriptionId: number): Promise<void> {
    if (!this.subscriptions.has(subscriptionId)) {
      return
    }

    this.subscriptions.delete(subscriptionId)
    this.sendRaw({ type: 'UNSUBSCRIBE', id: subscriptionId })
  }

  async emit(trigger: string, payload?: unknown): Promise<void> {
    const timestamp = Date.now() * 1000 + this.serverTimeOffset
    if (!this.sendRaw({
      type: 'PUBLISH',
      address: trigger,
      signal: 'event',
      payload: payload ?? null,
      timestamp,
    }, QoS.Confirm)) {
      throw new Error('Not connected')
    }
  }

  async stream(channel: string, data: unknown): Promise<void> {
    const timestamp = Date.now() * 1000 + this.serverTimeOffset
    if (!this.sendRaw({
      type: 'PUBLISH',
      address: channel,
      signal: 'stream',
      value: data,
      timestamp,
    }, QoS.Fire)) {
      throw new Error('Not connected')
    }
  }

  async sendBundle(
    messages: Array<{ set?: [string, ClaspValue]; emit?: [string, ClaspValue] }>,
    scheduledTime?: number
  ): Promise<void> {
    const formatted = messages.map((m) => {
      if (m.set) {
        return { type: 'SET', address: m.set[0], value: m.set[1] }
      }
      if (m.emit) {
        return { type: 'PUBLISH', address: m.emit[0], signal: 'event', payload: m.emit[1] }
      }
      throw new Error('Invalid bundle message')
    })

    if (!this.sendRaw({
      type: 'BUNDLE',
      timestamp: scheduledTime,
      messages: formatted,
    }, QoS.Commit)) {
      throw new Error('Not connected')
    }
  }

  // =========================================================================
  // Getters
  // =========================================================================

  get session(): string | null {
    return this.sessionId
  }

  get allParams(): Map<string, ClaspValue> {
    return new Map(this.params)
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  dispose(): void {
    this.subscriptions.clear()
    this.params.clear()
    super.dispose()
  }
}

// ============================================================================
// Connection Type Definition for Registration
// ============================================================================

export const claspConnectionType: ConnectionTypeDefinition<ClaspConnectionConfig> = {
  id: 'clasp',
  name: 'CLASP Router',
  icon: 'radio',
  color: '#6366f1',
  category: 'protocol',
  description: 'Connect to a CLASP (Creative Low-latency Application Streaming Protocol) router',
  platforms: ['web', 'electron'],
  configControls: [
    {
      id: 'url',
      type: 'text',
      label: 'Server URL',
      description: 'WebSocket URL of the CLASP router',
      default: 'ws://localhost:7330',
    },
    {
      id: 'token',
      type: 'text',
      label: 'Auth Token',
      description: 'Optional authentication token',
      default: '',
    },
    {
      id: 'autoConnect',
      type: 'checkbox',
      label: 'Auto Connect',
      description: 'Connect automatically on flow start',
      default: true,
    },
    {
      id: 'autoReconnect',
      type: 'checkbox',
      label: 'Auto Reconnect',
      description: 'Reconnect automatically on disconnect',
      default: true,
    },
    {
      id: 'reconnectDelay',
      type: 'number',
      label: 'Reconnect Delay (ms)',
      description: 'Delay between reconnection attempts',
      default: 5000,
      props: { min: 1000, max: 60000, step: 1000 },
    },
  ],
  defaultConfig: {
    url: 'ws://localhost:7330',
    token: '',
    autoConnect: true,
    autoReconnect: true,
    reconnectDelay: 5000,
    maxReconnectAttempts: 0,
  },
  createAdapter: (config) => new ClaspAdapterImpl(config),
}
