<script setup lang="ts">
import { computed, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { ChevronDown, ChevronRight, Disc } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta, type NodeDefinition, useNodesStore } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'
import RotaryKnob from '@/components/controls/RotaryKnob.vue'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()

const isCollapsed = ref(false)
const hoveredPort = ref<string | null>(null)

// Get definition from nodesStore
const definition = computed<NodeDefinition | null>(() => {
  const nodeType = (props.data?.nodeType as string) ?? 'knob'
  return nodesStore.getDefinition(nodeType) ?? props.data?.definition ?? null
})

const categoryColor = computed(() => {
  if (!definition.value) return 'var(--color-neutral-400)'
  return categoryMeta[definition.value.category]?.color ?? 'var(--color-neutral-400)'
})

// Knob value (normalized 0-1)
const knobValue = computed({
  get: () => (props.data?.value as number) ?? 0.5,
  set: (value: number) => {
    flowsStore.updateNodeData(props.id, { value: Math.max(0, Math.min(1, value)) })
  },
})

// Range values
const min = computed({
  get: () => (props.data?.min as number) ?? 0,
  set: (value: number) => {
    flowsStore.updateNodeData(props.id, { min: value })
  },
})

const max = computed({
  get: () => (props.data?.max as number) ?? 1,
  set: (value: number) => {
    flowsStore.updateNodeData(props.id, { max: value })
  },
})

// Computed raw value (mapped to range)
const rawValue = computed(() => {
  return min.value + knobValue.value * (max.value - min.value)
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}

function updateKnobValue(value: number) {
  knobValue.value = value
}
</script>

<template>
  <div
    class="knob-node"
    :class="{ selected: props.selected, collapsed: isCollapsed }"
  >
    <!-- Output Handle -->
    <div class="handles-column handles-right">
      <div
        class="handle-slot"
        @mouseenter="hoveredPort = 'value'"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          id="value"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('number') }"
          class="port-handle"
        />
        <div
          class="port-label port-label-right"
          :class="{ visible: hoveredPort === 'value' || props.selected }"
        >
          <span class="label-text">Value</span>
          <span
            class="label-type"
            :style="{ color: getTypeColor('number') }"
          >float</span>
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
        <Disc
          :size="14"
          class="header-icon"
        />
        <span class="node-title">Knob</span>
        <button
          class="node-collapse-btn"
          :aria-label="isCollapsed ? 'Expand node' : 'Collapse node'"
          :aria-expanded="!isCollapsed"
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
        <!-- Rotary Knob -->
        <div
          class="knob-container"
          @mousedown.stop
        >
          <RotaryKnob
            :model-value="knobValue"
            :min="0"
            :max="1"
            :step="0.01"
            accent-color="#ff6b35"
            size="medium"
            :show-value="false"
            @update:model-value="updateKnobValue"
          />
        </div>

        <!-- Value Display -->
        <div class="value-display">
          <span class="value-number">{{ rawValue.toFixed(2) }}</span>
        </div>

        <!-- Range Controls -->
        <div class="range-controls">
          <div class="range-row">
            <label>Min</label>
            <input
              type="number"
              :value="min"
              @input="min = parseFloat(($event.target as HTMLInputElement).value) || 0"
              @mousedown.stop
            >
          </div>
          <div class="range-row">
            <label>Max</label>
            <input
              type="number"
              :value="max"
              @input="max = parseFloat(($event.target as HTMLInputElement).value) || 1"
              @mousedown.stop
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.knob-node {
  position: relative;
  min-width: 100px;
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

.knob-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.knob-node:hover .node-content {
  box-shadow: 4px 4px 0 0 var(--color-neutral-400);
}

/* Handle columns */
.handles-column {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  z-index: 10;
}

.handles-right {
  right: 0;
}

.knob-node.collapsed .handles-column {
  justify-content: center;
  padding-top: 0;
  gap: 0;
}

.handle-slot {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}

/* Port labels */
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

.knob-node.collapsed .node-header {
  border-radius: var(--radius-default);
  border-bottom: none;
}

.header-icon {
  color: #ff6b35;
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
  align-items: center;
  gap: var(--space-2);
}

.knob-container {
  display: flex;
  justify-content: center;
}

/* Value Display */
.value-display {
  display: flex;
  justify-content: center;
  padding: var(--space-1) var(--space-2);
  background: var(--color-neutral-100);
  border-radius: var(--radius-xs);
  min-width: 60px;
}

.value-number {
  font-size: 12px;
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-800);
}

/* Range Controls */
.range-controls {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
}

.range-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.range-row label {
  font-size: 9px;
  color: var(--color-neutral-500);
  min-width: 24px;
  text-transform: uppercase;
}

.range-row input {
  flex: 1;
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
