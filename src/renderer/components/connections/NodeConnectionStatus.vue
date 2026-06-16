<script setup lang="ts">
/**
 * NodeConnectionStatus
 *
 * Displays connection status indicators below a node's header.
 * Shows colored dots for each bound connection with tooltips.
 */

import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useConnectionsStore } from '@/stores/connections'
import ConnectionStatusBadge from './ConnectionStatusBadge.vue'
import type { ConnectionStatus } from '@/services/connections/types'

interface ConnectionBinding {
  /** Connection ID */
  connectionId: string
  /** Control ID that holds the binding */
  controlId: string
  /** Whether this connection is required */
  required?: boolean
}

const props = defineProps<{
  /** Array of connection bindings for this node */
  bindings: ConnectionBinding[]
}>()

const connectionsStore = useConnectionsStore()
const { connections, statuses } = storeToRefs(connectionsStore)

interface BindingInfo {
  connectionId: string
  connectionName: string
  status: ConnectionStatus
  error?: string
  required: boolean
}

const bindingInfos = computed<BindingInfo[]>(() => {
  const result: BindingInfo[] = []

  for (const binding of props.bindings) {
    const connection = connections.value.find((c) => c.id === binding.connectionId)
    if (!connection) continue

    const statusInfo = statuses.value.get(binding.connectionId)

    result.push({
      connectionId: binding.connectionId,
      connectionName: connection.name,
      status: statusInfo?.status ?? 'disconnected',
      error: statusInfo?.error,
      required: binding.required ?? false,
    })
  }

  return result
})

const hasAnyConnection = computed(() => bindingInfos.value.length > 0)

function getTooltip(info: BindingInfo): string {
  let tooltip = `${info.connectionName}: ${info.status}`
  if (info.error) {
    tooltip += ` - ${info.error}`
  }
  if (info.required) {
    tooltip += ' (required)'
  }
  return tooltip
}
</script>

<template>
  <div
    v-if="hasAnyConnection"
    class="node-connection-status"
  >
    <div class="status-dots">
      <ConnectionStatusBadge
        v-for="info in bindingInfos"
        :key="info.connectionId"
        :status="info.status"
        :label="getTooltip(info)"
        size="sm"
      />
    </div>
    <span
      v-if="bindingInfos.length === 1"
      class="status-label"
    >
      {{ bindingInfos[0].connectionName }}
    </span>
    <span
      v-else
      class="status-label"
    >
      {{ bindingInfos.length }} connections
    </span>
  </div>
</template>

<style scoped>
.node-connection-status {
  display: flex;
  align-items: center;
  gap: var(--space-1-5);
  padding: var(--space-1) var(--space-2);
  background: var(--color-neutral-800);
  border-top: 1px solid var(--color-neutral-700);
  font-size: var(--font-size-xs);
}

.status-dots {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.status-label {
  color: var(--color-neutral-500);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
