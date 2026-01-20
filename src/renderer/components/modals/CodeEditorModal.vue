<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { X, Save, RotateCcw, Info } from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore } from '@/stores/nodes'
import MonacoEditor from '@/components/editors/MonacoEditor.vue'

const uiStore = useUIStore()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()

// Local state
const code = ref('')
const originalCode = ref('')
const showHelp = ref(false)

// Get the node being edited
const editingNode = computed(() => {
  if (!uiStore.codeEditorNodeId || !flowsStore.activeFlow) return null
  return flowsStore.activeFlow.nodes.find(n => n.id === uiStore.codeEditorNodeId) ?? null
})

// Get node definition
const nodeDefinition = computed(() => {
  if (!editingNode.value) return null
  const nodeType = editingNode.value.data?.nodeType as string
  return nodesStore.getDefinition(nodeType) ?? null
})

// Check if code has changed
const hasChanges = computed(() => code.value !== originalCode.value)

// Initialize code when node changes
watch(() => uiStore.codeEditorNodeId, () => {
  if (editingNode.value) {
    const nodeCode = editingNode.value.data?.code as string ?? getDefaultCode()
    code.value = nodeCode
    originalCode.value = nodeCode
  }
}, { immediate: true })

function getDefaultCode(): string {
  return `// Access inputs via: inputs.a, inputs.b, etc.
// Access time via: time, deltaTime, frame
// Use state: getState('key', default), setState('key', value)
// Return a value or object with multiple outputs

return inputs.a + inputs.b;`
}

function saveCode() {
  if (editingNode.value) {
    flowsStore.updateNodeData(editingNode.value.id, {
      code: code.value,
    })
    originalCode.value = code.value
  }
}

function resetCode() {
  code.value = originalCode.value
}

function close() {
  if (hasChanges.value) {
    if (confirm('You have unsaved changes. Save before closing?')) {
      saveCode()
    }
  }
  uiStore.closeCodeEditor()
}

// Save on Ctrl/Cmd+S
function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveCode()
  }
  if (e.key === 'Escape') {
    close()
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.codeEditorOpen"
      class="modal-overlay"
      @keydown="handleKeydown"
    >
      <div class="modal-container">
        <!-- Header -->
        <div class="modal-header">
          <div class="header-left">
            <h2 class="modal-title">
              Function Editor
              <span
                v-if="nodeDefinition"
                class="node-name"
              >
                - {{ editingNode?.data?.label || nodeDefinition.name }}
              </span>
            </h2>
            <span
              v-if="hasChanges"
              class="unsaved-indicator"
            >Modified</span>
          </div>

          <div class="header-actions">
            <button
              class="action-btn"
              title="Help (H)"
              :class="{ active: showHelp }"
              @click="showHelp = !showHelp"
            >
              <Info :size="18" />
            </button>
            <button
              class="action-btn"
              title="Reset (Ctrl+Z)"
              :disabled="!hasChanges"
              @click="resetCode"
            >
              <RotateCcw :size="18" />
            </button>
            <button
              class="action-btn primary"
              title="Save (Ctrl+S)"
              :disabled="!hasChanges"
              @click="saveCode"
            >
              <Save :size="18" />
              <span>Save</span>
            </button>
            <button
              class="close-btn"
              title="Close (Esc)"
              @click="close"
            >
              <X :size="20" />
            </button>
          </div>
        </div>

        <!-- Main content -->
        <div class="modal-content">
          <!-- Help panel -->
          <div
            v-if="showHelp"
            class="help-panel"
          >
            <h3>Function Node Help</h3>
            <div class="help-section">
              <h4>Available Variables</h4>
              <ul>
                <li><code>inputs.a</code>, <code>inputs.b</code>, <code>inputs.c</code>, <code>inputs.d</code> - Input values</li>
                <li><code>time</code> - Current time in seconds</li>
                <li><code>deltaTime</code> - Time since last frame</li>
                <li><code>frame</code> - Current frame number</li>
              </ul>
            </div>
            <div class="help-section">
              <h4>State Management</h4>
              <ul>
                <li><code>getState('key', defaultValue)</code> - Get persistent state</li>
                <li><code>setState('key', value)</code> - Set persistent state</li>
              </ul>
            </div>
            <div class="help-section">
              <h4>Output</h4>
              <ul>
                <li>Return a single value for the <code>result</code> output</li>
                <li>Return an object <code>{ result: ..., error: ... }</code> for multiple outputs</li>
              </ul>
            </div>
            <div class="help-section">
              <h4>Example</h4>
              <pre>// Smooth value with state
const smoothed = getState('smooth', inputs.a);
const newSmooth = smoothed + (inputs.a - smoothed) * 0.1;
setState('smooth', newSmooth);
return newSmooth;</pre>
            </div>
          </div>

          <!-- Editor -->
          <div class="editor-panel">
            <MonacoEditor
              v-model="code"
              language="javascript"
              theme="vs-dark"
              :minimap="true"
              line-numbers="on"
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  width: 90vw;
  max-width: 1200px;
  height: 85vh;
  background: var(--color-neutral-900);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  background: var(--color-neutral-800);
  border-bottom: 1px solid var(--color-neutral-700);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.modal-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-100);
  margin: 0;
}

.node-name {
  font-weight: var(--font-weight-normal);
  color: var(--color-neutral-400);
}

.unsaved-indicator {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-warning-400);
  background: rgba(251, 191, 36, 0.2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-300);
  background: var(--color-neutral-700);
  border: 1px solid var(--color-neutral-600);
  border-radius: var(--radius-default);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover:not(:disabled) {
  background: var(--color-neutral-600);
  color: var(--color-neutral-100);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.active {
  background: var(--color-primary-600);
  border-color: var(--color-primary-500);
  color: white;
}

.action-btn.primary {
  background: var(--color-primary-600);
  border-color: var(--color-primary-500);
  color: white;
}

.action-btn.primary:hover:not(:disabled) {
  background: var(--color-primary-500);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: var(--color-neutral-400);
  background: transparent;
  border: none;
  border-radius: var(--radius-default);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--color-neutral-700);
  color: var(--color-neutral-100);
}

.modal-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.help-panel {
  width: 300px;
  padding: var(--space-4);
  background: var(--color-neutral-850);
  border-right: 1px solid var(--color-neutral-700);
  overflow-y: auto;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-300);
}

.help-panel h3 {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-100);
  margin: 0 0 var(--space-4);
}

.help-section {
  margin-bottom: var(--space-4);
}

.help-section h4 {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary-400);
  margin: 0 0 var(--space-2);
}

.help-section ul {
  margin: 0;
  padding-left: var(--space-4);
}

.help-section li {
  margin-bottom: var(--space-1);
}

.help-section code {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  background: var(--color-neutral-800);
  padding: 2px 4px;
  border-radius: 2px;
  color: var(--color-primary-300);
}

.help-section pre {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  background: var(--color-neutral-800);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  white-space: pre-wrap;
  color: var(--color-neutral-200);
}

.editor-panel {
  flex: 1;
  min-width: 0;
}

.editor-panel :deep(.monaco-editor-container) {
  height: 100%;
}
</style>
