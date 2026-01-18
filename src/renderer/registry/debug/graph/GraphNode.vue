<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import type { NodeProps } from '@vue-flow/core'
import { LineChart, Plus, Minus } from 'lucide-vue-next'
import { categoryMeta, dataTypeMeta } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowsStore } from '@/stores/flows'

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()
const flowsStore = useFlowsStore()

const categoryColor = computed(() => {
  return categoryMeta['debug']?.color ?? 'var(--color-neutral-400)'
})

// Canvas for graph display
const canvas = ref<HTMLCanvasElement | null>(null)
const ctx = ref<CanvasRenderingContext2D | null>(null)

// Number of point inputs (dynamic)
const pointCount = computed(() => (props.data?.pointCount as number) ?? 3)

// Display options
const displayMode = computed(() => (props.data?.displayMode as string) ?? 'line')
const showGrid = computed(() => (props.data?.showGrid as boolean) ?? true)
const autoScale = computed(() => (props.data?.autoScale as boolean) ?? true)

// Point history for each input (for trail effect)
const pointHistories = ref<Map<number, { x: number; y: number }[]>>(new Map())
const maxHistory = 50

// Animation frame
let animationFrame: number | null = null

function updateControl(key: string, value: unknown) {
  flowsStore.updateNodeData(props.id, { [key]: value })
}

function addPoint() {
  if (pointCount.value < 8) {
    updateControl('pointCount', pointCount.value + 1)
  }
}

function removePoint() {
  if (pointCount.value > 1) {
    updateControl('pointCount', pointCount.value - 1)
    // Clean up history for removed point
    pointHistories.value.delete(pointCount.value - 1)
  }
}

