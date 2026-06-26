<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { RotateCcw } from 'lucide-vue-next'
import * as THREE from 'three'
import { categoryMeta, dataTypeMeta, type NodeDefinition, useNodesStore } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowsStore } from '@/stores/flows'
import { getExecutionEngine } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()
const nodesStore = useNodesStore()
const flowsStore = useFlowsStore()
const { getViewport } = useVueFlow()

const previewCanvas = ref<HTMLCanvasElement | null>(null)
const inputResolution = ref({ w: 0, h: 0 })

// Arbitrary display size (CSS px), persisted on the node so it survives reloads.
const DEFAULT_SIZE = { w: 320, h: 180 }
const MIN = { w: 160, h: 90 }
const MAX = { w: 1280, h: 720 }
const size = ref({
  w: (props.data?.outputSize as { w: number; h: number } | undefined)?.w ?? DEFAULT_SIZE.w,
  h: (props.data?.outputSize as { w: number; h: number } | undefined)?.h ?? DEFAULT_SIZE.h,
})
// Cap the device-pixel-ratio so a 4K screen doesn't allocate a huge buffer.
const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2)

const definition = computed<NodeDefinition | null>(() => {
  const nodeType = (props.data?.nodeType as string) ?? 'main-output'
  return nodesStore.getDefinition(nodeType) ?? props.data?.definition ?? null
})

const categoryColor = computed(() => {
  if (!definition.value) return 'var(--color-neutral-400)'
  return categoryMeta[definition.value.category]?.color ?? 'var(--color-neutral-400)'
})

/** Size the backing buffer to the display size × DPR for crisp output. */
function syncCanvasResolution() {
  const c = previewCanvas.value
  if (!c) return
  const bw = Math.round(size.value.w * dpr)
  const bh = Math.round(size.value.h * dpr)
  if (c.width !== bw || c.height !== bh) {
    c.width = bw
    c.height = bh
  }
}

