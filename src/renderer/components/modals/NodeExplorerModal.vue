<script setup lang="ts">
import { watch } from 'vue'
import { X, GraduationCap } from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'
import { useFlowsStore } from '@/stores/flows'
import { useNodeExplorerStore } from '@/stores/node-explorer'
import { flowSnippets } from '@/data/flow-snippets'
import { nanoid } from 'nanoid'
import NodeExplorer from '@/components/node-explorer/NodeExplorer.vue'

const uiStore = useUIStore()
const flowsStore = useFlowsStore()
const explorerStore = useNodeExplorerStore()

// Reset explorer state when opening
watch(() => uiStore.nodeExplorerOpen, (open) => {
  if (open) {
    explorerStore.reset()
  }
})

function close() {
  uiStore.closeNodeExplorer()
}

function handleAddNode(nodeId: string) {
  // Add node to center of viewport
  flowsStore.addNode(nodeId, { x: 400, y: 300 })
  close()
}

function handleInsertSnippet(snippetId: string) {
  const snippet = flowSnippets.find(s => s.id === snippetId)
  if (!snippet || !flowsStore.activeFlow) return

  // Clone snippet nodes with new IDs
  const idMap = new Map<string, string>()
  const baseX = 400
  const baseY = 300

  for (const node of snippet.nodes) {
    const newId = nanoid()
    idMap.set(node.id, newId)
    flowsStore.addNode(node.type, {
      x: baseX + node.position.x,
      y: baseY + node.position.y,
    })
  }

  // Note: edges between snippet nodes would need the new IDs.
  // For simplicity, we just add the nodes. Users can wire them up.
  close()
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="uiStore.nodeExplorerOpen"
        class="modal-overlay"
        @click.self="close"
        @keydown="handleKeydown"
      >
        <div class="modal-container">
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-title-group">
              <GraduationCap :size="18" />
              <h2 class="modal-title">
                NODE EXPLORER
              </h2>
            </div>
            <button
              class="close-btn"
              @click="close"
            >
              <X :size="16" />
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <NodeExplorer
              @add-node="handleAddNode"
              @insert-snippet="handleInsertSnippet"
              @close="close"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
}

.modal-container {
  width: 90vw;
  max-width: 900px;
  height: 80vh;
  max-height: 700px;
  display: flex;
  flex-direction: column;
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-800);
  box-shadow: 6px 6px 0 0 var(--color-neutral-800);
  font-family: var(--font-mono);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 2px solid var(--color-neutral-800);
  background: var(--color-neutral-50);
}

.modal-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-neutral-800);
}

.modal-title {
  font-size: 14px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
  margin: 0;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: 1px solid var(--color-neutral-300);
  cursor: pointer;
  color: var(--color-neutral-600);
}

.close-btn:hover {
  background: var(--color-neutral-200);
  color: var(--color-neutral-800);
}

.modal-body {
  flex: 1;
  overflow: hidden;
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.15s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container {
  transform: translateY(20px);
}

.modal-leave-to .modal-container {
  transform: translateY(20px);
}
</style>