function updateDisplay() {
  if (!canvas.value || !ctx.value) return

  const width = canvas.value.width
  const height = canvas.value.height
  const c = ctx.value

  // Clear with dark background
  c.fillStyle = '#0f0f0f'
  c.fillRect(0, 0, width, height)

  // Get metrics from runtime
  const metrics = runtimeStore.nodeMetrics.get(props.id)

  // Collect all points
  const points: { x: number; y: number; index: number }[] = []
  for (let i = 0; i < pointCount.value; i++) {
    const x = metrics?.outputValues?.[`_point${i}_x`] as number ?? 0
    const y = metrics?.outputValues?.[`_point${i}_y`] as number ?? 0
    points.push({ x, y, index: i })

    // Add to history
    if (!pointHistories.value.has(i)) {
      pointHistories.value.set(i, [])
    }
    const history = pointHistories.value.get(i)!
    history.push({ x, y })
    if (history.length > maxHistory) {
      history.shift()
    }
  }

  // Calculate bounds for auto-scale
  let minX = 0, maxX = 1, minY = 0, maxY = 1
  if (autoScale.value && points.length > 0) {
    const allPoints = Array.from(pointHistories.value.values()).flat()
    if (allPoints.length > 0) {
      minX = Math.min(...allPoints.map(p => p.x))
      maxX = Math.max(...allPoints.map(p => p.x))
      minY = Math.min(...allPoints.map(p => p.y))
      maxY = Math.max(...allPoints.map(p => p.y))

      // Add padding
      const padX = (maxX - minX) * 0.1 || 0.5
      const padY = (maxY - minY) * 0.1 || 0.5
      minX -= padX
      maxX += padX
      minY -= padY
      maxY += padY
    }
  }

  // Transform function
  const toCanvasX = (x: number) => ((x - minX) / (maxX - minX)) * width
  const toCanvasY = (y: number) => height - ((y - minY) / (maxY - minY)) * height

  // Draw grid
  if (showGrid.value) {
    c.strokeStyle = '#1a2a1a'
    c.lineWidth = 1

    // Vertical lines
    for (let i = 0; i <= 8; i++) {
      const x = (width / 8) * i
      c.beginPath()
      c.moveTo(x, 0)
      c.lineTo(x, height)
      c.stroke()
    }

    // Horizontal lines
    for (let i = 0; i <= 6; i++) {
      const y = (height / 6) * i
      c.beginPath()
      c.moveTo(0, y)
      c.lineTo(width, y)
      c.stroke()
    }

    // Axes if in range
    c.strokeStyle = '#2a4a2a'
    c.lineWidth = 1.5
    if (minX <= 0 && maxX >= 0) {
      const axisX = toCanvasX(0)
      c.beginPath()
      c.moveTo(axisX, 0)
      c.lineTo(axisX, height)
      c.stroke()
    }
    if (minY <= 0 && maxY >= 0) {
      const axisY = toCanvasY(0)
      c.beginPath()
      c.moveTo(0, axisY)
      c.lineTo(width, axisY)
      c.stroke()
    }
  }

  // Colors for different series
  const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

  // Draw based on mode
  if (displayMode.value === 'line') {
    // Draw lines connecting history points for each series
    for (let i = 0; i < pointCount.value; i++) {
      const history = pointHistories.value.get(i) ?? []
      if (history.length < 2) continue

      c.strokeStyle = colors[i % colors.length]
      c.lineWidth = 2
      c.beginPath()

      for (let j = 0; j < history.length; j++) {
        const px = toCanvasX(history[j].x)
        const py = toCanvasY(history[j].y)
        if (j === 0) {
          c.moveTo(px, py)
        } else {
          c.lineTo(px, py)
        }
      }

      c.stroke()
    }
  } else if (displayMode.value === 'scatter') {
    // Draw all history points as dots
    for (let i = 0; i < pointCount.value; i++) {
      const history = pointHistories.value.get(i) ?? []
      c.fillStyle = colors[i % colors.length]

      for (let j = 0; j < history.length; j++) {
        const alpha = (j + 1) / history.length
        c.globalAlpha = alpha * 0.8
        const px = toCanvasX(history[j].x)
        const py = toCanvasY(history[j].y)
        c.beginPath()
        c.arc(px, py, 3, 0, Math.PI * 2)
        c.fill()
      }
      c.globalAlpha = 1
    }
  }

  // Draw current points (larger)
  for (let i = 0; i < points.length; i++) {
    const px = toCanvasX(points[i].x)
    const py = toCanvasY(points[i].y)

    // Outer glow
    c.fillStyle = colors[i % colors.length]
    c.shadowColor = colors[i % colors.length]
    c.shadowBlur = 8
    c.beginPath()
    c.arc(px, py, 5, 0, Math.PI * 2)
    c.fill()
    c.shadowBlur = 0

    // Inner dot
    c.fillStyle = '#fff'
    c.beginPath()
    c.arc(px, py, 2, 0, Math.PI * 2)
    c.fill()
  }

  // Display scale info
  c.fillStyle = '#666'
  c.font = '9px monospace'
  c.fillText(`X: ${minX.toFixed(1)}..${maxX.toFixed(1)}`, 4, 10)
  c.fillText(`Y: ${minY.toFixed(1)}..${maxY.toFixed(1)}`, 4, 22)

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
        ctx.value.fillStyle = '#0f0f0f'
        ctx.value.fillRect(0, 0, canvas.value.width, canvas.value.height)
        ctx.value.fillStyle = '#333'
        ctx.value.font = '10px monospace'
        ctx.value.fillText('NO DATA', 70, 60)
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
    class="graph-node"
    :class="{ selected: props.selected }"
  >
    <!-- Input Handles Column -->
    <div class="handles-column handles-left">
      <template
        v-for="i in pointCount"
        :key="`point-${i}`"
      >
        <div class="handle-slot">
          <Handle
            :id="`x${i - 1}`"
            type="target"
            :position="Position.Left"
            :style="{ background: getTypeColor('number') }"
            class="port-handle"
          />
          <span class="port-label">X{{ i }}</span>
        </div>
        <div class="handle-slot">
          <Handle
            :id="`y${i - 1}`"
            type="target"
            :position="Position.Left"
            :style="{ background: getTypeColor('number') }"
            class="port-handle"
          />
          <span class="port-label">Y{{ i }}</span>
        </div>
      </template>
    </div>

    <!-- Node Content -->
    <div class="node-content">
      <!-- Header -->
      <div
        class="node-header"
        :style="{ borderLeftColor: categoryColor }"
      >
        <LineChart
          :size="14"
          class="node-icon"
          :style="{ color: categoryColor }"
        />
        <span class="node-title">Graph</span>
        <div class="point-controls">
          <button
            class="point-btn"
            :disabled="pointCount <= 1"
            @click.stop="removePoint"
            @mousedown.stop
          >
            <Minus :size="12" />
          </button>
          <span class="point-count">{{ pointCount }}</span>
          <button
            class="point-btn"
            :disabled="pointCount >= 8"
            @click.stop="addPoint"
            @mousedown.stop
          >
            <Plus :size="12" />
          </button>
        </div>
      </div>

      <!-- Graph Display -->
      <div class="graph-display">
        <canvas
          ref="canvas"
          width="200"
          height="120"
          class="graph-canvas"
        />
      </div>

      <!-- Controls -->
      <div class="graph-controls">
        <div class="control-row">
          <label>MODE</label>
          <select
            :value="displayMode"
            @change="updateControl('displayMode', ($event.target as HTMLSelectElement).value)"
            @mousedown.stop
          >
            <option value="line">
              Line
            </option>
            <option value="scatter">
              Scatter
            </option>
          </select>
        </div>
        <div class="control-row">
          <label
            class="toggle-label"
            @mousedown.stop
          >
            <input
              type="checkbox"
              :checked="showGrid"
              @change="updateControl('showGrid', ($event.target as HTMLInputElement).checked)"
            >
            Grid
          </label>
          <label
            class="toggle-label"
            @mousedown.stop
          >
            <input
              type="checkbox"
              :checked="autoScale"
              @change="updateControl('autoScale', ($event.target as HTMLInputElement).checked)"
            >
            Auto
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-node {
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

.graph-node.selected .node-content {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}

.graph-node:hover .node-content {
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

.point-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.point-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: var(--color-neutral-700);
  border: none;
  border-radius: 2px;
  color: var(--color-neutral-300);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.point-btn:hover:not(:disabled) {
  background: var(--color-neutral-600);
  color: var(--color-neutral-100);
}

.point-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.point-count {
  font-size: 10px;
  color: var(--color-neutral-400);
  min-width: 16px;
  text-align: center;
}

/* Graph Display */
.graph-display {
  padding: var(--space-2);
}

.graph-canvas {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--color-neutral-700);
  border-radius: 2px;
}

/* Controls */
.graph-controls {
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

.control-row label:first-child {
  font-size: 9px;
  color: var(--color-neutral-500);
  text-transform: uppercase;
  min-width: 36px;
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

.control-row select:focus {
  outline: none;
  border-color: var(--color-primary-400);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 9px;
  color: var(--color-neutral-400);
  cursor: pointer;
}

.toggle-label input[type="checkbox"] {
  width: 12px;
  height: 12px;
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
  height: 16px;
  display: flex;
  align-items: center;
}

.port-label {
  position: absolute;
  left: 14px;
  font-size: 8px;
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-500);
  text-transform: uppercase;
  white-space: nowrap;
}

:deep(.port-handle) {
  width: 8px !important;
  height: 8px !important;
  border: 2px solid var(--color-neutral-900) !important;
  border-radius: 50% !important;
  position: absolute !important;
}

:deep(.port-handle:hover) {
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
}

:deep(.vue-flow__handle-left) {
  left: -4px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}
</style>
