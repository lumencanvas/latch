// All logic nodes are co-located at registry/logic/<id>/node.ts (Phase 6), discovered by
// the nodeRegistry glob. Barrel kept (allNodes.ts imports `logicNodes`) but now empty.
import type { NodeDefinition } from '../types'

export const logicNodes: NodeDefinition[] = []
