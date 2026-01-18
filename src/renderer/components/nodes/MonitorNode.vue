<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { Activity } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()

const categoryColor = computed(() => {
  return categoryMeta['debug']?.color ?? 'var(--color-neutral-400)'
})

// Get the monitored value from runtime
const monitoredValue = computed(() => {
  const metrics = runtimeStore.nodeMetrics.get(props.id)
  const display = metrics?.outputValues?.display
  const value = metrics?.outputValues?.value
  return display ?? value ?? null
})

// Format value for display
const displayValue = computed(() => {
  const val = monitoredValue.value
  if (val === null || val === undefined) return '—'
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return val.toString()
    return val.toFixed(4)
  }
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (typeof val === 'string') return val
  if (Array.isArray(val)) return JSON.stringify(val, null, 1)
  if (val instanceof WebGLTexture) return '[Texture]'
  if (typeof val === 'object') return JSON.stringify(val, null, 1)
  return String(val)
})

// Determine the type of value for styling
const valueType = computed(() => {
  const val = monitoredValue.value
  if (val === null || val === undefined) return 'null'
  if (typeof val === 'number') return 'number'
  if (typeof val === 'boolean') return 'boolean'
  if (typeof val === 'string') return 'string'
  if (Array.isArray(val)) return 'array'
  if (val instanceof WebGLTexture) return 'texture'
  if (typeof val === 'object') return 'object'
  return 'unknown'
})

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}
</script>

<template>
  <div
    class="monitor-node"
    :class="{ selected: props.selected }"
  >
    <!-- Input Handle -->
    <div class="handle-left">
      <Handle
        id="value"
        type="target"
        :position="Position.Left"
        :style="{ background: getTypeColor('any') }"
        class="port-handle"
      />
    </div>

    <!-- Output Handle (passthrough) -->
    <div class="handle-right">
      <Handle
        id="value"
        type="source"
        :position="Position.Right"
        :style="{ background: getTypeColor('any') }"
        class="port-handle"
      />
    </div>

    <!-- Node Content -->
    <div class="node-content">
      <!-- Header -->
      <div
        class="node-header"
        :style="{ borderLeftColor: categoryColor }"
      >
        <Activity
          :size="14"
          class="node-icon"
          :style="{ color: categoryColor }"
        />
        <span class="node-title">Monitor</span>
      </div>

      <!-- Value Display -->
      <div
        class="monitor-display"
        :class="valueType"
      >
        <pre class="monitor-value">{{ displayValue }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.monitor-node {
  position: relative;
  min-width: 120px;
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

.monitor-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.monitor-node:hover .node-content {
  box-shadow: 4px 4px 0 0 var(--color-neutral-400);
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

/* Monitor Display */
.monitor-display {
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-900);
  min-height: 40px;
  max-height: 120px;
  overflow: auto;
}

.monitor-value {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-neutral-100);
  white-space: pre-wrap;
  word-break: break-all;
}

/* Value type styling */
.monitor-display.null .monitor-value {
  color: var(--color-neutral-500);
  font-style: italic;
}

.monitor-display.number .monitor-value {
  color: #7dd3fc; /* cyan */
}

.monitor-display.boolean .monitor-value {
  color: #fbbf24; /* amber */
}

.monitor-display.string .monitor-value {
  color: #86efac; /* green */
}

.monitor-display.array .monitor-value,
.monitor-display.object .monitor-value {
  color: #c4b5fd; /* purple */
}

.monitor-display.texture .monitor-value {
  color: #f472b6; /* pink */
}

/* Handle positioning */
.handle-left,
.handle-right {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  z-index: 10;
}

.handle-left {
  left: 0;
}

.handle-right {
  right: 0;
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
