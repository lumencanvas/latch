export { stringConcatNode } from './concat'
export { stringSplitNode } from './split'
export { stringReplaceNode } from './replace'
export { stringSliceNode } from './slice'
export { stringCaseNode } from './case'

import { stringConcatNode } from './concat'
import { stringSplitNode } from './split'
import { stringReplaceNode } from './replace'
import { stringSliceNode } from './slice'
import { stringCaseNode } from './case'
import type { NodeDefinition } from '../types'

export const stringNodes: NodeDefinition[] = [
  stringConcatNode,
  stringSplitNode,
  stringReplaceNode,
  stringSliceNode,
  stringCaseNode,
]
