/**
 * CLASP Protocol Executors
 *
 * Full-featured CLASP connectivity nodes using the @clasp-to/core library.
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
 * - clasp-video-receive: Receives video from CLASP relay room
 * - clasp-video-send: Sends video to CLASP relay room
 * - clasp-gesture: Receives gesture signals
 */

import { Clasp, ClaspBuilder, type Value } from '@clasp-to/core'
import * as THREE from 'three'
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { useConnectionsStore } from '@/stores/connections'
import type { ClaspConnectionConfig } from '@/services/connections/types'
import {
  chunkFrame,
  decodeChunkFromTransport,
  ChunkAssembler,
  createSequenceGenerator,
  type AssembledFrame,
} from '@/services/clasp/videoChunker'
import { getThreeShaderRenderer } from './visual'

// ============================================================================
// Connection Management
// ============================================================================

interface ClaspConnection {
  client: Clasp | null
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error: string | null
  config: {
    url: string
    name: string
    token: string
    autoConnect: boolean
    autoReconnect: boolean
    reconnectDelay: number
  }
  subscribers: Set<string>
  reconnectTimer: ReturnType<typeof setTimeout> | null
  reconnectAttempts: number
}

// Global connection manager
const claspConnections = new Map<string, ClaspConnection>()

// State cache for subscribed values
const claspState = new Map<string, unknown>()

// Track active subscriptions per node
const nodeSubscriptions = new Map<string, { connectionId: string; unsubscribe: () => void; pattern: string }>()

/**
 * Get or create a connection.
 * First checks local connections, then looks up from ConnectionManager.
 */
function getConnection(connectionId: string): ClaspConnection | undefined {
  // First check local connections
  const localConn = claspConnections.get(connectionId)
  if (localConn) {
    return localConn
  }

  // If not found locally, check ConnectionManager for CLASP connections
  try {
    const connectionsStore = useConnectionsStore()
    const managedConn = connectionsStore.connections.find(
      (c) => c.id === connectionId && c.protocol === 'clasp'
    ) as ClaspConnectionConfig | undefined

    if (managedConn) {
      // Create a local connection from the managed config
      const config: ClaspConnection['config'] = {
        url: managedConn.url || 'ws://localhost:7330',
        name: managedConn.name || 'latch',
        token: managedConn.token || '',
        autoConnect: managedConn.autoConnect ?? true,
        autoReconnect: managedConn.autoReconnect ?? true,
        reconnectDelay: managedConn.reconnectDelay ?? 5000,
      }
      return createConnection(connectionId, config)
    }
  } catch (e) {
    console.warn('[CLASP] Could not access ConnectionManager:', e)
  }

  return undefined
}

/**
 * Get or create a connection and auto-connect if needed
 */
async function getOrConnectConnection(connectionId: string): Promise<ClaspConnection | undefined> {
  const connection = getConnection(connectionId)
  if (!connection) {
    return undefined
  }

  // Auto-connect if disconnected and autoConnect is enabled
  if (connection.status === 'disconnected' && connection.config.autoConnect) {
    try {
      await connect(connection, connectionId)
    } catch (e) {
      console.warn('[CLASP] Auto-connect failed:', e)
    }
  }

  return connection
}

/**
 * Create a new connection configuration
 */
function createConnection(connectionId: string, config: ClaspConnection['config']): ClaspConnection {
  const connection: ClaspConnection = {
    client: null,
    status: 'disconnected',
    error: null,
    config,
    subscribers: new Set(),
    reconnectTimer: null,
    reconnectAttempts: 0,
  }
  claspConnections.set(connectionId, connection)
  return connection
}

/** Maximum reconnection attempts */
const MAX_RECONNECT_ATTEMPTS = 10

/** Connection timeout in milliseconds */
const CONNECTION_TIMEOUT = 10000

/**
 * Connect to CLASP server using @clasp-to/core
 */
async function connect(connection: ClaspConnection, connectionId: string): Promise<void> {
  if (connection.client?.connected) {
    return
  }

  connection.status = 'connecting'
  connection.error = null

  try {
    const builder = new ClaspBuilder(connection.config.url)
      .name(connection.config.name)
      .reconnect(false) // We handle reconnection ourselves

    if (connection.config.token) {
      builder.token(connection.config.token)
    }

    // Create connection with timeout
    const connectPromise = builder.connect()
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT)
    })

    connection.client = await Promise.race([connectPromise, timeoutPromise])
    connection.status = 'connected'
    connection.reconnectAttempts = 0

    console.log(`[CLASP] Connected to ${connection.config.url}, session: ${connection.client.session}`)

    // Listen for disconnection
    connection.client.onDisconnect((reason) => {
      console.log(`[CLASP] Disconnected from ${connection.config.url}: ${reason}`)
      connection.status = 'disconnected'
      connection.client = null
      scheduleReconnect(connection, connectionId)
    })

    connection.client.onError((error) => {
      console.error(`[CLASP] Error:`, error)
      connection.error = error.message
    })
  } catch (e) {
    connection.status = 'error'
    connection.error = e instanceof Error ? e.message : String(e)
    connection.client = null

    // Schedule reconnect if enabled
    scheduleReconnect(connection, connectionId)

    throw e
  }
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect(connection: ClaspConnection, connectionId: string): void {
  if (!connection.config.autoReconnect) return
  if (connection.subscribers.size === 0) return
  if (connection.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log(`[CLASP] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached for ${connectionId}`)
    connection.error = 'Max reconnection attempts reached'
    return
  }

  // Exponential backoff: delay * 2^(attempts), capped at 30 seconds
  const backoffDelay = Math.min(
    connection.config.reconnectDelay * Math.pow(2, connection.reconnectAttempts),
    30000
  )
  connection.reconnectAttempts++

  console.log(`[CLASP] Reconnecting in ${backoffDelay}ms (attempt ${connection.reconnectAttempts})`)

  connection.reconnectTimer = setTimeout(() => {
    connect(connection, connectionId).catch(() => {})
  }, backoffDelay)
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

  if (connection.client) {
    connection.client.close()
    connection.client = null
  }
  connection.status = 'disconnected'
}

