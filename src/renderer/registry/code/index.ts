// All code nodes are co-located at registry/code/<id>/node.ts (Phase 6), discovered by
// the nodeRegistry glob. Barrel kept (allNodes.ts imports `codeNodes`) but now empty.
import type { NodeDefinition } from '../types'

export const codeNodes: NodeDefinition[] = []
