/**
 * Node executors registry
 * Each executor is a function that takes an ExecutionContext and returns outputs
 */

import type { NodeExecutorFn } from '../ExecutionEngine'
import { disposeClaspNode, disposeAllClaspConnections, getClaspConnectionStatus } from './clasp'
import { disposeMqttNode, disposeAllMqttNodes, gcMqttState } from './mqtt'
import { disposeWebSocketNode, disposeAllWebSocketNodes, gcWebSocketState } from './websocket'
import { disposeHttpNode, disposeAllHttpNodes, gcHttpState } from './http'
import { subflowExecutors } from './subflow'
import { gcEmulationState, disposeAllEmulationNodes } from './emulation'
import { colocatedExecutors } from '@/registry/nodeRegistry'

// Re-export CLASP utilities for external use
export { disposeClaspNode, disposeAllClaspConnections, getClaspConnectionStatus }

// Re-export new connection executor utilities
export { disposeMqttNode, disposeAllMqttNodes, gcMqttState }
export { disposeWebSocketNode, disposeAllWebSocketNodes, gcWebSocketState }
export { disposeHttpNode, disposeAllHttpNodes, gcHttpState }

// Re-export emulation executor state cleanup
export { gcEmulationState, disposeAllEmulationNodes }

// Re-export the extracted node-group modules so the public barrel
// (@/engine/executors) keeps exposing their executors + state stores.
export * from './input'
export * from './math'
// `smooth` (def + executor + its `smoothState` store) is co-located; re-export the
// store + executor so the governed public-export contract still resolves them here.
export { smoothState, smoothExecutor } from '@/registry/math/smooth/node'
export * from './logic'
export * from './timing'
export * from './debug'
export * from './rag'
export * from './webllm'

// ============================================================================
// Registry
// ============================================================================

export const builtinExecutors: Record<string, NodeExecutorFn> = {
  // Every built-in node (all 241) is co-located at registry/<cat>/<node>/node.ts and
  // registers its executor here via the glob (Phase 6 complete).
  ...colocatedExecutors,

  // The ONE exception: the `subflow` instance node is dynamically instantiated and has no
  // NodeDefinition (so it isn't glob-discovered) — it stays keyed in the subflow module's map.
  ...subflowExecutors,
}
