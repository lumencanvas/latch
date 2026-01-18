/**
 * Connection Adapters Index
 *
 * Export all connection adapters and their type definitions.
 */

export { BaseAdapter } from './BaseAdapter'

// Protocol Adapters
export { ClaspAdapterImpl, claspConnectionType, QoS } from './ClaspAdapter'
export type { ClaspValue } from './ClaspAdapter'

export { WebSocketAdapterImpl, websocketConnectionType } from './WebSocketAdapter'

export { MqttAdapterImpl, mqttConnectionType } from './MqttAdapter'

export { OscAdapterImpl, oscConnectionType } from './OscAdapter'

export { HttpAdapterImpl, httpConnectionType } from './HttpAdapter'
export type { HttpRequestOptions } from './HttpAdapter'
