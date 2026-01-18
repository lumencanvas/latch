<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import { useFlowsStore } from '@/stores/flows'
import { usePersistence } from '@/composables/usePersistence'

const flowsStore = useFlowsStore()
const { deleteFlow: deleteFlowFromDb, saveFlow } = usePersistence()

// Get only main flows (not subflows) for tabs
const openFlows = computed(() => flowsStore.mainFlows)
const activeFlowId = computed(() => flowsStore.activeFlowId)

// Context menu state
const contextMenu = ref<{
  visible: boolean
  flowId: string | null
  x: number
  y: number
}>({
  visible: false,
  flowId: null,
  x: 0,
  y: 0,
})

// Rename modal state
const renameModal = ref<{
  visible: boolean
  flowId: string | null
  name: string
}>({
  visible: false,
  flowId: null,
  name: '',
})

function selectFlow(flowId: string) {
  flowsStore.setActiveFlow(flowId)
}

function startRenameFlow(flowId: string) {
  const flow = flowsStore.getFlowById(flowId)
  if (flow) {
    renameModal.value = {
      visible: true,
      flowId: flow.id,
      name: flow.name,
    }
  }
}

async function createNewFlow() {
  const flow = flowsStore.createFlow('Untitled Flow')
  // Save the new flow to the database
  await saveFlow(flow.id)
}

async function closeFlow(flowId: string, event: MouseEvent) {
  event.stopPropagation()

  // Don't close if it's the only flow
  if (openFlows.value.length <= 1) return

  // Delete from database first, then from store
  await deleteFlowFromDb(flowId)
  flowsStore.deleteFlow(flowId)
}

function showContextMenu(flowId: string, event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()

  contextMenu.value = {
    visible: true,
    flowId,
    x: event.clientX,
    y: event.clientY,
  }

  // Close menu when clicking elsewhere
  const closeMenu = () => {
    contextMenu.value.visible = false
    document.removeEventListener('click', closeMenu)
  }
  setTimeout(() => {
    document.addEventListener('click', closeMenu)
  }, 0)
}

function renameFlow() {
  const flow = flowsStore.getFlowById(contextMenu.value.flowId!)
  if (flow) {
    renameModal.value = {
      visible: true,
      flowId: flow.id,
      name: flow.name,
    }
  }
  contextMenu.value.visible = false
}

function confirmRename() {
  if (renameModal.value.flowId && renameModal.value.name.trim()) {
    flowsStore.renameFlow(renameModal.value.flowId, renameModal.value.name.trim())
  }
  renameModal.value.visible = false
}

function cancelRename() {
  renameModal.value.visible = false
}

async function duplicateFlow() {
  if (contextMenu.value.flowId) {
    const newFlow = flowsStore.duplicateFlow(contextMenu.value.flowId)
    if (newFlow) {
      flowsStore.setActiveFlow(newFlow.id)
      // Save the duplicated flow to the database
      await saveFlow(newFlow.id)
    }
  }
  contextMenu.value.visible = false
}

async function closeFlowFromMenu() {
  if (contextMenu.value.flowId && openFlows.value.length > 1) {
    await deleteFlowFromDb(contextMenu.value.flowId)
    flowsStore.deleteFlow(contextMenu.value.flowId)
  }
  contextMenu.value.visible = false
}

// Handle keyboard in rename input
function handleRenameKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    confirmRename()
  } else if (event.key === 'Escape') {
    cancelRename()
  }
}
</script>