// ============================================================================
// CLASP Connection Node Executor
// ============================================================================

export const claspConnectionExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.controls.get('connectionId') as string) ?? 'default'
  const url = (ctx.inputs.get('url') as string) ?? (ctx.controls.get('url') as string) ?? 'ws://localhost:7330'
  const name = (ctx.controls.get('name') as string) ?? 'latch'
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
      await connect(connection, connectionId)
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
  outputs.set('session', connection.client?.session ?? null)
  outputs.set('connectionId', connectionId)

  return outputs
}

// ============================================================================
// CLASP Subscribe Node Executor
// ============================================================================

export const claspSubscribeExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? ''
  const pattern = (ctx.inputs.get('pattern') as string) ?? (ctx.controls.get('pattern') as string) ?? '/**'

  const outputs = new Map<string, unknown>()

  // Skip if no connection selected
  if (!connectionId) {
    outputs.set('value', null)
    outputs.set('address', null)
    outputs.set('type', null)
    outputs.set('revision', null)
    outputs.set('subscribed', false)
    return outputs
  }

  const connection = await getOrConnectConnection(connectionId)

  if (!connection || connection.status !== 'connected' || !connection.client) {
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
      existingSub.unsubscribe()
    }

    // Subscribe using the library's on() method
    const unsubscribe = connection.client.on(pattern, (value: Value, address: string) => {
      // Store in state cache
      claspState.set(`${ctx.nodeId}:_hasUpdate`, true)
      claspState.set(`${ctx.nodeId}:_lastAddress`, address)
      claspState.set(`${ctx.nodeId}:_lastValue`, value)
      claspState.set(`${ctx.nodeId}:_lastType`, 'param')
    })

    nodeSubscriptions.set(ctx.nodeId, { connectionId, unsubscribe, pattern })
  }

  // Get latest value from state cache
  const hasUpdate = claspState.get(`${ctx.nodeId}:_hasUpdate`) as boolean
  const lastValue = claspState.get(`${ctx.nodeId}:_lastValue`)
  const lastAddress = claspState.get(`${ctx.nodeId}:_lastAddress`) as string | undefined
  const lastType = claspState.get(`${ctx.nodeId}:_lastType`) as string | undefined

  // Clear update flag
  claspState.set(`${ctx.nodeId}:_hasUpdate`, false)

  outputs.set('value', lastValue ?? null)
  outputs.set('address', lastAddress ?? null)
  outputs.set('type', lastType ?? null)
  outputs.set('revision', null)
  outputs.set('subscribed', true)
  outputs.set('updated', hasUpdate ?? false)

  return outputs
}

// ============================================================================
// CLASP Set Node Executor
// ============================================================================

export const claspSetExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? ''
  const address = (ctx.inputs.get('address') as string) ?? (ctx.controls.get('address') as string) ?? '/param'
  const value = ctx.inputs.get('value')
  const trigger = ctx.inputs.get('trigger') as boolean

  const outputs = new Map<string, unknown>()

  // Skip if no connection selected
  if (!connectionId) {
    outputs.set('sent', false)
    outputs.set('error', 'No connection selected')
    return outputs
  }

  const connection = await getOrConnectConnection(connectionId)

  if (!connection || connection.status !== 'connected' || !connection.client) {
    outputs.set('sent', false)
    outputs.set('error', 'Not connected')
    return outputs
  }

  // Only send when triggered (or when value changes if no trigger connected)
  if (trigger && value !== undefined) {
    try {
      connection.client.set(address, value as Value)
      outputs.set('sent', true)
      outputs.set('error', null)
    } catch (e) {
      outputs.set('sent', false)
      outputs.set('error', e instanceof Error ? e.message : 'Failed to send')
    }
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
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? ''
  const address = (ctx.inputs.get('address') as string) ?? (ctx.controls.get('address') as string) ?? '/event'
  const payload = ctx.inputs.get('payload')
  const trigger = ctx.inputs.get('trigger') as boolean

  const outputs = new Map<string, unknown>()

  if (!connectionId) {
    outputs.set('sent', false)
    outputs.set('error', 'No connection selected')
    return outputs
  }

  const connection = await getOrConnectConnection(connectionId)

  if (!connection || connection.status !== 'connected' || !connection.client) {
    outputs.set('sent', false)
    outputs.set('error', 'Not connected')
    return outputs
  }

  // Only send when triggered
  if (trigger) {
    try {
      connection.client.emit(address, (payload ?? null) as Value | undefined)
      outputs.set('sent', true)
      outputs.set('error', null)
    } catch (e) {
      outputs.set('sent', false)
      outputs.set('error', e instanceof Error ? e.message : 'Failed to send')
    }
  } else {
    outputs.set('sent', false)
    outputs.set('error', null)
  }

  return outputs
}

