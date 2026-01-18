<script setup lang="ts">
import { computed, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { ChevronDown, ChevronRight, Type } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta, type NodeDefinition, useNodesStore } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()

// Collapsed state
const isCollapsed = ref(false)

// Resizing state
const isResizing = ref(false)
const startHeight = ref(100)
const startY = ref(0)

// Get definition from nodesStore
const definition = computed<NodeDefinition | null>(() => {
  const nodeType = (props.data?.nodeType as string) ?? 'textbox'
  return nodesStore.getDefinition(nodeType) ?? null
})

const categoryColor = computed(() => {
  if (!definition.value) return 'var(--color-neutral-400)'
  return categoryMeta[definition.value.category]?.color ?? 'var(--color-neutral-400)'
})

// Text value
const textValue = computed({
  get: () => (props.data?.text as string) ?? '',
  set: (value: string) => {
    flowsStore.updateNodeData(props.id, { text: value })
  },
})

// Node height for resizing
const nodeHeight = computed({
  get: () => (props.data?.height as number) ?? 100,
  set: (value: number) => {
    flowsStore.updateNodeData(props.id, { height: Math.max(60, Math.min(400, value)) })
  },
})


function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}

// Resize handlers
function onResizeStart(event: MouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  isResizing.value = true
  startHeight.value = nodeHeight.value
  startY.value = event.clientY

  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(event: MouseEvent) {
  if (!isResizing.value) return
  const deltaY = event.clientY - startY.value
  nodeHeight.value = startHeight.value + deltaY
}

function onResizeEnd() {
  isResizing.value = false
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

// Preview text for collapsed state
const previewText = computed(() => {
  const text = textValue.value
  if (!text) return '(empty)'
  if (text.length > 30) return text.slice(0, 30) + '...'
  return text
})
</script>

<template>
  <!-- Collapsed State -->
  <div
    v-if="isCollapsed"
    class="textbox-node textbox-node-collapsed"
    :class="{ selected: props.selected }"
  >
    <div class="collapsed-content">
      <Type
        :size="14"
        class="collapsed-icon"
      />
      <span class="collapsed-text">{{ previewText }}</span>
    </div>

    <!-- Output handle -->
    <Handle
      id="text"
      type="source"
      :position="Position.Right"
      :style="{ background: getTypeColor('string') }"
      class="port-handle"
    />

    <!-- Trigger input handle -->
    <Handle
      id="trigger"
      type="target"
      :position="Position.Left"
      :style="{ background: getTypeColor('trigger') }"
      class="port-handle"
    />

    <!-- Expand button -->
    <button
      class="expand-btn"
      @click.stop="toggleCollapse"
    >
      <ChevronRight :size="12" />
    </button>
  </div>

  <!-- Expanded State -->
  <div
    v-else
    class="textbox-node"
    :class="{ selected: props.selected, resizing: isResizing }"
  >
    <!-- Header -->
    <div
      class="node-header"
      :style="{ borderLeftColor: categoryColor }"
    >
      <Type
        :size="14"
        class="header-icon"
      />
      <span class="node-title">Textbox</span>
      <button
        class="node-collapse-btn"
        @click.stop="toggleCollapse"
      >
        <ChevronDown :size="14" />
      </button>
    </div>

    <!-- Body -->
    <div class="node-body">
      <!-- Trigger Input -->
      <div class="input-row">
        <Handle
          id="trigger"
          type="target"
          :position="Position.Left"
          :style="{ background: getTypeColor('trigger') }"
          class="port-handle"
        />
        <span class="port-label">Trigger</span>
      </div>

      <!-- Resizable Textarea -->
      <div
        class="textarea-wrapper"
        :style="{ height: nodeHeight + 'px' }"
      >
        <textarea
          v-model="textValue"
          class="text-input"
          placeholder="Enter text..."
          @mousedown.stop
        />
      </div>

      <!-- Resize Handle -->
      <div
        class="resize-handle"
        @mousedown="onResizeStart"
      >
        <div class="resize-grip" />
      </div>

      <!-- Output Row -->
      <div class="output-row">
        <span class="output-label">Output:</span>
        <span class="output-value">{{ previewText }}</span>
        <Handle
          id="text"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('string') }"
          class="port-handle"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.textbox-node {
  min-width: 200px;
  max-width: 400px;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-default);
  box-shadow: 3px 3px 0 0 var(--color-neutral-300);
  font-family: var(--font-mono);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
}

.textbox-node.selected {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.textbox-node:hover {
  box-shadow: 4px 4px 0 0 var(--color-neutral-400);
}

.textbox-node.resizing {
  user-select: none;
}

/* Collapsed State */
.textbox-node-collapsed {
  min-width: auto;
  max-width: none;
  padding: var(--space-2) var(--space-3);
  position: relative;
}

.collapsed-content {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-right: var(--space-4);
}

.collapsed-icon {
  color: var(--color-neutral-500);
  flex-shrink: 0;
}

.collapsed-text {
  font-size: var(--font-size-sm);
  color: var(--color-neutral-600);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}

.textbox-node-collapsed .expand-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 16px;
  height: 16px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-full);
  color: var(--color-neutral-500);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.textbox-node-collapsed .expand-btn:hover {
  background: var(--color-neutral-100);
  color: var(--color-neutral-700);
}

/* Header */
.node-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--color-neutral-200);
  border-left: 3px solid var(--color-neutral-400);
  border-radius: var(--radius-default) var(--radius-default) 0 0;
}

.header-icon {
  color: var(--color-neutral-500);
}

.node-title {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-800);
}

.node-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.node-collapse-btn:hover {
  color: var(--color-neutral-600);
}

/* Body */
.node-body {
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Input Row */
.input-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  position: relative;
}

.port-label {
  font-size: 10px;
  color: var(--color-neutral-500);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Textarea */
.textarea-wrapper {
  position: relative;
  min-height: 60px;
}

.text-input {
  width: 100%;
  height: 100%;
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  background: var(--color-neutral-50);
  color: var(--color-neutral-700);
  resize: none;
  line-height: 1.4;
}

.text-input:focus {
  outline: none;
  border-color: var(--color-primary-400);
  background: var(--color-neutral-0);
}

.text-input::placeholder {
  color: var(--color-neutral-400);
}

/* Resize Handle */
.resize-handle {
  display: flex;
  justify-content: center;
  padding: var(--space-1) 0;
  cursor: ns-resize;
}

.resize-grip {
  width: 40px;
  height: 4px;
  background: var(--color-neutral-200);
  border-radius: 2px;
  transition: background var(--transition-fast);
}

.resize-handle:hover .resize-grip {
  background: var(--color-neutral-400);
}

/* Output Row */
.output-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-neutral-100);
  position: relative;
}

.output-label {
  font-size: 10px;
  color: var(--color-neutral-500);
}

.output-value {
  flex: 1;
  font-size: 11px;
  color: var(--color-neutral-600);
  background: var(--color-neutral-100);
  padding: 2px 8px;
  border-radius: var(--radius-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Handle styles */
:deep(.port-handle) {
  width: var(--node-port-size) !important;
  height: var(--node-port-size) !important;
  border: 2px solid var(--color-neutral-0) !important;
  border-radius: var(--radius-full) !important;
}

:deep(.vue-flow__handle-right) {
  right: calc(var(--node-port-size) / -2 - 1px) !important;
}

:deep(.vue-flow__handle-left) {
  left: calc(var(--node-port-size) / -2 - 1px) !important;
}
</style>
