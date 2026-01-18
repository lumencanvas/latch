<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { ChevronDown, ChevronRight, Move } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta, type NodeDefinition, useNodesStore } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()

// Collapsed state
const isCollapsed = ref(false)
const showRange = ref(false)
const padRef = ref<HTMLDivElement | null>(null)
const isDragging = ref(false)
const hoveredPort = ref<string | null>(null)

// Get definition from nodesStore (more reliable than props.data.definition)
const definition = computed<NodeDefinition | null>(() => {
  const nodeType = (props.data?.nodeType as string) ?? 'xy-pad'
  return nodesStore.getDefinition(nodeType) ?? props.data?.definition ?? null
})

const categoryColor = computed(() => {
  if (!definition.value) return 'var(--color-neutral-400)'
  return categoryMeta[definition.value.category]?.color ?? 'var(--color-neutral-400)'
})

// Control values (0-1 normalized)
const normalizedX = computed({
  get: () => (props.data?.normalizedX as number) ?? 0.5,
  set: (value: number) => {
    flowsStore.updateNodeData(props.id, { normalizedX: Math.max(0, Math.min(1, value)) })
  },
})

const normalizedY = computed({
  get: () => (props.data?.normalizedY as number) ?? 0.5,
  set: (value: number) => {
    flowsStore.updateNodeData(props.id, { normalizedY: Math.max(0, Math.min(1, value)) })
  },
})

// Range values
const minX = computed({
  get: () => (props.data?.minX as number) ?? 0,
  set: (value: number) => {
    flowsStore.updateNodeData(props.id, { minX: value })
  },
})

const maxX = computed({
  get: () => (props.data?.maxX as number) ?? 1,
  set: (value: number) => {
    flowsStore.updateNodeData(props.id, { maxX: value })
  },
})

const minY = computed({
  get: () => (props.data?.minY as number) ?? 0,
  set: (value: number) => {
    flowsStore.updateNodeData(props.id, { minY: value })
  },
})

const maxY = computed({
  get: () => (props.data?.maxY as number) ?? 1,
  set: (value: number) => {
    flowsStore.updateNodeData(props.id, { maxY: value })
  },
})

// Computed raw values (mapped to range)
const rawX = computed(() => {
  return minX.value + normalizedX.value * (maxX.value - minX.value)
})

const rawY = computed(() => {
  return minY.value + normalizedY.value * (maxY.value - minY.value)
})

// Point position as CSS percentage
const pointStyle = computed(() => ({
  left: `${normalizedX.value * 100}%`,
  top: `${(1 - normalizedY.value) * 100}%`,
}))

function handlePadClick(event: MouseEvent) {
  updateFromEvent(event)
}

function handlePadMouseDown(event: MouseEvent) {
  isDragging.value = true
  updateFromEvent(event)
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
}

function handleMouseMove(event: MouseEvent) {
  if (isDragging.value) {
    updateFromEvent(event)
  }
}

function handleMouseUp() {
  isDragging.value = false
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
}

function updateFromEvent(event: MouseEvent) {
  if (!padRef.value) return

  const rect = padRef.value.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width
  const y = 1 - (event.clientY - rect.top) / rect.height

  normalizedX.value = Math.max(0, Math.min(1, x))
  normalizedY.value = Math.max(0, Math.min(1, y))
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', handleMouseUp)
})
</script>