// ============================================================================
// CLASP Get Node Executor
// ============================================================================

export const claspGetExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? ''
  const address = (ctx.inputs.get('address') as string) ?? (ctx.controls.get('address') as string) ?? '/param'
  const trigger = ctx.inputs.get('trigger') as boolean

  const outputs = new Map<string, unknown>()

  if (!connectionId) {
    outputs.set('value', null)
    outputs.set('error', 'No connection selected')
    return outputs
  }

  const connection = await getOrConnectConnection(connectionId)

  if (!connection || connection.status !== 'connected' || !connection.client) {
    outputs.set('value', null)
    outputs.set('error', 'Not connected')
    return outputs
  }

  // Check cache first
  const cachedValue = connection.client.cached(address)
  if (cachedValue !== undefined) {
    outputs.set('value', cachedValue)
    outputs.set('error', null)
    return outputs
  }

  // Request from server when triggered
  if (trigger) {
    try {
      const value = await connection.client.get(address)
      outputs.set('value', value)
      outputs.set('error', null)
    } catch (e) {
      outputs.set('value', null)
      outputs.set('error', e instanceof Error ? e.message : 'Failed to get')
    }
  } else {
    outputs.set('value', null)
    outputs.set('error', null)
  }

  return outputs
}

// ============================================================================
// CLASP Stream Node Executor
// ============================================================================

export const claspStreamExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? ''
  const address = (ctx.inputs.get('address') as string) ?? (ctx.controls.get('address') as string) ?? '/stream'
  const value = ctx.inputs.get('value')
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true

  const outputs = new Map<string, unknown>()

  if (!connectionId || !enabled) {
    outputs.set('sent', false)
    return outputs
  }

  const connection = await getOrConnectConnection(connectionId)

  if (!connection || connection.status !== 'connected' || !connection.client) {
    outputs.set('sent', false)
    return outputs
  }

  // Send continuously while enabled and value is provided
  if (value !== undefined) {
    try {
      connection.client.stream(address, value as Value)
      outputs.set('sent', true)
    } catch {
      outputs.set('sent', false)
    }
  } else {
    outputs.set('sent', false)
  }

  return outputs
}

// ============================================================================
// CLASP Bundle Node Executor
// ============================================================================

export const claspBundleExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? ''
  const messages = ctx.inputs.get('messages') as Array<{ set?: [string, unknown]; emit?: [string, unknown] }> | undefined
  const trigger = ctx.inputs.get('trigger') as boolean
  const scheduledTime = ctx.inputs.get('at') as number | undefined

  const outputs = new Map<string, unknown>()

  if (!connectionId) {
    outputs.set('sent', false)
    outputs.set('error', 'No connection selected')
    return outputs
  }

  const connection = await getOrConnectConnection(connectionId)

  if (!connection || connection.status !== 'connected' || !connection.client) {
    outputs.set('sent', false)
    outputs.set('error', 'Not connected')
    return outputs
  }

  // Only send when triggered
  if (trigger && messages && messages.length > 0) {
    try {
      const opts = scheduledTime ? { at: scheduledTime } : undefined
      connection.client.bundle(messages as Array<{ set?: [string, Value]; emit?: [string, Value] }>, opts)
      outputs.set('sent', true)
      outputs.set('error', null)
    } catch (e) {
      outputs.set('sent', false)
      outputs.set('error', e instanceof Error ? e.message : 'Failed to send')
    }
  } else {
    outputs.set('sent', false)
    outputs.set('error', null)
  }

  return outputs
}

// ============================================================================
// CLASP Video Receive Node Executor
// ============================================================================

interface VideoReceiveNodeState {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  texture: THREE.Texture
  decoder: VideoDecoder | null
  decoderConfigured: boolean
  waitingForKeyframe: boolean
  codecDescription: Uint8Array | null
  assembler: ChunkAssembler
  presenceUnsub: (() => void) | null
  streamUnsub: (() => void) | null
  peers: Map<string, unknown>
  currentRoom: string
  currentPeerId: string
  currentConnectionId: string
  videoMode: string
  currentAddress: string
  fpsCounter: { frames: number; lastReset: number; fps: number }
  receiving: boolean
  frameDirty: boolean
}

const videoReceiveState = new Map<string, VideoReceiveNodeState>()

function createReceiveCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 2
  const ctx = canvas.getContext('2d')!
  return { canvas, ctx }
}

/**
 * Create a VideoDecoder for a receive node.
 * Matches the CLASP playground pattern: create once, reset() on error, configure on first keyframe.
 */
