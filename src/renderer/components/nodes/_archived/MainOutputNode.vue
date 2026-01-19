<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { Maximize2, Minimize2 } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta, type NodeDefinition, useNodesStore } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'
import { getShaderRenderer } from '@/services/visual/ShaderRenderer'

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()
const nodesStore = useNodesStore()

// Preview canvas
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)
const isExpanded = ref(false)

// Get definition from nodesStore (more reliable than props.data.definition)
const definition = computed<NodeDefinition | null>(() => {
  const nodeType = (props.data?.nodeType as string) ?? 'main-output'
  return nodesStore.getDefinition(nodeType) ?? props.data?.definition ?? null
})

const categoryColor = computed(() => {
  if (!definition.value) return 'var(--color-neutral-400)'
  return categoryMeta[definition.value.category]?.color ?? 'var(--color-neutral-400)'
})


// Preview dimensions
const previewWidth = computed(() => isExpanded.value ? 320 : 200)
const previewHeight = computed(() => isExpanded.value ? 200 : 125)

// Animation loop
let animationFrame: number | null = null

function updatePreview() {
  if (!previewCanvas.value || !ctx.value) return

  // Get input from node metrics (set by executor)
  const metrics = runtimeStore.nodeMetrics.get(props.id)
  const texture = metrics?.outputValues?.['_input_texture']

  if (!texture) {
    // No input - draw placeholder
    ctx.value.fillStyle = '#1a1a1a'
    ctx.value.fillRect(0, 0, previewWidth.value, previewHeight.value)
    ctx.value.fillStyle = '#666'
    ctx.value.font = '12px monospace'
    ctx.value.textAlign = 'center'
    ctx.value.fillText('No Input', previewWidth.value / 2, previewHeight.value / 2)
    return
  }

  // Draw from shader renderer canvas
  const renderer = getShaderRenderer()
  const sourceCanvas = renderer.getCanvas()
  ctx.value.drawImage(sourceCanvas, 0, 0, previewWidth.value, previewHeight.value)
}

function startLoop() {
  const loop = () => {
    if (runtimeStore.isRunning) {
      updatePreview()
    }
    animationFrame = requestAnimationFrame(loop)
  }
  loop()
}

function stopLoop() {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
}

function toggleExpanded() {
  isExpanded.value = !isExpanded.value
}

onMounted(() => {
  if (previewCanvas.value) {
    ctx.value = previewCanvas.value.getContext('2d')
    updatePreview()
    startLoop()
  }
})

onUnmounted(() => {
  stopLoop()
})

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}
</script>

<template>
  <div
    class="main-output-node"
    :class="{
      selected: props.selected,
      expanded: isExpanded,
    }"
  >
    <!-- Header -->
    <div
      class="node-header"
      :style="{ borderLeftColor: categoryColor }"
    >
      <span class="node-title">OUTPUT</span>
      <button
        class="expand-btn"
        @click.stop="toggleExpanded"
      >
        <Minimize2
          v-if="isExpanded"
          :size="14"
        />
        <Maximize2
          v-else
          :size="14"
        />
      </button>
    </div>

    <!-- Preview Area -->
    <div class="preview-area">
      <canvas
        ref="previewCanvas"
        :width="previewWidth"
        :height="previewHeight"
        class="preview-canvas"
      />

      <!-- Input Port -->
      <div class="input-port">
        <Handle
          id="texture"
          type="target"
          :position="Position.Left"
          :style="{ background: getTypeColor('texture') }"
          class="port-handle"
        />
        <span class="port-label">Texture</span>
      </div>
    </div>

    <!-- Footer with status -->
    <div class="node-footer">
      <span class="status-text">
        {{ runtimeStore.isRunning ? 'Live' : 'Stopped' }}
      </span>
      <span class="resolution-text">
        512 x 512
      </span>
    </div>
  </div>
</template>

<style scoped>
.main-output-node {
  min-width: 220px;
  background: var(--color-neutral-900);
  border: 2px solid var(--color-primary-400);
  border-radius: var(--radius-default);
  box-shadow: 4px 4px 0 0 var(--color-primary-300);
  font-family: var(--font-mono);
  transition: all var(--transition-fast);
}

.main-output-node.selected {
  border-color: var(--color-primary-300);
  box-shadow: 6px 6px 0 0 var(--color-primary-200);
}

.main-output-node.expanded {
  min-width: 340px;
}

.node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--color-primary-600);
  border-bottom: 1px solid var(--color-primary-400);
  border-left: 3px solid var(--color-primary-300);
  border-radius: var(--radius-default) var(--radius-default) 0 0;
}

.node-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: white;
}

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: rgba(255,255,255,0.1);
  border: none;
  border-radius: 2px;
  color: white;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.expand-btn:hover {
  background: rgba(255,255,255,0.2);
}

.preview-area {
  position: relative;
  padding: var(--space-2);
}

.preview-canvas {
  display: block;
  width: 100%;
  height: auto;
  background: #000;
  border: 1px solid var(--color-neutral-700);
}

.input-port {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.port-label {
  font-size: 10px;
  color: var(--color-neutral-400);
  margin-left: var(--space-3);
}

.node-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-800);
  border-top: 1px solid var(--color-neutral-700);
  border-radius: 0 0 var(--radius-default) var(--radius-default);
}

.status-text {
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  color: var(--color-success);
}

.resolution-text {
  font-size: 10px;
  color: var(--color-neutral-500);
}

/* Handle styles */
:deep(.port-handle) {
  width: var(--node-port-size) !important;
  height: var(--node-port-size) !important;
  border: 2px solid var(--color-neutral-900) !important;
  border-radius: var(--radius-full) !important;
}

:deep(.vue-flow__handle-left) {
  left: calc(var(--node-port-size) / -2 - 2px) !important;
}
</style>
