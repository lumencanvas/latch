<script setup lang="ts">
import { computed } from 'vue'
import { Settings, Plus, CheckCircle2, Loader, AlertCircle } from 'lucide-vue-next'
import { useConnectionsStore } from '@/stores/connections'

const props = defineProps<{
  modelValue: string | undefined
  protocol: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | undefined]
}>()

const connectionsStore = useConnectionsStore()

// Get options for this protocol
const options = computed(() => connectionsStore.getConnectionOptions(props.protocol))

const selectedStatus = computed(() => {
  if (!props.modelValue) return null
  return connectionsStore.getStatus(props.modelValue)
})

function getStatusColor(status: string | undefined): string {
  switch (status) {
    case 'connected': return '#22C55E'
    case 'connecting':
    case 'reconnecting': return '#F59E0B'
    case 'error': return '#EF4444'
    default: return '#6B7280'
  }
}

function handleSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  emit('update:modelValue', value || undefined)
}

function openManager() {
  connectionsStore.startCreate(props.protocol)
}

function editConnection() {
  if (props.modelValue) {
    connectionsStore.selectConnection(props.modelValue)
    connectionsStore.openModal()
  }
}
</script>

<template>
  <div class="connection-select-wrapper">
    <div class="select-container">
      <!-- Status indicator -->
      <div
        class="status-indicator"
        :style="{ background: getStatusColor(selectedStatus?.status) }"
      />

      <select
        class="connection-select"
        :value="modelValue"
        @change="handleSelect"
      >
        <option value="">
          {{ placeholder || 'Select connection...' }}
        </option>
        <option
          v-for="opt in options"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>

      <!-- Status icon -->
      <div
        v-if="selectedStatus"
        class="status-icon"
      >
        <CheckCircle2
          v-if="selectedStatus.status === 'connected'"
          :size="14"
          class="icon-connected"
        />
        <Loader
          v-else-if="selectedStatus.status === 'connecting' || selectedStatus.status === 'reconnecting'"
          :size="14"
          class="icon-connecting"
        />
        <AlertCircle
          v-else-if="selectedStatus.status === 'error'"
          :size="14"
          class="icon-error"
        />
      </div>
    </div>

    <div class="select-actions">
      <!-- Edit button (if selection exists) -->
      <button
        v-if="modelValue"
        class="action-btn"
        title="Edit connection"
        @click="editConnection"
      >
        <Settings :size="14" />
      </button>

      <!-- Add button -->
      <button
        class="action-btn action-add"
        title="Add new connection"
        @click="openManager"
      >
        <Plus :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.connection-select-wrapper {
  display: flex;
  gap: var(--space-1);
}

.select-container {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
}

.status-indicator {
  position: absolute;
  left: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  pointer-events: none;
  z-index: 1;
}

.connection-select {
  width: 100%;
  padding: var(--space-1) var(--space-2);
  padding-left: 20px;
  padding-right: 24px;
  font-size: var(--font-size-xs);
  color: var(--color-neutral-800);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
}

.connection-select:focus {
  outline: none;
  border-color: #6366f1;
}

.connection-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-icon {
  position: absolute;
  right: 24px;
  display: flex;
  align-items: center;
  pointer-events: none;
}

.icon-connected {
  color: #22C55E;
}

.icon-connecting {
  color: #F59E0B;
  animation: spin 1s linear infinite;
}

.icon-error {
  color: #EF4444;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.select-actions {
  display: flex;
  gap: 2px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  color: var(--color-neutral-500);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background: var(--color-neutral-200);
  color: var(--color-neutral-700);
}

.action-add {
  background: #6366f1;
  border-color: #4f46e5;
  color: white;
}

.action-add:hover {
  background: #4f46e5;
}
</style>
