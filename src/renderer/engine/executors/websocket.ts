/**
 * WebSocket Executor
 *
 * WebSocket node executor using the ConnectionManager pattern.
 * Handles message listener lifecycle per node with automatic cleanup on dispose.
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import type { WebSocketHandle } from '@/services/connections/ConnectionHandle'
import { defineNodeState } from '../nodeState'

// Per-node received-message cache. Auto-gc'd via the engine's generic lifecycle loop.
export const wsState = defineNodeState<{
  lastMessage: unknown
}>({ label: 'websocket' })

// Active message listener per node. The dispose callback unsubscribes — that IS the
// resource teardown — so engine gc, stop(), and a rewire .delete() all release it.
export const nodeListeners = defineNodeState<{
  connectionId: string
  unsubscribe: () => void
}>({ label: 'websocket-listeners', dispose: (l) => l.unsubscribe() })

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

  // Resolve the no-secret WebSocket handle (broker holds the credential); auto-connects
  // with a shared throttle. Null when the connection is unavailable or not WebSocket.
  const conn = ctx.connection<WebSocketHandle>({ protocol: 'websocket' })

  if (!conn) {
    outputs.set('message', state.lastMessage)
    outputs.set('connected', false)
    outputs.set('error', 'Connection not found or not available')
    return outputs
  }

  const isConnected = conn.status === 'connected'

  if (!isConnected) {
    outputs.set('message', state.lastMessage)
    outputs.set('connected', false)
    outputs.set('error', 'Not connected')
    return outputs
  }

  // Check if we need to update message listener
  const existingListener = nodeListeners.get(ctx.nodeId)

  if (!existingListener || existingListener.connectionId !== connectionId) {
    // Release the old listener. `.delete()` runs the dispose callback (unsubscribe),
    // so we must NOT unsubscribe manually too — that would double-fire.
    if (existingListener) {
      nodeListeners.delete(ctx.nodeId)
    }

    // Set up new message listener
    const unsubscribe = conn.onMessage((message) => {
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
      await conn.send(sendData)
    } catch (e) {
      console.error('[WebSocket] Send error:', e)
    }
  }

  outputs.set('message', state.lastMessage)
  outputs.set('connected', isConnected)
  outputs.set('error', null)

  return outputs
}

// The engine now drains both stores through its generic lifecycle loop (the
// `nodeListeners` dispose callback unsubscribes); the helpers below are thin
// store-backed wrappers retained for tests and the index barrel re-export.

/** Dispose one WebSocket node's listener (unsubscribe) + message cache. */
export function disposeWebSocketNode(nodeId: string): void {
  nodeListeners.delete(nodeId) // dispose callback unsubscribes
  wsState.delete(nodeId)
}

/** Dispose all WebSocket node resources (test/teardown helper). */
export function disposeAllWebSocketNodes(): void {
  nodeListeners.disposeAll() // unsubscribes each
  wsState.disposeAll()
}

/** Garbage-collect WebSocket state for removed nodes (test helper). */
export function gcWebSocketState(validNodeIds: Set<string>): void {
  nodeListeners.gc(validNodeIds)
  wsState.gc(validNodeIds)
}
