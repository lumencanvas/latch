<script setup lang="ts">
/**
 * ConnectionSidebar
 *
 * A dedicated sidebar panel for managing connections.
 * Shows connection list with status, quick actions, and usage counts.
 */

import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { Plus, Plug, Unplug } from 'lucide-vue-next'
import { useConnectionsStore } from '@/stores/connections'
import { useFlowsStore } from '@/stores/flows'
import ConnectionList from './ConnectionList.vue'
import ConnectionStatusBadge from './ConnectionStatusBadge.vue'
import type { ConnectionStatus } from '@/services/connections/types'

const emit = defineEmits<{
  (e: 'open-manager'): void
  (e: 'select-connection', connectionId: string): void
}>()

const connectionsStore = useConnectionsStore()
const flowsStore = useFlowsStore()
const { connections, statuses } = storeToRefs(connectionsStore)

const selectedConnectionId = ref<string | null>(null)

// Count how many nodes use each connection
const connectionUsageCounts = computed(() => {
  const counts = new Map<string, number>()

  for (const node of flowsStore.activeNodes) {
    // Check node data for connection references
    for (const key of Object.keys(node.data || {})) {
      const value = node.data[key]
      if (typeof value === 'string' && connections.value.some((c) => c.id === value)) {
        counts.set(value, (counts.get(value) || 0) + 1)
      }
    }
  }

  return counts
})

// Get overall connection stats
const stats = computed(() => {
  let connected = 0
  let connecting = 0
  let errors = 0
  let disconnected = 0

  for (const status of statuses.value.values()) {
    switch (status.status) {
      case 'connected':
        connected++
        break
      case 'connecting':
      case 'reconnecting':
        connecting++
        break
      case 'error':
        errors++
        break
      case 'disconnected':
        disconnected++
        break
    }
  }

  return { connected, connecting, errors, disconnected, total: connections.value.length }
})

function getStatus(connectionId: string): ConnectionStatus {
  return statuses.value.get(connectionId)?.status ?? 'disconnected'
}

function getUsageCount(connectionId: string): number {
  return connectionUsageCounts.value.get(connectionId) || 0
}

async function connectAll() {
  for (const conn of connections.value) {
    const status = getStatus(conn.id)
    if (status === 'disconnected' || status === 'error') {
      await connectionsStore.connect(conn.id)
    }
  }
}

async function disconnectAll() {
  for (const conn of connections.value) {
    const status = getStatus(conn.id)
    if (status === 'connected' || status === 'connecting' || status === 'reconnecting') {
      await connectionsStore.disconnect(conn.id)
    }
  }
}

function selectConnection(connectionId: string) {
  selectedConnectionId.value = connectionId
  emit('select-connection', connectionId)
}
</script>

<template>
  <div class="connection-sidebar">
    <!-- Header -->
    <div class="sidebar-header">
      <h3 class="sidebar-title">
        Connections
      </h3>
      <button
        class="add-btn"
        title="Add Connection"
        @click="emit('open-manager')"
      >
        <Plus :size="14" />
      </button>
    </div>

    <!-- Stats bar -->
    <div class="stats-bar">
      <div
        class="stat"
        title="Connected"
      >
        <ConnectionStatusBadge
          status="connected"
          size="sm"
          :pulse="false"
        />
        <span>{{ stats.connected }}</span>
      </div>
      <div
        v-if="stats.connecting > 0"
        class="stat"
        title="Connecting"
      >
        <ConnectionStatusBadge
          status="connecting"
          size="sm"
        />
        <span>{{ stats.connecting }}</span>
      </div>
      <div
        v-if="stats.errors > 0"
        class="stat"
        title="Errors"
      >
        <ConnectionStatusBadge
          status="error"
          size="sm"
          :pulse="false"
        />
        <span>{{ stats.errors }}</span>
      </div>
      <div
        v-if="stats.disconnected > 0"
        class="stat"
        title="Disconnected"
      >
        <ConnectionStatusBadge
          status="disconnected"
          size="sm"
          :pulse="false"
        />
        <span>{{ stats.disconnected }}</span>
      </div>

      <div class="stat-spacer" />

      <!-- Quick actions -->
      <button
        v-if="stats.disconnected > 0 || stats.errors > 0"
        class="action-btn"
        title="Connect All"
        @click="connectAll"
      >
        <Plug :size="14" />
      </button>
      <button
        v-if="stats.connected > 0"
        class="action-btn"
        title="Disconnect All"
        @click="disconnectAll"
      >
        <Unplug :size="14" />
      </button>
    </div>

    <!-- Connection list -->
    <div class="connections-scroll">
      <ConnectionList
        :selected-id="selectedConnectionId"
        :show-actions="true"
        :compact="true"
        @select="selectConnection"
        @create="emit('open-manager')"
      />
    </div>

    <!-- Usage info for selected connection -->
    <div
      v-if="selectedConnectionId"
      class="usage-info"
    >
      <span class="usage-label">Used by:</span>
      <span class="usage-count">{{ getUsageCount(selectedConnectionId) }} nodes</span>
    </div>
  </div>
</template>

<style scoped>
.connection-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-neutral-0);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-neutral-200);
}

.sidebar-title {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-neutral-500);
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--color-primary-600);
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  cursor: pointer;
}

.add-btn:hover {
  background: var(--color-primary-500);
}

.add-btn svg {
  width: 14px;
  height: 14px;
}

.stats-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--color-neutral-200);
}

.stat {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
}

.stat-spacer {
  flex: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-neutral-500);
  cursor: pointer;
}

.action-btn:hover {
  background: var(--color-neutral-100);
  color: var(--color-neutral-700);
}

.action-btn svg {
  width: 14px;
  height: 14px;
}

.connections-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2);
}

.usage-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
  border-top: 1px solid var(--color-neutral-200);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.usage-label {
  color: var(--color-neutral-500);
}

.usage-count {
  color: var(--color-neutral-700);
}
</style>
