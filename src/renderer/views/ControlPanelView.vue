<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useUIStore, type ControlLayout } from '@/stores/ui'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'
import { Sliders, Zap, Move, Hash, Waves, Eye, Video, Activity, Settings, GripVertical } from 'lucide-vue-next'

const uiStore = useUIStore()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()
const runtimeStore = useRuntimeStore()

// Grid configuration
const GRID_COLS = 12
const CELL_SIZE = 60 // pixels per grid cell

// Control node types that should auto-appear
const controlNodeTypes = ['slider', 'trigger', 'xy-pad', 'constant', 'lfo']
const monitorNodeTypes = ['monitor', 'oscilloscope', 'main-output']

// Edit mode
const editMode = ref(false)

// Drag state
const dragging = ref<{ nodeId: string; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null)
const resizing = ref<{ nodeId: string; startW: number; startH: number; startX: number; startY: number } | null>(null)

// Get all control-type nodes
const controlNodes = computed(() => {
  if (!flowsStore.activeFlow) return []
  return flowsStore.activeFlow.nodes
    .filter(node => {
      const nodeType = node.data?.nodeType as string
      return controlNodeTypes.includes(nodeType) || monitorNodeTypes.includes(nodeType)
    })
    .map(node => {
      const nodeType = node.data?.nodeType as string
      const definition = nodesStore.getDefinition(nodeType)
      const layout = uiStore.getControlLayout(node.id)
      return {
        node,
        nodeType,
        definition,
        label: (node.data?.label as string) || definition?.name || nodeType,
        layout,
        isMonitor: monitorNodeTypes.includes(nodeType),
      }
    })
})

// Calculate grid height based on content
const gridHeight = computed(() => {
  if (controlNodes.value.length === 0) return 400
  const maxY = Math.max(...controlNodes.value.map(c => c.layout.y + c.layout.h))
  return Math.max(400, (maxY + 2) * CELL_SIZE)
})

// Get node icon
function getNodeIcon(nodeType: string) {
  switch (nodeType) {
    case 'slider': return Sliders
    case 'trigger': return Zap
    case 'xy-pad': return Move
    case 'constant': return Hash
    case 'lfo': return Waves
    case 'monitor': return Eye
    case 'oscilloscope': return Activity
    case 'main-output': return Video
    default: return Sliders
  }
}

// Get control value
function getControlValue(nodeId: string, controlId: string, defaultVal: unknown = 0): unknown {
  const node = flowsStore.activeFlow?.nodes.find(n => n.id === nodeId)
  if (!node?.data) return defaultVal
  return node.data[controlId] ?? defaultVal
}

// Update control value
function updateControlValue(nodeId: string, controlId: string, value: unknown) {
  flowsStore.updateNodeData(nodeId, { [controlId]: value })
}

// Get live output value
function getLiveValue(nodeId: string): string {
  const metrics = runtimeStore.nodeMetrics.get(nodeId)
  if (!metrics?.outputValues) return ''
  const value = metrics.outputValues['value'] ?? metrics.outputValues['result'] ?? metrics.outputValues['trigger']
  if (value === undefined || value === null) return ''
  if (typeof value === 'number') return value.toFixed(3)
  if (typeof value === 'boolean') return value ? '1' : '0'
  return String(value)
}

// Get monitor display value
function getMonitorValue(nodeId: string): string {
  const metrics = runtimeStore.nodeMetrics.get(nodeId)
  if (!metrics?.outputValues) return '—'
  const value = metrics.outputValues['display'] ?? metrics.outputValues['value']
  if (value === undefined || value === null) return '—'
  if (typeof value === 'number') return value.toFixed(4)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value)
}

// Update node label
function updateNodeLabel(nodeId: string, label: string) {
  flowsStore.updateNodeData(nodeId, { label })
}

// Drag handlers
function startDrag(e: MouseEvent, nodeId: string, layout: ControlLayout) {
  if (!editMode.value) return
  e.preventDefault()
  dragging.value = {
    nodeId,
    startX: layout.x,
    startY: layout.y,
    offsetX: e.clientX,
    offsetY: e.clientY,
  }
}

