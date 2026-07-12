<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, shallowRef } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { Code2 } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'
import { useRuntimeStore } from '@/stores/runtime'
import * as monaco from 'monaco-editor'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()
const runtimeStore = useRuntimeStore()

const categoryColor = computed(() => {
  return categoryMeta['code']?.color ?? 'var(--color-neutral-400)'
})

// Editor state
const editorContainer = ref<HTMLElement | null>(null)
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)
const isCollapsed = ref(false)

// Get current code from node data
const code = computed(() => {
  return (props.data?.code as string) ?? `// Access inputs via: inputs.a, inputs.b, etc.
// Access time via: time, deltaTime, frame
// Return a value or object

return inputs.a + inputs.b;`
})

// Get node inputs/outputs from definition
const inputs = computed(() => {
  return props.data?.inputs as Array<{ id: string; type: string; label: string }> ?? [
    { id: 'a', type: 'any', label: 'A' },
    { id: 'b', type: 'any', label: 'B' },
    { id: 'c', type: 'any', label: 'C' },
    { id: 'd', type: 'any', label: 'D' },
  ]
})

const outputs = computed(() => {
  return props.data?.outputs as Array<{ id: string; type: string; label: string }> ?? [
    { id: 'result', type: 'any', label: 'Result' },
    { id: 'error', type: 'string', label: 'Error' },
  ]
})

// Get error from runtime metrics
const error = computed(() => {
  const metrics = runtimeStore.nodeMetrics.get(props.id)
  return metrics?.outputValues?.error as string | undefined
})

function updateCode(newCode: string) {
  flowsStore.updateNodeData(props.id, { code: newCode })
}

function initEditor() {
  if (!editorContainer.value || editor.value) return

  // Configure Monaco for embedded use
  editor.value = monaco.editor.create(editorContainer.value, {
    value: code.value,
    language: 'javascript',
    theme: 'vs-dark',
    minimap: { enabled: false },
    lineNumbers: 'off',
    scrollBeyondLastLine: false,
    folding: false,
    glyphMargin: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    overviewRulerBorder: false,
    scrollbar: {
      vertical: 'auto',
      horizontal: 'auto',
      verticalScrollbarSize: 6,
      horizontalScrollbarSize: 6,
    },
    fontSize: 11,
    fontFamily: 'var(--font-mono, monospace)',
    automaticLayout: true,
    wordWrap: 'on',
    tabSize: 2,
    padding: { top: 4, bottom: 4 },
  })

  // Listen for content changes
  editor.value.onDidChangeModelContent(() => {
    const newCode = editor.value?.getValue() ?? ''
    updateCode(newCode)
  })

  // Stop event propagation for drag/pan prevention
  editorContainer.value.addEventListener('mousedown', (e) => {
    e.stopPropagation()
  })
  editorContainer.value.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
  })
}

function disposeEditor() {
  if (editor.value) {
    editor.value.dispose()
    editor.value = null
  }
}

// Watch for external code changes
watch(code, (newCode) => {
  if (editor.value && editor.value.getValue() !== newCode) {
    editor.value.setValue(newCode)
  }
})

// Watch for collapse state
watch(isCollapsed, (collapsed) => {
  if (!collapsed) {
    // Re-init editor when expanding
    setTimeout(() => {
      if (!editor.value && editorContainer.value) {
        initEditor()
      }
    }, 50)
  } else {
    disposeEditor()
  }
})

onMounted(() => {
  if (!isCollapsed.value) {
    initEditor()
  }
})

onUnmounted(() => {
  disposeEditor()
})

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div
    class="function-node"
    :class="{ selected: props.selected, collapsed: isCollapsed }"
  >
    <!-- Input Handles Column -->
    <div class="handles-column handles-left">
      <div
        v-for="input in inputs"
        :key="input.id"
        class="handle-slot"
      >
        <Handle
          :id="input.id"
          type="target"
          :position="Position.Left"
          :style="{ background: getTypeColor(input.type) }"
          class="port-handle"
        />
        <span class="port-label">{{ input.label }}</span>
      </div>
    </div>

    <!-- Node Content -->
    <div class="node-content">
      <!-- Header -->
      <div
        class="node-header"
        :style="{ borderLeftColor: categoryColor }"
        @dblclick="toggleCollapse"
      >
        <Code2
          :size="14"
          class="node-icon"
          :style="{ color: categoryColor }"
        />
        <span class="node-title">Function</span>
        <span
          v-if="error"
          class="error-indicator"
          title="Error in function"
        >!</span>
      </div>

      <!-- Code Editor -->
      <div
        v-if="!isCollapsed"
        class="editor-container"
      >
        <div
          ref="editorContainer"
          class="monaco-editor-wrapper"
          @pointerdown.stop
          @touchstart.stop
        />
        <div
          v-if="error"
          class="error-display"
        >
          {{ error }}
        </div>
      </div>
    </div>

    <!-- Output Handles Column -->
    <div class="handles-column handles-right">
      <div
        v-for="output in outputs"
        :key="output.id"
        class="handle-slot"
      >
        <Handle
          :id="output.id"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor(output.type) }"
          class="port-handle"
        />
        <span class="port-label port-label-right">{{ output.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.function-node {
  position: relative;
  min-width: 280px;
  font-family: var(--font-mono);
}

.function-node.collapsed {
  min-width: 180px;
}

.node-content {
  background: var(--color-neutral-900);
  border: 1px solid var(--color-neutral-700);
  border-radius: var(--radius-default);
  box-shadow: 3px 3px 0 0 var(--color-neutral-800);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
  overflow: hidden;
}

.function-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.function-node:hover .node-content {
  box-shadow: 4px 4px 0 0 var(--color-neutral-600);
}

/* Header */
.node-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-800);
  border-bottom: 1px solid var(--color-neutral-700);
  border-left: 3px solid var(--color-neutral-400);
  border-radius: var(--radius-default) var(--radius-default) 0 0;
  cursor: pointer;
}

.node-icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.node-title {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-200);
}

.error-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: bold;
  border-radius: 50%;
}

/* Editor Container */
.editor-container {
  padding: var(--space-2);
}

.monaco-editor-wrapper {
  width: 100%;
  height: 120px;
  border: 1px solid var(--color-neutral-700);
  border-radius: 4px;
  overflow: hidden;
}

.error-display {
  margin-top: 4px;
  padding: 4px 8px;
  font-size: 9px;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 2px;
  word-break: break-word;
}

/* Handle columns - positioned at node edges */
.handles-column {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 2px;
  z-index: 10;
  padding-top: 44px;
}

.handles-left {
  left: 0;
}

.handles-right {
  right: 0;
}

.handle-slot {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}

.port-label {
  position: absolute;
  left: 16px;
  font-size: 9px;
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-500);
  text-transform: uppercase;
  white-space: nowrap;
}

.port-label-right {
  left: auto;
  right: 16px;
}

:deep(.port-handle) {
  width: var(--node-port-size, 10px) !important;
  height: var(--node-port-size, 10px) !important;
  border: 2px solid var(--color-neutral-900) !important;
  border-radius: 50% !important;
  position: absolute !important;
}

:deep(.port-handle:hover) {
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
}

:deep(.vue-flow__handle-left) {
  left: calc(var(--node-port-size, 10px) / -2) !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}

:deep(.vue-flow__handle-right) {
  right: calc(var(--node-port-size, 10px) / -2) !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}
</style>
