<script setup lang="ts">
/**
 * ConnectionManagerModal
 *
 * Container modal for connection management.
 * Composes ConnectionList, ProtocolSelector, and ConnectionEditor sub-components.
 */

import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { Plug, X, CheckCircle } from 'lucide-vue-next'
import { useConnectionsStore } from '@/stores/connections'
import ConnectionList from './ConnectionList.vue'
import ProtocolSelector from './ProtocolSelector.vue'
import ConnectionEditor from './ConnectionEditor.vue'
import type { BaseConnectionConfig, ConnectionTypeDefinition } from '@/services/connections/types'
import { nanoid } from 'nanoid'

const connectionsStore = useConnectionsStore()
const { modalOpen, selectedConnection, selectedConnectionId, isCreating, selectedProtocol, connections } =
  storeToRefs(connectionsStore)

// Save feedback toast
const saveMessage = ref<string | null>(null)
let saveMessageTimeout: ReturnType<typeof setTimeout> | null = null

function showSaveMessage(message: string) {
  saveMessage.value = message
  if (saveMessageTimeout) {
    clearTimeout(saveMessageTimeout)
  }
  saveMessageTimeout = setTimeout(() => {
    saveMessage.value = null
  }, 2000)
}

// Get the type definition for the selected protocol or connection
const currentTypeDef = computed((): ConnectionTypeDefinition | undefined => {
  const protocol = selectedProtocol.value || selectedConnection.value?.protocol
  if (!protocol) return undefined
  return connectionsStore.getType(protocol)
})

// Handle protocol selection during creation
function handleProtocolSelect(typeDef: ConnectionTypeDefinition) {
  connectionsStore.selectedProtocol = typeDef.id
}

// Handle save from editor
function handleSave(config: Partial<BaseConnectionConfig>) {
  const fullConfig: BaseConnectionConfig = {
    id: config.id || nanoid(8),
    name: config.name || 'New Connection',
    protocol: config.protocol || selectedProtocol.value || 'clasp',
    autoConnect: config.autoConnect ?? true,
    autoReconnect: config.autoReconnect ?? true,
    reconnectDelay: config.reconnectDelay ?? 5000,
    maxReconnectAttempts: config.maxReconnectAttempts ?? 0,
    ...config,
  } as BaseConnectionConfig

  if (isCreating.value) {
    connectionsStore.addConnection(fullConfig)
    connectionsStore.selectConnection(fullConfig.id)
    showSaveMessage(`Connection "${fullConfig.name}" created`)
  } else if (selectedConnectionId.value) {
    connectionsStore.updateConnection(selectedConnectionId.value, fullConfig)
    showSaveMessage(`Connection "${fullConfig.name}" saved`)
  }
}

// Handle cancel from editor
function handleCancel() {
  if (isCreating.value) {
    connectionsStore.selectedProtocol = null
  }
  connectionsStore.closeModal()
}

// Handle delete from editor
function handleDelete() {
  if (selectedConnectionId.value) {
    connectionsStore.removeConnection(selectedConnectionId.value)
  }
}

// Handle connection selection from list
function handleSelectConnection(connectionId: string) {
  connectionsStore.selectConnection(connectionId)
}

// Handle create new from list
function handleCreate() {
  connectionsStore.startCreate()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modalOpen"
        class="connection-modal-overlay"
        @click.self="connectionsStore.closeModal"
      >
        <div class="connection-modal">
          <!-- Header -->
          <div class="modal-header">
            <div class="header-left">
              <Plug class="header-icon" />
              <h2 class="modal-title">
                Connections
              </h2>
              <span class="connection-count">{{ connections.length }} configured</span>
            </div>
            <button
              class="close-btn"
              @click="connectionsStore.closeModal"
            >
              <X />
            </button>
          </div>

          <div class="modal-body">
            <!-- Sidebar: Connection List -->
            <div class="connection-sidebar">
              <ConnectionList
                :selected-id="selectedConnectionId"
                :show-actions="true"
                @select="handleSelectConnection"
                @create="handleCreate"
              />
            </div>

            <!-- Main Content: Editor -->
            <div class="connection-editor-area">
              <!-- No selection state -->
              <div
                v-if="!selectedConnection && !isCreating"
                class="editor-placeholder"
              >
                <Plug class="placeholder-icon" />
                <p>Select a connection to edit or create a new one</p>
              </div>

              <!-- Protocol selector when creating -->
              <ProtocolSelector
                v-else-if="isCreating && !selectedProtocol"
                @select="handleProtocolSelect"
              />

              <!-- Connection form -->
              <ConnectionEditor
                v-else-if="currentTypeDef"
                :type-def="currentTypeDef"
                :connection="selectedConnection"
                @save="handleSave"
                @cancel="handleCancel"
                @delete="handleDelete"
              />
            </div>
          </div>

          <!-- Save feedback toast -->
          <Transition name="save-toast">
            <div
              v-if="saveMessage"
              class="save-toast"
            >
              <CheckCircle class="save-toast-icon" />
              {{ saveMessage }}
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.connection-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-6);
}

.connection-modal {
  width: 100%;
  max-width: 960px;
  max-height: 90vh;
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-300);
  box-shadow: 8px 8px 0 0 var(--color-neutral-400);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border-bottom: 2px solid #4f46e5;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.header-icon {
  color: white;
  width: 20px;
  height: 20px;
}

.modal-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: white;
}

.connection-count {
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.8);
  padding: 2px var(--space-2);
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.close-btn:hover {
  color: white;
}

.close-btn svg {
  width: 20px;
  height: 20px;
}

.modal-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Sidebar */
.connection-sidebar {
  width: 280px;
  border-right: 1px solid var(--color-neutral-200);
  display: flex;
  flex-direction: column;
  background: var(--color-neutral-50);
  overflow: hidden;
}

/* Editor Area */
.connection-editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--space-4);
  overflow-y: auto;
}

.editor-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-neutral-400);
  text-align: center;
  padding: var(--space-6);
}

.placeholder-icon {
  width: 48px;
  height: 48px;
  margin-bottom: var(--space-3);
}

.editor-placeholder p {
  margin: 0;
  font-size: var(--font-size-sm);
}

/* Save toast */
.save-toast {
  position: absolute;
  bottom: var(--space-4);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  background: #059669;
  color: white;
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-offset);
  white-space: nowrap;
  z-index: 10;
}

.save-toast-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.save-toast-enter-active,
.save-toast-leave-active {
  transition: all 0.2s ease;
}

.save-toast-enter-from,
.save-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .connection-modal,
.modal-leave-to .connection-modal {
  transform: scale(0.95);
}
</style>