function createReceiveDecoder(nodeId: string): VideoDecoder {
  return new VideoDecoder({
    output: (frame: VideoFrame) => {
      const s = videoReceiveState.get(nodeId)
      if (!s) { frame.close(); return }

      if (s.canvas.width !== frame.displayWidth || s.canvas.height !== frame.displayHeight) {
        s.canvas.width = frame.displayWidth
        s.canvas.height = frame.displayHeight
      }
      s.ctx.drawImage(frame as unknown as CanvasImageSource, 0, 0)
      frame.close()
      s.fpsCounter.frames++
      s.receiving = true
      s.frameDirty = true
    },
    error: (e: DOMException) => {
      console.error('[CLASP Video Receive] Decoder error:', e)
      const s = videoReceiveState.get(nodeId)
      if (!s || !s.decoder) return
      // Reset decoder and wait for next keyframe (playground pattern)
      s.decoderConfigured = false
      s.waitingForKeyframe = true
      try { s.decoder.reset() } catch { /* ignore */ }
      // Request keyframe to recover
      const conn = getConnection(s.currentConnectionId)
      if (conn?.client && s.currentRoom) {
        conn.client.emit(`/video/relay/${s.currentRoom}/request-keyframe/${s.currentPeerId}`)
      }
    },
  })
}

