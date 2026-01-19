<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { ChevronDown, ChevronRight, Grid3x3 } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta, type NodeDefinition, useNodesStore } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()

const isCollapsed = ref(false)
const hoveredPort = ref<string | null>(null)

// Get definition from nodesStore
const definition = computed<NodeDefinition | null>(() => {
  const nodeType = (props.data?.nodeType as string) ?? 'step-sequencer'
  return nodesStore.getDefinition(nodeType) ?? props.data?.definition ?? null
})

const categoryColor = computed(() => {
  if (!definition.value) return 'var(--color-neutral-400)'
  return categoryMeta[definition.value.category]?.color ?? 'var(--color-neutral-400)'
})

// Control values
const stepCount = computed({
  get: () => (props.data?.steps as number) ?? 8,
  set: (value: number) => {
    const newCount = Math.max(1, Math.min(64, value))
    flowsStore.updateNodeData(props.id, { steps: newCount })
    // Ensure stepValues array is the right size
    const currentValues = (props.data?.stepValues as number[]) ?? []
    const newValues = [...currentValues]
    while (newValues.length < newCount) {
      newValues.push(0.5)
    }
    while (newValues.length > newCount) {
      newValues.pop()
    }
    flowsStore.updateNodeData(props.id, { stepValues: newValues })
  },
})

const mode = computed({
  get: () => (props.data?.mode as string) ?? 'Forward',
  set: (value: string) => {
    flowsStore.updateNodeData(props.id, { mode: value })
  },
})

const stepValues = computed({
  get: () => {
    const values = (props.data?.stepValues as number[]) ?? []
    // Ensure we have the right number of values
    const result = [...values]
    while (result.length < stepCount.value) {
      result.push(0.5)
    }
    return result
  },
  set: (value: number[]) => {
    flowsStore.updateNodeData(props.id, { stepValues: value })
  },
})

// Current step from executor output
const currentStep = computed(() => {
  const outputs = props.data?._outputs as Map<string, unknown> | Record<string, unknown> | undefined
  if (!outputs) return -1
  if (outputs instanceof Map) {
    return (outputs.get('step') as number) ?? -1
  }
  return (outputs['step'] as number) ?? -1
})

// Initialize step values on first render
watch(
  () => props.id,
  () => {
    if (!props.data?.stepValues || (props.data.stepValues as number[]).length === 0) {
      const initialValues = Array(stepCount.value).fill(0.5)
      flowsStore.updateNodeData(props.id, { stepValues: initialValues })
    }
  },
  { immediate: true }
)

function toggleStep(index: number) {
  const values = [...stepValues.value]
  // Toggle between 0 and 1
  values[index] = values[index] > 0.5 ? 0 : 1
  stepValues.value = values
}

function setStepValue(index: number, value: number) {
  const values = [...stepValues.value]
  values[index] = Math.max(0, Math.min(1, value))
  stepValues.value = values
}

function handleStepDrag(index: number, event: MouseEvent) {
  const startY = event.clientY
  const startValue = stepValues.value[index]

  const handleMove = (e: MouseEvent) => {
    const deltaY = startY - e.clientY
    const deltaValue = deltaY / 100
    setStepValue(index, startValue + deltaValue)
  }

  const handleUp = () => {
    window.removeEventListener('mousemove', handleMove)
    window.removeEventListener('mouseup', handleUp)
  }

  window.addEventListener('mousemove', handleMove)
  window.addEventListener('mouseup', handleUp)
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}
</script>

