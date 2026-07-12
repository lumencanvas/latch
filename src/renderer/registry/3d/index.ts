// All 3d nodes are co-located at registry/3d/<id>/node.ts (ROADMAP Phase 6) and
// discovered by the nodeRegistry glob. This barrel is kept (allNodes.ts imports
// `threeDNodes`) but is now empty.
import type { NodeDefinition } from '../types'

export const threeDNodes: NodeDefinition[] = []
