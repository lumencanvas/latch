<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { AudioWaveform } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'

interface AudioCategory {
  categoryName: string
  score: number
}

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()

const categoryColor = computed(() => {
  return categoryMeta['ai']?.color ?? 'var(--color-neutral-400)'
})

// Canvas for visualization
const canvas = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)

// Animation frame
let animationFrame: number | null = null

// Color mapping for common categories
const categoryColors: Record<string, string> = {
  'Speech': '#4ecdc4',
  'Music': '#ff6b6b',
  'Singing': '#ffd93d',
  'Animal': '#a29bfe',
  'Dog': '#fd79a8',
  'Cat': '#fd79a8',
  'Bird': '#fd79a8',
  'Vehicle': '#6c5ce7',
  'Silence': '#636e72',
}

function getCategoryColor(name: string): string {
  // Check for partial matches
  for (const [key, color] of Object.entries(categoryColors)) {
    if (name.toLowerCase().includes(key.toLowerCase())) {
      return color
    }
  }
  return '#00b894'
}

function updateDisplay() {
  if (!canvas.value || !ctx.value) return

  const width = canvas.value.width
  const height = canvas.value.height
  const c = ctx.value

  // Clear canvas
  c.fillStyle = '#1a1a1a'
  c.fillRect(0, 0, width, height)

  // Get classification results from runtime metrics
  const metrics = runtimeStore.nodeMetrics.get(props.id)
  if (!metrics) {
    // No data
    c.fillStyle = '#666'
    c.font = '10px monospace'
    c.textAlign = 'center'
    c.fillText('No Audio', width / 2, height / 2)
    animationFrame = requestAnimationFrame(updateDisplay)
    return
  }

  const outputs = metrics.outputValues ?? {}
  const detected = outputs.detected as boolean
  const loading = outputs.loading as boolean
  const categories = outputs.categories as AudioCategory[] | undefined
  const category = outputs.category as string | undefined

  // Draw status
  if (loading) {
    c.fillStyle = '#ffcc00'
    c.font = '10px monospace'
    c.textAlign = 'left'
    c.fillText('Loading...', 8, 16)
    animationFrame = requestAnimationFrame(updateDisplay)
    return
  }

  if (!detected || !categories || categories.length === 0) {
    c.fillStyle = '#666'
    c.font = '10px monospace'
    c.textAlign = 'center'
    c.fillText('Listening...', width / 2, height / 2)
    animationFrame = requestAnimationFrame(updateDisplay)
    return
  }

  // Draw category bars
  const barHeight = 16
  const barPadding = 4
  const maxBars = Math.min(categories.length, 5)
  const startY = 8

  c.font = '9px monospace'
  c.textAlign = 'left'

  for (let i = 0; i < maxBars; i++) {
    const cat = categories[i]
    const y = startY + i * (barHeight + barPadding)
    const barWidth = (width - 16) * cat.score
    const color = getCategoryColor(cat.categoryName)

    // Background bar
    c.fillStyle = '#333'
    c.fillRect(8, y, width - 16, barHeight)

    // Value bar
    c.fillStyle = color
    c.fillRect(8, y, barWidth, barHeight)

    // Label
    c.fillStyle = '#fff'
    const label = cat.categoryName.length > 12
      ? cat.categoryName.substring(0, 12) + '...'
      : cat.categoryName
    c.fillText(`${label} ${Math.round(cat.score * 100)}%`, 12, y + 11)
  }

  // Draw top category highlight
  if (category) {
    c.fillStyle = getCategoryColor(category)
    c.font = '10px monospace'
    c.textAlign = 'right'
    c.fillText(category.toUpperCase(), width - 8, height - 8)
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
        ctx.value.fillStyle = '#1a1a1a'
        ctx.value.fillRect(0, 0, canvas.value.width, canvas.value.height)
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
          id="audio"
          type="target"
          :position="Position.Left"
          :style="{ background: getTypeColor('audio') }"
          class="port-handle"
        />
        <span class="port-label port-label-left">Audio</span>
      </div>
    </div>

    <!-- Node Content -->
    <div class="node-content">
      <!-- Header -->
      <div
        class="node-header"
        :style="{ borderLeftColor: categoryColor }"
      >
        <AudioWaveform
          :size="14"
          class="node-icon"
          :style="{ color: categoryColor }"
        />
        <span class="node-title">Audio Classify</span>
      </div>

      <!-- Visualization Display -->
      <div class="audio-display">
        <canvas
          ref="canvas"
          width="240"
          height="120"
          class="audio-canvas"
        />
      </div>
    </div>

    <!-- Output Handles Column -->
    <div class="handles-column handles-right">
      <div class="handle-slot">
        <Handle
          id="category"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('string') }"
          class="port-handle"
        />
        <span class="port-label port-label-right">Category</span>
      </div>
      <div class="handle-slot">
        <Handle
          id="confidence"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('number') }"
          class="port-handle"
        />
        <span class="port-label port-label-right">Confidence</span>
      </div>
      <div class="handle-slot">
        <Handle
          id="isSpeech"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('boolean') }"
          class="port-handle"
        />
        <span class="port-label port-label-right">Speech</span>
      </div>
      <div class="handle-slot">
        <Handle
          id="isMusic"
          type="source"
          :position="Position.Right"
          :style="{ background: getTypeColor('boolean') }"
          class="port-handle"
        />
        <span class="port-label port-label-right">Music</span>
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

/* Audio Display */
.audio-display {
  padding: var(--space-2);
}

.audio-canvas {
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
