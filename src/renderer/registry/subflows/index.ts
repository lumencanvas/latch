// All subflows nodes are co-located at registry/subflows/<id>/node.ts (ROADMAP Phase 6) and
// discovered by the nodeRegistry glob. This barrel is kept (allNodes.ts imports
// `subflowNodes`) but is now empty.
import type { NodeDefinition } from '../types'

export const subflowNodes: NodeDefinition[] = []
