/**
 * Messaging Node Executors
 *
 * These executors handle the Send/Receive messaging system
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState, defineLifecycle } from '../nodeState'
import { risingEdge } from '../trigger'
import { messageBus } from '@/services/messaging/MessageBus'

// Per-node state (nodeId-keyed) — auto-cleaned via defineNodeState.
export const sendPrevValues = defineNodeState<unknown>({ label: 'send' })
export const activeReceiveNodes = defineNodeState<true>({ label: 'receive-active' })
// Last channel value each Receive node observed — lets `changed` fire on the NEXT frame when
// the receiver happened to execute before the sender (unwired, so topo order is arbitrary)
// and the bus's per-frame change flag was cleared before the receiver ever saw it.
export const receiveLastSeen = defineNodeState<{ v: unknown }>({ label: 'receive-last-seen' })

// Channel-keyed (NOT nodeId-keyed), so it can't be a defineNodeState; its cleanup
// + the message-bus side effects + the end-of-frame flush ride the generic loop
// via the defineLifecycle below.
const receiveProcessed = new Map<string, Map<string, boolean>>()

/** Drop receiveProcessed entries for nodes no longer in the graph. */
function gcReceiveProcessed(validNodeIds: Set<string>): void {
  for (const [, processed] of receiveProcessed) {
    for (const id of processed.keys()) if (!validNodeIds.has(id)) processed.delete(id)
  }
}

/** End-of-frame: reset change flags + per-node processed markers so the next
 *  frame can detect new changes. */
function endMessagingFrame(): void {
  for (const channel of messageBus.getChannels()) messageBus.clearChangeFlag(channel)
  for (const [, processed] of receiveProcessed) processed.clear()
}

// sendPrevValues + activeReceiveNodes clean via their own stores; this lifecycle
// covers the channel-keyed receiveProcessed map and the message-bus side effects.
defineLifecycle({
  label: 'messaging-bus',
  gc: gcReceiveProcessed,
  disposeAll: () => {
    receiveProcessed.clear()
    messageBus.clear()
  },
  endFrame: endMessagingFrame,
})

/**
 * Full reset, for tests / explicit teardown. Production cleanup runs through the
 * generic lifecycle loop (the stores + the messaging-bus lifecycle above), so the
 * engine no longer calls this.
 */
export function disposeAllMessagingState(): void {
  sendPrevValues.disposeAll()
  activeReceiveNodes.disposeAll()
  receiveLastSeen.disposeAll()
  receiveProcessed.clear()
  messageBus.clear()
}

/** Full per-node GC, for tests / explicit teardown (see disposeAllMessagingState). */
export function gcMessagingState(validNodeIds: Set<string>): void {
  sendPrevValues.gc(validNodeIds)
  activeReceiveNodes.gc(validNodeIds)
  receiveLastSeen.gc(validNodeIds)
  gcReceiveProcessed(validNodeIds)
}

// ============================================================================
// Send Node
// ============================================================================

export const sendExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const channel = (ctx.controls.get('channel') as string) ?? 'default'
  const sendOnChange = (ctx.controls.get('sendOnChange') as boolean) ?? true

  // Rising edge only — a level test re-sent on every frame the trigger was held high.
  const hasTrigger = risingEdge(ctx.nodeId, 'trigger', ctx.inputs.get('trigger'))

  // Check for value change
  const prevValue = sendPrevValues.get(ctx.nodeId)
  const valueChanged = value !== undefined && value !== prevValue

  // Send if triggered or if value changed and sendOnChange is enabled
  if (hasTrigger || (sendOnChange && valueChanged)) {
    if (value !== undefined) {
      messageBus.send(channel, value)
      sendPrevValues.set(ctx.nodeId, value)
    }
  }

  // Send nodes have no outputs
  return new Map()
}

// ============================================================================
// Receive Node
// ============================================================================

export const receiveExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const channel = (ctx.controls.get('channel') as string) ?? 'default'

  // Register this receive node as active
  activeReceiveNodes.set(ctx.nodeId, true)

  const outputs = new Map<string, unknown>()
  const value = messageBus.get(channel)

  outputs.set('value', value)

  // Check if this specific receive node has processed this change
  let nodeProcessed = receiveProcessed.get(channel)
  if (!nodeProcessed) {
    nodeProcessed = new Map()
    receiveProcessed.set(channel, nodeProcessed)
  }

  const hasChanged = messageBus.hasChanged(channel)
  const alreadyProcessed = nodeProcessed.get(ctx.nodeId) ?? false
  const last = receiveLastSeen.get(ctx.nodeId)
  receiveLastSeen.set(ctx.nodeId, { v: value })
  // A value that moved since this receiver last looked also counts (covers receiver-before-
  // sender ordering, where the flag set this frame is cleared before we run next frame).
  const missedChange = last !== undefined && last.v !== value

  if ((hasChanged && !alreadyProcessed) || missedChange) {
    outputs.set('changed', 1)
    nodeProcessed.set(ctx.nodeId, true)
  } else {
    outputs.set('changed', 0)
  }

  // Only clear the change flag at the end of a frame (after all receivers have run)
  // We detect this by checking if we're the last registered receiver to process
  // For now, we use a simpler heuristic: clear on frameCount change
  // The change flags will be reset at the start of next frame via the cleanup
  // This is handled by the frame boundary detection in the send executor

  return outputs
}

// `send`/`receive` are co-located (registry/messaging/<id>/node.ts) and import their
// executors from this module; there is no `messagingExecutors` map to register.
