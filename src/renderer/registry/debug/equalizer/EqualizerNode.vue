<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { BarChart3 } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowsStore } from '@/stores/flows'

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()
const flowsStore = useFlowsStore()

const categoryColor = computed(() => {
  return categoryMeta['debug']?.color ?? 'var(--color-neutral-400)'
})

// Canvas for EQ display
const canvas = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)

// Number of bars
const barCount = computed(() => (props.data?.barCount as number) ?? 16)
const colorMode = computed(() => (props.data?.colorMode as string) ?? 'gradient')
const smoothing = computed(() => (props.data?.smoothing as number) ?? 0.8)

// Smoothed values for animation
const smoothedValues = ref<number[]>([])

// Animation frame
let animationFrame: number | null = null

function updateControl(key: string, value: unknown) {
  flowsStore.updateNodeData(props.id, { [key]: value })
}

function updateDisplay() {
  if (!canvas.value || !ctx.value) return

  const width = canvas.value.width
  const height = canvas.value.height
  const c = ctx.value

  // Clear with dark background
  c.fillStyle = '#0a0a0a'
  c.fillRect(0, 0, width, height)

  // Get FFT data from runtime
  const metrics = runtimeStore.nodeMetrics.get(props.id)
  const fftData = metrics?.outputValues?.['_fft_data'] as number[] | null

  // Debug: show what we're receiving
  if (metrics && !fftData) {
    console.log('[Equalizer] Metrics exist but no FFT data:', Object.keys(metrics.outputValues || {}))
  }

  if (!fftData || fftData.length === 0) {
    // Draw placeholder bars
    c.fillStyle = '#1a1a1a'
    const barW = (width - (barCount.value + 1) * 2) / barCount.value
    for (let i = 0; i < barCount.value; i++) {
      const x = 2 + i * (barW + 2)
      c.fillRect(x, height - 10, barW, 8)
    }
    animationFrame = requestAnimationFrame(updateDisplay)
    return
  }

  // Initialize smoothed values if needed
  if (smoothedValues.value.length !== barCount.value) {
    smoothedValues.value = new Array(barCount.value).fill(0)
  }

  // Calculate bar values from FFT data
  const binsPerBar = Math.floor(fftData.length / barCount.value)
  const barValues: number[] = []

  for (let i = 0; i < barCount.value; i++) {
    let sum = 0
    const startBin = i * binsPerBar
    const endBin = Math.min(startBin + binsPerBar, fftData.length)

    for (let j = startBin; j < endBin; j++) {
      // FFT data is in dB, normalize to 0-1
      const val = (fftData[j] + 100) / 100
      sum += Math.max(0, Math.min(1, val))
    }

    barValues.push(sum / binsPerBar)
  }

  // Smooth the values
  for (let i = 0; i < barCount.value; i++) {
    const target = barValues[i] ?? 0
    smoothedValues.value[i] = smoothedValues.value[i] * smoothing.value + target * (1 - smoothing.value)
  }

  // Draw bars
  const barW = (width - (barCount.value + 1) * 2) / barCount.value
  const maxBarHeight = height - 8

  for (let i = 0; i < barCount.value; i++) {
    const val = smoothedValues.value[i]
    const barH = Math.max(4, val * maxBarHeight)
    const x = 2 + i * (barW + 2)
    const y = height - barH - 2

    // Color based on mode
    if (colorMode.value === 'gradient') {
      // Gradient from green to yellow to red based on height
      const hue = 120 - (val * 120) // 120 (green) to 0 (red)
      c.fillStyle = `hsl(${hue}, 80%, 50%)`
    } else if (colorMode.value === 'spectrum') {
      // Rainbow across frequency bands
      const hue = (i / barCount.value) * 300
      c.fillStyle = `hsl(${hue}, 80%, 55%)`
    } else {
      // Solid cyan
      c.fillStyle = '#22d3ee'
    }

    // Draw bar with rounded top
    c.beginPath()
    c.roundRect(x, y, barW, barH, [2, 2, 0, 0])
    c.fill()

    // Glow effect for higher values
    if (val > 0.5) {
      c.shadowColor = c.fillStyle as string
      c.shadowBlur = val * 10
      c.fill()
      c.shadowBlur = 0
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

// Draw static idle state
function drawIdleState() {
  if (!canvas.value || !ctx.value) return

  const width = canvas.value.width
  const height = canvas.value.height
  const c = ctx.value

  // Clear with dark background
  c.fillStyle = '#0a0a0a'
  c.fillRect(0, 0, width, height)

  // Draw small placeholder bars
  c.fillStyle = '#1a1a1a'
  const barW = (width - (barCount.value + 1) * 2) / barCount.value
  for (let i = 0; i < barCount.value; i++) {
    const x = 2 + i * (barW + 2)
    c.fillRect(x, height - 10, barW, 8)
  }

  // Draw "NO SIGNAL" text
  c.fillStyle = '#333'
  c.font = '10px monospace'
  c.textAlign = 'center'
  c.fillText('NO SIGNAL', width / 2, height / 2)
  c.textAlign = 'left'
}

// Watch for running state
watch(() => runtimeStore.isRunning, (running) => {
  if (!ctx.value) return // Wait for mount
  stopLoop()
  if (running) {
    startLoop()
  } else {
    drawIdleState()
  }
})

onMounted(() => {
  if (canvas.value) {
    ctx.value = canvas.value.getContext('2d')
    // Start or show idle based on current state
    if (runtimeStore.isRunning) {
      startLoop()
    } else {
      drawIdleState()
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
    class="equalizer-node"
    :class="{ selected: props.selected }"
  >
    <!-- Input Handle -->
    <div class="handles-column handles-left">
      <div class="handle-slot">
        <Handle
          id="audio"
          type="target"
          :position="Position.Left"
          :style="{ background: getTypeColor('audio') }"
          class="port-handle"
        />
        <span class="port-label">IN</span>
      </div>
    </div>

    <!-- Node Content -->
    <div class="node-content">
      <!-- Header -->
      <div
        class="node-header"
        :style="{ borderLeftColor: categoryColor }"
      >
        <BarChart3
          :size="14"
          class="node-icon"
          :style="{ color: categoryColor }"
        />
        <span class="node-title">EQ</span>
      </div>

      <!-- EQ Display -->
      <div class="eq-display">
        <canvas
          ref="canvas"
          width="180"
          height="80"
          class="eq-canvas"
        />
      </div>

      <!-- Controls -->
      <div class="eq-controls">
        <div class="control-row">
          <label>BARS</label>
          <input
            type="range"
            :value="barCount"
            min="8"
            max="32"
            step="4"
            @input="updateControl('barCount', parseInt(($event.target as HTMLInputElement).value))"
            @mousedown.stop
          >
          <span class="value-label">{{ barCount }}</span>
        </div>
        <div class="control-row">
          <label>COLOR</label>
          <select
            :value="colorMode"
            @change="updateControl('colorMode', ($event.target as HTMLSelectElement).value)"
            @mousedown.stop
          >
            <option value="gradient">
              Gradient
            </option>
            <option value="spectrum">
              Spectrum
            </option>
            <option value="solid">
              Solid
            </option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.equalizer-node {
  position: relative;
  min-width: 200px;
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

.equalizer-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.equalizer-node:hover .node-content {
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

/* EQ Display */
.eq-display {
  padding: var(--space-2);
}

.eq-canvas {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--color-neutral-700);
  border-radius: 2px;
}

/* Controls */
.eq-controls {
  padding: var(--space-2);
  border-top: 1px solid var(--color-neutral-700);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.control-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.control-row label {
  font-size: 9px;
  color: var(--color-neutral-500);
  text-transform: uppercase;
  min-width: 36px;
}

.control-row input[type="range"] {
  flex: 1;
  height: 3px;
  -webkit-appearance: none;
  background: var(--color-neutral-700);
  border-radius: 2px;
}

.control-row input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  background: #22d3ee;
  border-radius: 50%;
  cursor: pointer;
}

.control-row select {
  flex: 1;
  padding: 2px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--color-neutral-800);
  border: 1px solid var(--color-neutral-600);
  border-radius: 2px;
  color: var(--color-neutral-200);
  cursor: pointer;
}

.value-label {
  font-size: 9px;
  color: var(--color-neutral-400);
  min-width: 20px;
  text-align: right;
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

.handle-slot {
  position: relative;
  height: 20px;
  display: flex;
  align-items: center;
}

.port-label {
  position: absolute;
  left: 16px;
  font-size: 9px;
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-500);
  text-transform: uppercase;
  white-space: nowrap;
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
</style>