export const claspVideoReceiveExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? ''
  const room = (ctx.inputs.get('room') as string) ?? (ctx.controls.get('room') as string) ?? 'default'
  const peerIdInput = (ctx.inputs.get('peerId') as string) ?? (ctx.controls.get('peerId') as string) ?? ''
  const videoMode = (ctx.controls.get('videoMode') as string) ?? 'room'
  const directAddress = (ctx.inputs.get('address') as string) ?? (ctx.controls.get('address') as string) ?? ''
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true

  const outputs = new Map<string, unknown>()

  if (!connectionId || !enabled) {
    outputs.set('texture', null)
    outputs.set('width', 0)
    outputs.set('height', 0)
    outputs.set('fps', 0)
    outputs.set('receiving', false)
    outputs.set('peers', [])
    return outputs
  }

  // Check WebCodecs support
  if (typeof VideoDecoder === 'undefined') {
    outputs.set('texture', null)
    outputs.set('width', 0)
    outputs.set('height', 0)
    outputs.set('fps', 0)
    outputs.set('receiving', false)
    outputs.set('peers', [])
    outputs.set('_error', 'WebCodecs (VideoDecoder) not available in this browser')
    return outputs
  }

  const connection = await getOrConnectConnection(connectionId)

  if (!connection || connection.status !== 'connected' || !connection.client) {
    outputs.set('texture', null)
    outputs.set('width', 0)
    outputs.set('height', 0)
    outputs.set('fps', 0)
    outputs.set('receiving', false)
    outputs.set('peers', [])
    return outputs
  }

  // Initialize state
  let state = videoReceiveState.get(ctx.nodeId)
  if (!state) {
    const { canvas, ctx: canvasCtx } = createReceiveCanvas()
    const renderer = getThreeShaderRenderer()
    const texture = renderer.createTexture(canvas)

    state = {
      canvas,
      ctx: canvasCtx,
      texture,
      decoder: null,
      decoderConfigured: false,
      waitingForKeyframe: false,
      codecDescription: null,
      assembler: new ChunkAssembler(),
      presenceUnsub: null,
      streamUnsub: null,
      peers: new Map(),
      currentRoom: '',
      currentPeerId: '',
      currentConnectionId: '',
      videoMode: '',
      currentAddress: '',
      fpsCounter: { frames: 0, lastReset: Date.now(), fps: 0 },
      receiving: false,
      frameDirty: false,
    }
    videoReceiveState.set(ctx.nodeId, state)
  }

  const needsResubscribe =
    state.currentRoom !== room ||
    state.currentConnectionId !== connectionId ||
    state.videoMode !== videoMode ||
    (videoMode === 'direct' && state.currentAddress !== directAddress)

  if (needsResubscribe) {
    // Cleanup old subscriptions
    if (state.presenceUnsub) { state.presenceUnsub(); state.presenceUnsub = null }
    if (state.streamUnsub) { state.streamUnsub(); state.streamUnsub = null }
    if (state.decoder && state.decoder.state !== 'closed') {
      try { state.decoder.close() } catch { /* ignore */ }
    }
    state.decoder = null
    state.decoderConfigured = false
    state.waitingForKeyframe = false
    state.codecDescription = null
    state.assembler.clear()
    state.peers.clear()
    state.receiving = false
    state.currentRoom = room
    state.currentConnectionId = connectionId
    state.currentPeerId = ''
    state.videoMode = videoMode
    state.currentAddress = ''

    // In room mode, subscribe to presence for peer discovery
    if (videoMode === 'room') {
      const presencePattern = `/video/relay/${room}/presence/*`
      state.presenceUnsub = connection.client.on(presencePattern, (value: Value, address: string) => {
        const peerId = address.split('/').pop()!
        const s = videoReceiveState.get(ctx.nodeId)
        if (!s) return
        if (value === null) {
          s.peers.delete(peerId)
          // If the disconnected peer is the one we're subscribed to, tear down
          // the stream so auto-selection picks a new broadcaster on the next tick
          if (peerId === s.currentPeerId) {
            if (s.streamUnsub) { s.streamUnsub(); s.streamUnsub = null }
            if (s.decoder && s.decoder.state !== 'closed') {
              try { s.decoder.close() } catch { /* ignore */ }
            }
            s.decoder = null
            s.decoderConfigured = false
            s.waitingForKeyframe = false
            s.codecDescription = null
            s.assembler.clear()
            s.currentPeerId = ''
            s.currentAddress = ''
            s.receiving = false
          }
        } else {
          s.peers.set(peerId, value)
        }
      })
    }
  }

  const nodeId = ctx.nodeId

  /**
   * Setup assembler + decoder + stream subscription for a given address.
   * Used by both room mode (peer-selected address) and direct address mode.
   */
  const setupStreamSubscription = (streamAddress: string) => {
    if (state!.streamUnsub) { state!.streamUnsub(); state!.streamUnsub = null }
    if (state!.decoder && state!.decoder.state !== 'closed') {
      try { state!.decoder.close() } catch { /* ignore */ }
    }
    state!.decoder = null
    state!.decoderConfigured = false
    state!.waitingForKeyframe = true
    state!.codecDescription = null
    state!.assembler.clear()

    // Create decoder once per subscription (playground pattern)
    state!.decoder = createReceiveDecoder(nodeId)

    // Setup assembler — configure decoder once on first keyframe
    state!.assembler = new ChunkAssembler({
      onFrame: (frame: AssembledFrame) => {
        const s = videoReceiveState.get(nodeId)
        if (!s || !s.decoder) return

        try {
          // Store codec description if present
          if (frame.description) {
            s.codecDescription = frame.description
          }

          // Configure decoder on first keyframe (playground pattern)
          if (!s.decoderConfigured && frame.frameType === 'key') {
            const config: VideoDecoderConfig = {
              codec: 'avc1.42001e',
              optimizeForLatency: true,
              hardwareAcceleration: 'prefer-software',
            }
            if (s.codecDescription) {
              config.description = s.codecDescription
            }
            s.decoder.configure(config)
            s.decoderConfigured = true
            s.waitingForKeyframe = false
          }

          // Skip delta frames when waiting for keyframe
          if (s.waitingForKeyframe && frame.frameType !== 'key') {
            return
          }

          if (s.decoderConfigured) {
            s.decoder.decode(new EncodedVideoChunk({
              type: frame.frameType as EncodedVideoChunkType,
              timestamp: frame.timestamp,
              data: frame.data,
            }))
          }
        } catch (e) {
          console.error('[CLASP Video Receive] Decode error:', e)
          // Reset decoder and wait for keyframe (playground pattern)
          s.decoderConfigured = false
          s.waitingForKeyframe = true
          try { s.decoder.reset() } catch { /* ignore */ }
          const conn = getConnection(s.currentConnectionId)
          if (conn?.client && s.currentRoom) {
            conn.client.emit(`/video/relay/${s.currentRoom}/request-keyframe/${s.currentPeerId}`)
          }
        }
      },
      onError: (e: Error) => {
        console.error('[CLASP Video Receive] Assembly error:', e)
        const s = videoReceiveState.get(nodeId)
        if (!s) return
        const conn = getConnection(s.currentConnectionId)
        if (conn?.client && s.currentRoom && s.currentPeerId) {
          conn.client.emit(`/video/relay/${s.currentRoom}/request-keyframe/${s.currentPeerId}`)
        }
      },
    })

    // Subscribe to stream chunks at the address
    state!.streamUnsub = connection!.client!.on(streamAddress, (data: Value) => {
      const s = videoReceiveState.get(nodeId)
      if (!s) return
      try {
        if (data && typeof data === 'object' && (data as Record<string, unknown>).data) {
          const chunk = decodeChunkFromTransport(data)
          s.assembler.addChunk(chunk)
        }
      } catch (e) {
        console.error('[CLASP Video Receive] Chunk processing error:', e)
      }
    })

    state!.currentAddress = streamAddress

    // Request a keyframe immediately to start decoding
    // In room mode, currentPeerId and currentRoom are set before calling this function.
    // In direct mode, try to extract room/peerId from the address pattern:
    //   /video/relay/{room}/stream/{peerId}
    let reqRoom = state!.currentRoom
    let reqPeerId = state!.currentPeerId
    if (!reqPeerId && streamAddress) {
      const parts = streamAddress.split('/')
      const streamIdx = parts.indexOf('stream')
      if (streamIdx > 1 && streamIdx < parts.length - 1) {
        reqRoom = parts[streamIdx - 1]
        reqPeerId = parts[streamIdx + 1]
      }
    }
    if (reqPeerId && reqRoom) {
      connection!.client!.emit(
        `/video/relay/${reqRoom}/request-keyframe/${reqPeerId}`,
      )
    }
  }

  if (videoMode === 'direct') {
    // Direct address mode: subscribe directly to the provided address
    if (directAddress && state.currentAddress !== directAddress) {
      setupStreamSubscription(directAddress)
    }
  } else {
    // Room mode: discover peer then subscribe to their stream address
    let targetPeerId = peerIdInput
    if (!targetPeerId) {
      // Auto-select first broadcaster
      for (const [peerId, data] of state.peers) {
        if (data && typeof data === 'object' && (data as Record<string, unknown>).isBroadcaster) {
          targetPeerId = peerId
          break
        }
      }
    }

    if (targetPeerId && targetPeerId !== state.currentPeerId) {
      state.currentPeerId = targetPeerId
      const streamAddress = `/video/relay/${room}/stream/${targetPeerId}`
      setupStreamSubscription(streamAddress)
    }
  }

  // Update FPS counter
  const now = Date.now()
  if (now - state.fpsCounter.lastReset >= 1000) {
    state.fpsCounter.fps = state.fpsCounter.frames
    state.fpsCounter.frames = 0
    state.fpsCounter.lastReset = now
    if (state.fpsCounter.fps === 0) {
      state.receiving = false
    }
  }

  // Update texture only when a new frame was decoded
  if (state.frameDirty) {
    const renderer = getThreeShaderRenderer()
    renderer.updateTexture(state.texture, state.canvas)
    state.frameDirty = false
  }

  outputs.set('texture', state.texture)
  outputs.set('_display', state.canvas)
  outputs.set('width', state.canvas.width)
  outputs.set('height', state.canvas.height)
  outputs.set('fps', state.fpsCounter.fps)
  outputs.set('receiving', state.receiving)
  outputs.set('peers', Array.from(state.peers.entries()).map(([id, data]) => ({ id, ...(data as object) })))

  return outputs
}

