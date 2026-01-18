/**
 * Connection Manager Service
 *
 * Singleton service that manages all connection types, configurations,
 * and runtime adapters. Provides a unified API for connection management
 * across the application.
 */

import type {
  BaseConnectionConfig,
  ConnectionAdapter,
  ConnectionManagerEvents,
  ConnectionManagerEventHandler,
  ConnectionStatusInfo,
  ConnectionTypeDefinition,
  IConnectionManager,
  Platform,
} from './types'
import { getPlatform } from '@/utils/platform'

type EventMap = {
  [K in keyof ConnectionManagerEvents]: Set<ConnectionManagerEventHandler<K>>
}

/**
 * Connection Manager implementation
 */
class ConnectionManagerImpl implements IConnectionManager {
  /** Registered connection type definitions */
  private types = new Map<string, ConnectionTypeDefinition>()

  /** Saved connection configurations */
  private connections = new Map<string, BaseConnectionConfig>()

  /** Active runtime adapters */
  private adapters = new Map<string, ConnectionAdapter>()

  /** Connection status cache */
  private statusCache = new Map<string, ConnectionStatusInfo>()

  /** Event listeners */
  private listeners: EventMap = {
    'connection-added': new Set(),
    'connection-removed': new Set(),
    'connection-updated': new Set(),
    'status-change': new Set(),
    'type-registered': new Set(),
    'type-unregistered': new Set(),
  }

  /** Unsubscribe functions for adapter status listeners */
  private adapterUnsubscribers = new Map<string, () => void>()

  // =========================================================================
  // Type Registry
  // =========================================================================

  registerType<TConfig extends BaseConnectionConfig>(
    definition: ConnectionTypeDefinition<TConfig>
  ): void {
    if (this.types.has(definition.id)) {
      console.warn(`[ConnectionManager] Type '${definition.id}' already registered, overwriting`)
    }

    this.types.set(definition.id, definition as unknown as ConnectionTypeDefinition)
    this.emit('type-registered', definition as unknown as ConnectionTypeDefinition)
    console.log(`[ConnectionManager] Registered type: ${definition.id}`)
  }

  unregisterType(typeId: string): void {
    if (!this.types.has(typeId)) {
      return
    }

    // Remove all connections of this type
    for (const [connId, config] of this.connections) {
      if (config.protocol === typeId) {
        this.removeConnection(connId)
      }
    }

    this.types.delete(typeId)
    this.emit('type-unregistered', typeId)
    console.log(`[ConnectionManager] Unregistered type: ${typeId}`)
  }

  getType(typeId: string): ConnectionTypeDefinition | undefined {
    return this.types.get(typeId)
  }

  getTypes(): ConnectionTypeDefinition[] {
    return Array.from(this.types.values())
  }

  getTypesForPlatform(platform?: Platform): ConnectionTypeDefinition[] {
    const currentPlatform = platform ?? getPlatform()
    return this.getTypes().filter(t => t.platforms.includes(currentPlatform))
  }

  // =========================================================================
  // Connection Management
  // =========================================================================

  addConnection(config: BaseConnectionConfig): void {
    if (this.connections.has(config.id)) {
      console.warn(`[ConnectionManager] Connection '${config.id}' already exists, use updateConnection`)
      return
    }

    const typeDef = this.types.get(config.protocol)
    if (!typeDef) {
      console.error(`[ConnectionManager] Unknown protocol '${config.protocol}' for connection '${config.id}'`)
      return
    }

    this.connections.set(config.id, config)
    this.statusCache.set(config.id, { status: 'disconnected' })
    this.emit('connection-added', config)
    console.log(`[ConnectionManager] Added connection: ${config.id} (${config.protocol})`)

    // Auto-connect if configured
    if (config.autoConnect) {
      this.connect(config.id).catch(err => {
        console.error(`[ConnectionManager] Auto-connect failed for ${config.id}:`, err)
      })
    }
  }

  removeConnection(connectionId: string): void {
    const config = this.connections.get(connectionId)
    if (!config) {
      return
    }

    // Disconnect and dispose adapter
    this.disposeAdapter(connectionId)

    this.connections.delete(connectionId)
    this.statusCache.delete(connectionId)
    this.emit('connection-removed', connectionId)
    console.log(`[ConnectionManager] Removed connection: ${connectionId}`)
  }

  updateConnection(connectionId: string, updates: Partial<BaseConnectionConfig>): void {
    const existing = this.connections.get(connectionId)
    if (!existing) {
      console.warn(`[ConnectionManager] Connection '${connectionId}' not found`)
      return
    }

    // Can't change protocol
    if (updates.protocol && updates.protocol !== existing.protocol) {
      console.error(`[ConnectionManager] Cannot change protocol of existing connection`)
      return
    }

    const updated = { ...existing, ...updates, id: connectionId }
    this.connections.set(connectionId, updated)
    this.emit('connection-updated', updated)

    // If adapter exists and key config changed, reconnect
    const adapter = this.adapters.get(connectionId)
    if (adapter && adapter.status === 'connected') {
      // Reconnect with new config
      this.disconnect(connectionId).then(() => {
        this.connect(connectionId)
      })
    }
  }

  getConnection(connectionId: string): BaseConnectionConfig | undefined {
    return this.connections.get(connectionId)
  }

  getConnections(): BaseConnectionConfig[] {
    return Array.from(this.connections.values())
  }

  getConnectionsByProtocol(protocol: string): BaseConnectionConfig[] {
    return this.getConnections().filter(c => c.protocol === protocol)
  }

  // =========================================================================
  // Adapter Management
  // =========================================================================

  getAdapter(connectionId: string): ConnectionAdapter | undefined {
    return this.adapters.get(connectionId)
  }

