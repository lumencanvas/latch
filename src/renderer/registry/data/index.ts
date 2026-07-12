// The array-* / object-* / type-conversion data nodes are co-located in
// registry/data/<node>/node.ts (Phase 6). Remaining here: the cross-file / stateful /
// service-backed nodes (json-parse/json-stringify → connectivity.ts executors,
// router → utility.ts, debounce/throttle → stateful, texture-to-data → visual service).

import type { NodeDefinition } from '../types'

export const dataNodes: NodeDefinition[] = [
]
