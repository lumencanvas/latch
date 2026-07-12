// All audio nodes are co-located at registry/audio/<id>/node.ts (ROADMAP Phase 6),
// discovered by the nodeRegistry glob. Barrel kept (allNodes.ts imports `audioNodes`).
import type { NodeDefinition } from '../types'

export const audioNodes: NodeDefinition[] = []
