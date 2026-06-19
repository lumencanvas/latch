/**
 * MQTT Executor
 *
 * MQTT node executor using the ConnectionManager pattern.
 * Handles subscription lifecycle per node with automatic cleanup on dispose.
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { useConnectionsStore } from '@/stores/connections'
import type { MqttAdapterImpl } from '@/services/connections/adapters/MqttAdapter'

// State cache for subscribed values per node
const mqttState = new Map<string, {
  lastMessage: unknown
  lastTopic: string | null
}>()

// Track active subscriptions per node
const nodeSubscriptions = new Map<string, {
  connectionId: string
  topic: string
  unsubscribe: () => void
}>()

/**
 * Get MQTT adapter from ConnectionManager
 */
function getMqttAdapter(connectionId: string): MqttAdapterImpl | null {
  if (!connectionId) return null

  try {
    const connectionsStore = useConnectionsStore()
    const adapter = connectionsStore.getAdapter(connectionId)

    if (adapter && adapter.protocol === 'mqtt') {
      return adapter as MqttAdapterImpl
    }
  } catch (e) {
    console.warn('[MQTT] Could not get adapter:', e)
  }

  return null
}

// Throttle auto-connect attempts per connection so a persistently-failing
// connection isn't re-dialed every frame (~60×/s). Reset on success.
const lastConnectAttempt = new Map<string, number>()
const RECONNECT_THROTTLE_MS = 2000

/**
 * Ensure connection is established
 */
async function ensureConnected(connectionId: string): Promise<MqttAdapterImpl | null> {
  const adapter = getMqttAdapter(connectionId)
  if (!adapter) return null

  if (adapter.status !== 'connected') {
    const now = Date.now()
    if (now - (lastConnectAttempt.get(connectionId) ?? 0) >= RECONNECT_THROTTLE_MS) {
      lastConnectAttempt.set(connectionId, now)
      try {
        const connectionsStore = useConnectionsStore()
        await connectionsStore.connect(connectionId)
      } catch (e) {
        console.warn('[MQTT] Auto-connect failed:', e)
        return null
      }
    }
  } else {
    lastConnectAttempt.delete(connectionId)
  }

  return adapter
}

/**
 * MQTT Node Executor
 */
export const mqttExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const connectionId = (ctx.inputs.get('connectionId') as string) ?? (ctx.controls.get('connectionId') as string) ?? ''
  const topic = (ctx.inputs.get('topic') as string) ?? (ctx.controls.get('topic') as string) ?? ''
  const publishData = ctx.inputs.get('publish')
  const trigger = ctx.inputs.get('trigger') as boolean | undefined
  const qos = (ctx.controls.get('qos') as 0 | 1 | 2) ?? 0

  const outputs = new Map<string, unknown>()

  // Initialize state for this node
  if (!mqttState.has(ctx.nodeId)) {
    mqttState.set(ctx.nodeId, { lastMessage: null, lastTopic: null })
  }
  const state = mqttState.get(ctx.nodeId)!

  // Skip if no connection selected
  if (!connectionId) {
    outputs.set('message', state.lastMessage)
    outputs.set('topic', state.lastTopic)
    outputs.set('connected', false)
    outputs.set('error', 'No connection selected')
    return outputs
  }

  // Get adapter
  const adapter = await ensureConnected(connectionId)

  if (!adapter) {
    outputs.set('message', state.lastMessage)
    outputs.set('topic', state.lastTopic)
    outputs.set('connected', false)
    outputs.set('error', 'Connection not found or not available')
    return outputs
  }

  const isConnected = adapter.status === 'connected'

  if (!isConnected) {
    outputs.set('message', state.lastMessage)
    outputs.set('topic', state.lastTopic)
    outputs.set('connected', false)
    outputs.set('error', 'Not connected')
    return outputs
  }

  // Check if we need to update subscription
  const existingSub = nodeSubscriptions.get(ctx.nodeId)

  if (topic && (!existingSub || existingSub.connectionId !== connectionId || existingSub.topic !== topic)) {
    // Unsubscribe from old topic
    if (existingSub) {
      existingSub.unsubscribe()
      nodeSubscriptions.delete(ctx.nodeId)
    }

    // Subscribe to new topic
    adapter.subscribe(topic, qos)

    // Set up message listener
    const unsubscribe = adapter.onMessage((message) => {
      if (message.topic === topic || (topic.includes('#') || topic.includes('+'))) {
        // For wildcard topics, check if the message matches the pattern
        const matches = matchMqttTopic(topic, message.topic ?? '')
        if (matches) {
          const nodeState = mqttState.get(ctx.nodeId)
          if (nodeState) {
            nodeState.lastMessage = message.data
            nodeState.lastTopic = message.topic ?? null
          }
        }
      }
    })

    nodeSubscriptions.set(ctx.nodeId, { connectionId, topic, unsubscribe })
  }

  // Handle unsubscribe when topic is cleared
  if (!topic && existingSub) {
    existingSub.unsubscribe()
    adapter.unsubscribe(existingSub.topic)
    nodeSubscriptions.delete(ctx.nodeId)
  }

  // Publish message when triggered
  if (trigger && publishData !== undefined && topic && isConnected) {
    try {
      adapter.publish(topic, publishData, { qos })
    } catch (e) {
      console.error('[MQTT] Publish error:', e)
    }
  }

  outputs.set('message', state.lastMessage)
  outputs.set('topic', state.lastTopic)
  outputs.set('connected', isConnected)
  outputs.set('error', null)

  return outputs
}

/**
 * Match MQTT topic with wildcard pattern
 */
function matchMqttTopic(pattern: string, topic: string): boolean {
  if (pattern === topic) return true
  if (pattern === '#') return true

  const patternParts = pattern.split('/')
  const topicParts = topic.split('/')

  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]

    if (p === '#') {
      // # matches all remaining levels
      return true
    }

    if (p === '+') {
      // + matches exactly one level
      if (i >= topicParts.length) return false
      continue
    }

    if (p !== topicParts[i]) {
      return false
    }
  }

  return patternParts.length === topicParts.length
}

/**
 * Dispose MQTT node and clean up resources
 */
export function disposeMqttNode(nodeId: string): void {
  // Clean up subscription
  const sub = nodeSubscriptions.get(nodeId)
  if (sub) {
    sub.unsubscribe()

    // Try to unsubscribe from the adapter
    try {
      const adapter = getMqttAdapter(sub.connectionId)
      if (adapter) {
        adapter.unsubscribe(sub.topic)
      }
    } catch {
      // Ignore errors during cleanup
    }

    nodeSubscriptions.delete(nodeId)
  }

  // Clean up state
  mqttState.delete(nodeId)
}

/**
 * Dispose all MQTT node resources
 */
export function disposeAllMqttNodes(): void {
  for (const [, sub] of nodeSubscriptions) {
    sub.unsubscribe()

    try {
      const adapter = getMqttAdapter(sub.connectionId)
      if (adapter) {
        adapter.unsubscribe(sub.topic)
      }
    } catch {
      // Ignore errors during cleanup
    }
  }

  nodeSubscriptions.clear()
  mqttState.clear()
}

/**
 * Garbage collect MQTT state for removed nodes
 */
export function gcMqttState(validNodeIds: Set<string>): void {
  for (const nodeId of mqttState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposeMqttNode(nodeId)
    }
  }
}
