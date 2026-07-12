// All opencv nodes are co-located at registry/opencv/<id>/node.ts (ROADMAP Phase 6) and
// discovered by the nodeRegistry glob. This barrel is kept (allNodes.ts imports
// `opencvNodes`) but is now empty.
import type { NodeDefinition } from '../types'

export const opencvNodes: NodeDefinition[] = []
