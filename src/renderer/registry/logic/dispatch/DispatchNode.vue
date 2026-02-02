<script setup lang="ts">
import { computed, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { GitFork, Plus, X } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'

interface Condition {
  operator: string
  value: string
  type: string
}

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()

const categoryColor = categoryMeta.logic.color

const conditions = computed<Condition[]>(() => {
  try {
    const raw = props.data?.conditions as string
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return [{ operator: '==', value: '', type: 'number' }]
})

const operators = ['==', '!=', '>', '>=', '<', '<=', 'contains', 'matches regex', 'is true', 'is empty', 'is type', 'otherwise']

// Build dynamic outputs from conditions
const dynamicOutputs = computed(() => {
  return conditions.value.map((_, i) => ({
    id: `out-${i}`,
    type: 'any' as const,
    label: `→ ${i + 1}`,
  }))
})

// Sync dynamic outputs to node data when conditions change
watch(dynamicOutputs, (newOutputs) => {
  const currentDynamic = props.data?._dynamicOutputs as Array<{ id: string }> | undefined
  const newIds = newOutputs.map(o => o.id).join(',')
  const currentIds = currentDynamic?.map(o => o.id).join(',') ?? ''
  if (newIds !== currentIds) {
    flowsStore.updateNodeData(props.id, { _dynamicOutputs: newOutputs })
  }
}, { immediate: true })

function updateConditions(newConditions: Condition[]) {
  flowsStore.updateNodeData(props.id, {
    conditions: JSON.stringify(newConditions),
  })
}

function updateCondition(index: number, field: keyof Condition, value: string) {
  const updated = [...conditions.value]
  updated[index] = { ...updated[index], [field]: value }
  updateConditions(updated)
}

function addCondition() {
  const updated = [...conditions.value, { operator: '==', value: '', type: 'number' }]
  updateConditions(updated)
}

function removeCondition(index: number) {
  if (conditions.value.length <= 1) return
  const updated = conditions.value.filter((_, i) => i !== index)
  updateConditions(updated)
}

const operatorLabels: Record<string, string> = {
  '==': '=',
  '!=': '≠',
  '>': '>',
  '>=': '≥',
  '<': '<',
  '<=': '≤',
  'contains': '∋',
  'matches regex': '~',
  'is true': '✓',
  'is empty': '∅',
  'is type': 'T',
  'otherwise': '…',
}

const inputs = [{ id: 'value', type: 'any', label: 'Value' }]

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}
</script>

<template>
  <div
    class="dispatch-node"
    :class="{ selected: props.selected }"
  >
    <!-- Input handle -->
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
      </div>
    </div>

    <!-- Output handles -->
    <div class="handles-column handles-right">
      <div
        v-for="output in dynamicOutputs"
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
      </div>
    </div>

    <div class="node-content">
      <!-- Header -->
      <div
        class="node-header"
        :style="{ borderLeftColor: categoryColor }"
      >
        <GitFork
          :size="14"
          class="node-icon"
          :style="{ color: categoryColor }"
        />
        <span class="node-title">{{ props.data?.label ?? 'Dispatch' }}</span>
      </div>

      <!-- Condition rows -->
      <div class="dispatch-body">
        <div
          v-for="(cond, i) in conditions"
          :key="i"
          class="condition-row"
        >
          <select
            class="cond-operator"
            :value="cond.operator"
            @change="updateCondition(i, 'operator', ($event.target as HTMLSelectElement).value)"
            @mousedown.stop
          >
            <option
              v-for="op in operators"
              :key="op"
              :value="op"
            >
              {{ operatorLabels[op] ?? op }}
            </option>
          </select>
          <input
            v-if="cond.operator !== 'is true' && cond.operator !== 'is empty' && cond.operator !== 'otherwise'"
            class="cond-value"
            type="text"
            :value="cond.value"
            placeholder="value"
            @input="updateCondition(i, 'value', ($event.target as HTMLInputElement).value)"
            @mousedown.stop
          >
          <span class="cond-output">→ {{ i + 1 }}</span>
          <button
            v-if="conditions.length > 1"
            class="cond-remove"
            @click.stop="removeCondition(i)"
            @mousedown.stop
          >
            <X :size="10" />
          </button>
        </div>
        <button
          class="add-condition"
          @click.stop="addCondition"
          @mousedown.stop
        >
          <Plus :size="10" />
          <span>Add</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dispatch-node {
  position: relative;
  min-width: 140px;
  font-family: var(--font-mono);
}

.node-content {
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-default);
  box-shadow: 3px 3px 0 0 var(--color-neutral-300);
  overflow: hidden;
}

.dispatch-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.node-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
  border-left: 3px solid var(--color-neutral-400);
  border-bottom: 1px solid var(--color-neutral-200);
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
  color: var(--color-neutral-800);
}

.dispatch-body {
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.condition-row {
  display: flex;
  align-items: center;
  gap: 3px;
}

.cond-operator {
  width: 36px;
  padding: 1px 2px;
  font-family: var(--font-mono);
  font-size: 9px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
  cursor: pointer;
}

.cond-value {
  flex: 1;
  min-width: 40px;
  padding: 1px 3px;
  font-family: var(--font-mono);
  font-size: 9px;
  border: 1px solid var(--color-neutral-200);
  border-radius: 2px;
  background: var(--color-neutral-50);
}

.cond-value:focus,
.cond-operator:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

.cond-output {
  font-size: 9px;
  color: var(--color-neutral-500);
  white-space: nowrap;
  min-width: 20px;
}

.cond-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  background: none;
  border: none;
  color: var(--color-neutral-400);
  cursor: pointer;
}

.cond-remove:hover {
  color: #EF4444;
}

.add-condition {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--color-neutral-500);
  background: none;
  border: 1px dashed var(--color-neutral-200);
  border-radius: 2px;
  cursor: pointer;
}

.add-condition:hover {
  color: var(--color-primary-500);
  border-color: var(--color-primary-300);
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

.handles-left {
  left: 0;
}

.handles-right {
  right: 0;
  /* Offset for header + condition rows */
  padding-top: 38px;
}

.handle-slot {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}

:deep(.port-handle) {
  width: var(--node-port-size, 10px) !important;
  height: var(--node-port-size, 10px) !important;
  border: 2px solid var(--color-neutral-0) !important;
  border-radius: 50% !important;
  position: absolute !important;
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
