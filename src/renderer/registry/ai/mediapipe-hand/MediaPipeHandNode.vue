<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { Hand } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowsStore } from '@/stores/flows'
import { getExecutionEngine } from '@/engine/ExecutionEngine'
import {
  drawVideo,
  clearCanvas,
  drawLandmarks,
  drawConnections,
  drawLabel,
  drawFilledMesh,
  drawLandmarkBoundingBox,
  HAND_CONNECTIONS,
  HAND_MESH_TRIANGLES,
  getHandColor,
  type Landmark,
} from '../utils/mediapipe-drawing'

interface HandData {
  landmarks: Landmark[]
  worldLandmarks: Landmark[]
  handedness: string
  confidence: number
}

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
const vizMode = computed(() => (props.data?.vizMode as string) ?? 'skeleton')
const overlayColor = computed(() => (props.data?.overlayColor as string) ?? '#00ff00')
const lineWidth = computed(() => (props.data?.lineWidth as number) ?? 2)
const pointSize = computed(() => (props.data?.pointSize as number) ?? 4)
const colorByHand = computed(() => (props.data?.colorByHand as boolean) ?? true)

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

  // Get detection results from runtime metrics
  const metrics = runtimeStore.nodeMetrics.get(props.id)
  if (!metrics) {
    animationFrame = requestAnimationFrame(updateDisplay)
    return
  }

  const outputs = metrics.outputValues ?? {}
  const detected = outputs.detected as boolean
  const loading = outputs.loading as boolean
  const allHands = outputs.allHands as HandData[] | undefined
  const gestureType = outputs.gestureType as string | undefined
  const handCount = outputs.handCount as number | undefined

  // Draw status text
  if (loading) {
    drawLabel(c, 'Loading...', 8, 18, { color: '#ffcc00' })
  } else if (!detected) {
    drawLabel(c, 'No hands', 8, 18, { color: '#ff6666' })
  }

  // Draw overlay if enabled and we have hands
  if (showOverlay.value && detected && allHands && allHands.length > 0) {
    const mode = vizMode.value

    // Draw all detected hands
    for (const hand of allHands) {
      const landmarks = hand.landmarks
      if (!landmarks || landmarks.length === 0) continue

      const color = colorByHand.value && hand.handedness
        ? getHandColor(hand.handedness, overlayColor.value)
        : overlayColor.value

      // Draw based on visualization mode
      if (mode === 'mesh' || mode === 'both') {
        // Draw filled mesh with wireframe
        drawFilledMesh(c, landmarks, HAND_MESH_TRIANGLES, width, height, {
          color,
          lineWidth: lineWidth.value * 0.5,
          fillAlpha: 0.2,
          alpha: 0.5,
          wireframe: true,
        })
      }

      if (mode === 'skeleton' || mode === 'both') {
        // Draw skeleton connections
        drawConnections(c, landmarks, HAND_CONNECTIONS, width, height, {
          color,
          lineWidth: lineWidth.value,
        })

        // Draw landmark points
        drawLandmarks(c, landmarks, width, height, {
          color,
          pointSize: pointSize.value,
        })
      }

      if (mode === 'bbox') {
        // Draw bounding box only
        drawLandmarkBoundingBox(c, landmarks, width, height, {
          color,
          lineWidth: lineWidth.value,
          padding: 10,
        })
      }
    }

    // Draw info labels showing all hands
    const infoY = height - 6
    const handLabels = allHands.map(h => h.handedness?.toUpperCase() || '?').join(' ')
    if (handLabels) {
      drawLabel(c, handLabels, 8, infoY, { color: overlayColor.value })
    }
    if (gestureType && gestureType !== 'unknown') {
      drawLabel(c, gestureType, 70, infoY, { color: '#ffffff' })
    }
    if (handCount !== undefined && handCount > 0) {
      drawLabel(c, `${handCount}`, width - 16, 14, { color: '#888888' })
    }
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
        <Hand
          :size="14"
          class="node-icon"
          :style="{ color: categoryColor }"
        />
        <span class="node-title">Hand Tracking</span>
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
          id="landmarks"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('data') }"
          class="port-handle"
        />
        <span class="port-label port-label-right">Landmarks</span>
      </div>
      <div class="handle-slot">
        <Handle
          id="handedness"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('string') }"
          class="port-handle"
        />
        <span class="port-label port-label-right">Hand</span>
      </div>
      <div class="handle-slot">
        <Handle
          id="gestureType"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('string') }"
          class="port-handle"
        />
        <span class="port-label port-label-right">Gesture</span>
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
