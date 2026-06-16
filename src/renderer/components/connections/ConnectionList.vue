<script setup lang="ts">
/**
 * ConnectionList
 *
 * A sidebar-style list of connections with status indicators.
 * Used in both the modal and the connection sidebar.
 */

import { computed, type Component } from 'vue'
import { storeToRefs } from 'pinia'
import { Plug, Unplug, AlertCircle, Loader2, Radio, RadioTower, Globe, Cable, Bluetooth, Usb, Plus } from 'lucide-vue-next'
import { useConnectionsStore } from '@/stores/connections'
import ConnectionStatusBadge from './ConnectionStatusBadge.vue'
import type { BaseConnectionConfig, ConnectionTypeDefinition } from '@/services/connections/types'

// Icon mapping for dynamic icons
const iconMap: Record<string, Component> = {
  plug: Plug,
  unplug: Unplug,
  radio: Radio,
  'radio-tower': RadioTower,
  globe: Globe,
  cable: Cable,
  bluetooth: Bluetooth,
  usb: Usb,
}

function getIconComponent(iconName: string): Component {
  return iconMap[iconName] || Plug
}

const props = withDefaults(
  defineProps<{
    /** Currently selected connection ID */
    selectedId?: string | null
    /** Show quick connect/disconnect buttons */
    showActions?: boolean
    /** Compact mode for sidebar */
    compact?: boolean
    /** Filter by protocol type */
    filterProtocol?: string
  }>(),
  {
    selectedId: null,
    showActions: true,
    compact: false,
    filterProtocol: undefined,
  }
)

const emit = defineEmits<{
  (e: 'select', connectionId: string): void
  (e: 'create'): void
}>()

const connectionsStore = useConnectionsStore()
const { connections, statuses, types } = storeToRefs(connectionsStore)

const filteredConnections = computed(() => {
  if (props.filterProtocol) {
    return connections.value.filter(c => c.protocol === props.filterProtocol)
  }
  return connections.value
})

const connectionsByProtocol = computed(() => {
  const grouped: Record<string, BaseConnectionConfig[]> = {}
  for (const conn of filteredConnections.value) {
    if (!grouped[conn.protocol]) {
      grouped[conn.protocol] = []
    }
    grouped[conn.protocol].push(conn)
  }
  return grouped
})

function getTypeDef(typeId: string): ConnectionTypeDefinition | undefined {
  return types.value.find((t: ConnectionTypeDefinition) => t.id === typeId)
}

function getStatus(connectionId: string) {
  return statuses.value.get(connectionId)?.status ?? 'disconnected'
}

function getStatusError(connectionId: string) {
  return statuses.value.get(connectionId)?.error
}

async function toggleConnection(connection: BaseConnectionConfig) {
  try {
    const status = getStatus(connection.id)
    if (status === 'connected') {
      await connectionsStore.disconnect(connection.id)
    } else if (status === 'disconnected' || status === 'error') {
      await connectionsStore.connect(connection.id)
    }
  } catch (e) {
    console.error('[ConnectionList] Toggle connection error:', e)
  }
}

function selectConnection(connectionId: string) {
  emit('select', connectionId)
}
</script>

<template>
  <div class="connection-list">
    <!-- Add button (always visible) -->
    <div class="add-connection-header">
      <button
        class="add-btn"
        @click="emit('create')"
      >
        <Plus :size="14" />
        Add Connection
      </button>
    </div>

    <!-- Empty state -->
    <div
      v-if="filteredConnections.length === 0"
      class="empty-state"
    >
      <Plug class="empty-icon" />
      <p>No connections configured</p>
    </div>

    <!-- Grouped connections -->
    <template v-else>
      <div
        v-for="(conns, protocolId) in connectionsByProtocol"
        :key="protocolId"
        class="connection-group"
      >
        <!-- Group header -->
        <div class="group-header">
          <component
            :is="getIconComponent(getTypeDef(String(protocolId))?.icon || 'plug')"
            class="group-icon"
            :style="{ color: getTypeDef(String(protocolId))?.color }"
          />
          <span class="group-name">{{ getTypeDef(String(protocolId))?.name || protocolId }}</span>
          <span class="group-count">{{ conns.length }}</span>
        </div>

        <!-- Connection items -->
        <div
          v-for="conn in conns"
          :key="conn.id"
          :class="[
            'connection-item',
            props.selectedId === conn.id && 'selected',
            props.compact && 'compact',
          ]"
          @click="selectConnection(conn.id)"
        >
          <ConnectionStatusBadge
            :status="getStatus(conn.id)"
            size="sm"
          />
          <span class="connection-name">{{ conn.name }}</span>
          <span
            v-if="getStatusError(conn.id)"
            class="connection-error"
            :title="getStatusError(conn.id)"
          >
            <AlertCircle class="error-icon" />
          </span>

          <!-- Quick actions -->
          <div
            v-if="props.showActions"
            class="connection-actions"
            @click.stop
          >
            <button
              v-if="getStatus(conn.id) === 'connected'"
              class="action-btn disconnect"
              title="Disconnect"
              @click="toggleConnection(conn)"
            >
              <Unplug :size="16" />
            </button>
            <button
              v-else-if="getStatus(conn.id) === 'disconnected' || getStatus(conn.id) === 'error'"
              class="action-btn connect"
              title="Connect"
              @click="toggleConnection(conn)"
            >
              <Plug :size="16" />
            </button>
            <Loader2
              v-else
              class="action-spinner"
              :size="16"
            />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.connection-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  height: 100%;
  overflow-y: auto;
}

.add-connection-header {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-neutral-200);
  background: var(--color-neutral-100);
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: var(--color-primary-600);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.add-btn:hover {
  background: var(--color-primary-500);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  color: var(--color-neutral-500);
  gap: var(--space-2);
}

.empty-icon {
  width: 32px;
  height: 32px;
  opacity: 0.5;
}

.create-btn {
  margin-top: var(--space-2);
  padding: var(--space-1) var(--space-3);
  background: var(--color-primary-600);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.create-btn:hover {
  background: var(--color-primary-500);
}

.connection-group {
  display: flex;
  flex-direction: column;
}

.group-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.group-icon {
  width: 14px;
  height: 14px;
}

.group-name {
  flex: 1;
}

.group-count {
  background: var(--color-neutral-200);
  color: var(--color-neutral-600);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
}

.connection-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.connection-item:hover {
  background: var(--color-neutral-100);
}

.connection-item.selected {
  background: var(--color-primary-100);
  border-left: 2px solid var(--color-primary-500);
}

.connection-item.compact {
  padding: var(--space-1) var(--space-2);
}

.connection-name {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-800);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.connection-error {
  color: var(--color-error);
}

.error-icon {
  width: 14px;
  height: 14px;
}

.connection-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.connection-item:hover .connection-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-neutral-500);
  cursor: pointer;
}

.action-btn:hover {
  background: var(--color-neutral-200);
  color: var(--color-neutral-700);
}

.action-btn.connect:hover {
  color: var(--color-success);
}

.action-btn.disconnect:hover {
  color: var(--color-warning);
}

.action-spinner {
  width: 16px;
  height: 16px;
  color: var(--color-primary-500);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