// ============================================================================
// CLASP Video Send Node Executor
// ============================================================================

const QUALITY_PRESETS: Record<string, { width: number; height: number; bitrate: number; framerate: number }> = {
  low: { width: 640, height: 480, bitrate: 400_000, framerate: 24 },
  medium: { width: 1280, height: 720, bitrate: 1_200_000, framerate: 30 },
  high: { width: 1920, height: 1080, bitrate: 3_000_000, framerate: 30 },
}

interface VideoSendNodeState {
  encoder: VideoEncoder | null
  encoderConfigured: boolean
  seqGenerator: (() => number) | null
  captureCanvas: HTMLCanvasElement | null
  captureCtx: CanvasRenderingContext2D | null
  broadcasting: boolean
  connectionId: string
  room: string
  quality: string
  presenceInterval: ReturnType<typeof setInterval> | null
  keyframeUnsub: (() => void) | null
  lastKeyFrameTime: number
  lastEncodeTime: number
  codecDescription: Uint8Array | null
  stats: { framesSent: number; bytesSent: number; lastStatReset: number; fps: number; bitrate: number }
}

const videoSendState = new Map<string, VideoSendNodeState>()

export const claspVideoSendExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? ''
  const roomInput = (ctx.inputs.get('room') as string) ?? (ctx.controls.get('room') as string) ?? 'default'
  const qualityPreset = (ctx.controls.get('quality') as string) ?? 'medium'
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true
  const autoStart = (ctx.controls.get('autoStart') as boolean) ?? false
  const startTrigger = ctx.inputs.get('start') as boolean
  const stopTrigger = ctx.inputs.get('stop') as boolean
  const textureInput = ctx.inputs.get('texture') as THREE.Texture | null | undefined
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null | undefined

  const outputs = new Map<string, unknown>()

  if (!connectionId || !enabled) {
    outputs.set('broadcasting', false)
    outputs.set('fps', 0)
    outputs.set('bitrate', 0)
    outputs.set('error', !connectionId ? 'No connection selected' : null)
    return outputs
  }

  if (typeof VideoEncoder === 'undefined') {
    outputs.set('broadcasting', false)
    outputs.set('fps', 0)
    outputs.set('bitrate', 0)
    outputs.set('error', 'WebCodecs (VideoEncoder) not available in this browser')
    return outputs
  }

  const connection = await getOrConnectConnection(connectionId)

  if (!connection || connection.status !== 'connected' || !connection.client) {
    outputs.set('broadcasting', false)
    outputs.set('fps', 0)
    outputs.set('bitrate', 0)
    outputs.set('error', 'Not connected')
    return outputs
  }

  // Initialize state
  let state = videoSendState.get(ctx.nodeId)
  if (!state) {
    state = {
      encoder: null,
      encoderConfigured: false,
      seqGenerator: null,
      captureCanvas: null,
      captureCtx: null,
      broadcasting: false,
      connectionId: '',
      room: '',
      quality: '',
      presenceInterval: null,
      keyframeUnsub: null,
      lastKeyFrameTime: 0,
      lastEncodeTime: 0,
      codecDescription: null,
      stats: { framesSent: 0, bytesSent: 0, lastStatReset: Date.now(), fps: 0, bitrate: 0 },
    }
    videoSendState.set(ctx.nodeId, state)
  }

  const nodeId = ctx.nodeId
  const preset = QUALITY_PRESETS[qualityPreset] || QUALITY_PRESETS.medium

  // Handle stop trigger
  if (stopTrigger && state.broadcasting) {
    stopVideoSend(nodeId, connection)
    state.broadcasting = false
  }

  // Handle start trigger or autoStart
  const shouldStart = (startTrigger || (autoStart && !state.broadcasting)) && (textureInput || videoInput)

  if (shouldStart && !state.broadcasting) {
    state.seqGenerator = createSequenceGenerator()
    state.connectionId = connectionId
    state.room = roomInput
    state.quality = qualityPreset
    state.codecDescription = null

    // Create encoder
    state.encoder = new VideoEncoder({
      output: (chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) => {
        const s = videoSendState.get(nodeId)
        if (!s || !s.broadcasting) return
        const conn = getConnection(s.connectionId)
        if (!conn?.client) return

        // Capture codec description
        if (metadata?.decoderConfig?.description) {
          const desc = metadata.decoderConfig.description
          s.codecDescription = (desc instanceof ArrayBuffer)
            ? new Uint8Array(desc)
            : new Uint8Array((desc as unknown as ArrayBuffer))
        }

        const data = new Uint8Array(chunk.byteLength)
        chunk.copyTo(data)

        s.stats.bytesSent += data.byteLength
        s.stats.framesSent++

        const chunks = chunkFrame(data, chunk.type, chunk.timestamp, 16000, s.seqGenerator!)
        const address = `/video/relay/${s.room}/stream/${conn.client!.session}`

        if (chunk.type === 'key' && s.codecDescription && chunks.length > 0) {
          chunks[0].description = s.codecDescription
        }

        chunks.forEach((c) => {
          conn.client!.stream(address, c as unknown as Value)
        })
      },
      error: (e: DOMException) => {
        console.error('[CLASP Video Send] Encoder error:', e)
      },
    })

    // Configure encoder
    const encoderConfig: VideoEncoderConfig = {
      codec: 'avc1.42001e',
      width: preset.width,
      height: preset.height,
      bitrate: preset.bitrate,
      framerate: preset.framerate,
      latencyMode: 'realtime',
      hardwareAcceleration: 'prefer-hardware',
      avc: { format: 'annexb' },
    }

    try {
      const support = await VideoEncoder.isConfigSupported(encoderConfig)
      if (!support.supported) {
        encoderConfig.hardwareAcceleration = 'prefer-software'
      }
      state.encoder.configure(encoderConfig)
      state.encoderConfigured = true
    } catch (e) {
      outputs.set('broadcasting', false)
      outputs.set('fps', 0)
      outputs.set('bitrate', 0)
      outputs.set('error', `Encoder config failed: ${(e as Error).message}`)
      return outputs
    }

    state.broadcasting = true
    state.lastKeyFrameTime = 0

    // Presence announcements
    const session = connection.client.session
    const announcePresence = () => {
      const conn = getConnection(connectionId)
      if (conn?.client) {
        conn.client.set(`/video/relay/${roomInput}/presence/${session}`, {
          isBroadcaster: true,
          quality: qualityPreset,
        } as unknown as Value)
      }
    }
    announcePresence()
    state.presenceInterval = setInterval(announcePresence, 5000)

    // Listen for keyframe requests
    const keyframePattern = `/video/relay/${roomInput}/request-keyframe/${session}`
    state.keyframeUnsub = connection.client.on(keyframePattern, () => {
      const s = videoSendState.get(nodeId)
      if (s) s.lastKeyFrameTime = 0
    })
  }

  // Encode frame if broadcasting
  if (state.broadcasting && state.encoder && state.encoderConfigured) {
    const now = Date.now()
    const frameInterval = 1000 / preset.framerate

    if (now - state.lastEncodeTime >= frameInterval && state.encoder.encodeQueueSize < 5) {
      const forceKeyFrame = now - state.lastKeyFrameTime > 3000
      if (forceKeyFrame) {
        state.lastKeyFrameTime = now
      }

      try {
        let frame: VideoFrame | null = null

        if (videoInput && videoInput.readyState >= 2 && videoInput.videoWidth > 0) {
          frame = new VideoFrame(videoInput, { timestamp: performance.now() * 1000 })
        } else if (textureInput) {
          // Render texture to canvas
          if (!state.captureCanvas) {
            state.captureCanvas = document.createElement('canvas')
            state.captureCanvas.width = preset.width
            state.captureCanvas.height = preset.height
            state.captureCtx = state.captureCanvas.getContext('2d')
          }

          // If texture has an image source (canvas/video), draw it
          if (textureInput.image) {
            if (state.captureCanvas.width !== preset.width) state.captureCanvas.width = preset.width
            if (state.captureCanvas.height !== preset.height) state.captureCanvas.height = preset.height
            state.captureCtx!.drawImage(
              textureInput.image as CanvasImageSource,
              0, 0, preset.width, preset.height
            )
          }

          frame = new VideoFrame(state.captureCanvas, { timestamp: performance.now() * 1000 })
        }

        if (frame) {
          state.encoder.encode(frame, { keyFrame: forceKeyFrame })
          frame.close()
          state.lastEncodeTime = now
        }
      } catch (e) {
        console.error('[CLASP Video Send] Frame encode error:', e)
      }
    }
  }

  // Update stats
  const now = Date.now()
  if (now - state.stats.lastStatReset >= 1000) {
    state.stats.fps = state.stats.framesSent
    state.stats.bitrate = state.stats.bytesSent * 8
    state.stats.framesSent = 0
    state.stats.bytesSent = 0
    state.stats.lastStatReset = now
  }

  outputs.set('broadcasting', state.broadcasting)
  outputs.set('fps', state.stats.fps)
  outputs.set('bitrate', state.stats.bitrate)
  outputs.set('error', null)

  return outputs
}