function updatePreview() {
  const c = previewCanvas.value
  if (!c) return
  syncCanvasResolution()
  const ctx = c.getContext('2d')
  if (!ctx) return

  const engine = getExecutionEngine()
  const texture = engine.getNodeTexture(props.id) as THREE.Texture | null

  if (!texture || !(texture instanceof THREE.Texture)) {
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#666'
    ctx.font = `${14 * dpr}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText('No Input', c.width / 2, c.height / 2)
    return
  }

  // Canvas/video-backed textures draw directly (avoids a WebGL round-trip).
  const img = texture.image
  if (img instanceof HTMLCanvasElement || img instanceof HTMLVideoElement) {
    const srcW = img instanceof HTMLCanvasElement ? img.width : img.videoWidth
    const srcH = img instanceof HTMLCanvasElement ? img.height : img.videoHeight
    if (srcW > 0 && srcH > 0) inputResolution.value = { w: srcW, h: srcH }
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return
  }

  if (texture.image) {
    const image = texture.image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
    const srcW = image.width ?? image.videoWidth ?? 0
    const srcH = image.height ?? image.videoHeight ?? 0
    if (srcW > 0 && srcH > 0) inputResolution.value = { w: srcW, h: srcH }
  }
  getThreeShaderRenderer().renderToCanvas(texture, c)
}

// Animation loop
let animationFrame: number | null = null
function startLoop() {
  const loop = () => {
    if (runtimeStore.isRunning) updatePreview()
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

// ---- Drag-to-resize ----
const resizing = ref(false)
let startX = 0, startY = 0, startW = 0, startH = 0

function clamp(w: number, h: number) {
  return {
    w: Math.round(Math.max(MIN.w, Math.min(MAX.w, w))),
    h: Math.round(Math.max(MIN.h, Math.min(MAX.h, h))),
  }
}

function onResizeMove(e: PointerEvent) {
  if (!resizing.value) return
  // Drag deltas are screen px; divide by the flow zoom so resizing feels 1:1.
  const zoom = getViewport().zoom || 1
  size.value = clamp(startW + (e.clientX - startX) / zoom, startH + (e.clientY - startY) / zoom)
}
function onResizeEnd() {
  if (!resizing.value) return
  resizing.value = false
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
  flowsStore.updateNodeData(props.id, { outputSize: { ...size.value } })
}
function onResizeStart(e: PointerEvent) {
  resizing.value = true
  startX = e.clientX
  startY = e.clientY
  startW = size.value.w
  startH = size.value.h
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd)
  e.preventDefault()
  e.stopPropagation()
}

function resetSize() {
  // Reset to the input's aspect ratio at a comfortable width, else the default.
  const { w: iw, h: ih } = inputResolution.value
  if (iw > 0 && ih > 0) {
    size.value = clamp(DEFAULT_SIZE.w, (DEFAULT_SIZE.w * ih) / iw)
  } else {
    size.value = { ...DEFAULT_SIZE }
  }
  flowsStore.updateNodeData(props.id, { outputSize: { ...size.value } })
}

watch(size, () => { if (previewCanvas.value) { syncCanvasResolution(); updatePreview() } }, { deep: true })

onMounted(() => {
  if (previewCanvas.value) {
    syncCanvasResolution()
    updatePreview()
    startLoop()
  }
})
onUnmounted(() => {
  stopLoop()
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
})

function getTypeColor(type: string): string {
  return dataTypeMeta[type as keyof typeof dataTypeMeta]?.color ?? 'var(--color-neutral-400)'
}
</script>

<template>
  <div
    class="main-output-node"
    :class="{ selected: props.selected, resizing }"
  >
    <!-- Header -->
    <div
      class="node-header"
      :style="{ borderLeftColor: categoryColor }"
    >
      <span class="node-title">OUTPUT</span>
      <button
        class="reset-btn nodrag"
        title="Reset size to input aspect ratio"
        @click.stop="resetSize"
      >
        <RotateCcw :size="13" />
      </button>
    </div>

    <!-- Preview Area -->
    <div
      class="preview-area"
      :style="{ width: `${size.w}px` }"
    >
      <canvas
        ref="previewCanvas"
        class="preview-canvas"
        :style="{ width: `${size.w}px`, height: `${size.h}px` }"
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

      <!-- Drag-to-resize handle -->
      <div
        class="resize-handle nodrag nopan"
        title="Drag to resize"
        @pointerdown="onResizeStart"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
        >
          <path
            d="M11 1 L1 11 M11 5 L5 11 M11 9 L9 11"
            stroke="currentColor"
            stroke-width="1.2"
            fill="none"
          />
        </svg>
      </div>
    </div>

    <!-- Footer with status -->
    <div class="node-footer">
      <span class="status-text">{{ runtimeStore.isRunning ? 'Live' : 'Stopped' }}</span>
      <span class="resolution-text">
        {{ inputResolution.w > 0 ? `${inputResolution.w}×${inputResolution.h}` : '—' }}
        · {{ size.w }}×{{ size.h }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.main-output-node {
  min-width: 200px;
  background: var(--color-neutral-900);
  border: 2px solid var(--color-primary-400);
  border-radius: var(--radius-default);
  box-shadow: 4px 4px 0 0 var(--color-primary-300);
  font-family: var(--font-mono);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
  display: inline-block;
}

.main-output-node.selected {
  border-color: var(--color-primary-300);
  box-shadow: 6px 6px 0 0 var(--color-primary-200);
}

.main-output-node.resizing {
  user-select: none;
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

.reset-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 2px;
  color: white;
  cursor: pointer;
  transition: background var(--transition-fast);
}
.reset-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.preview-area {
  position: relative;
  padding: var(--space-2);
}

.preview-canvas {
  display: block;
  background: #000;
  border: 1px solid var(--color-neutral-700);
  image-rendering: auto;
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

.resize-handle {
  position: absolute;
  right: var(--space-2);
  bottom: var(--space-2);
  width: 16px;
  height: 16px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  color: var(--color-neutral-400);
  cursor: nwse-resize;
  border-radius: 2px;
  opacity: 0.65;
  transition: opacity var(--transition-fast), color var(--transition-fast);
}
.resize-handle:hover {
  opacity: 1;
  color: var(--color-primary-300);
}

.node-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
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
  white-space: nowrap;
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
