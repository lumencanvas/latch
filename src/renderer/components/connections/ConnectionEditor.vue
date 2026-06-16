<script setup lang="ts">
/**
 * ConnectionEditor
 *
 * Edit form for connection configuration.
 * Dynamically renders fields based on the connection type definition.
 */

import { ref, computed, watch, type Component } from 'vue'
import { Trash2, Check, Plus, Plug, Radio, RadioTower, Globe, Cable, Bluetooth, Usb, Play, Loader2, CheckCircle, XCircle, SlidersHorizontal, ChevronDown } from 'lucide-vue-next'
import { useConnectionsStore } from '@/stores/connections'
import ProtocolFormFields from './ProtocolFormFields.vue'
import ClaspDiscovery from './ClaspDiscovery.vue'
import ClaspBridgeDownload from './ClaspBridgeDownload.vue'
import ClaspInfo from './ClaspInfo.vue'
import type { ConnectionTypeDefinition, BaseConnectionConfig } from '@/services/connections/types'

// Icon mapping for dynamic icons
const iconMap: Record<string, Component> = {
  plug: Plug,
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

const props = defineProps<{
  /** Connection type definition */
  typeDef: ConnectionTypeDefinition
  /** Existing connection to edit (null for new) */
  connection?: BaseConnectionConfig | null
}>()

const emit = defineEmits<{
  (e: 'save', config: Partial<BaseConnectionConfig>): void
  (e: 'cancel'): void
  (e: 'delete'): void
}>()

// Form state
const formValues = ref<Record<string, unknown>>({})
const connectionName = ref('')

// Initialize form values
watch(
  () => [props.connection, props.typeDef],
  () => {
    if (props.connection) {
      // Editing existing connection
      connectionName.value = props.connection.name
      formValues.value = { ...props.connection }
    } else {
      // New connection - use defaults
      connectionName.value = props.typeDef.name
      const defaults: Record<string, unknown> = {}
      for (const control of props.typeDef.configControls) {
        defaults[control.id] = control.default
      }
      if (props.typeDef.defaultConfig) {
        Object.assign(defaults, props.typeDef.defaultConfig)
      }
      formValues.value = defaults
    }
  },
  { immediate: true }
)

const isEditing = computed(() => !!props.connection)

// The configured CLASP server URL (set by Quick Connect / Scan, or manually in
// Advanced). Drives the selected-server highlight + the Advanced summary.
const selectedServerUrl = computed(() => String(formValues.value.url ?? ''))

// Test connection state
const testStatus = ref<'idle' | 'testing' | 'success' | 'error'>('idle')
const testError = ref<string | null>(null)

// Handle CLASP server discovery
function handleClaspServerSelect(url: string) {
  formValues.value = {
    ...formValues.value,
    url,
  }
}

function handleSave() {
  const config: Partial<BaseConnectionConfig> = {
    ...formValues.value,
    name: connectionName.value,
    protocol: props.typeDef.id,
  }

  if (props.connection) {
    config.id = props.connection.id
  }

  emit('save', config)
}

function handleDelete() {
  if (confirm(`Delete connection "${connectionName.value}"?`)) {
    emit('delete')
  }
}

async function handleTestConnection() {
  if (!props.connection) {
    testError.value = 'Save the connection first to test it'
    testStatus.value = 'error'
    return
  }

  const connectionsStore = useConnectionsStore()

  // Check current status - if already connecting/connected, don't try again
  const currentStatus = connectionsStore.getStatus(props.connection.id)
  if (currentStatus?.status === 'connecting' || currentStatus?.status === 'reconnecting') {
    testError.value = 'Connection in progress...'
    testStatus.value = 'testing'
    return
  }

  if (currentStatus?.status === 'connected') {
    testStatus.value = 'success'
    setTimeout(() => {
      testStatus.value = 'idle'
    }, 3000)
    return
  }

  testStatus.value = 'testing'
  testError.value = null

  try {
    // Try to connect
    await connectionsStore.connect(props.connection.id)

    // Check status
    const status = connectionsStore.getStatus(props.connection.id)
    if (status?.status === 'connected') {
      testStatus.value = 'success'
      // Disconnect after successful test
      await connectionsStore.disconnect(props.connection.id)
    } else {
      testStatus.value = 'error'
      testError.value = status?.error || 'Connection failed'
    }
  } catch (e) {
    testStatus.value = 'error'
    testError.value = e instanceof Error ? e.message : 'Connection failed'
  }

  // Reset status after 3 seconds
  setTimeout(() => {
    if (testStatus.value !== 'testing') {
      testStatus.value = 'idle'
      testError.value = null
    }
  }, 3000)
}
</script>

<template>
  <div class="connection-editor">
    <!-- Header -->
    <div class="editor-header">
      <div
        class="type-badge"
        :style="{ backgroundColor: typeDef.color + '20', color: typeDef.color }"
      >
        <component
          :is="getIconComponent(typeDef.icon)"
          :size="14"
        />
        <span>{{ typeDef.name }}</span>
      </div>
    </div>

    <!-- Name field -->
    <div class="name-field">
      <label
        for="connection-name"
        class="field-label"
      >
        Connection Name
      </label>
      <input
        id="connection-name"
        v-model="connectionName"
        type="text"
        class="field-input"
        placeholder="My Connection"
      >
    </div>

    <!-- CLASP: discovery is the primary path; raw fields go under Advanced. -->
    <template v-if="typeDef.id === 'clasp'">
      <ClaspInfo />
      <ClaspDiscovery
        :selected-url="selectedServerUrl"
        @select="handleClaspServerSelect"
      />
      <details class="advanced-fields">
        <summary class="advanced-summary">
          <SlidersHorizontal :size="14" />
          <span>Advanced</span>
          <span class="advanced-url">{{ selectedServerUrl || 'no server set' }}</span>
          <ChevronDown
            :size="14"
            class="advanced-chevron"
          />
        </summary>
        <div class="advanced-body">
          <ProtocolFormFields
            :controls="typeDef.configControls"
            :values="formValues"
            @update:values="formValues = $event"
          />
        </div>
      </details>
    </template>

    <!-- Other protocols: the form fields ARE the primary input. -->
    <ProtocolFormFields
      v-else
      :controls="typeDef.configControls"
      :values="formValues"
      @update:values="formValues = $event"
    />

    <!-- CLASP Bridge download (for OSC/MIDI/Serial) -->
    <template v-if="['osc', 'midi', 'serial'].includes(typeDef.id)">
      <ClaspBridgeDownload />
    </template>

    <!-- Actions -->
    <div class="editor-actions">
      <button
        v-if="isEditing"
        class="delete-btn"
        @click="handleDelete"
      >
        <Trash2 :size="14" />
        Delete
      </button>

      <button
        v-if="isEditing"
        class="test-btn"
        :class="testStatus"
        :disabled="testStatus === 'testing'"
        @click="handleTestConnection"
      >
        <Loader2
          v-if="testStatus === 'testing'"
          :size="14"
          class="spin"
        />
        <CheckCircle
          v-else-if="testStatus === 'success'"
          :size="14"
        />
        <XCircle
          v-else-if="testStatus === 'error'"
          :size="14"
        />
        <Play
          v-else
          :size="14"
        />
        <span v-if="testStatus === 'testing'">Testing...</span>
        <span v-else-if="testStatus === 'success'">Connected!</span>
        <span v-else-if="testStatus === 'error'">Failed</span>
        <span v-else>Test</span>
      </button>

      <div class="action-spacer" />

      <button
        class="cancel-btn"
        @click="emit('cancel')"
      >
        Cancel
      </button>

      <button
        class="save-btn"
        @click="handleSave"
      >
        <Check
          v-if="isEditing"
          :size="14"
        />
        <Plus
          v-else
          :size="14"
        />
        {{ isEditing ? 'Save' : 'Create' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.connection-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.editor-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.type-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: 500;
}

.type-badge svg {
  width: 14px;
  height: 14px;
}

.name-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-neutral-700);
}