<template>
  <div
    class="stepseq-node"
    :class="{ selected: props.selected, collapsed: isCollapsed }"
  >
    <!-- Input Handles Column (left side) -->
    <div class="handles-column handles-left">
      <div
        class="handle-slot"
        @mouseenter="hoveredPort = 'clock'"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          id="clock"
          type="target"
          :position="Position.Left"
          :style="{ background: getTypeColor('trigger') }"
          class="port-handle"
        />
        <div
          class="port-label port-label-left"
          :class="{ visible: hoveredPort === 'clock' || props.selected }"
        >
          <span class="label-text">Clock</span>
        </div>
      </div>
      <div
        class="handle-slot"
        @mouseenter="hoveredPort = 'reset'"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          id="reset"
          type="target"
          :position="Position.Left"
          :style="{ background: getTypeColor('trigger') }"
          class="port-handle"
        />
        <div
          class="port-label port-label-left"
          :class="{ visible: hoveredPort === 'reset' || props.selected }"
        >
          <span class="label-text">Reset</span>
        </div>
      </div>
    </div>

    <!-- Output Handles Column (right side) -->
    <div class="handles-column handles-right">
      <div
        class="handle-slot"
        @mouseenter="hoveredPort = 'gate'"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          id="gate"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('trigger') }"
          class="port-handle"
        />
        <div
          class="port-label port-label-right"
          :class="{ visible: hoveredPort === 'gate' || props.selected }"
        >
          <span class="label-text">Gate</span>
        </div>
      </div>
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
        </div>
      </div>
      <div
        class="handle-slot"
        @mouseenter="hoveredPort = 'step'"
        @mouseleave="hoveredPort = null"
      >
        <Handle
          id="step"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('number') }"
          class="port-handle"
        />
        <div
          class="port-label port-label-right"
          :class="{ visible: hoveredPort === 'step' || props.selected }"
        >
          <span class="label-text">Step #</span>
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
        <Grid3x3
          :size="14"
          class="header-icon"
        />
        <span class="node-title">Step Seq</span>
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
        <!-- Controls -->
        <div class="controls-row">
          <label>Steps</label>
          <input
            type="number"
            :value="stepCount"
            min="1"
            max="64"
            @input="stepCount = parseInt(($event.target as HTMLInputElement).value) || 8"
            @mousedown.stop
          >
          <label>Mode</label>
          <select
            :value="mode"
            @change="mode = ($event.target as HTMLSelectElement).value"
            @mousedown.stop
          >
            <option value="Forward">→</option>
            <option value="Backward">←</option>
            <option value="Ping-Pong">↔</option>
            <option value="Random">?</option>
          </select>
        </div>

        <!-- Step Grid -->
        <div class="step-grid">
          <div
            v-for="(value, index) in stepValues.slice(0, stepCount)"
            :key="index"
            class="step-cell"
            :class="{
              active: value > 0.5,
              current: currentStep === index + 1
            }"
            @click.stop="toggleStep(index)"
            @mousedown.stop="handleStepDrag(index, $event)"
          >
            <div
              class="step-bar"
              :style="{ height: `${value * 100}%` }"
            />
            <span class="step-number">{{ index + 1 }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stepseq-node {
  position: relative;
  min-width: 200px;
  font-family: var(--font-mono);
}

.node-content {
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-default);
  box-shadow: 3px 3px 0 0 var(--color-neutral-300);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
  overflow: hidden;
}

.stepseq-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.stepseq-node:hover .node-content {
  box-shadow: 4px 4px 0 0 var(--color-neutral-400);
}

/* Handle columns */
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

.handles-left { left: 0; }
.handles-right { right: 0; }

.stepseq-node.collapsed .handles-column {
  justify-content: center;
  padding-top: 0;
  gap: 0;
}

.stepseq-node.collapsed .handle-slot {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: auto;
}

.stepseq-node.collapsed .port-label {
  display: none;
}

.handle-slot {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}

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

.port-label.visible { opacity: 1; }
.port-label-left { right: 12px; top: 50%; transform: translateY(-50%); }
.port-label-right { left: 12px; top: 50%; transform: translateY(-50%); }

.label-text { color: var(--color-neutral-600); }

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

.header-icon { color: var(--color-neutral-500); }

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

.node-collapse-btn:hover { color: var(--color-neutral-600); }

/* Body */
.node-body {
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* Controls Row */
.controls-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 10px;
}

.controls-row label {
  color: var(--color-neutral-500);
}

.controls-row input,
.controls-row select {
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
}

.controls-row input { width: 40px; }
.controls-row select { width: 40px; }

.controls-row input:focus,
.controls-row select:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

/* Step Grid */
.step-grid {
  display: flex;
  gap: 2px;
  height: 60px;
  background: var(--color-neutral-100);
  border-radius: var(--radius-xs);
  padding: 4px;
  overflow-x: auto;
}

.step-cell {
  position: relative;
  flex: 0 0 20px;
  height: 100%;
  background: var(--color-neutral-200);
  border-radius: 2px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  overflow: hidden;
  transition: background 0.1s;
}

.step-cell:hover {
  background: var(--color-neutral-300);
}

.step-cell.active {
  background: var(--color-primary-200);
}

.step-cell.current {
  box-shadow: 0 0 0 2px var(--color-primary-500);
}

.step-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--color-primary-500);
  border-radius: 1px 1px 0 0;
  transition: height 0.1s;
}

.step-number {
  position: absolute;
  bottom: 2px;
  font-size: 8px;
  color: var(--color-neutral-600);
  z-index: 1;
}

.step-cell.active .step-number {
  color: var(--color-neutral-0);
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