<template>
  <div
    class="xypad-node"
    :class="{ selected: props.selected, collapsed: isCollapsed }"
  >
    <!-- Output Handles Column (right side) -->
    <div class="handles-column handles-right">
      <div
        class="handle-slot"
        @mouseenter="hoveredPort = 'rawX'"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          id="rawX"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('number') }"
          class="port-handle"
        />
        <div
          class="port-label port-label-right"
          :class="{ visible: hoveredPort === 'rawX' || props.selected }"
        >
          <span class="label-text">X</span>
          <span
            class="label-type"
            :style="{ color: getTypeColor('number') }"
          >raw</span>
        </div>
      </div>
      <div
        class="handle-slot"
        @mouseenter="hoveredPort = 'rawY'"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          id="rawY"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('number') }"
          class="port-handle"
        />
        <div
          class="port-label port-label-right"
          :class="{ visible: hoveredPort === 'rawY' || props.selected }"
        >
          <span class="label-text">Y</span>
          <span
            class="label-type"
            :style="{ color: getTypeColor('number') }"
          >raw</span>
        </div>
      </div>
      <div
        class="handle-slot"
        @mouseenter="hoveredPort = 'normX'"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          id="normX"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('number') }"
          class="port-handle"
        />
        <div
          class="port-label port-label-right"
          :class="{ visible: hoveredPort === 'normX' || props.selected }"
        >
          <span class="label-text">nX</span>
          <span
            class="label-type"
            :style="{ color: getTypeColor('number') }"
          >0→1</span>
        </div>
      </div>
      <div
        class="handle-slot"
        @mouseenter="hoveredPort = 'normY'"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          id="normY"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('number') }"
          class="port-handle"
        />
        <div
          class="port-label port-label-right"
          :class="{ visible: hoveredPort === 'normY' || props.selected }"
        >
          <span class="label-text">nY</span>
          <span
            class="label-type"
            :style="{ color: getTypeColor('number') }"
          >0→1</span>
        </div>
      </div>
    </div>

    <!-- Node Content -->
    <div class="node-content">
      <!-- Header -->
      <div
        class="node-header"
        :style="{ borderLeftColor: categoryColor }"
      >
        <Move
          :size="14"
          class="header-icon"
        />
        <span class="node-title">XY-Pad</span>
        <button
          class="node-collapse-btn"
          @click.stop="toggleCollapse"
        >
          <ChevronDown
            v-if="!isCollapsed"
            :size="14"
          />
          <ChevronRight
            v-else
            :size="14"
          />
        </button>
      </div>

      <!-- Body -->
      <div
        v-if="!isCollapsed"
        class="node-body"
      >
        <!-- XY Pad Area -->
        <div
          ref="padRef"
          class="pad-area"
          @mousedown.stop="handlePadMouseDown"
          @click.stop="handlePadClick"
        >
          <!-- Grid lines -->
          <div class="pad-grid">
            <div class="grid-line-h" />
            <div class="grid-line-v" />
          </div>

          <!-- Point -->
          <div
            class="pad-point"
            :style="pointStyle"
          />
        </div>

        <!-- Value Display -->
        <div class="value-display">
          <div class="value-item">
            <span class="value-label">X:</span>
            <span class="value-number">{{ rawX.toFixed(2) }}</span>
          </div>
          <div class="value-item">
            <span class="value-label">Y:</span>
            <span class="value-number">{{ rawY.toFixed(2) }}</span>
          </div>
        </div>

        <!-- Range Section -->
        <div class="range-section">
          <button
            class="range-toggle"
            @click.stop="showRange = !showRange"
            @mousedown.stop
          >
            <ChevronRight
              v-if="!showRange"
              :size="12"
            />
            <ChevronDown
              v-else
              :size="12"
            />
            <span>RANGE</span>
          </button>

          <div
            v-if="showRange"
            class="range-controls"
          >
            <div class="range-row">
              <label>X Min</label>
              <input
                type="number"
                :value="minX"
                @input="minX = parseFloat(($event.target as HTMLInputElement).value) || 0"
                @mousedown.stop
              >
              <label>Max</label>
              <input
                type="number"
                :value="maxX"
                @input="maxX = parseFloat(($event.target as HTMLInputElement).value) || 1"
                @mousedown.stop
              >
            </div>
            <div class="range-row">
              <label>Y Min</label>
              <input
                type="number"
                :value="minY"
                @input="minY = parseFloat(($event.target as HTMLInputElement).value) || 0"
                @mousedown.stop
              >
              <label>Max</label>
              <input
                type="number"
                :value="maxY"
                @input="maxY = parseFloat(($event.target as HTMLInputElement).value) || 1"
                @mousedown.stop
              >
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.xypad-node {
  position: relative;
  min-width: 180px;
  font-family: var(--font-mono);
}

/* Node content - the visible box */
.node-content {
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-default);
  box-shadow: 3px 3px 0 0 var(--color-neutral-300);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
  overflow: hidden;
}

.xypad-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.xypad-node:hover .node-content {
  box-shadow: 4px 4px 0 0 var(--color-neutral-400);
}

/* Handle columns - same as BaseNode */
.handles-column {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 2px;
  z-index: 10;
  padding-top: 16px;
}

.handles-right {
  right: 0;
}

/* For collapsed nodes, stack all handles at the same position */
.xypad-node.collapsed .handles-column {
  justify-content: center;
  padding-top: 0;
  gap: 0;
}

.xypad-node.collapsed .handle-slot {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: auto;
}

/* Hide port labels when collapsed */
.xypad-node.collapsed .port-label {
  display: none;
}

.handle-slot {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}

/* Port labels - positioned OUTSIDE the node */
.port-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  font-size: 9px;
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-600);
  background: var(--color-neutral-0);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--color-neutral-200);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  z-index: 1000;
}

.port-label.visible {
  opacity: 1;
}

.port-label-right {
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
}

.label-text {
  color: var(--color-neutral-600);
}

.label-type {
  font-weight: var(--font-weight-bold);
  text-transform: lowercase;
  opacity: 0.85;
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
  gap: var(--space-3);
}

/* Pad Area */
.pad-area {
  width: 150px;
  height: 120px;
  background: linear-gradient(135deg, #E9E4F0 0%, #D3CCE3 100%);
  border-radius: var(--radius-xs);
  position: relative;
  cursor: crosshair;
  user-select: none;
}

.pad-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.grid-line-h {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(107, 70, 193, 0.3);
}

.grid-line-v {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(107, 70, 193, 0.3);
}

.pad-point {
  position: absolute;
  width: 14px;
  height: 14px;
  background: #7C3AED;
  border: 2px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  pointer-events: none;
}

/* Value Display */
.value-display {
  display: flex;
  justify-content: space-around;
  padding: var(--space-2);
  background: var(--color-neutral-100);
  border-radius: var(--radius-xs);
}

.value-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.value-label {
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-500);
}

.value-number {
  font-size: 12px;
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-800);
}

/* Range Section */
.range-section {
  border-top: 1px solid var(--color-neutral-100);
  padding-top: var(--space-2);
}

.range-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0;
  background: none;
  border: none;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-500);
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.range-toggle:hover {
  color: var(--color-neutral-700);
}

.range-controls {
  margin-top: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.range-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.range-row label {
  font-size: 9px;
  color: var(--color-neutral-500);
  min-width: 28px;
}

.range-row input {
  width: 50px;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
}

.range-row input:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

/* Handle styles */
:deep(.port-handle) {
  width: var(--node-port-size, 10px) !important;
  height: var(--node-port-size, 10px) !important;
  border: 2px solid var(--color-neutral-0) !important;
  border-radius: 50% !important;
  position: absolute !important;
}

:deep(.port-handle:hover) {
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
}

:deep(.vue-flow__handle-right) {
  right: calc(var(--node-port-size, 10px) / -2) !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}
</style>
