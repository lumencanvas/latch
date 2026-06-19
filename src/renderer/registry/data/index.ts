export { jsonParseNode } from './json-parse'
export { jsonStringifyNode } from './json-stringify'
export { textureToDataNode } from './texture-to-data'
// Array operations
export { arrayLengthNode } from './array-length'
export { arrayGetNode } from './array-get'
export { arrayFirstLastNode } from './array-first-last'
export { arrayContainsNode } from './array-contains'
export { arraySliceNode } from './array-slice'
export { arrayJoinNode } from './array-join'
export { arrayReverseNode } from './array-reverse'
export { arrayPushNode } from './array-push'
export { arrayFilterNullsNode } from './array-filter-nulls'
export { arrayUniqueNode } from './array-unique'
export { arraySortNode } from './array-sort'
export { arrayRangeNode } from './array-range'
// Object operations
export { objectGetNode } from './object-get'
export { objectSetNode } from './object-set'
export { objectKeysNode } from './object-keys'
export { objectValuesNode } from './object-values'
export { objectHasNode } from './object-has'
export { objectMergeNode } from './object-merge'
export { objectCreateNode } from './object-create'
export { objectEntriesNode } from './object-entries'
// Flow control
export { routerNode } from './router'
export { debounceNode } from './debounce'
export { throttleNode } from './throttle'
// Type conversion
export { toStringNode } from './to-string'
export { toNumberNode } from './to-number'
export { toBooleanNode } from './to-boolean'
export { parseIntNode } from './parse-int'
export { parseFloatNode } from './parse-float'
export { toArrayNode } from './to-array'
export { formatNumberNode } from './format-number'

import { jsonParseNode } from './json-parse'
import { jsonStringifyNode } from './json-stringify'
import { textureToDataNode } from './texture-to-data'
// Array operations
import { arrayLengthNode } from './array-length'
import { arrayGetNode } from './array-get'
import { arrayFirstLastNode } from './array-first-last'
import { arrayContainsNode } from './array-contains'
import { arraySliceNode } from './array-slice'
import { arrayJoinNode } from './array-join'
import { arrayReverseNode } from './array-reverse'
import { arrayPushNode } from './array-push'
import { arrayFilterNullsNode } from './array-filter-nulls'
import { arrayUniqueNode } from './array-unique'
import { arraySortNode } from './array-sort'
import { arrayRangeNode } from './array-range'
// Object operations
import { objectGetNode } from './object-get'
import { objectSetNode } from './object-set'
import { objectKeysNode } from './object-keys'
import { objectValuesNode } from './object-values'
import { objectHasNode } from './object-has'
import { objectMergeNode } from './object-merge'
import { objectCreateNode } from './object-create'
import { objectEntriesNode } from './object-entries'
// Flow control
import { routerNode } from './router'
import { debounceNode } from './debounce'
import { throttleNode } from './throttle'
// Type conversion
import { toStringNode } from './to-string'
import { toNumberNode } from './to-number'
import { toBooleanNode } from './to-boolean'
import { parseIntNode } from './parse-int'
import { parseFloatNode } from './parse-float'
import { toArrayNode } from './to-array'
import { formatNumberNode } from './format-number'
import type { NodeDefinition } from '../types'

export const dataNodes: NodeDefinition[] = [
  jsonParseNode,
  jsonStringifyNode,
  textureToDataNode,
  // Array operations
  arrayLengthNode,
  arrayGetNode,
  arrayFirstLastNode,
  arrayContainsNode,
  arraySliceNode,
  arrayJoinNode,
  arrayReverseNode,
  arrayPushNode,
  arrayFilterNullsNode,
  arrayUniqueNode,
  arraySortNode,
  arrayRangeNode,
  // Object operations
  objectGetNode,
  objectSetNode,
  objectKeysNode,
  objectValuesNode,
  objectHasNode,
  objectMergeNode,
  objectCreateNode,
  objectEntriesNode,
  // Flow control
  routerNode,
  debounceNode,
  throttleNode,
  // Type conversion
  toStringNode,
  toNumberNode,
  toBooleanNode,
  parseIntNode,
  parseFloatNode,
  toArrayNode,
  formatNumberNode,
]
