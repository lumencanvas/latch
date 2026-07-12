// The array-* / object-* / type-conversion data nodes are co-located in
// registry/data/<node>/node.ts (Phase 6). Remaining here: the cross-file / stateful /
// service-backed nodes (json-parse/json-stringify → connectivity.ts executors,
// router → utility.ts, debounce/throttle → stateful, texture-to-data → visual service).
export { jsonParseNode } from './json-parse'
export { jsonStringifyNode } from './json-stringify'
export { textureToDataNode } from './texture-to-data'
export { routerNode } from './router'
export { debounceNode } from './debounce'
export { throttleNode } from './throttle'

import { jsonParseNode } from './json-parse'
import { jsonStringifyNode } from './json-stringify'
import { textureToDataNode } from './texture-to-data'
import { routerNode } from './router'
import { debounceNode } from './debounce'
import { throttleNode } from './throttle'
import type { NodeDefinition } from '../types'

export const dataNodes: NodeDefinition[] = [
  jsonParseNode,
  jsonStringifyNode,
  textureToDataNode,
  routerNode,
  debounceNode,
  throttleNode,
]
