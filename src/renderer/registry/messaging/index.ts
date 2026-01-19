export { sendNode } from './send'
export { receiveNode } from './receive'

import { sendNode } from './send'
import { receiveNode } from './receive'
import type { NodeDefinition } from '../types'

export const messagingNodes: NodeDefinition[] = [
  sendNode,
  receiveNode,
]
