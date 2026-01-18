<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { Activity } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowsStore } from '@/stores/flows'

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()
const flowsStore = useFlowsStore()

const categoryColor = computed(() => {
  return categoryMeta['debug']?.color ?? 'var(--color-neutral-400)'
})

// Canvas for waveform display
const canvas = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)

// Store signal history for number mode
const signalHistory = ref<number[]>([])
const maxSamples = 128

// Control values
const timeScale = computed(() => (props.data?.timeScale as number) ?? 1)
const amplitude = computed(() => (props.data?.amplitude as number) ?? 1)

// Update time scale
function updateTimeScale(value: number) {
  flowsStore.updateNodeData(props.id, { timeScale: value })
}

// Update amplitude
function updateAmplitude(value: number) {
  flowsStore.updateNodeData(props.id, { amplitude: value })
}

// Animation frame
let animationFrame: number | null = null

function updateDisplay() {
  if (!canvas.value || !ctx.value) return

  const width = canvas.value.width
  const height = canvas.value.height
  const c = ctx.value

  // Clear with dark background
  c.fillStyle = '#0a0a0a'
  c.fillRect(0, 0, width, height)

  // Draw grid
  c.strokeStyle = '#1a3a1a'
  c.lineWidth = 1

  // Horizontal center line
  c.beginPath()
  c.moveTo(0, height / 2)
  c.lineTo(width, height / 2)
  c.stroke()

  // Vertical divisions
  for (let i = 0; i < 8; i++) {
    const x = (width / 8) * i
    c.beginPath()
    c.moveTo(x, 0)
    c.lineTo(x, height)
    c.stroke()
  }

  // Get data from runtime
  const metrics = runtimeStore.nodeMetrics.get(props.id)
  const mode = metrics?.outputValues?.['_mode'] as string ?? 'signal'
  const waveform = metrics?.outputValues?.['_input_waveform'] as number[] | null
  const inputValue = metrics?.outputValues?.['_input_signal'] as number ?? 0

  if (mode === 'audio' && waveform && waveform.length > 0) {
    // Audio waveform mode - draw full waveform from Tone.js analyzer
    c.strokeStyle = '#22c55e'
    c.lineWidth = 2
    c.beginPath()

    const step = width / waveform.length
    for (let i = 0; i < waveform.length; i++) {
      const x = i * step
      const y = height / 2 - (waveform[i] * amplitude.value * (height / 2 - 10))

      if (i === 0) {
        c.moveTo(x, y)
      } else {
        c.lineTo(x, y)
      }
    }

    c.stroke()

    // Glow effect
    c.shadowColor = '#22c55e'
    c.shadowBlur = 4
    c.stroke()
    c.shadowBlur = 0

    // Display mode indicator
    c.fillStyle = '#22c55e'
    c.font = '10px monospace'
    c.fillText('AUDIO', 4, 12)
  } else {
    // Number signal mode - accumulate history
    signalHistory.value.push(inputValue)
    if (signalHistory.value.length > maxSamples) {
      signalHistory.value.shift()
    }

    // Draw waveform from history
    if (signalHistory.value.length > 1) {
      c.strokeStyle = '#22c55e'
      c.lineWidth = 2
      c.beginPath()

      const samples = signalHistory.value
      const step = width / (maxSamples * timeScale.value)

      for (let i = 0; i < samples.length; i++) {
        const x = i * step
        const y = height / 2 - (samples[i] * amplitude.value * (height / 2 - 10))

        if (i === 0) {
          c.moveTo(x, y)
        } else {
          c.lineTo(x, y)
        }
      }

      c.stroke()

      // Glow effect
      c.shadowColor = '#22c55e'
      c.shadowBlur = 4
      c.stroke()
      c.shadowBlur = 0
    }

    // Display current value
    c.fillStyle = '#22c55e'
    c.font = '10px monospace'
    c.fillText(`${inputValue.toFixed(3)}`, 4, 12)
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
        ctx.value.fillStyle = '#0a0a0a'
        ctx.value.fillRect(0, 0, canvas.value.width, canvas.value.height)
        ctx.value.fillStyle = '#333'
        ctx.value.font = '10px monospace'
        ctx.value.fillText('NO SIGNAL', 50, 50)
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
    class="oscilloscope-node"
    :class="{ selected: props.selected }"
  >
    <!-- Input Handles Column -->
    <div class="handles-column handles-left">
      <div class="handle-slot">
        <Handle
          id="signal"
          type="target"
          :position="Position.Left"
          :style="{ background: getTypeColor('number') }"
          class="port-handle"
        />
        <span class="port-label">SIG</span>
      </div>
      <div class="handle-slot">
        <Handle
          id="audio"
          type="target"
          :position="Position.Left"
          :style="{ background: getTypeColor('audio') }"
          class="port-handle"
        />
        <span class="port-label">AUD</span>
      </div>
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
        <span class="node-title">Scope</span>
      </div>

      <!-- Oscilloscope Display -->
      <div class="scope-display">
        <canvas
          ref="canvas"
          width="180"
          height="100"
          class="scope-canvas"
        />
      </div>

      <!-- Controls -->
      <div class="scope-controls">
        <div class="control-row">
          <label>TIME</label>
          <input
            type="range"
            :value="timeScale"
            min="0.25"
            max="4"
            step="0.25"
            @input="updateTimeScale(parseFloat(($event.target as HTMLInputElement).value))"
            @mousedown.stop
          >
        </div>
        <div class="control-row">
          <label>AMP</label>
          <input
            type="range"
            :value="amplitude"
            min="0.1"
            max="2"
            step="0.1"
            @input="updateAmplitude(parseFloat(($event.target as HTMLInputElement).value))"
            @mousedown.stop
          >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.oscilloscope-node {
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

.oscilloscope-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.oscilloscope-node:hover .node-content {
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

/* Scope Display */
.scope-display {
  padding: var(--space-2);
}

.scope-canvas {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--color-neutral-700);
  border-radius: 2px;
}

/* Controls */
.scope-controls {
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
  min-width: 32px;
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
  background: #22c55e;
  border-radius: 50%;
  cursor: pointer;
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
