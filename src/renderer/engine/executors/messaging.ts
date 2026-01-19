/**
 * Messaging Node Executors
 *
 * These executors handle the Send/Receive messaging system
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { messageBus } from '@/services/messaging/MessageBus'

// Track previous values for change detection in send nodes
const sendPrevValues = new Map<string, unknown>()

// Track which receive nodes have processed the change
const receiveProcessed = new Map<string, Map<string, boolean>>()

// Track active receive nodes for proper change detection
const activeReceiveNodes = new Set<string>()

/**
 * Clean up state for a specific node
 */
export function disposeMessagingNode(nodeId: string): void {
  sendPrevValues.delete(nodeId)
  activeReceiveNodes.delete(nodeId)
  // Clean up any processed entries for this node
  for (const [, processed] of receiveProcessed) {
    processed.delete(nodeId)
  }
}

/**
 * Clean up all messaging state (called when execution stops)
 */
export function disposeAllMessagingState(): void {
  sendPrevValues.clear()
  receiveProcessed.clear()
  activeReceiveNodes.clear()
  messageBus.clear()
}

/**
 * Called at the end of each frame to reset change tracking
 */
export function endMessagingFrame(): void {
  // Clear all change flags and processed markers at frame end
  for (const channel of messageBus.getChannels()) {
    messageBus.clearChangeFlag(channel)
  }
  // Clear processed flags so next frame can detect new changes
  for (const [, processed] of receiveProcessed) {
    processed.clear()
  }
}

// ============================================================================
// Send Node
// ============================================================================

export const sendExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const trigger = ctx.inputs.get('trigger')
  const channel = (ctx.controls.get('channel') as string) ?? 'default'
  const sendOnChange = (ctx.controls.get('sendOnChange') as boolean) ?? true

  // Check for trigger
  const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)

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
  activeReceiveNodes.add(ctx.nodeId)

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

  if (hasChanged && !alreadyProcessed) {
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

// ============================================================================
// Registry
// ============================================================================

export const messagingExecutors: Record<string, NodeExecutorFn> = {
  send: sendExecutor,
  receive: receiveExecutor,
}