function stopVideoSend(nodeId: string, _connection?: ClaspConnection): void {
  const state = videoSendState.get(nodeId)
  if (!state) return

  state.broadcasting = false

  if (state.encoder && state.encoder.state !== 'closed') {
    try { state.encoder.close() } catch { /* ignore */ }
  }
  state.encoder = null
  state.encoderConfigured = false

  if (state.presenceInterval) {
    clearInterval(state.presenceInterval)
    state.presenceInterval = null
  }

  if (state.keyframeUnsub) {
    state.keyframeUnsub()
    state.keyframeUnsub = null
  }

  state.seqGenerator = null
  state.codecDescription = null
  state.captureCanvas = null
  state.captureCtx = null
}

// ============================================================================
// CLASP Gesture Node Executor
// ============================================================================

interface GestureNodeState {
  unsub: (() => void) | null
  currentConnectionId: string
  currentPattern: string
  x: number
  y: number
  pressure: number
  phase: string
  pointerType: string
  gestureId: number
  updated: boolean
}

const gestureState = new Map<string, GestureNodeState>()

export const claspGestureExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? ''
  const pattern = (ctx.controls.get('pattern') as string) ?? '/gesture/**'

  const outputs = new Map<string, unknown>()

  if (!connectionId) {
    outputs.set('x', 0)
    outputs.set('y', 0)
    outputs.set('pressure', 0)
    outputs.set('phase', '')
    outputs.set('pointerType', '')
    outputs.set('updated', false)
    return outputs
  }

  const connection = await getOrConnectConnection(connectionId)

  if (!connection || connection.status !== 'connected' || !connection.client) {
    outputs.set('x', 0)
    outputs.set('y', 0)
    outputs.set('pressure', 0)
    outputs.set('phase', '')
    outputs.set('pointerType', '')
    outputs.set('updated', false)
    return outputs
  }

  let state = gestureState.get(ctx.nodeId)
  if (!state) {
    state = {
      unsub: null,
      currentConnectionId: '',
      currentPattern: '',
      x: 0, y: 0, pressure: 0,
      phase: '', pointerType: '', gestureId: 0,
      updated: false,
    }
    gestureState.set(ctx.nodeId, state)
  }

  // Resubscribe if connection or pattern changed
  if (state.currentConnectionId !== connectionId || state.currentPattern !== pattern) {
    if (state.unsub) { state.unsub(); state.unsub = null }

    const nodeId = ctx.nodeId
    state.unsub = connection.client.on(pattern, (value: Value) => {
      const s = gestureState.get(nodeId)
      if (!s || !value || typeof value !== 'object') return
      const v = value as Record<string, unknown>
      if (typeof v.x === 'number') s.x = v.x
      if (typeof v.y === 'number') s.y = v.y
      if (typeof v.pressure === 'number') s.pressure = v.pressure
      if (typeof v.phase === 'string') s.phase = v.phase
      if (typeof v.pointerType === 'string') s.pointerType = v.pointerType
      if (typeof v.gestureId === 'number') s.gestureId = v.gestureId
      s.updated = true
    })

    state.currentConnectionId = connectionId
    state.currentPattern = pattern
  }

  outputs.set('x', state.x)
  outputs.set('y', state.y)
  outputs.set('pressure', state.pressure)
  outputs.set('phase', state.phase)
  outputs.set('pointerType', state.pointerType)
  outputs.set('updated', state.updated)

  // Clear update flag after reading
  state.updated = false

  return outputs
}

