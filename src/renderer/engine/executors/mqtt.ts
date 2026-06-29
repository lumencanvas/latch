/**
 * MQTT Executor
 *
 * MQTT node executor using the ConnectionManager pattern.
 * Handles subscription lifecycle per node with automatic cleanup on dispose.
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { useConnectionsStore } from '@/stores/connections'
import type { MqttAdapterImpl } from '@/services/connections/adapters/MqttAdapter'
import { defineNodeState } from '../nodeState'

// State cache for subscribed values per node. Auto-gc'd via the generic lifecycle loop.
export const mqttState = defineNodeState<{
  lastMessage: unknown
  lastTopic: string | null
}>({ label: 'mqtt' })

// Active subscription per node. The dispose callback is the FULL teardown — release the
// message listener AND unsubscribe the adapter from the topic (matching the old
// disposeMqttNode) — so engine gc / stop() / the topic-cleared .delete() all run it.
export const nodeSubscriptions = defineNodeState<{
  connectionId: string
  topic: string
  unsubscribe: () => void
}>({
  label: 'mqtt-subscriptions',
  dispose: (sub) => {
    sub.unsubscribe()
    try {
      getMqttAdapter(sub.connectionId)?.unsubscribe(sub.topic)
    } catch {
      // Ignore errors during cleanup
    }
  },
})

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
    // Release only the old message listener — the adapter subscription is replaced by
    // subscribe() below, so we deliberately do NOT adapter.unsubscribe here (preserves
    // the original rewire behavior). NOT .delete(): that would run the full-teardown
    // dispose (adapter.unsubscribe too); the .set() below overwrites the stale entry.
    if (existingSub) {
      existingSub.unsubscribe()
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

  // Handle unsubscribe when topic is cleared — full teardown via the dispose callback
  // (.delete() runs unsubscribe + adapter.unsubscribe for the subscription's own
  // connection, consistent with node-removal teardown).
  if (!topic && existingSub) {
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

// The engine drains both stores through its generic lifecycle loop (the
// `nodeSubscriptions` dispose callback does the full unsubscribe + adapter.unsubscribe);
// the helpers below are thin store-backed wrappers kept for tests + the index re-export.

/** Dispose one MQTT node's subscription (unsubscribe + adapter.unsubscribe) + cache. */
export function disposeMqttNode(nodeId: string): void {
  nodeSubscriptions.delete(nodeId) // dispose callback does the full teardown
  mqttState.delete(nodeId)
}

/** Dispose all MQTT node resources (test/teardown helper). */
export function disposeAllMqttNodes(): void {
  nodeSubscriptions.disposeAll() // full teardown per entry
  mqttState.disposeAll()
}

/** Garbage-collect MQTT state for removed nodes (test helper). */
export function gcMqttState(validNodeIds: Set<string>): void {
  nodeSubscriptions.gc(validNodeIds)
  mqttState.gc(validNodeIds)
}
