<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { Maximize2, Minimize2 } from 'lucide-vue-next'
import * as THREE from 'three'
import { categoryMeta, dataTypeMeta, type NodeDefinition, useNodesStore } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'
import { getExecutionEngine } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()
const nodesStore = useNodesStore()

// Preview canvas
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const isExpanded = ref(false)
const inputResolution = ref({ w: 0, h: 0 })

// Get definition from nodesStore
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

/**
 * Update preview - get texture directly from ExecutionEngine and render to canvas
 */
function updatePreview() {
  if (!previewCanvas.value) return

  const ctx = previewCanvas.value.getContext('2d')
  if (!ctx) return

  // Get texture directly from execution engine (bypasses Vue reactivity issues)
  const engine = getExecutionEngine()
  const texture = engine.getNodeTexture(props.id) as THREE.Texture | null

  // Debug logging (every 60 frames)
  if (Math.random() < 0.02) {
    const outputs = engine.getNodeOutputs(props.id)
    console.log(`[MainOutputNode ${props.id}] outputs:`, outputs ? [...outputs.entries()] : 'none')
    console.log(`[MainOutputNode ${props.id}] texture:`, texture ? `THREE.Texture uuid=${texture.uuid}` : 'null')
  }

  if (!texture || !(texture instanceof THREE.Texture)) {
    // No input - draw placeholder
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, previewCanvas.value.width, previewCanvas.value.height)
    ctx.fillStyle = '#666'
    ctx.font = '12px monospace'
    ctx.textAlign = 'center'
    ctx.fillText('No Input', previewCanvas.value.width / 2, previewCanvas.value.height / 2)
    return
  }

  // If the texture wraps a canvas or video, draw it directly (avoids Three.js WebGL round-trip)
  const img = texture.image
  if (img instanceof HTMLCanvasElement || img instanceof HTMLVideoElement) {
    const srcW = img instanceof HTMLCanvasElement ? img.width : img.videoWidth
    const srcH = img instanceof HTMLCanvasElement ? img.height : img.videoHeight
    if (srcW > 0 && srcH > 0) {
      inputResolution.value = { w: srcW, h: srcH }
    }
    ctx.drawImage(img, 0, 0, previewCanvas.value.width, previewCanvas.value.height)
    return
  }

  // Fall back to ThreeShaderRenderer's renderToCanvas for render target textures
  if (texture.image) {
    const srcW = texture.image.width ?? texture.image.videoWidth ?? 0
    const srcH = texture.image.height ?? texture.image.videoHeight ?? 0
    if (srcW > 0 && srcH > 0) {
      inputResolution.value = { w: srcW, h: srcH }
    }
  }
  const threeRenderer = getThreeShaderRenderer()
  threeRenderer.renderToCanvas(texture, previewCanvas.value)
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

// Handle resize when expanded state changes
watch([previewWidth, previewHeight], () => {
  if (previewCanvas.value) {
    previewCanvas.value.width = previewWidth.value
    previewCanvas.value.height = previewHeight.value
    updatePreview()
  }
})

onMounted(() => {
  if (previewCanvas.value) {
    previewCanvas.value.width = previewWidth.value
    previewCanvas.value.height = previewHeight.value
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
        {{ inputResolution.w > 0 ? `${inputResolution.w} x ${inputResolution.h}` : '—' }}
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