// ============================================================================
// Video Node Disposal
// ============================================================================

function disposeClaspVideoReceiveNode(nodeId: string): void {
  const state = videoReceiveState.get(nodeId)
  if (!state) return

  if (state.presenceUnsub) state.presenceUnsub()
  if (state.streamUnsub) state.streamUnsub()
  if (state.decoder && state.decoder.state !== 'closed') {
    try { state.decoder.close() } catch { /* ignore */ }
  }
  state.assembler.clear()
  state.texture.dispose()
  videoReceiveState.delete(nodeId)
}

function disposeClaspVideoSendNode(nodeId: string): void {
  stopVideoSend(nodeId)
  videoSendState.delete(nodeId)
}

function disposeClaspGestureNode(nodeId: string): void {
  const state = gestureState.get(nodeId)
  if (!state) return
  if (state.unsub) state.unsub()
  gestureState.delete(nodeId)
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
    sub.unsubscribe()

    const connection = claspConnections.get(sub.connectionId)
    if (connection) {
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

  // Clean up video/gesture state
  disposeClaspVideoReceiveNode(nodeId)
  disposeClaspVideoSendNode(nodeId)
  disposeClaspGestureNode(nodeId)
}

/**
 * Dispose all CLASP connections
 */
export function disposeAllClaspConnections(): void {
  // Dispose all video/gesture state
  for (const nodeId of videoReceiveState.keys()) {
    disposeClaspVideoReceiveNode(nodeId)
  }
  for (const nodeId of videoSendState.keys()) {
    disposeClaspVideoSendNode(nodeId)
  }
  for (const nodeId of gestureState.keys()) {
    disposeClaspGestureNode(nodeId)
  }
  videoReceiveState.clear()
  videoSendState.clear()
  gestureState.clear()

  for (const [, connection] of claspConnections) {
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
      session: connection.client?.session ?? null,
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
  'clasp-video-receive': claspVideoReceiveExecutor,
  'clasp-video-send': claspVideoSendExecutor,
  'clasp-gesture': claspGestureExecutor,
}