function onMouseMove(e: MouseEvent) {
  if (dragging.value) {
    const dx = Math.round((e.clientX - dragging.value.offsetX) / CELL_SIZE)
    const dy = Math.round((e.clientY - dragging.value.offsetY) / CELL_SIZE)
    const newX = Math.max(0, Math.min(GRID_COLS - 1, dragging.value.startX + dx))
    const newY = Math.max(0, dragging.value.startY + dy)
    uiStore.updateControlLayout(dragging.value.nodeId, { x: newX, y: newY })
  }
  if (resizing.value) {
    const dx = Math.round((e.clientX - resizing.value.startX) / CELL_SIZE)
    const dy = Math.round((e.clientY - resizing.value.startY) / CELL_SIZE)
    const newW = Math.max(2, Math.min(GRID_COLS, resizing.value.startW + dx))
    const newH = Math.max(2, resizing.value.startH + dy)
    uiStore.updateControlLayout(resizing.value.nodeId, { w: newW, h: newH })
  }
}

function onMouseUp() {
  dragging.value = null
  resizing.value = null
}

function startResize(e: MouseEvent, nodeId: string, layout: ControlLayout) {
  if (!editMode.value) return
  e.preventDefault()
  e.stopPropagation()
  resizing.value = {
    nodeId,
    startW: layout.w,
    startH: layout.h,
    startX: e.clientX,
    startY: e.clientY,
  }
}

// View switching
function goToEditor() {
  uiStore.setViewMode('editor')
}

const isRunning = computed(() => runtimeStore.isRunning)

// Oscilloscope state
const scopeCanvases = ref<Map<string, HTMLCanvasElement>>(new Map())
const scopeHistories = ref<Map<string, number[]>>(new Map())
const MAX_SCOPE_SAMPLES = 128
let scopeAnimationFrame: number | null = null

function registerScopeCanvas(nodeId: string, canvas: HTMLCanvasElement | null) {
  if (canvas) {
    scopeCanvases.value.set(nodeId, canvas)
    if (!scopeHistories.value.has(nodeId)) {
      scopeHistories.value.set(nodeId, [])
    }
  } else {
    scopeCanvases.value.delete(nodeId)
  }
}

function updateScopes() {
  for (const [nodeId, canvas] of scopeCanvases.value) {
    const ctx = canvas.getContext('2d')
    if (!ctx) continue

    const width = canvas.width
    const height = canvas.height

    // Clear with dark background
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, width, height)

    // Draw grid
    ctx.strokeStyle = '#1a3a1a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()

    for (let i = 0; i < 4; i++) {
      const x = (width / 4) * i
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    // Get current signal value
    const metrics = runtimeStore.nodeMetrics.get(nodeId)
    const inputValue = (metrics?.outputValues?.['_input_signal'] as number) ?? 0

    // Update history
    let history = scopeHistories.value.get(nodeId) ?? []
    history.push(inputValue)
    if (history.length > MAX_SCOPE_SAMPLES) {
      history.shift()
    }
    scopeHistories.value.set(nodeId, history)

    // Draw waveform
    if (history.length > 1) {
      ctx.strokeStyle = '#22c55e'
      ctx.lineWidth = 2
      ctx.beginPath()

      const step = width / MAX_SCOPE_SAMPLES

      for (let i = 0; i < history.length; i++) {
        const x = i * step
        const y = height / 2 - (history[i] * (height / 2 - 4))

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }

      ctx.stroke()

      // Glow effect
      ctx.shadowColor = '#22c55e'
      ctx.shadowBlur = 3
      ctx.stroke()
      ctx.shadowBlur = 0
    }

    // Display current value
    ctx.fillStyle = '#22c55e'
    ctx.font = '10px monospace'
    ctx.fillText(`${inputValue.toFixed(3)}`, 4, 12)
  }

  if (runtimeStore.isRunning) {
    scopeAnimationFrame = requestAnimationFrame(updateScopes)
  }
}

function startScopeLoop() {
  if (scopeAnimationFrame === null && runtimeStore.isRunning) {
    scopeAnimationFrame = requestAnimationFrame(updateScopes)
  }
}

function stopScopeLoop() {
  if (scopeAnimationFrame !== null) {
    cancelAnimationFrame(scopeAnimationFrame)
    scopeAnimationFrame = null
  }
}

// Watch for running state changes
watch(() => runtimeStore.isRunning, (running) => {
  if (running) {
    startScopeLoop()
  } else {
    stopScopeLoop()
  }
}, { immediate: true })

// Mouse event listeners
onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  if (runtimeStore.isRunning) {
    nextTick(() => startScopeLoop())
  }
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  stopScopeLoop()
})
</script>

