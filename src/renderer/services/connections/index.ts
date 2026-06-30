/**
 * Connection Manager Service
 *
 * Centralized connection management for clasp-flow.
 * Provides registration, lifecycle management, and adapters for various protocols.
 */

// Core types
export type {
  // Status types
  ConnectionStatus,
  ConnectionStatusInfo,
  // Config types
  BaseConnectionConfig,
  ClaspConnectionConfig,
  WebSocketConnectionConfig,
  MqttConnectionConfig,
  OscConnectionConfig,
  MidiConnectionConfig,
  SerialConnectionConfig,
  BleConnectionConfig,
  HttpConnectionConfig,
  ConnectionConfig,
  // Definition types
  ConnectionCategory,
  Platform,
  ConnectionTypeDefinition,
  // Adapter types
  ConnectionAdapter,
  ConnectionAdapterEvents,
  ClaspAdapter,
  // Manager types
  IConnectionManager,
  ConnectionManagerEvents,
  // Serialization
  ConnectionsSerializationData,
  // Node integration
  NodeConnectionRequirement,
} from './types'

// Connection manager singleton (raw exports - prefer wrapped getConnectionManager below)
export { ConnectionManagerImpl } from './ConnectionManager'

// Adapters
export {
  BaseAdapter,
  ClaspAdapterImpl,
  claspConnectionType,
  WebSocketAdapterImpl,
  websocketConnectionType,
  MqttAdapterImpl,
  mqttConnectionType,
  OscAdapterImpl,
  oscConnectionType,
  HttpAdapterImpl,
  httpConnectionType,
  QoS,
} from './adapters'
export type { ClaspValue, HttpRequestOptions } from './adapters'

// ============================================================================
// Initialization Helper
// ============================================================================

import { getConnectionManager as getManagerInstance, resetConnectionManager } from './ConnectionManager'
import { colocatedProtocolTypes } from './protocolRegistry'

let initialized = false

/**
 * Register built-in connection types with the manager.
 *
 * Authoritative source is now the `protocolRegistry` glob over
 * `protocols/<name>/protocol.ts` (step 6b) — adding a protocol is one folder, no
 * edit here. The protocol-count gate asserts the glob set equals the built-in set.
 */
function registerBuiltInTypes(): void {
  if (initialized) return

  const manager = getManagerInstance()

  for (const type of colocatedProtocolTypes) {
    manager.registerType(type)
  }

  initialized = true
  console.log(
    `[Connections] Connection manager initialized with ${colocatedProtocolTypes.length} built-in types`
  )
}

/**
 * Get the connection manager singleton instance.
 * Automatically registers built-in types on first call.
 */
export function getConnectionManager() {
  registerBuiltInTypes()
  return getManagerInstance()
}

// Re-export reset but also reset initialization flag
export { resetConnectionManager }

/**
 * Initialize the connection manager with built-in connection types.
 * @deprecated Use getConnectionManager() instead - it auto-initializes
 */
export function initializeConnectionManager(): void {
  registerBuiltInTypes()
}
