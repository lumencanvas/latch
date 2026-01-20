<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { Layers } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowsStore } from '@/stores/flows'
import { getExecutionEngine } from '@/engine/ExecutionEngine'
import {
  drawVideo,
  clearCanvas,
  drawLabel,
} from '../utils/mediapipe-drawing'

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()
const flowsStore = useFlowsStore()

const categoryColor = computed(() => {
  return categoryMeta['ai']?.color ?? 'var(--color-neutral-400)'
})

// Canvas for overlay display
const canvas = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)

// Control values
const showOverlay = computed(() => (props.data?.showOverlay as boolean) ?? true)
const overlayMode = computed(() => (props.data?.overlayMode as string) ?? 'mask')
const overlayColor = computed(() => (props.data?.overlayColor as string) ?? '#00ff00')
const maskOpacity = computed(() => (props.data?.maskOpacity as number) ?? 0.5)

// Animation frame
let animationFrame: number | null = null

/**
 * Get the video element from the connected source node
 */
function getInputVideo(): HTMLVideoElement | null {
  const edges = flowsStore.activeEdges
  const videoEdge = edges.find(
    e => e.target === props.id && e.targetHandle === 'video'
  )

  if (!videoEdge) return null

  const engine = getExecutionEngine()
  const sourceOutputs = engine.getNodeOutputs(videoEdge.source)
  if (!sourceOutputs) return null

  const video = sourceOutputs.get(videoEdge.sourceHandle ?? 'video')
  return video instanceof HTMLVideoElement ? video : null
}

/**
 * Parse hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : { r: 0, g: 255, b: 0 }
}

/**
 * Draw segmentation mask overlay
 */
function drawSegmentationOverlay(
  c: CanvasRenderingContext2D,
  mask: ImageData,
  _video: HTMLVideoElement,
  width: number,
  height: number,
  mode: string,
  color: string,
  opacity: number
): void {
  // Create temporary canvas for mask processing
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = mask.width
  tempCanvas.height = mask.height
  const tempCtx = tempCanvas.getContext('2d')!

  const rgb = hexToRgb(color)
  const imageData = tempCtx.createImageData(mask.width, mask.height)
  const maskData = mask.data
  const outData = imageData.data

  for (let i = 0; i < maskData.length; i += 4) {
    // MediaPipe selfie segmenter: Category 0 = background, Category 1 = person
    // The mask data red channel contains the category index (0 or 1)
    const isPerson = maskData[i] > 0

    if (mode === 'mask') {
      // Show mask color on person
      if (isPerson) {
        outData[i] = rgb.r
        outData[i + 1] = rgb.g
        outData[i + 2] = rgb.b
        outData[i + 3] = Math.round(255 * opacity)
      } else {
        outData[i + 3] = 0
      }
    } else if (mode === 'cutout') {
      // Show only person (transparent background)
      if (!isPerson) {
        outData[i] = 0
        outData[i + 1] = 0
        outData[i + 2] = 0
        outData[i + 3] = Math.round(255 * 0.8)
      } else {
        outData[i + 3] = 0
      }
    } else if (mode === 'blur') {
      // Darken background
      if (!isPerson) {
        outData[i] = 0
        outData[i + 1] = 0
        outData[i + 2] = 0
        outData[i + 3] = Math.round(255 * 0.6)
      } else {
        outData[i + 3] = 0
      }
    }
  }

  tempCtx.putImageData(imageData, 0, 0)

  // Draw scaled to canvas
  c.drawImage(tempCanvas, 0, 0, width, height)
}

function updateDisplay() {
  if (!canvas.value || !ctx.value) return

  const width = canvas.value.width
  const height = canvas.value.height
  const c = ctx.value

  // Get video from connected source
  const video = getInputVideo()

  if (!video || video.readyState < 2) {
    // No video - show placeholder
    clearCanvas(c, width, height, '#1a1a1a')
    c.fillStyle = '#666'
    c.font = '10px monospace'
    c.textAlign = 'center'
    c.fillText('No Video', width / 2, height / 2)
    animationFrame = requestAnimationFrame(updateDisplay)
    return
  }

  // Draw video background
  drawVideo(c, video, width, height)

  // Get segmentation results from runtime metrics
  const metrics = runtimeStore.nodeMetrics.get(props.id)
  if (!metrics) {
    animationFrame = requestAnimationFrame(updateDisplay)
    return
  }

  const outputs = metrics.outputValues ?? {}
  const detected = outputs.detected as boolean
  const loading = outputs.loading as boolean
  const mask = outputs.mask as ImageData | undefined

  // Draw status text
  if (loading) {
    drawLabel(c, 'Loading...', 8, 18, { color: '#ffcc00' })
  } else if (!detected) {
    drawLabel(c, 'No segment', 8, 18, { color: '#ff6666' })
  }

  // Draw overlay if enabled and we have a mask
  if (showOverlay.value && detected && mask) {
    drawSegmentationOverlay(
      c,
      mask,
      video,
      width,
      height,
      overlayMode.value,
      overlayColor.value,
      maskOpacity.value
    )

    // Draw mode label
    drawLabel(c, overlayMode.value.toUpperCase(), 8, height - 8, { color: overlayColor.value })
  }

  animationFrame = requestAnimationFrame(updateDisplay)
}

