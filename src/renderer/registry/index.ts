/**
 * Node Registry
 *
 * Central registry for all node definitions in LATCH.
 * This module initializes all built-in nodes when the application starts.
 */

import { useNodesStore } from '@/stores/nodes'

// Import node arrays from each category
import { inputNodes } from './inputs'
import { debugNodes } from './debug'
import { mathNodes } from './math'
import { timingNodes } from './timing'
import { logicNodes } from './logic'
import { audioNodes } from './audio'
import { visualNodes } from './visual'
import { aiNodes } from './ai'
import { connectivityNodes } from './connectivity'
import { claspNodes } from './clasp'
import { dataNodes } from './data'
import { codeNodes } from './code'
import { subflowNodes } from './subflows'
import { threeDNodes } from './3d'
import { outputNodes } from './outputs'
import { stringNodes } from './string'
import { messagingNodes } from './messaging'

// Combine all nodes into a single array
export const allNodes = [
  ...inputNodes,
  ...debugNodes,
  ...mathNodes,
  ...timingNodes,
  ...logicNodes,
  ...audioNodes,
  ...visualNodes,
  ...aiNodes,
  ...connectivityNodes,
  ...claspNodes,
  ...dataNodes,
  ...codeNodes,
  ...subflowNodes,
  ...threeDNodes,
  ...outputNodes,
  ...stringNodes,
  ...messagingNodes,
]

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