  async connect(connectionId: string): Promise<void> {
    const config = this.connections.get(connectionId)
    if (!config) {
      throw new Error(`Connection '${connectionId}' not found`)
    }

    const typeDef = this.types.get(config.protocol)
    if (!typeDef) {
      throw new Error(`Protocol '${config.protocol}' not registered`)
    }

    // Check platform compatibility
    const currentPlatform = getPlatform()
    if (!typeDef.platforms.includes(currentPlatform)) {
      throw new Error(`Protocol '${config.protocol}' not available on ${currentPlatform}`)
    }

    // Create adapter if not exists
    let adapter = this.adapters.get(connectionId)
    if (!adapter) {
      adapter = typeDef.createAdapter(config)
      this.adapters.set(connectionId, adapter)

      // Listen to status changes
      const unsubscribe = adapter.onStatusChange((status) => {
        this.statusCache.set(connectionId, status)
        this.emit('status-change', { connectionId, status })
      })
      this.adapterUnsubscribers.set(connectionId, unsubscribe)
    }

    // Update status
    this.statusCache.set(connectionId, { status: 'connecting' })
    this.emit('status-change', { connectionId, status: { status: 'connecting' } })

    try {
      await adapter.connect()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.statusCache.set(connectionId, { status: 'error', error: errorMsg })
      this.emit('status-change', { connectionId, status: { status: 'error', error: errorMsg } })
      throw error
    }
  }

  async disconnect(connectionId: string): Promise<void> {
    const adapter = this.adapters.get(connectionId)
    if (!adapter) {
      return
    }

    try {
      await adapter.disconnect()
      this.statusCache.set(connectionId, { status: 'disconnected' })
      this.emit('status-change', { connectionId, status: { status: 'disconnected' } })
    } catch (error) {
      console.error(`[ConnectionManager] Disconnect error for ${connectionId}:`, error)
    }
  }

  async connectAll(): Promise<void> {
    const promises: Promise<void>[] = []

    for (const config of this.connections.values()) {
      if (config.autoConnect) {
        promises.push(
          this.connect(config.id).catch(err => {
            console.error(`[ConnectionManager] Failed to connect ${config.id}:`, err)
          })
        )
      }
    }

    await Promise.all(promises)
  }

  async disconnectAll(): Promise<void> {
    const promises: Promise<void>[] = []

    for (const connectionId of this.adapters.keys()) {
      promises.push(this.disconnect(connectionId))
    }

    await Promise.all(promises)
  }

  getStatus(connectionId: string): ConnectionStatusInfo | undefined {
    return this.statusCache.get(connectionId)
  }

  // =========================================================================
  // Events
  // =========================================================================

  on<K extends keyof ConnectionManagerEvents>(
    event: K,
    handler: ConnectionManagerEventHandler<K>
  ): () => void {
    const handlers = this.listeners[event] as Set<ConnectionManagerEventHandler<K>>
    handlers.add(handler)

    return () => {
      handlers.delete(handler)
    }
  }

  private emit<K extends keyof ConnectionManagerEvents>(
    event: K,
    data: ConnectionManagerEvents[K]
  ): void {
    const handlers = this.listeners[event] as Set<ConnectionManagerEventHandler<K>>
    for (const handler of handlers) {
      try {
        handler(data)
      } catch (error) {
        console.error(`[ConnectionManager] Event handler error for '${event}':`, error)
      }
    }
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  private disposeAdapter(connectionId: string): void {
    const adapter = this.adapters.get(connectionId)
    if (adapter) {
      // Unsubscribe from status changes
      const unsubscribe = this.adapterUnsubscribers.get(connectionId)
      if (unsubscribe) {
        unsubscribe()
        this.adapterUnsubscribers.delete(connectionId)
      }

      // Dispose adapter
      try {
        adapter.dispose()
      } catch (error) {
        console.error(`[ConnectionManager] Dispose error for ${connectionId}:`, error)
      }

      this.adapters.delete(connectionId)
    }
  }

  dispose(): void {
    // Disconnect and dispose all adapters
    for (const connectionId of this.adapters.keys()) {
      this.disposeAdapter(connectionId)
    }

    // Clear all state
    this.connections.clear()
    this.statusCache.clear()
    this.types.clear()

    // Clear all listeners
    for (const handlers of Object.values(this.listeners)) {
      handlers.clear()
    }

    console.log('[ConnectionManager] Disposed')
  }

  // =========================================================================
  // Serialization
  // =========================================================================

  /**
   * Export connections for persistence
   */
  exportConnections(): BaseConnectionConfig[] {
    return this.getConnections()
  }

  /**
   * Import connections from persistence
   */
  importConnections(configs: BaseConnectionConfig[]): void {
    for (const config of configs) {
      if (!this.connections.has(config.id)) {
        this.addConnection(config)
      }
    }
  }

  /**
   * Replace all connections (used when loading a flow)
   */
  replaceConnections(configs: BaseConnectionConfig[]): void {
    // Disconnect and remove all existing
    for (const connectionId of Array.from(this.connections.keys())) {
      this.removeConnection(connectionId)
    }

    // Add new connections
    for (const config of configs) {
      this.addConnection(config)
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: ConnectionManagerImpl | null = null

/**
 * Get the connection manager singleton instance
 */
export function getConnectionManager(): IConnectionManager {
  if (!instance) {
    instance = new ConnectionManagerImpl()
  }
  return instance
}

/**
 * Reset the connection manager (for testing)
 */
export function resetConnectionManager(): void {
  if (instance) {
    instance.dispose()
    instance = null
  }
}

// Export the class for testing
export { ConnectionManagerImpl }
