<script setup lang="ts">
import { computed, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { ChevronDown, ChevronRight, Zap } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta, type NodeDefinition, useNodesStore } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'
import { useRuntimeStore } from '@/stores/runtime'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()
const runtimeStore = useRuntimeStore()
const nodesStore = useNodesStore()

// Collapsed state
const isCollapsed = ref(false)

// Get definition from nodesStore using nodeType (more reliable than props.data.definition which doesn't survive serialization)
const definition = computed<NodeDefinition | null>(() => {
  const nodeType = (props.data?.nodeType as string) ?? 'trigger'
  return nodesStore.getDefinition(nodeType) ?? props.data?.definition ?? null
})

const categoryColor = computed(() => {
  if (!definition.value) return 'var(--color-neutral-400)'
  return categoryMeta[definition.value.category]?.color ?? 'var(--color-neutral-400)'
})

// Control values
const outputType = computed({
  get: () => (props.data?.outputType as string) ?? 'boolean',
  set: (value: string) => {
    flowsStore.updateNodeData(props.id, { outputType: value })
  },
})

const currentValue = computed({
  get: () => (props.data?.value as boolean) ?? false,
  set: (value: boolean) => {
    flowsStore.updateNodeData(props.id, { value })
  },
})

const stringValue = computed({
  get: () => (props.data?.stringValue as string) ?? '',
  set: (value: string) => {
    flowsStore.updateNodeData(props.id, { stringValue: value })
  },
})

const jsonValue = computed({
  get: () => (props.data?.jsonValue as string) ?? '{}',
  set: (value: string) => {
    flowsStore.updateNodeData(props.id, { jsonValue: value })
  },
})

// Output value from runtime
const outputValue = computed(() => {
  const metrics = runtimeStore.nodeMetrics.get(props.id)
  return metrics?.outputValues?.trigger
})

// Get display value based on output type
const displayValue = computed(() => {
  switch (outputType.value) {
    case 'boolean':
      return currentValue.value ? 'true' : 'false'
    case 'number':
      return currentValue.value ? '1' : '0'
    case 'string':
      return stringValue.value || '(empty)'
    case 'json':
      return jsonValue.value.slice(0, 20) + (jsonValue.value.length > 20 ? '...' : '')
    case 'timestamp':
      return 'now()'
    default:
      return String(outputValue.value ?? currentValue.value)
  }
})

// Trigger action - fires the trigger
function fireTrigger() {
  // Toggle the value to create a pulse effect
  const newValue = !currentValue.value
  flowsStore.updateNodeData(props.id, { value: newValue })

  // Optionally reset after a short delay for pulse behavior
  setTimeout(() => {
    flowsStore.updateNodeData(props.id, { value: !newValue })
  }, 100)
}

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}
</script>

<template>
  <!-- Collapsed State: Just the trigger button -->
  <div
    v-if="isCollapsed"
    class="trigger-node trigger-node-collapsed"
    :class="{ selected: props.selected }"
  >
    <button
      class="trigger-btn-large"
      @click.stop="fireTrigger"
      @mousedown.stop
    >
      <Zap :size="20" />
      <span>TRIGGER</span>
    </button>

    <!-- Hidden handle for connections -->
    <Handle
      id="trigger"
      type="source"
      :position="Position.Right"
      :style="{ background: getTypeColor('trigger') }"
      class="port-handle port-handle-collapsed"
    />

    <!-- Expand button -->
    <button
      class="expand-btn"
      @click.stop="toggleCollapse"
    >
      <ChevronRight :size="12" />
    </button>
  </div>

  <!-- Expanded State: Full node -->
  <div
    v-else
    class="trigger-node"
    :class="{ selected: props.selected }"
  >
    <!-- Header -->
    <div
      class="node-header"
      :style="{ borderLeftColor: categoryColor }"
    >
      <Zap
        :size="14"
        class="header-icon"
      />
      <span class="node-title">Trigger</span>
      <button
        class="node-collapse-btn"
        @click.stop="toggleCollapse"
      >
        <ChevronDown :size="14" />
      </button>
    </div>

    <!-- Body -->
    <div class="node-body">
      <!-- Type Selector -->
      <div class="control-row">
        <label class="control-label">TYPE</label>
        <select
          v-model="outputType"
          class="type-select"
          @mousedown.stop
        >
          <option value="boolean">
            Boolean
          </option>
          <option value="number">
            Number
          </option>
          <option value="string">
            String
          </option>
          <option value="json">
            JSON
          </option>
          <option value="timestamp">
            Timestamp
          </option>
        </select>
      </div>

      <!-- Value Toggle for Boolean/Number -->
      <div
        v-if="outputType === 'boolean' || outputType === 'number'"
        class="control-row"
      >
        <label class="control-label">VALUE</label>
        <div class="value-toggle">
          <button
            class="value-btn"
            :class="{ active: !currentValue, 'false-btn': true }"
            @click.stop="currentValue = false"
            @mousedown.stop
          >
            {{ outputType === 'number' ? '0' : 'FALSE' }}
          </button>
          <button
            class="value-btn"
            :class="{ active: currentValue, 'true-btn': true }"
            @click.stop="currentValue = true"
            @mousedown.stop
          >
            {{ outputType === 'number' ? '1' : 'TRUE' }}
          </button>
        </div>
      </div>

      <!-- String Input -->
      <div
        v-else-if="outputType === 'string'"
        class="control-row control-row-full"
      >
        <label class="control-label">VALUE</label>
        <input
          v-model="stringValue"
          type="text"
          class="string-input"
          placeholder="Enter string..."
          @mousedown.stop
        >
      </div>

      <!-- JSON Input -->
      <div
        v-else-if="outputType === 'json'"
        class="control-row control-row-full"
      >
        <label class="control-label">JSON</label>
        <textarea
          v-model="jsonValue"
          class="json-input"
          placeholder="{&quot;key&quot;: &quot;value&quot;}"
          rows="2"
          @mousedown.stop
        />
      </div>

      <!-- Timestamp Info -->
      <div
        v-else-if="outputType === 'timestamp'"
        class="control-row"
      >
        <label class="control-label">VALUE</label>
        <span class="timestamp-info">Current timestamp on trigger</span>
      </div>

      <!-- Main Trigger Button -->
      <button
        class="trigger-btn"
        @click.stop="fireTrigger"
        @mousedown.stop
      >
        <Zap :size="16" />
        <span>TRIGGER</span>
      </button>

      <!-- Output Display -->
      <div class="output-row">
        <span class="output-label">Output:</span>
        <span
          class="output-value"
          :class="{ 'value-true': currentValue && (outputType === 'boolean' || outputType === 'number') }"
        >
          {{ displayValue }}
        </span>
        <Handle
          id="trigger"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('trigger') }"
          class="port-handle"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.trigger-node {
  min-width: 160px;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-default);
  box-shadow: 3px 3px 0 0 var(--color-neutral-300);
  font-family: var(--font-mono);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
}