.field-input {
  padding: var(--space-2) var(--space-3);
  background: white;
  border: 1px solid var(--color-neutral-300);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-neutral-800);
}

.field-input:focus {
  outline: none;
  border-color: var(--color-primary-500);
}

/* Advanced (manual host/port/token) — collapsed; discovery is the primary path. */
.advanced-fields {
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
}

.advanced-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  list-style: none;
  user-select: none;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-neutral-700);
}

.advanced-summary::-webkit-details-marker {
  display: none;
}

.advanced-url {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-neutral-500);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 50%;
}

.advanced-chevron {
  color: var(--color-neutral-400);
  transition: transform var(--transition-fast);
  flex-shrink: 0;
}

.advanced-fields[open] .advanced-chevron {
  transform: rotate(180deg);
}

.advanced-body {
  margin-top: var(--space-3);
}

/* Pinned to the bottom of the scrolling editor pane so Create/Save/Test are
   always reachable without scrolling past the form. The negative margins bleed
   it to the pane edges (cancelling the editor-area's space-4 padding). */
.editor-actions {
  position: sticky;
  bottom: calc(-1 * var(--space-4));
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: var(--space-2) calc(-1 * var(--space-4)) calc(-1 * var(--space-4));
  padding: var(--space-3) var(--space-4);
  background: var(--color-neutral-0);
  border-top: 1px solid var(--color-neutral-200);
}

.action-spacer {
  flex: 1;
}

.delete-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: 1px solid var(--color-error);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-error);
  cursor: pointer;
}

.delete-btn:hover {
  background: var(--color-error-bg);
}

.test-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-300);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-neutral-700);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.test-btn:hover:not(:disabled) {
  background: var(--color-neutral-200);
}

.test-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.test-btn.testing {
  color: var(--color-primary-600);
  border-color: var(--color-primary-300);
}

.test-btn.success {
  color: var(--color-success);
  border-color: var(--color-success);
  background: var(--color-success-bg, rgba(34, 197, 94, 0.1));
}

.test-btn.error {
  color: var(--color-error);
  border-color: var(--color-error);
  background: var(--color-error-bg);
}

.spin {
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

.cancel-btn {
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: 1px solid var(--color-neutral-300);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-neutral-700);
  cursor: pointer;
}

.cancel-btn:hover {
  border-color: var(--color-neutral-400);
  background: var(--color-neutral-100);
}

.save-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--color-primary-600);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  color: white;
  cursor: pointer;
}

.save-btn:hover {
  background: var(--color-primary-500);
}

.save-btn svg,
.delete-btn svg {
  width: 14px;
  height: 14px;
}
</style>
