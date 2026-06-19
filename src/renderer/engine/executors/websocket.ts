/**
 * WebSocket Executor
 *
 * WebSocket node executor using the ConnectionManager pattern.
 * Handles message listener lifecycle per node with automatic cleanup on dispose.
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { useConnectionsStore } from '@/stores/connections'
import type { WebSocketAdapterImpl } from '@/services/connections/adapters/WebSocketAdapter'

// State cache for received messages per node
const wsState = new Map<string, {
  lastMessage: unknown
}>()

// Track active message listeners per node
const nodeListeners = new Map<string, {
  connectionId: string
  unsubscribe: () => void
}>()

/**
 * Get WebSocket adapter from ConnectionManager
 */
function getWebSocketAdapter(connectionId: string): WebSocketAdapterImpl | null {
  if (!connectionId) return null

  try {
    const connectionsStore = useConnectionsStore()
    const adapter = connectionsStore.getAdapter(connectionId)

    if (adapter && adapter.protocol === 'websocket') {
      return adapter as WebSocketAdapterImpl
    }
  } catch (e) {
    console.warn('[WebSocket] Could not get adapter:', e)
  }

  return null
}

/**
 * Ensure connection is established
 */
// Throttle auto-connect attempts per connection so a persistently-failing
// connection isn't re-dialed every frame (~60×/s). Reset on success.
const lastConnectAttempt = new Map<string, number>()
const RECONNECT_THROTTLE_MS = 2000

async function ensureConnected(connectionId: string): Promise<WebSocketAdapterImpl | null> {
  const adapter = getWebSocketAdapter(connectionId)
  if (!adapter) return null

  if (adapter.status !== 'connected') {
    const now = Date.now()
    if (now - (lastConnectAttempt.get(connectionId) ?? 0) >= RECONNECT_THROTTLE_MS) {
      lastConnectAttempt.set(connectionId, now)
      try {
        const connectionsStore = useConnectionsStore()
        await connectionsStore.connect(connectionId)
      } catch (e) {
        console.warn('[WebSocket] Auto-connect failed:', e)
        return null
      }
    }
  } else {
    lastConnectAttempt.delete(connectionId)
  }

  return adapter
}

/**
 * WebSocket Node Executor
 */
export const websocketExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? ''
  const sendData = ctx.inputs.get('send')
  const trigger = ctx.inputs.get('trigger') as boolean | undefined

  const outputs = new Map<string, unknown>()

  // Initialize state for this node
  if (!wsState.has(ctx.nodeId)) {
    wsState.set(ctx.nodeId, { lastMessage: null })
  }
  const state = wsState.get(ctx.nodeId)!

  // Skip if no connection selected
  if (!connectionId) {
    outputs.set('message', state.lastMessage)
    outputs.set('connected', false)
    outputs.set('error', 'No connection selected')
    return outputs
  }

  // Get adapter
  const adapter = await ensureConnected(connectionId)

  if (!adapter) {
    outputs.set('message', state.lastMessage)
    outputs.set('connected', false)
    outputs.set('error', 'Connection not found or not available')
    return outputs
  }

  const isConnected = adapter.status === 'connected'

  if (!isConnected) {
    outputs.set('message', state.lastMessage)
    outputs.set('connected', false)
    outputs.set('error', 'Not connected')
    return outputs
  }

  // Check if we need to update message listener
  const existingListener = nodeListeners.get(ctx.nodeId)

  if (!existingListener || existingListener.connectionId !== connectionId) {
    // Unsubscribe from old listener
    if (existingListener) {
      existingListener.unsubscribe()
      nodeListeners.delete(ctx.nodeId)
    }

    // Set up new message listener
    const unsubscribe = adapter.onMessage((message) => {
      const nodeState = wsState.get(ctx.nodeId)
      if (nodeState) {
        nodeState.lastMessage = message.data
      }
    })

    nodeListeners.set(ctx.nodeId, { connectionId, unsubscribe })
  }

  // Send data when triggered
  if (trigger && sendData !== undefined && isConnected) {
    try {
      await adapter.send(sendData)
    } catch (e) {
      console.error('[WebSocket] Send error:', e)
    }
  }

  outputs.set('message', state.lastMessage)
  outputs.set('connected', isConnected)
  outputs.set('error', null)

  return outputs
}

/**
 * Dispose WebSocket node and clean up resources
 */
export function disposeWebSocketNode(nodeId: string): void {
  // Clean up message listener
  const listener = nodeListeners.get(nodeId)
  if (listener) {
    listener.unsubscribe()
    nodeListeners.delete(nodeId)
  }

  // Clean up state
  wsState.delete(nodeId)
}

/**
 * Dispose all WebSocket node resources
 */
export function disposeAllWebSocketNodes(): void {
  for (const [, listener] of nodeListeners) {
    listener.unsubscribe()
  }

  nodeListeners.clear()
  wsState.clear()
}

/**
 * Garbage collect WebSocket state for removed nodes
 */
export function gcWebSocketState(validNodeIds: Set<string>): void {
  for (const nodeId of wsState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposeWebSocketNode(nodeId)
    }
  }
}