.trigger-node.selected {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.trigger-node:hover {
  box-shadow: 4px 4px 0 0 var(--color-neutral-400);
}

/* Collapsed State */
.trigger-node-collapsed {
  min-width: auto;
  padding: 0;
  position: relative;
  display: flex;
  align-items: center;
}

.trigger-node-collapsed .trigger-btn-large {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: linear-gradient(135deg, #F97316 0%, #EA580C 100%);
  border: none;
  border-radius: var(--radius-default);
  color: white;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 3px 3px 0 0 #C2410C;
}

.trigger-node-collapsed .trigger-btn-large:hover {
  background: linear-gradient(135deg, #EA580C 0%, #C2410C 100%);
  transform: translateY(-1px);
}

.trigger-node-collapsed .trigger-btn-large:active {
  transform: translateY(1px);
  box-shadow: 1px 1px 0 0 #C2410C;
}

.trigger-node-collapsed .expand-btn {
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

.trigger-node-collapsed .expand-btn:hover {
  background: var(--color-neutral-100);
  color: var(--color-neutral-700);
}

.trigger-node-collapsed .port-handle-collapsed {
  right: -6px !important;
  opacity: 0;
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

/* Controls */
.control-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.control-label {
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-500);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  min-width: 44px;
}

.type-select {
  flex: 1;
  padding: var(--space-1) var(--space-2);
  font-family: var(--font-mono);
  font-size: 11px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  background: var(--color-neutral-50);
  color: var(--color-neutral-700);
  cursor: pointer;
}

.type-select:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

/* Full width control rows */
.control-row-full {
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-1);
}

.control-row-full .control-label {
  min-width: auto;
}

.string-input {
  padding: var(--space-1) var(--space-2);
  font-family: var(--font-mono);
  font-size: 11px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  background: var(--color-neutral-50);
  color: var(--color-neutral-700);
}

.string-input:focus {
  outline: none;
  border-color: var(--color-primary-400);
  background: var(--color-neutral-0);
}

.json-input {
  padding: var(--space-1) var(--space-2);
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  background: var(--color-neutral-50);
  color: var(--color-neutral-700);
  resize: vertical;
  min-height: 40px;
}

.json-input:focus {
  outline: none;
  border-color: var(--color-primary-400);
  background: var(--color-neutral-0);
}

.timestamp-info {
  font-size: 10px;
  color: var(--color-neutral-500);
  font-style: italic;
}

/* Value Toggle */
.value-toggle {
  flex: 1;
  display: flex;
  gap: 2px;
  background: var(--color-neutral-100);
  border-radius: var(--radius-xs);
  padding: 2px;
}

.value-btn {
  flex: 1;
  padding: var(--space-1) var(--space-2);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  border: none;
  border-radius: 2px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.value-btn.false-btn {
  background: transparent;
  color: var(--color-neutral-500);
}

.value-btn.false-btn.active {
  background: var(--color-neutral-600);
  color: white;
}

.value-btn.true-btn {
  background: transparent;
  color: var(--color-neutral-500);
}

.value-btn.true-btn.active {
  background: #10B981;
  color: white;
}

/* Trigger Button */
.trigger-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: linear-gradient(135deg, #F97316 0%, #EA580C 100%);
  border: none;
  border-radius: var(--radius-xs);
  color: white;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 2px 4px rgba(249, 115, 22, 0.3);
}

.trigger-btn:hover {
  background: linear-gradient(135deg, #EA580C 0%, #C2410C 100%);
  transform: translateY(-1px);
  box-shadow: 0 3px 6px rgba(249, 115, 22, 0.4);
}

.trigger-btn:active {
  transform: translateY(1px);
  box-shadow: 0 1px 2px rgba(249, 115, 22, 0.3);
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
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-600);
  background: var(--color-neutral-100);
  padding: 2px 8px;
  border-radius: var(--radius-xs);
}

.output-value.value-true {
  color: #10B981;
  background: rgba(16, 185, 129, 0.1);
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
</style>
