export { httpRequestNode } from './http-request'
export { websocketNode } from './websocket'
export { midiInputNode } from './midi-input'
export { midiOutputNode } from './midi-output'
export { mqttNode } from './mqtt'
export { oscNode } from './osc'
export { serialNode } from './serial'
export { bleNode } from './ble'
export { bleScannerNode } from './ble-scanner'
export { bleDeviceNode } from './ble-device'
export { bleCharacteristicNode } from './ble-characteristic'
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

import { httpRequestNode } from './http-request'
import { websocketNode } from './websocket'
import { midiInputNode } from './midi-input'
import { midiOutputNode } from './midi-output'
import { mqttNode } from './mqtt'
import { oscNode } from './osc'
import { serialNode } from './serial'
import { bleNode } from './ble'
import { bleScannerNode } from './ble-scanner'
import { bleDeviceNode } from './ble-device'
import { bleCharacteristicNode } from './ble-characteristic'
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

export const connectivityNodes: NodeDefinition[] = [
  httpRequestNode,
  websocketNode,
  midiInputNode,
  midiOutputNode,
  mqttNode,
  oscNode,
  serialNode,
  bleNode,
  bleScannerNode,
  bleDeviceNode,
  bleCharacteristicNode,
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