function startLoop() {
  if (animationFrame === null) {
    updateDisplay()
  }
}

function stopLoop() {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame)
    animationFrame = null
  }
}

// Watch for running state
watch(() => runtimeStore.isRunning, (running) => {
  if (running) {
    startLoop()
  } else {
    stopLoop()
  }
}, { immediate: true })

onMounted(() => {
  if (canvas.value) {
    ctx.value = canvas.value.getContext('2d')
    if (runtimeStore.isRunning) {
      startLoop()
    } else {
      // Draw empty state
      if (ctx.value) {
        clearCanvas(ctx.value, canvas.value.width, canvas.value.height, '#1a1a1a')
        ctx.value.fillStyle = '#666'
        ctx.value.font = '10px monospace'
        ctx.value.textAlign = 'center'
        ctx.value.fillText('Stopped', canvas.value.width / 2, canvas.value.height / 2)
      }
    }
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
    class="mediapipe-node"
    :class="{ selected: props.selected }"
  >
    <!-- Input Handles Column -->
    <div class="handles-column handles-left">
      <div class="handle-slot">
        <Handle
          id="video"
          type="target"
          :position="Position.Left"
          :style="{ background: getTypeColor('video') }"
          class="port-handle"
        />
        <span class="port-label port-label-left">Video</span>
      </div>
    </div>

    <!-- Node Content -->
    <div class="node-content">
      <!-- Header -->
      <div
        class="node-header"
        :style="{ borderLeftColor: categoryColor }"
      >
        <Layers
          :size="14"
          class="node-icon"
          :style="{ color: categoryColor }"
        />
        <span class="node-title">Segmentation</span>
      </div>

      <!-- Video Display -->
      <div class="video-display">
        <canvas
          ref="canvas"
          width="240"
          height="180"
          class="video-canvas"
        />
      </div>
    </div>

    <!-- Output Handles Column -->
    <div class="handles-column handles-right">
      <div class="handle-slot">
        <Handle
          id="mask"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('data') }"
          class="port-handle"
        />
        <span class="port-label port-label-right">Mask</span>
      </div>
      <div class="handle-slot">
        <Handle
          id="detected"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('boolean') }"
          class="port-handle"
        />
        <span class="port-label port-label-right">Detected</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mediapipe-node {
  position: relative;
  min-width: 220px;
  font-family: var(--font-mono);
}

.node-content {
  background: var(--color-neutral-900);
  border: 1px solid var(--color-neutral-700);
  border-radius: var(--radius-default);
  box-shadow: 3px 3px 0 0 var(--color-neutral-800);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
  overflow: hidden;
}

.mediapipe-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.mediapipe-node:hover .node-content {
  box-shadow: 4px 4px 0 0 var(--color-neutral-600);
}

/* Header */
.node-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-800);
  border-bottom: 1px solid var(--color-neutral-700);
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
  color: var(--color-neutral-200);
}

/* Video Display */
.video-display {
  padding: var(--space-2);
}

.video-canvas {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--color-neutral-700);
  border-radius: 2px;
  background: #0a0a0a;
}

/* Handle columns - positioned at node edges */
.handles-column {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 2px;
  z-index: 10;
  padding-top: 50px;
}

.handles-left {
  left: 0;
}

.handles-right {
  right: 0;
}

.handle-slot {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}

.port-label {
  position: absolute;
  font-size: 9px;
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-500);
  text-transform: uppercase;
  white-space: nowrap;
  top: 50%;
  transform: translateY(-50%);
}

/* Left side labels extend outside (to the left) */
.port-label-left {
  right: 12px;
}

/* Right side labels extend outside (to the right) */
.port-label-right {
  left: 12px;
}

:deep(.port-handle) {
  width: var(--node-port-size, 10px) !important;
  height: var(--node-port-size, 10px) !important;
  border: 2px solid var(--color-neutral-900) !important;
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
