/**
 * Connections Store
 *
 * Pinia store for connection management UI state.
 * Wraps the ConnectionManager service with reactive Vue state.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  BaseConnectionConfig,
  ConnectionStatusInfo,
  ConnectionTypeDefinition,
  Platform,
} from '@/services/connections/types'
import { getConnectionManager } from '@/services/connections'
import { getPlatform } from '@/utils/platform'

export const useConnectionsStore = defineStore('connections', () => {
  // =========================================================================
  // State
  // =========================================================================

  /** Whether the connection manager modal is open */
  const modalOpen = ref(false)

  /** Currently selected connection ID for editing */
  const selectedConnectionId = ref<string | null>(null)

  /** Whether we're in create mode (vs edit mode) */
  const isCreating = ref(false)

  /** Selected protocol when creating new connection */
  const selectedProtocol = ref<string | null>(null)

  /** Connection configs (reactive mirror of manager state) */
  const connections = ref<BaseConnectionConfig[]>([])

  /** Connection statuses (reactive mirror) */
  const statuses = ref<Map<string, ConnectionStatusInfo>>(new Map())

  /** Registered connection types (reactive mirror) */
  const types = ref<ConnectionTypeDefinition[]>([])

  /** Current platform */
  const platform = ref<Platform>(getPlatform())

  // =========================================================================
  // Manager Integration
  // =========================================================================

  const manager = getConnectionManager()

  // Sync initial state
  function syncFromManager() {
    connections.value = manager.getConnections()
    types.value = manager.getTypes()

    // Sync statuses
    const newStatuses = new Map<string, ConnectionStatusInfo>()
    for (const conn of connections.value) {
      const status = manager.getStatus(conn.id)
      if (status) {
        newStatuses.set(conn.id, status)
      }
    }
    statuses.value = newStatuses
  }

  // Subscribe to manager events
  const unsubscribers: (() => void)[] = []

  function setupManagerListeners() {
    unsubscribers.push(
      manager.on('connection-added', (config) => {
        connections.value = [...connections.value, config]
        statuses.value.set(config.id, { status: 'disconnected' })
      })
    )

    unsubscribers.push(
      manager.on('connection-removed', (id) => {
        connections.value = connections.value.filter((c) => c.id !== id)
        statuses.value.delete(id)

        // Clear selection if removed
        if (selectedConnectionId.value === id) {
          selectedConnectionId.value = null
          isCreating.value = false
        }
      })
    )

    unsubscribers.push(
      manager.on('connection-updated', (config) => {
        const index = connections.value.findIndex((c) => c.id === config.id)
        if (index !== -1) {
          connections.value = [
            ...connections.value.slice(0, index),
            config,
            ...connections.value.slice(index + 1),
          ]
        }
      })
    )

    unsubscribers.push(
      manager.on('status-change', ({ connectionId, status }) => {
        statuses.value = new Map(statuses.value).set(connectionId, status)
      })
    )

    unsubscribers.push(
      manager.on('type-registered', () => {
        types.value = manager.getTypes()
      })
    )

    unsubscribers.push(
      manager.on('type-unregistered', () => {
        types.value = manager.getTypes()
      })
    )
  }

  // Initialize
  syncFromManager()
  setupManagerListeners()

  // =========================================================================
  // Getters
  // =========================================================================

  /** Get connection types available on current platform */
  const availableTypes = computed(() => {
    return types.value.filter((t) => t.platforms.includes(platform.value))
  })

  /** Get connection types grouped by category */
  const typesByCategory = computed(() => {
    const map = new Map<string, ConnectionTypeDefinition[]>()
    for (const type of availableTypes.value) {
      const list = map.get(type.category) ?? []
      list.push(type)
      map.set(type.category, list)
    }
    return map
  })

  /** Get the currently selected connection config */
  const selectedConnection = computed(() => {
    if (!selectedConnectionId.value) return null
    return connections.value.find((c) => c.id === selectedConnectionId.value) ?? null
  })

  /** Get status for a connection */
  const getStatus = (connectionId: string): ConnectionStatusInfo | undefined => {
    return statuses.value.get(connectionId)
  }

  /** Get connections filtered by protocol */
  const getConnectionsByProtocol = (protocol: string): BaseConnectionConfig[] => {
    return connections.value.filter((c) => c.protocol === protocol)
  }

  /** Get dropdown options for a protocol (for node property panels) */
  const getConnectionOptions = (protocol: string) => {
    return getConnectionsByProtocol(protocol).map((c) => ({
      value: c.id,
      label: c.name,
      status: statuses.value.get(c.id)?.status ?? 'disconnected',
    }))
  }

  // =========================================================================
  // Actions
  // =========================================================================

  /** Open the connection manager modal */
  function openModal() {
    modalOpen.value = true
  }

  /** Close the connection manager modal */
  function closeModal() {
    modalOpen.value = false
    selectedConnectionId.value = null
    selectedProtocol.value = null
    isCreating.value = false
  }

  /** Start creating a new connection */
  function startCreate(protocol?: string) {
    isCreating.value = true
    selectedConnectionId.value = null
    selectedProtocol.value = protocol ?? null

    if (!modalOpen.value) {
      modalOpen.value = true
    }
  }

  /** Select a connection for editing */
  function selectConnection(connectionId: string) {
    selectedConnectionId.value = connectionId
    isCreating.value = false
    selectedProtocol.value = null
  }

  /** Add a new connection */
  function addConnection(config: BaseConnectionConfig) {
    manager.addConnection(config)
    isCreating.value = false
    selectedConnectionId.value = config.id
  }

  /** Update an existing connection */
  function updateConnection(connectionId: string, updates: Partial<BaseConnectionConfig>) {
    manager.updateConnection(connectionId, updates)
  }

  /** Remove a connection */
  function removeConnection(connectionId: string) {
    manager.removeConnection(connectionId)
  }

  /** Connect a connection */
  async function connect(connectionId: string) {
    try {
      await manager.connect(connectionId)
    } catch (e) {
      console.error('[Connections] Connect error:', e)
      throw e
    }
  }

  /** Disconnect a connection */
  async function disconnect(connectionId: string) {
    try {
      await manager.disconnect(connectionId)
    } catch (e) {
      console.error('[Connections] Disconnect error:', e)
      throw e
    }
  }

  /** Connect all auto-connect connections */
  async function connectAll() {
    await manager.connectAll()
  }

  /** Disconnect all connections */
  async function disconnectAll() {
    await manager.disconnectAll()
  }

  /** Toggle connection state */
  async function toggleConnection(connectionId: string) {
    const status = statuses.value.get(connectionId)
    if (status?.status === 'connected') {
      await disconnect(connectionId)
    } else {
      await connect(connectionId)
    }
  }

  /** Get adapter for a connection (for node executors) */
  function getAdapter(connectionId: string) {
    return manager.getAdapter(connectionId)
  }

  /** Get type definition */
  function getType(typeId: string) {
    return manager.getType(typeId)
  }

  // =========================================================================
  // Persistence Helpers
  // =========================================================================

  /** Export connections for flow save */
  function exportConnections(): BaseConnectionConfig[] {
    return manager.exportConnections()
  }

  /** Import connections from flow load */
  function importConnections(configs: BaseConnectionConfig[]) {
    manager.importConnections(configs)
    syncFromManager()
  }

  /** Replace all connections (flow load) */
  function replaceConnections(configs: BaseConnectionConfig[]) {
    manager.replaceConnections(configs)
    syncFromManager()
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  function dispose() {
    for (const unsub of unsubscribers) {
      unsub()
    }
    unsubscribers.length = 0
  }

  return {
    // State
    modalOpen,
    selectedConnectionId,
    isCreating,
    selectedProtocol,
    connections,
    statuses,
    types,
    platform,

    // Getters
    availableTypes,
    typesByCategory,
    selectedConnection,
    getStatus,
    getConnectionsByProtocol,
    getConnectionOptions,

    // Actions
    openModal,
    closeModal,
    startCreate,
    selectConnection,
    addConnection,
    updateConnection,
    removeConnection,
    connect,
    disconnect,
    connectAll,
    disconnectAll,
    toggleConnection,
    getAdapter,
    getType,

    // Persistence
    exportConnections,
    importConnections,
    replaceConnections,

    // Cleanup
    dispose,
  }
})