<template>
  <div class="control-panel-view">
    <!-- Header -->
    <header class="control-panel-header">
      <div class="header-left">
        <h1>{{ flowsStore.activeFlow?.name ?? 'Control Panel' }}</h1>
        <span
          v-if="isRunning"
          class="running-indicator"
        >LIVE</span>
      </div>
      <div class="header-right">
        <button
          class="edit-mode-btn"
          :class="{ active: editMode }"
          @click="editMode = !editMode"
        >
          <Settings :size="16" />
          {{ editMode ? 'Done' : 'Edit Layout' }}
        </button>
        <button
          class="back-btn"
          @click="goToEditor"
        >
          Back to Editor
        </button>
      </div>
    </header>

    <!-- Grid Area -->
    <main
      class="control-panel-content"
      :class="{ 'edit-mode': editMode }"
    >
      <div
        class="control-grid"
        :style="{
          '--grid-cols': GRID_COLS,
          '--cell-size': CELL_SIZE + 'px',
          minHeight: gridHeight + 'px'
        }"
      >
        <!-- Grid lines (visible in edit mode) -->
        <div
          v-if="editMode"
          class="grid-lines"
        />

        <!-- Control Cards -->
        <div
          v-for="{ node, nodeType, label, layout, isMonitor } in controlNodes"
          :key="node.id"
          class="control-card"
          :class="[nodeType, { dragging: dragging?.nodeId === node.id, resizing: resizing?.nodeId === node.id }]"
          :style="{
            left: (layout.x * CELL_SIZE) + 'px',
            top: (layout.y * CELL_SIZE) + 'px',
            width: (layout.w * CELL_SIZE - 8) + 'px',
            height: (layout.h * CELL_SIZE - 8) + 'px',
          }"
        >
          <!-- Drag Handle (edit mode) -->
          <div
            v-if="editMode"
            class="drag-handle"
            @mousedown="startDrag($event, node.id, layout)"
          >
            <GripVertical :size="16" />
          </div>

          <!-- Card Header -->
          <div class="card-header">
            <component
              :is="getNodeIcon(nodeType)"
              :size="14"
              class="card-icon"
            />
            <input
              v-if="editMode"
              type="text"
              class="label-input"
              :value="label"
              @input="updateNodeLabel(node.id, ($event.target as HTMLInputElement).value)"
              @mousedown.stop
            >
            <span
              v-else
              class="card-label"
            >{{ label }}</span>
            <span
              v-if="isRunning && !isMonitor"
              class="live-value"
            >{{ getLiveValue(node.id) }}</span>
          </div>

          <!-- Control Body -->
          <div class="card-body">
            <!-- Slider -->
            <template v-if="nodeType === 'slider'">
              <input
                type="range"
                class="big-slider"
                :value="getControlValue(node.id, 'value', 0.5)"
                min="0"
                max="1"
                step="0.01"
                @input="updateControlValue(node.id, 'value', parseFloat(($event.target as HTMLInputElement).value))"
              >
              <div class="value-display">
                {{ (getControlValue(node.id, 'value', 0.5) as number).toFixed(2) }}
              </div>
            </template>

            <!-- Trigger -->
            <template v-else-if="nodeType === 'trigger'">
              <button
                class="trigger-btn"
                :class="{ active: getControlValue(node.id, 'value', false) }"
                @mousedown="updateControlValue(node.id, 'value', true)"
                @mouseup="updateControlValue(node.id, 'value', false)"
                @mouseleave="updateControlValue(node.id, 'value', false)"
              >
                <Zap :size="32" />
              </button>
            </template>

            <!-- XY Pad -->
            <template v-else-if="nodeType === 'xy-pad'">
              <div
                class="xy-pad"
                @mousedown="(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                  const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
                  updateControlValue(node.id, 'x', x)
                  updateControlValue(node.id, 'y', y)
                }"
              >
                <div
                  class="xy-cursor"
                  :style="{
                    left: `${(getControlValue(node.id, 'x', 0.5) as number) * 100}%`,
                    bottom: `${(getControlValue(node.id, 'y', 0.5) as number) * 100}%`
                  }"
                />
              </div>
            </template>

            <!-- Constant -->
            <template v-else-if="nodeType === 'constant'">
              <input
                type="number"
                class="big-number"
                :value="getControlValue(node.id, 'value', 0)"
                step="0.1"
                @input="updateControlValue(node.id, 'value', parseFloat(($event.target as HTMLInputElement).value) || 0)"
              >
            </template>

            <!-- LFO -->
            <template v-else-if="nodeType === 'lfo'">
              <div class="lfo-controls">
                <div class="lfo-row">
                  <span>F</span>
                  <input
                    type="range"
                    :value="getControlValue(node.id, 'frequency', 1)"
                    min="0.01"
                    max="10"
                    step="0.01"
                    @input="updateControlValue(node.id, 'frequency', parseFloat(($event.target as HTMLInputElement).value))"
                  >
                </div>
                <div class="lfo-row">
                  <span>A</span>
                  <input
                    type="range"
                    :value="getControlValue(node.id, 'amplitude', 1)"
                    min="0"
                    max="2"
                    step="0.01"
                    @input="updateControlValue(node.id, 'amplitude', parseFloat(($event.target as HTMLInputElement).value))"
                  >
                </div>
              </div>
            </template>

            <!-- Monitor -->
            <template v-else-if="nodeType === 'monitor'">
              <div class="monitor-display">
                {{ getMonitorValue(node.id) }}
              </div>
            </template>

            <!-- Oscilloscope -->
            <template v-else-if="nodeType === 'oscilloscope'">
              <canvas
                :ref="(el) => registerScopeCanvas(node.id, el as HTMLCanvasElement)"
                class="scope-canvas"
                width="200"
                height="100"
              />
            </template>
          </div>

          <!-- Resize Handle (edit mode) -->
          <div
            v-if="editMode"
            class="resize-handle"
            @mousedown="startResize($event, node.id, layout)"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="controlNodes.length === 0"
        class="empty-state"
      >
        <Sliders
          :size="48"
          class="empty-icon"
        />
        <h2>No Controls in Flow</h2>
        <p>Add control nodes to your flow:</p>
        <ul>
          <li>Slider, Trigger, XY Pad</li>
          <li>Constant, LFO</li>
          <li>Monitor, Oscilloscope</li>
        </ul>
        <button
          class="back-btn"
          @click="goToEditor"
        >
          Go to Editor
        </button>
      </div>
    </main>

    <!-- Footer -->
    <footer class="control-panel-footer">
      <div class="playback-controls">
        <button
          v-if="!isRunning"
          class="play-btn"
          @click="runtimeStore.start()"
        >
          ▶ Play
        </button>
        <button
          v-else
          class="stop-btn"
          @click="runtimeStore.stop()"
        >
          ⏹ Stop
        </button>
        <span class="fps-display">{{ runtimeStore.fps }} FPS</span>
      </div>
      <div class="flow-info">
        <span>{{ controlNodes.length }} controls</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.control-panel-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-neutral-950);
  color: var(--color-neutral-100);
}

