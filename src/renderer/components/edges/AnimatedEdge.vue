<script setup lang="ts">
import { computed } from 'vue'
import { getSmoothStepPath, BaseEdge } from '@vue-flow/core'
import type { EdgeProps, Position } from '@vue-flow/core'
import { useRuntimeStore } from '@/stores/runtime'
import { useNodesStore, dataTypeMeta, type DataType } from '@/stores/nodes'

const props = defineProps<EdgeProps>()
const runtimeStore = useRuntimeStore()
const nodesStore = useNodesStore()

// Calculate the path for the edge
const pathData = computed(() => {
  return getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition as Position,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition as Position,
    borderRadius: 8,
  })
})

// Get the data type from the source node's output port
const edgeDataType = computed((): DataType => {
  const nodeType = props.sourceNode?.data?.nodeType as string
  if (!nodeType) return 'any'

  const nodeDef = nodesStore.getDefinition(nodeType)
  if (!nodeDef) return 'any'

  const outputPort = nodeDef.outputs.find(o => o.id === props.sourceHandleId)
  return (outputPort?.type as DataType) ?? 'any'
})

// Get color from data type metadata
const edgeColor = computed(() => {
  const meta = dataTypeMeta[edgeDataType.value]
  return meta?.color ?? '#D4D4D4'
})

// Check if connected node is selected (for highlight)
const isConnectedToSelected = computed(() => {
  return props.sourceNode?.selected || props.targetNode?.selected
})

// Determine animation direction based on which node is selected
// Data flows from source to target, so:
// - If target is selected (incoming), chase flows towards target (normal)
// - If source is selected (outgoing), chase flows away from source (normal)
// Both cases animate in data flow direction (source → target)
const isIncoming = computed(() => props.targetNode?.selected && !props.sourceNode?.selected)
const isOutgoing = computed(() => props.sourceNode?.selected && !props.targetNode?.selected)

const isAnimated = computed(() => runtimeStore.isRunning)
const isSelected = computed(() => props.selected)
</script>

<template>
  <g
    class="edge-group"
    :class="{ selected: isSelected, 'connected-selected': isConnectedToSelected }"
  >
    <!-- Invisible wider path for easier clicking -->
    <path
      :d="pathData[0]"
      fill="none"
      stroke="transparent"
      stroke-width="20"
      class="edge-interaction-area"
    />

    <!-- Selection highlight (behind main edge) -->
    <path
      v-if="isSelected"
      :d="pathData[0]"
      fill="none"
      stroke="var(--color-primary-300)"
      stroke-width="6"
      stroke-linecap="round"
      class="edge-selection"
    />

    <!-- Main edge with data type color -->
    <BaseEdge
      :id="id"
      :path="pathData[0]"
      :marker-end="markerEnd"
      :style="{
        stroke: edgeColor,
        strokeWidth: isSelected ? 3 : 2,
      }"
    />

    <!-- Glow effect behind the chase -->
    <path
      v-if="isConnectedToSelected && !isSelected"
      :d="pathData[0]"
      fill="none"
      :stroke="edgeColor"
      stroke-width="10"
      stroke-linecap="round"
      stroke-dasharray="12 24"
      class="edge-chase-glow"
      :class="{ 'chase-incoming': isIncoming, 'chase-outgoing': isOutgoing, 'chase-both': !isIncoming && !isOutgoing }"
    />
    <!-- Connected node selection highlight (animated chase) -->
    <path
      v-if="isConnectedToSelected && !isSelected"
      :d="pathData[0]"
      fill="none"
      :stroke="edgeColor"
      stroke-width="4"
      stroke-linecap="round"
      stroke-dasharray="12 24"
      class="edge-chase"
      :class="{ 'chase-incoming': isIncoming, 'chase-outgoing': isOutgoing, 'chase-both': !isIncoming && !isOutgoing }"
    />

    <!-- Animated particle overlay when running -->
    <path
      v-if="isAnimated"
      :d="pathData[0]"
      fill="none"
      :stroke="edgeColor"
      stroke-width="4"
      stroke-linecap="round"
      class="edge-animation"
      :style="{ opacity: 0.6 }"
    />
  </g>
</template>

<style scoped>
.edge-group {
  cursor: pointer;
}

.edge-interaction-area {
  pointer-events: stroke;
}

.edge-group:hover :deep(.vue-flow__edge-path) {
  stroke-width: 3;
  filter: brightness(1.2);
}

.edge-selection {
  opacity: 0.4;
}

.edge-group.selected :deep(.vue-flow__edge-path) {
  filter: brightness(1.3);
}

/* Chase animation for connected node selection */
.edge-chase {
  pointer-events: none;
  filter: brightness(1.5);
}

.edge-chase-glow {
  pointer-events: none;
  opacity: 0.5;
  filter: blur(4px) brightness(1.3);
}

/* Data flows from source to target (positive offset direction) */
.chase-incoming,
.chase-outgoing,
.chase-both {
  animation: chase-flow 0.6s linear infinite;
}

@keyframes chase-flow {
  from {
    stroke-dashoffset: 36;
  }
  to {
    stroke-dashoffset: 0;
  }
}

.edge-animation {
  stroke-dasharray: 8 8;
  animation: flow 0.5s linear infinite;
  pointer-events: none;
}

@keyframes flow {
  from {
    stroke-dashoffset: 16;
  }
  to {
    stroke-dashoffset: 0;
  }
}
</style>
