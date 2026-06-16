<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { Gamepad2 } from 'lucide-vue-next'
import { dataTypeMeta } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'
import { useRuntimeStore } from '@/stores/runtime'
import { emptyControllerState, type ControllerState } from '@/services/input/controllerState'
import GamepadDisplay from '@/components/controls/GamepadDisplay.vue'

const props = defineProps<NodeProps>()
const flowsStore = useFlowsStore()
const runtimeStore = useRuntimeStore()

// What to light up: the node's merged output state (input + interactive).
const displayState = computed<ControllerState>(() => {
  const metrics = runtimeStore.nodeMetrics.get(props.id)
  const state = metrics?.outputValues?.state as ControllerState | undefined
  return state ?? interactiveState.value
})

// The interactive (touch/click) state lives in node.data.interactive; the executor
// reads it from controls and merges it with the wired input.
const interactiveState = computed<ControllerState>({
  get: () => (props.data?.interactive as ControllerState) ?? emptyControllerState(),
  set: (value) => flowsStore.updateNodeData(props.id, { interactive: value }),
})

function typeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}
</script>

<template>
  <div
    class="gamepad-visual-node"
    :class="{ selected: props.selected }"
  >
    <!-- input handle (left) -->
    <div class="handles-column handles-left">
      <div class="handle-slot">
        <Handle
          id="state"
          type="target"
          :position="Position.Left"
          :style="{ background: typeColor('data') }"
          class="port-handle"
        />
      </div>
    </div>

    <!-- output handle (right) -->
    <div class="handles-column handles-right">
      <div class="handle-slot">
        <Handle
          id="state"
          type="source"
          :position="Position.Right"
          :style="{ background: typeColor('data') }"
          class="port-handle"
        />
      </div>
    </div>

    <div class="node-content">
      <div class="node-header">
        <Gamepad2
          :size="14"
          class="header-icon"
        />
        <span class="node-title">Visual Gamepad</span>
      </div>
      <div class="node-body">
        <GamepadDisplay
          v-model:interactive-state="interactiveState"
          :display-state="displayState"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.gamepad-visual-node {
  position: relative;
  width: 220px;
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
.gamepad-visual-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}
.gamepad-visual-node:hover .node-content {
  box-shadow: 4px 4px 0 0 var(--color-neutral-400);
}
.handles-column {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  z-index: 10;
}
.handles-left { left: 0; }
.handles-right { right: 0; }
.handle-slot {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}
.node-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--color-neutral-200);
  border-left: 3px solid var(--color-primary-400);
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
.node-body {
  padding: var(--space-3);
}
:deep(.port-handle) {
  width: var(--node-port-size, 10px) !important;
  height: var(--node-port-size, 10px) !important;
  border: 2px solid var(--color-neutral-0) !important;
  border-radius: 50% !important;
}
</style>
