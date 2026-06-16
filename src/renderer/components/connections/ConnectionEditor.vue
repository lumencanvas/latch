<script setup lang="ts">
/**
 * ConnectionEditor
 *
 * Edit form for connection configuration.
 * Dynamically renders fields based on the connection type definition.
 */

import { ref, computed, watch, type Component } from 'vue'
import { Trash2, Check, Plus, Plug, Radio, RadioTower, Globe, Cable, Bluetooth, Usb, Play, Loader2, CheckCircle, XCircle } from 'lucide-vue-next'
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
      // Connection-level behavior (not part of protocol configControls). NEW
      // connections never auto-connect, so creating one makes no surprise network
      // connection (or local-network permission prompt) — the user opts in via the
      // toggle. (Overrides any protocol defaultConfig.autoConnect.)
      defaults.autoConnect = false
      if (defaults.autoReconnect === undefined) defaults.autoReconnect = true
      formValues.value = defaults
    }
  },
  { immediate: true }
)

const isEditing = computed(() => !!props.connection)

// Connection behavior (auto-connect / auto-reconnect / reconnect delay) is owned by
// the dedicated Behavior section below — strip it from the protocol field list so it
// isn't rendered twice.
const BEHAVIOR_FIELDS = ['autoConnect', 'autoReconnect', 'reconnectDelay']
const protocolControls = computed(() =>
  props.typeDef.configControls.filter((c) => !BEHAVIOR_FIELDS.includes(c.id))
)
const supportsReconnect = computed(() =>
  props.typeDef.configControls.some((c) => c.id === 'autoReconnect')
)

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

// Toggle a boolean behavior field (autoConnect / autoReconnect).
function setBehavior(key: 'autoConnect' | 'autoReconnect', event: Event) {
  formValues.value = {
    ...formValues.value,
    [key]: (event.target as HTMLInputElement).checked,
  }
}

function setReconnectDelay(event: Event) {
  formValues.value = {
    ...formValues.value,
    reconnectDelay: Number((event.target as HTMLInputElement).value),
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

    <!-- CLASP: pick a server (relay/local), then the URL + token are editable directly. -->
    <template v-if="typeDef.id === 'clasp'">
      <ClaspInfo />
      <section class="editor-section">
        <h4 class="section-label">
          Server
        </h4>
        <ClaspDiscovery
          :selected-url="selectedServerUrl"
          @select="handleClaspServerSelect"
        />
        <ProtocolFormFields
          :controls="protocolControls"
          :values="formValues"
          @update:values="formValues = $event"
        />
      </section>
    </template>

    <!-- Other protocols: the form fields ARE the primary input. -->
    <section
      v-else
      class="editor-section"
    >
      <h4 class="section-label">
        Configuration
      </h4>
      <ProtocolFormFields
        :controls="protocolControls"
        :values="formValues"
        @update:values="formValues = $event"
      />
    </section>

    <!-- CLASP Bridge download (for OSC/MIDI/Serial) -->
    <template v-if="['osc', 'midi', 'serial'].includes(typeDef.id)">
      <ClaspBridgeDownload />
    </template>

    <!-- Connection behavior -->
    <section class="editor-section">
      <h4 class="section-label">
        Behavior
      </h4>
      <div class="behavior-settings">
        <label class="toggle-row">
          <input
            type="checkbox"
            :checked="!!formValues.autoConnect"
            @change="setBehavior('autoConnect', $event)"
          >
          <span class="toggle-text">
            Auto-connect on startup
            <span class="toggle-hint">Off by default — connecting to a localhost router may ask your browser for local-network access.</span>
          </span>
        </label>
        <label
          v-if="supportsReconnect"
          class="toggle-row"
        >
          <input
            type="checkbox"
            :checked="!!formValues.autoReconnect"
            @change="setBehavior('autoReconnect', $event)"
          >
          <span class="toggle-text">Auto-reconnect if dropped</span>
        </label>
        <div
          v-if="supportsReconnect && !!formValues.autoReconnect"
          class="reconnect-delay"
        >
          <label
            for="reconnect-delay"
            class="delay-label"
          >Reconnect delay</label>
          <div class="delay-input-wrap">
            <input
              id="reconnect-delay"
              type="number"
              min="0"
              step="500"
              :value="Number(formValues.reconnectDelay ?? 5000)"
              class="delay-input"
              @input="setReconnectDelay"
            >
            <span class="delay-unit">ms</span>
          </div>
        </div>
      </div>
    </section>

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
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.type-badge svg {
  width: 14px;
  height: 14px;
}

/* Grouped section (Configuration / Behavior) with a mono uppercase header. */
.editor-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.section-label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-neutral-400);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--color-neutral-200);
}

.name-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.field-label {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-neutral-500);
}

.field-input {
  padding: var(--space-2);
  background: var(--color-neutral-50);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-900);
  transition: border-color var(--transition-fast);
}

.field-input:hover {
  border-color: var(--color-neutral-300);
}

.field-input:focus {
  outline: none;
  border-color: var(--color-primary-500);
}

/* Connection behavior (auto-connect / auto-reconnect) — explicit + controllable. */
.behavior-settings {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.toggle-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  cursor: pointer;
}

.toggle-row input[type='checkbox'] {
  margin-top: 2px;
  width: 16px;
  height: 16px;
  accent-color: var(--color-primary-500);
  flex-shrink: 0;
}

.toggle-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
}

.toggle-hint {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  line-height: 1.4;
}

/* Reconnect delay — compact inline number, revealed only when auto-reconnect is on. */
.reconnect-delay {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding-left: calc(16px + var(--space-2));
}

.delay-label {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-neutral-500);
}

.delay-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.delay-input {
  width: 92px;
  padding: var(--space-1) var(--space-2);
  padding-right: var(--space-6);
  background: var(--color-neutral-50);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-900);
  text-align: right;
}

.delay-input:focus {
  outline: none;
  border-color: var(--color-primary-500);
}

.delay-unit {
  position: absolute;
  right: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-400);
  pointer-events: none;
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
  font-size: var(--font-size-sm);
  color: var(--color-error);
  cursor: pointer;
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
}

.test-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-300);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
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
  background: rgba(239, 68, 68, 0.1);
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
  font-size: var(--font-size-sm);
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
  font-size: var(--font-size-sm);
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
