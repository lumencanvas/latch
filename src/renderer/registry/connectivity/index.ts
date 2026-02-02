export { httpRequestNode } from './http-request'
export { websocketNode } from './websocket'
export { midiOutputNode } from './midi-output'
export { mqttNode } from './mqtt'
export { oscNode } from './osc'
export { serialNode } from './serial'
export { bleNode } from './ble'
export { bleScannerNode } from './ble-scanner'
export { bleDeviceNode } from './ble-device'
export { bleCharacteristicNode } from './ble-characteristic'

import { httpRequestNode } from './http-request'
import { websocketNode } from './websocket'
import { midiOutputNode } from './midi-output'
import { mqttNode } from './mqtt'
import { oscNode } from './osc'
import { serialNode } from './serial'
import { bleNode } from './ble'
import { bleScannerNode } from './ble-scanner'
import { bleDeviceNode } from './ble-device'
import { bleCharacteristicNode } from './ble-characteristic'
import type { NodeDefinition } from '../types'

export const connectivityNodes: NodeDefinition[] = [
  httpRequestNode,
  websocketNode,
  midiOutputNode,
  mqttNode,
  oscNode,
  serialNode,
  bleNode,
  bleScannerNode,
  bleDeviceNode,
  bleCharacteristicNode,
]
