// All string nodes are co-located in registry/string/<node>/node.ts (Phase 6),
// discovered by the nodeRegistry glob. This barrel is now empty — kept so
// `allNodes.ts` can keep importing `stringNodes` until the legacy union is retired.
import type { NodeDefinition } from '../types'

export const stringNodes: NodeDefinition[] = []
