export { compareNode } from './compare'
export { andNode } from './and'
export { orNode } from './or'
export { notNode } from './not'
export { gateNode } from './gate'
export { switchNode } from './switch'
export { selectNode } from './select'
// New value checking nodes
export { isNullNode } from './is-null'
export { isEmptyNode } from './is-empty'
export { passIfNode } from './pass-if'
export { defaultValueNode } from './default-value'
export { coalesceNode } from './coalesce'
export { equalsNode } from './equals'
export { changedNode } from './changed'
export { typeOfNode } from './type-of'
export { inRangeNode } from './in-range'
export { sampleHoldNode } from './sample-hold'
export { latchNode } from './latch'
export { matchValueNode } from './match-value'
export { dispatchNode, DispatchNode } from './dispatch'

import { compareNode } from './compare'
import { andNode } from './and'
import { orNode } from './or'
import { notNode } from './not'
import { gateNode } from './gate'
import { switchNode } from './switch'
import { selectNode } from './select'
// New value checking nodes
import { isNullNode } from './is-null'
import { isEmptyNode } from './is-empty'
import { passIfNode } from './pass-if'
import { defaultValueNode } from './default-value'
import { coalesceNode } from './coalesce'
import { equalsNode } from './equals'
import { changedNode } from './changed'
import { typeOfNode } from './type-of'
import { inRangeNode } from './in-range'
import { sampleHoldNode } from './sample-hold'
import { latchNode } from './latch'
import { matchValueNode } from './match-value'
import { dispatchNode } from './dispatch'
import type { NodeDefinition } from '../types'

export const logicNodes: NodeDefinition[] = [
  compareNode,
  andNode,
  orNode,
  notNode,
  gateNode,
  switchNode,
  selectNode,
  // New value checking nodes
  isNullNode,
  isEmptyNode,
  passIfNode,
  defaultValueNode,
  coalesceNode,
  equalsNode,
  changedNode,
  typeOfNode,
  inRangeNode,
  sampleHoldNode,
  latchNode,
  matchValueNode,
  dispatchNode,
]
