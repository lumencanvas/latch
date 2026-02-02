export { claspConnectionNode } from './clasp-connection'
export { claspSubscribeNode } from './clasp-subscribe'
export { claspSetNode } from './clasp-set'
export { claspEmitNode } from './clasp-emit'
export { claspGetNode } from './clasp-get'
export { claspStreamNode } from './clasp-stream'
export { claspBundleNode } from './clasp-bundle'
export { claspVideoReceiveNode } from './clasp-video-receive'
export { claspVideoSendNode } from './clasp-video-send'
export { claspGestureNode } from './clasp-gesture'

import { claspConnectionNode } from './clasp-connection'
import { claspSubscribeNode } from './clasp-subscribe'
import { claspSetNode } from './clasp-set'
import { claspEmitNode } from './clasp-emit'
import { claspGetNode } from './clasp-get'
import { claspStreamNode } from './clasp-stream'
import { claspBundleNode } from './clasp-bundle'
import { claspVideoReceiveNode } from './clasp-video-receive'
import { claspVideoSendNode } from './clasp-video-send'
import { claspGestureNode } from './clasp-gesture'
import type { NodeDefinition } from '../types'

export const claspNodes: NodeDefinition[] = [
  claspConnectionNode,
  claspSubscribeNode,
  claspSetNode,
  claspEmitNode,
  claspGetNode,
  claspStreamNode,
  claspBundleNode,
  claspVideoReceiveNode,
  claspVideoSendNode,
  claspGestureNode,
]