/* Header */
.control-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  background: var(--color-neutral-900);
  border-bottom: 1px solid var(--color-neutral-800);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.header-left h1 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin: 0;
}

.running-indicator {
  background: var(--color-success);
  color: white;
  font-size: 10px;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 2px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.header-right {
  display: flex;
  gap: var(--space-2);
}

.edit-mode-btn,
.back-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 12px;
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-neutral-700);
  background: var(--color-neutral-800);
  color: var(--color-neutral-200);
  cursor: pointer;
}

.edit-mode-btn:hover,
.back-btn:hover {
  background: var(--color-neutral-700);
}

.edit-mode-btn.active {
  background: var(--color-primary-600);
  border-color: var(--color-primary-500);
  color: white;
}

/* Grid Content */
.control-panel-content {
  flex: 1;
  overflow: auto;
  padding: var(--space-4);
}

.control-grid {
  position: relative;
  width: calc(var(--grid-cols) * var(--cell-size));
  min-height: 100%;
}

.edit-mode .control-grid {
  background-image:
    linear-gradient(to right, var(--color-neutral-800) 1px, transparent 1px),
    linear-gradient(to bottom, var(--color-neutral-800) 1px, transparent 1px);
  background-size: var(--cell-size) var(--cell-size);
}

/* Control Cards */
.control-card {
  position: absolute;
  background: var(--color-neutral-900);
  border: 1px solid var(--color-neutral-700);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.control-card:hover {
  border-color: var(--color-neutral-600);
}

.control-card.dragging,
.control-card.resizing {
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  border-color: var(--color-primary-500);
}

/* Drag Handle */
.drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 24px;
  background: var(--color-neutral-800);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  color: var(--color-neutral-500);
  z-index: 10;
}

.drag-handle:active {
  cursor: grabbing;
}

.edit-mode .control-card .card-header {
  margin-top: 24px;
}

/* Card Header */
.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--color-neutral-850);
  border-bottom: 1px solid var(--color-neutral-800);
}

