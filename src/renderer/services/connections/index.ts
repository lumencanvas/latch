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
import {
  claspConnectionType,
  websocketConnectionType,
  mqttConnectionType,
  oscConnectionType,
  httpConnectionType,
} from './adapters'

let initialized = false

/**
 * Register built-in connection types with the manager
 */
function registerBuiltInTypes(): void {
  if (initialized) return

  const manager = getManagerInstance()

  // Register built-in protocol types
  manager.registerType(claspConnectionType)
  manager.registerType(websocketConnectionType)
  manager.registerType(mqttConnectionType)
  manager.registerType(oscConnectionType)
  manager.registerType(httpConnectionType)

  initialized = true
  console.log('[Connections] Connection manager initialized with built-in types')
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