<template>
  <div class="flow-tabs">
    <div class="tabs-container">
      <div
        v-for="flow in openFlows"
        :key="flow.id"
        class="flow-tab"
        :class="{ active: flow.id === activeFlowId }"
        @click="selectFlow(flow.id)"
        @dblclick="startRenameFlow(flow.id)"
        @contextmenu="showContextMenu(flow.id, $event)"
      >
        <span class="tab-name">
          {{ flow.name }}
          <span
            v-if="flow.dirty"
            class="dirty-dot"
          >*</span>
        </span>
        <button
          v-if="openFlows.length > 1"
          class="close-btn"
          title="Close flow"
          @click="closeFlow(flow.id, $event)"
        >
          <X :size="12" />
        </button>
      </div>
    </div>

    <button
      class="new-tab-btn"
      title="New Flow"
      @click="createNewFlow"
    >
      <Plus :size="16" />
    </button>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <button
          class="menu-item"
          @click="renameFlow"
        >
          Rename
        </button>
        <button
          class="menu-item"
          @click="duplicateFlow"
        >
          Duplicate
        </button>
        <div class="menu-divider" />
        <button
          class="menu-item danger"
          :disabled="openFlows.length <= 1"
          @click="closeFlowFromMenu"
        >
          Close
        </button>
      </div>
    </Teleport>

    <!-- Rename Modal -->
    <Teleport to="body">
      <div
        v-if="renameModal.visible"
        class="modal-overlay"
        @click.self="cancelRename"
      >
        <div class="rename-modal">
          <h3>Rename Flow</h3>
          <input
            ref="renameInput"
            v-model="renameModal.name"
            type="text"
            class="rename-input"
            placeholder="Flow name"
            autofocus
            @keydown="handleRenameKeydown"
          >
          <div class="modal-actions">
            <button
              class="btn btn-secondary"
              @click="cancelRename"
            >
              Cancel
            </button>
            <button
              class="btn btn-primary"
              @click="confirmRename"
            >
              Rename
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.flow-tabs {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  height: 32px;
  padding: 0 var(--space-2);
  background: var(--color-neutral-900);
  border-bottom: 1px solid var(--color-neutral-700);
}

.tabs-container {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  flex: 1;
  scrollbar-width: none;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

.flow-tab {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-400);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  max-width: 160px;
}

.flow-tab:hover {
  color: var(--color-neutral-200);
  background: var(--color-neutral-800);
}

.flow-tab.active {
  color: var(--color-neutral-0);
  background: var(--color-neutral-700);
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.dirty-dot {
  color: var(--color-warning);
  margin-left: 2px;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--color-neutral-500);
  cursor: pointer;
  opacity: 0;
  transition: all 0.1s ease;
}

.flow-tab:hover .close-btn {
  opacity: 1;
}

.close-btn:hover {
  background: var(--color-neutral-600);
  color: var(--color-neutral-200);
}

.new-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-neutral-400);
  cursor: pointer;
  transition: all 0.15s ease;
}

.new-tab-btn:hover {
  background: var(--color-neutral-700);
  color: var(--color-neutral-200);
}

/* Context Menu */
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 150px;
  background: var(--color-neutral-800);
  border: 1px solid var(--color-neutral-600);
  border-radius: var(--radius-sm);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  padding: var(--space-1);
}

.menu-item {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-200);
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-xs);
  transition: background 0.1s ease;
}

.menu-item:hover:not(:disabled) {
  background: var(--color-neutral-700);
}

.menu-item:disabled {
  color: var(--color-neutral-500);
  cursor: not-allowed;
}

.menu-item.danger {
  color: var(--color-error);
}

.menu-item.danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.15);
}

.menu-divider {
  height: 1px;
  background: var(--color-neutral-600);
  margin: var(--space-1) 0;
}

/* Rename Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}

.rename-modal {
  width: 320px;
  padding: var(--space-4);
  background: var(--color-neutral-800);
  border: 1px solid var(--color-neutral-600);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.rename-modal h3 {
  margin: 0 0 var(--space-3) 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-100);
}

.rename-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-100);
  background: var(--color-neutral-900);
  border: 1px solid var(--color-neutral-600);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-4);
}

.rename-input:focus {
  outline: none;
  border-color: var(--color-primary-500);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.modal-actions .btn {
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}

.modal-actions .btn-secondary {
  background: var(--color-neutral-700);
  border: 1px solid var(--color-neutral-600);
  color: var(--color-neutral-200);
}

.modal-actions .btn-secondary:hover {
  background: var(--color-neutral-600);
}

.modal-actions .btn-primary {
  background: var(--color-primary-500);
  border: 1px solid var(--color-primary-500);
  color: white;
}

.modal-actions .btn-primary:hover {
  background: var(--color-primary-600);
}
</style>
