// All clasp nodes are co-located at registry/clasp/<id>/node.ts (ROADMAP Phase 6) and
// discovered by the nodeRegistry glob. This barrel is kept (allNodes.ts imports
// `claspNodes`) but is now empty.
import type { NodeDefinition } from '../types'

export const claspNodes: NodeDefinition[] = []