.card-icon {
  color: var(--color-primary-400);
  flex-shrink: 0;
}

.card-label {
  flex: 1;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-neutral-300);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.label-input {
  flex: 1;
  background: var(--color-neutral-700);
  border: none;
  padding: 2px 4px;
  font-size: 11px;
  color: var(--color-neutral-100);
  border-radius: 2px;
  min-width: 0;
}

.live-value {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--color-primary-400);
  background: rgba(59, 130, 246, 0.2);
  padding: 1px 4px;
  border-radius: 2px;
}

/* Card Body */
.card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  gap: 4px;
}

/* Slider */
.big-slider {
  width: 100%;
  height: 8px;
  -webkit-appearance: none;
  background: var(--color-neutral-700);
  border-radius: 4px;
  cursor: pointer;
}

.big-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  background: var(--color-primary-500);
  border-radius: 50%;
  cursor: grab;
}

.value-display {
  font-family: var(--font-mono);
  font-size: var(--font-size-lg);
  color: var(--color-neutral-200);
}

/* Trigger Button */
.trigger-btn {
  width: 80%;
  aspect-ratio: 1;
  max-width: 80px;
  max-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-neutral-800);
  border: 2px solid var(--color-warning);
  border-radius: 8px;
  color: var(--color-warning);
  cursor: pointer;
  transition: all 0.1s;
}

.trigger-btn:hover {
  background: var(--color-neutral-700);
}

.trigger-btn.active {
  background: var(--color-warning);
  color: var(--color-neutral-900);
  transform: scale(0.95);
}

/* XY Pad */
.xy-pad {
  width: 100%;
  flex: 1;
  min-height: 60px;
  background: var(--color-neutral-800);
  border: 1px solid var(--color-neutral-600);
  border-radius: 4px;
  position: relative;
  cursor: crosshair;
}

.xy-cursor {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--color-primary-500);
  border: 2px solid white;
  border-radius: 50%;
  transform: translate(-50%, 50%);
  pointer-events: none;
}

/* Number Input */
.big-number {
  width: 100%;
  padding: 8px;
  font-family: var(--font-mono);
  font-size: var(--font-size-xl);
  text-align: center;
  background: var(--color-neutral-800);
  border: 1px solid var(--color-neutral-600);
  border-radius: 4px;
  color: var(--color-neutral-100);
}

/* LFO */
.lfo-controls {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lfo-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.lfo-row span {
  width: 12px;
  font-size: 10px;
  color: var(--color-neutral-500);
}

.lfo-row input {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  background: var(--color-neutral-700);
  border-radius: 2px;
}

.lfo-row input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  background: var(--color-primary-500);
  border-radius: 50%;
}

/* Monitor */
.monitor-display {
  font-family: var(--font-mono);
  font-size: var(--font-size-xl);
  color: var(--color-success);
  text-align: center;
  background: var(--color-neutral-950);
  padding: 8px;
  border-radius: 4px;
  width: 100%;
}

/* Oscilloscope Canvas */
.scope-canvas {
  width: 100%;
  height: 100%;
  border: 1px solid var(--color-neutral-700);
  border-radius: 4px;
  background: #0a0a0a;
}

/* Resize Handle */
.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  background: linear-gradient(135deg, transparent 50%, var(--color-primary-500) 50%);
  opacity: 0.6;
}

.resize-handle:hover {
  opacity: 1;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: var(--space-12);
  color: var(--color-neutral-500);
}

.empty-icon {
  margin-bottom: var(--space-4);
  opacity: 0.3;
}

.empty-state h2 {
  font-size: var(--font-size-lg);
  color: var(--color-neutral-300);
  margin-bottom: var(--space-2);
}

.empty-state ul {
  list-style: none;
  padding: 0;
  margin: var(--space-4) 0;
}

.empty-state li {
  padding: 4px 0;
}

/* Footer */
.control-panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-4);
  background: var(--color-neutral-900);
  border-top: 1px solid var(--color-neutral-800);
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.play-btn,
.stop-btn {
  padding: 6px 16px;
  font-size: var(--font-size-sm);
  font-weight: bold;
  border: none;
  cursor: pointer;
  border-radius: 4px;
}

.play-btn {
  background: var(--color-success);
  color: white;
}

.stop-btn {
  background: var(--color-error);
  color: white;
}

.fps-display {
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  color: var(--color-neutral-500);
}

.flow-info {
  font-size: var(--font-size-sm);
  color: var(--color-neutral-500);
}
</style>
