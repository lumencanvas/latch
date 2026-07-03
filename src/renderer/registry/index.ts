/**
 * Node Registry
 *
 * Central registry for all node definitions in LATCH.
 * This module initializes all built-in nodes when the application starts.
 */

import { useNodesStore } from '@/stores/nodes'
import { allNodes } from './allNodes'

// Re-export the aggregated definition list (moved to ./allNodes to keep components.ts acyclic).
export { allNodes }

/**
 * Initialize the node registry by registering all built-in nodes.
 * Call this once at application startup.
 */
export function initializeNodeRegistry() {
  const nodesStore = useNodesStore()

  for (const node of allNodes) {
    nodesStore.register(node)
  }

  console.log(`[Registry] Registered ${allNodes.length} nodes`)
}

// Re-export types
export * from './types'

// Re-export node types component mapping
export { nodeTypes } from './components'
