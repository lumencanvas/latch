// compare / and / or / not / select / switch are co-located in
// registry/logic/<node>/node.ts (Phase 6).
export { gateNode } from './gate'
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
export { dispatchNode } from './dispatch'

import { gateNode } from './gate'
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
  gateNode,
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
