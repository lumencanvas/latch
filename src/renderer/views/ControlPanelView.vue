<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useUIStore, type ControlLayout } from '@/stores/ui'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'
import { Sliders, Zap, Settings, GripVertical, LayoutGrid } from 'lucide-vue-next'
import RotaryKnob from '@/components/controls/RotaryKnob.vue'
import EnvelopeEditor from '@/components/controls/EnvelopeEditor.vue'
import EQEditor from '@/components/controls/EQEditor.vue'
import WaveformEditor from '@/components/controls/WaveformEditor.vue'
import PianoKeyboard from '@/components/controls/PianoKeyboard.vue'
import * as THREE from 'three'
import { getExecutionEngine } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'

const uiStore = useUIStore()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()
const runtimeStore = useRuntimeStore()

// Grid configuration - responsive
const CELL_SIZE = 60
const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(1200)

// Calculate columns based on container width
const GRID_COLS = computed(() => Math.max(6, Math.floor(containerWidth.value / CELL_SIZE)))

// Control node types that should auto-appear
const controlNodeTypes = ['slider', 'knob', 'trigger', 'xy-pad', 'constant', 'lfo', 'envelope-visual', 'parametric-eq', 'wavetable', 'keyboard']
const monitorNodeTypes = ['monitor', 'oscilloscope', 'main-output']

// Edit mode
const editMode = ref(false)

// Drag state - using local state for performance
const dragging = ref<{
  nodeId: string
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  currentX: number
  currentY: number
} | null>(null)

const resizing = ref<{ nodeId: string; startW: number; startH: number; startX: number; startY: number } | null>(null)

// Fader drag state (separate from control dragging)
const faderDrag = ref<{ nodeId: string; startY: number; startValue: number } | null>(null)

// Accent colors by control type
const accentColors: Record<string, string> = {
  slider: '#00d4aa',
  knob: '#ff6b35',
  'xy-pad': '#a855f7',
  trigger: '#ef4444',
  monitor: '#22c55e',
  oscilloscope: '#3b82f6',
  constant: '#888888',
  lfo: '#f59e0b',
  'envelope-visual': '#ff6b35',
  'parametric-eq': '#a855f7',
  wavetable: '#22c55e',
  keyboard: '#22c55e',
  'main-output': '#3b82f6',
}

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
      const layout = uiStore.getControlLayout(node.id, nodeType)
      return {
        node,
        nodeType,
        definition,
        label: (node.data?.label as string) || definition?.name || nodeType,
        layout,
        isMonitor: monitorNodeTypes.includes(nodeType),
        accentColor: accentColors[nodeType] || '#00d4aa',
      }
    })
})

// Calculate grid height based on content
const gridHeight = computed(() => {
  if (controlNodes.value.length === 0) return 400
  const maxY = Math.max(...controlNodes.value.map(c => c.layout.y + c.layout.h))
  return Math.max(400, (maxY + 2) * CELL_SIZE)
})

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

// Drag handlers with local state for performance
// In edit mode, the entire control item is draggable
function startDrag(e: MouseEvent, nodeId: string, layout: ControlLayout) {
  if (!editMode.value) return
  e.preventDefault()
  e.stopPropagation()
  dragging.value = {
    nodeId,
    startX: layout.x,
    startY: layout.y,
    offsetX: e.clientX,
    offsetY: e.clientY,
    currentX: layout.x,
    currentY: layout.y,
  }
}

function onMouseMove(e: MouseEvent) {
  // Handle control dragging (edit mode)
  if (dragging.value) {
    const dx = Math.round((e.clientX - dragging.value.offsetX) / CELL_SIZE)
    const dy = Math.round((e.clientY - dragging.value.offsetY) / CELL_SIZE)
    dragging.value.currentX = Math.max(0, Math.min(GRID_COLS.value - 1, dragging.value.startX + dx))
    dragging.value.currentY = Math.max(0, dragging.value.startY + dy)
  }
  // Handle resizing
  if (resizing.value) {
    const dx = Math.round((e.clientX - resizing.value.startX) / CELL_SIZE)
    const dy = Math.round((e.clientY - resizing.value.startY) / CELL_SIZE)
    const newW = Math.max(2, Math.min(GRID_COLS.value, resizing.value.startW + dx))
    const newH = Math.max(2, resizing.value.startH + dy)
    uiStore.updateControlLayout(resizing.value.nodeId, { w: newW, h: newH })
  }
  // Handle fader dragging
  if (faderDrag.value) {
    const deltaY = faderDrag.value.startY - e.clientY
    const sensitivity = 1 / 150 // 150px for full range
    let newValue = faderDrag.value.startValue + deltaY * sensitivity
    newValue = Math.max(0, Math.min(1, newValue))
    updateControlValue(faderDrag.value.nodeId, 'value', newValue)
  }
}

function onMouseUp() {
  if (dragging.value) {
    // Single store update on drag end
    uiStore.updateControlLayout(dragging.value.nodeId, {
      x: dragging.value.currentX,
      y: dragging.value.currentY,
    })
    dragging.value = null
  }
  resizing.value = null
  faderDrag.value = null
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

// Fader handlers
function startFaderDrag(e: MouseEvent, nodeId: string) {
  if (editMode.value) return // Don't interact with controls in edit mode
  e.preventDefault()
  e.stopPropagation()
  const currentValue = getControlValue(nodeId, 'value', 0.5) as number
  faderDrag.value = {
    nodeId,
    startY: e.clientY,
    startValue: currentValue,
  }
}

// Get the visual position for a control (using local drag state if dragging)
function getControlPosition(nodeId: string, layout: ControlLayout) {
  if (dragging.value?.nodeId === nodeId) {
    return {
      x: dragging.value.currentX,
      y: dragging.value.currentY,
    }
  }
  return { x: layout.x, y: layout.y }
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

    // Horizontal center line
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()

    // Vertical divisions
    for (let i = 0; i < 8; i++) {
      const x = (width / 8) * i
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }

    // Get data from runtime
    const metrics = runtimeStore.nodeMetrics.get(nodeId)
    const mode = metrics?.outputValues?.['_mode'] as string ?? 'signal'
    const waveform = metrics?.outputValues?.['_input_waveform'] as number[] | null
    const inputValue = (metrics?.outputValues?.['_input_signal'] as number) ?? 0

    if (mode === 'audio' && waveform && waveform.length > 0) {
      // Audio waveform mode - draw full waveform from Tone.js analyzer
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.beginPath()

      const step = width / waveform.length
      for (let i = 0; i < waveform.length; i++) {
        const x = i * step
        const y = height / 2 - (waveform[i] * (height / 2 - 4))

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }

      ctx.stroke()

      // Glow effect
      ctx.shadowColor = '#3b82f6'
      ctx.shadowBlur = 4
      ctx.stroke()
      ctx.shadowBlur = 0

      // Display mode indicator
      ctx.fillStyle = '#3b82f6'
      ctx.font = '10px monospace'
      ctx.fillText('AUDIO', 4, 12)
    } else {
      // Number signal mode - accumulate history
      let history = scopeHistories.value.get(nodeId) ?? []
      history.push(inputValue)
      if (history.length > MAX_SCOPE_SAMPLES) {
        history.shift()
      }
      scopeHistories.value.set(nodeId, history)

      // Draw waveform from history
      if (history.length > 1) {
        ctx.strokeStyle = '#3b82f6'
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
        ctx.shadowColor = '#3b82f6'
        ctx.shadowBlur = 4
        ctx.stroke()
        ctx.shadowBlur = 0
      }

      // Display current value
      ctx.fillStyle = '#3b82f6'
      ctx.font = '10px monospace'
      ctx.fillText(`${inputValue.toFixed(3)}`, 4, 12)
    }
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

// Main-output canvas handling
const outputCanvases = ref<Map<string, HTMLCanvasElement>>(new Map())
let outputAnimationFrame: number | null = null

function registerOutputCanvas(nodeId: string, canvas: HTMLCanvasElement | null) {
  if (canvas) {
    outputCanvases.value.set(nodeId, canvas)
  } else {
    outputCanvases.value.delete(nodeId)
  }
}

function updateOutputPreviews() {
  if (outputCanvases.value.size === 0) {
    outputAnimationFrame = null
    return
  }

  for (const [nodeId, canvas] of outputCanvases.value) {
    const ctx = canvas.getContext('2d')
    if (!ctx) continue

    try {
      // Get texture directly from execution engine
      const engine = getExecutionEngine()
      const texture = engine.getNodeTexture(nodeId) as THREE.Texture | null

      if (!texture || !(texture instanceof THREE.Texture)) {
        // No input - draw placeholder
        ctx.fillStyle = '#1a1a1a'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#666'
        ctx.font = '12px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('No Input', canvas.width / 2, canvas.height / 2)
        continue
      }

      // Use ThreeShaderRenderer's renderToCanvas
      const threeRenderer = getThreeShaderRenderer()
      threeRenderer.renderToCanvas(texture, canvas)
    } catch {
      // Draw error placeholder
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }

  if (runtimeStore.isRunning) {
    outputAnimationFrame = requestAnimationFrame(updateOutputPreviews)
  } else {
    outputAnimationFrame = null
  }
}

function startOutputLoop() {
  if (outputAnimationFrame === null && runtimeStore.isRunning && outputCanvases.value.size > 0) {
    outputAnimationFrame = requestAnimationFrame(updateOutputPreviews)
  }
}

function stopOutputLoop() {
  if (outputAnimationFrame !== null) {
    cancelAnimationFrame(outputAnimationFrame)
    outputAnimationFrame = null
  }
}

watch(() => runtimeStore.isRunning, (running) => {
  if (running) {
    startScopeLoop()
    startOutputLoop()
  } else {
    stopScopeLoop()
    stopOutputLoop()
  }
})

// Keyboard note handlers
function handleKeyboardNoteOn(nodeId: string, note: number, velocity: number) {
  flowsStore.updateNodeData(nodeId, {
    note,
    velocity,
    gate: true,
    noteOn: true,
  })
  // Reset noteOn trigger after brief delay
  setTimeout(() => {
    flowsStore.updateNodeData(nodeId, { noteOn: false })
  }, 50)
}

function handleKeyboardNoteOff(nodeId: string, note: number) {
  // Get current note to check if it matches
  const currentNode = flowsStore.activeFlow?.nodes.find(n => n.id === nodeId)
  if (currentNode?.data?.note === note) {
    flowsStore.updateNodeData(nodeId, { gate: false })
  }
}

// Auto-layout function
function autoLayoutAll() {
  const nodes = controlNodes.value.map(c => ({
    id: c.node.id,
    nodeType: c.nodeType,
  }))
  uiStore.autoLayoutAll(nodes, GRID_COLS.value)
}

// ResizeObserver to track container width
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  if (runtimeStore.isRunning) {
    nextTick(() => {
      startScopeLoop()
      startOutputLoop()
    })
  }

  // Set up resize observer
  if (containerRef.value) {
    containerWidth.value = containerRef.value.clientWidth - 32 // Account for padding
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerWidth.value = entry.contentRect.width - 32
      }
    })
    resizeObserver.observe(containerRef.value)
  }
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
  stopScopeLoop()
  stopOutputLoop()
  resizeObserver?.disconnect()
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
          v-if="editMode"
          class="auto-layout-btn"
          title="Auto-arrange all controls"
          @click="autoLayoutAll"
        >
          <LayoutGrid :size="16" />
          Auto Layout
        </button>
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
      ref="containerRef"
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
        <!-- Grid dots (subtle alignment reference) -->
        <div class="grid-dots" />

        <!-- Control Items - Cardless floating controls -->
        <div
          v-for="{ node, nodeType, label, layout, isMonitor, accentColor } in controlNodes"
          :key="node.id"
          class="control-item"
          :class="[nodeType, {
            dragging: dragging?.nodeId === node.id,
            resizing: resizing?.nodeId === node.id,
            'edit-mode-item': editMode
          }]"
          :style="{
            left: (getControlPosition(node.id, layout).x * CELL_SIZE) + 'px',
            top: (getControlPosition(node.id, layout).y * CELL_SIZE) + 'px',
            width: (layout.w * CELL_SIZE - 16) + 'px',
            height: (layout.h * CELL_SIZE - 16) + 'px',
            '--accent-color': accentColor,
          }"
          @mousedown="editMode ? startDrag($event, node.id, layout) : undefined"
        >
          <!-- Edit mode overlay for dragging -->
          <div
            v-if="editMode"
            class="edit-overlay"
            @mousedown="startDrag($event, node.id, layout)"
          >
            <GripVertical :size="20" />
            <span class="edit-hint">Drag to move</span>
          </div>

          <!-- Label -->
          <div
            class="control-label"
            @mousedown.stop
          >
            <input
              v-if="editMode"
              type="text"
              class="label-input"
              :value="label"
              @input="updateNodeLabel(node.id, ($event.target as HTMLInputElement).value)"
              @mousedown.stop
            >
            <span v-else>{{ label }}</span>
          </div>

          <!-- Control Widget -->
          <div
            class="control-widget"
            @mousedown.stop
          >
            <!-- Slider as Fader -->
            <template v-if="nodeType === 'slider'">
              <div class="fader-container">
                <div
                  class="fader-track"
                  @mousedown="startFaderDrag($event, node.id)"
                >
                  <div
                    class="fader-fill"
                    :style="{ height: `${(getControlValue(node.id, 'value', 0.5) as number) * 100}%` }"
                  />
                  <div
                    class="fader-thumb"
                    :style="{ bottom: `${(getControlValue(node.id, 'value', 0.5) as number) * 100}%` }"
                  />
                </div>
                <div class="fader-value">
                  {{ (getControlValue(node.id, 'value', 0.5) as number).toFixed(2) }}
                </div>
              </div>
            </template>

            <!-- Knob node - uses RotaryKnob -->
            <template v-else-if="nodeType === 'knob'">
              <RotaryKnob
                :model-value="(getControlValue(node.id, 'value', 0.5) as number)"
                :min="(getControlValue(node.id, 'min', 0) as number)"
                :max="(getControlValue(node.id, 'max', 1) as number)"
                :step="0.01"
                :accent-color="accentColor"
                size="large"
                @update:model-value="updateControlValue(node.id, 'value', $event)"
              />
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
                <Zap :size="24" />
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
              <div class="xy-values">
                <span>X: {{ (getControlValue(node.id, 'x', 0.5) as number).toFixed(2) }}</span>
                <span>Y: {{ (getControlValue(node.id, 'y', 0.5) as number).toFixed(2) }}</span>
              </div>
            </template>

            <!-- Constant -->
            <template v-else-if="nodeType === 'constant'">
              <input
                type="number"
                class="constant-input"
                :value="getControlValue(node.id, 'value', 0)"
                step="0.1"
                @input="updateControlValue(node.id, 'value', parseFloat(($event.target as HTMLInputElement).value) || 0)"
              >
            </template>

            <!-- LFO -->
            <template v-else-if="nodeType === 'lfo'">
              <div class="lfo-controls">
                <RotaryKnob
                  :model-value="(getControlValue(node.id, 'frequency', 1) as number)"
                  :min="0.01"
                  :max="10"
                  :step="0.01"
                  label="FREQ"
                  :accent-color="accentColor"
                  size="small"
                  :value-format="(v: number) => v.toFixed(1) + 'Hz'"
                  @update:model-value="updateControlValue(node.id, 'frequency', $event)"
                />
                <RotaryKnob
                  :model-value="(getControlValue(node.id, 'amplitude', 1) as number)"
                  :min="0"
                  :max="2"
                  :step="0.01"
                  label="AMP"
                  :accent-color="accentColor"
                  size="small"
                  @update:model-value="updateControlValue(node.id, 'amplitude', $event)"
                />
              </div>
            </template>

            <!-- Envelope Visual -->
            <template v-else-if="nodeType === 'envelope-visual'">
              <EnvelopeEditor
                :model-value="{
                  attack: (getControlValue(node.id, 'attack', 0.01) as number),
                  decay: (getControlValue(node.id, 'decay', 0.1) as number),
                  sustain: (getControlValue(node.id, 'sustain', 0.5) as number),
                  release: (getControlValue(node.id, 'release', 0.3) as number),
                }"
                :accent-color="accentColor"
                :width="Math.max(120, layout.w * CELL_SIZE - 32)"
                :height="Math.max(60, layout.h * CELL_SIZE - 64)"
                @update:model-value="(val) => {
                  updateControlValue(node.id, 'attack', val.attack)
                  updateControlValue(node.id, 'decay', val.decay)
                  updateControlValue(node.id, 'sustain', val.sustain)
                  updateControlValue(node.id, 'release', val.release)
                }"
              />
            </template>

            <!-- Parametric EQ -->
            <template v-else-if="nodeType === 'parametric-eq'">
              <EQEditor
                :model-value="{
                  bands: [
                    { frequency: (getControlValue(node.id, 'freq1', 200) as number), gain: (getControlValue(node.id, 'gain1', 0) as number), q: (getControlValue(node.id, 'q1', 1) as number) },
                    { frequency: (getControlValue(node.id, 'freq2', 1000) as number), gain: (getControlValue(node.id, 'gain2', 0) as number), q: (getControlValue(node.id, 'q2', 1) as number) },
                    { frequency: (getControlValue(node.id, 'freq3', 5000) as number), gain: (getControlValue(node.id, 'gain3', 0) as number), q: (getControlValue(node.id, 'q3', 1) as number) },
                  ]
                }"
                :accent-color="accentColor"
                :width="Math.max(160, layout.w * CELL_SIZE - 32)"
                :height="Math.max(80, layout.h * CELL_SIZE - 48)"
                @update:model-value="(val) => {
                  updateControlValue(node.id, 'freq1', val.bands[0].frequency)
                  updateControlValue(node.id, 'gain1', val.bands[0].gain)
                  updateControlValue(node.id, 'q1', val.bands[0].q)
                  updateControlValue(node.id, 'freq2', val.bands[1].frequency)
                  updateControlValue(node.id, 'gain2', val.bands[1].gain)
                  updateControlValue(node.id, 'q2', val.bands[1].q)
                  updateControlValue(node.id, 'freq3', val.bands[2].frequency)
                  updateControlValue(node.id, 'gain3', val.bands[2].gain)
                  updateControlValue(node.id, 'q3', val.bands[2].q)
                }"
              />
            </template>

            <!-- Wavetable -->
            <template v-else-if="nodeType === 'wavetable'">
              <WaveformEditor
                :model-value="{
                  samples: (getControlValue(node.id, 'waveform', []) as number[]).length > 0
                    ? (getControlValue(node.id, 'waveform', []) as number[])
                    : Array.from({ length: 64 }, (_, i) => Math.sin((i / 64) * Math.PI * 2)),
                  preset: (getControlValue(node.id, 'preset', 'sine') as 'sine' | 'square' | 'sawtooth' | 'triangle' | 'custom'),
                }"
                :accent-color="accentColor"
                :width="Math.max(120, layout.w * CELL_SIZE - 32)"
                :height="Math.max(60, layout.h * CELL_SIZE - 48)"
                @update:model-value="(val) => {
                  updateControlValue(node.id, 'waveform', val.samples)
                  updateControlValue(node.id, 'preset', val.preset)
                }"
              />
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
                :width="Math.max(100, layout.w * CELL_SIZE - 32)"
                :height="Math.max(60, layout.h * CELL_SIZE - 48)"
              />
            </template>

            <!-- Main Output -->
            <template v-else-if="nodeType === 'main-output'">
              <canvas
                :ref="(el) => registerOutputCanvas(node.id, el as HTMLCanvasElement)"
                class="output-canvas"
                :width="Math.max(160, layout.w * CELL_SIZE - 32)"
                :height="Math.max(100, layout.h * CELL_SIZE - 48)"
              />
            </template>

            <!-- Keyboard -->
            <template v-else-if="nodeType === 'keyboard'">
              <PianoKeyboard
                :num-keys="parseInt(getControlValue(node.id, 'numKeys', '25') as string)"
                :start-octave="getControlValue(node.id, 'startOctave', 3) as number"
                :octave-shift="getControlValue(node.id, 'octaveShift', 0) as number"
                :include-black-keys="getControlValue(node.id, 'includeBlackKeys', true) as boolean"
                :velocity-sensitive="getControlValue(node.id, 'velocitySensitive', true) as boolean"
                :width="Math.max(200, layout.w * CELL_SIZE - 32)"
                :height="Math.max(80, layout.h * CELL_SIZE - 48)"
                dark-mode
                @note-on="(note, vel) => handleKeyboardNoteOn(node.id, note, vel)"
                @note-off="(note) => handleKeyboardNoteOff(node.id, note)"
              />
            </template>
          </div>

          <!-- Live value indicator -->
          <div
            v-if="isRunning && !isMonitor && nodeType !== 'slider'"
            class="live-value"
          >
            {{ getLiveValue(node.id) }}
          </div>

          <!-- Resize Handle (edit mode) -->
          <div
            v-if="editMode"
            class="resize-handle"
            @mousedown.stop="startResize($event, node.id, layout)"
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
          <li>Slider, Knob, Trigger, XY Pad</li>
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
          PLAY
        </button>
        <button
          v-else
          class="stop-btn"
          @click="runtimeStore.stop()"
        >
          STOP
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
  background: #0a0a0a;
  color: #e5e5e5;
}

/* Header */
.control-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #111;
  border-bottom: 1px solid #222;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-left h1 {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
  color: #888;
}

.running-indicator {
  background: #22c55e;
  color: #000;
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 9px;
  font-weight: 700;
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
  gap: 8px;
}

.edit-mode-btn,
.back-btn,
.auto-layout-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border: 1px solid #333;
  background: #1a1a1a;
  color: #888;
  cursor: pointer;
  transition: all 0.15s;
}

.edit-mode-btn:hover,
.back-btn:hover,
.auto-layout-btn:hover {
  background: #222;
  color: #aaa;
  border-color: #444;
}

.auto-layout-btn {
  border-color: #22c55e;
  color: #22c55e;
}

.auto-layout-btn:hover {
  background: rgba(34, 197, 94, 0.1);
  border-color: #22c55e;
  color: #22c55e;
}

.edit-mode-btn.active {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

/* Grid Content */
.control-panel-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.control-grid {
  position: relative;
  width: 100%;
  min-height: 100%;
}

/* Grid dots - subtle alignment reference */
.grid-dots {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, #1a1a1a 1px, transparent 1px);
  background-size: var(--cell-size) var(--cell-size);
  pointer-events: none;
}

.edit-mode .grid-dots {
  background-image: radial-gradient(circle, #333 1px, transparent 1px);
}

/* Control Items - Cardless floating controls */
.control-item {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  transition: transform 0.1s ease-out, box-shadow 0.15s;
  border-radius: 4px;
}

.control-item.dragging {
  z-index: 100;
  transform: scale(1.02);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.control-item.resizing {
  z-index: 100;
}

/* Edit mode - whole item is draggable */
.control-item.edit-mode-item {
  cursor: grab;
  border: 1px dashed #444;
  background: rgba(59, 130, 246, 0.05);
}

.control-item.edit-mode-item:hover {
  border-color: #666;
  background: rgba(59, 130, 246, 0.1);
}

.control-item.edit-mode-item.dragging {
  cursor: grabbing;
  border-color: #3b82f6;
}

/* Edit overlay */
.edit-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 4px;
  z-index: 10;
  color: #888;
  cursor: grab;
}

.edit-overlay:active {
  cursor: grabbing;
}

.edit-hint {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 9px;
  text-transform: uppercase;
  margin-top: 4px;
}

/* Control Label */
.control-label {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
  margin-bottom: 4px;
  text-align: center;
  z-index: 1;
}

.label-input {
  background: #1a1a1a;
  border: 1px solid #333;
  padding: 2px 6px;
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 9px;
  text-transform: uppercase;
  color: #aaa;
  text-align: center;
  width: 100%;
  max-width: 120px;
}

/* Control Widget */
.control-widget {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  z-index: 1;
}

/* Fader (vertical slider) */
.fader-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  gap: 8px;
}

.fader-track {
  position: relative;
  width: 12px;
  flex: 1;
  min-height: 80px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  cursor: ns-resize;
  overflow: hidden;
}

.fader-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, var(--accent-color, #00d4aa), var(--accent-color, #00d4aa)88, transparent);
  border-radius: 0 0 5px 5px;
  transition: height 0.05s ease-out;
}

.fader-thumb {
  position: absolute;
  left: -4px;
  right: -4px;
  height: 8px;
  background: var(--accent-color, #00d4aa);
  border: 2px solid #fff;
  border-radius: 3px;
  transform: translateY(50%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  transition: bottom 0.05s ease-out;
}

.fader-value {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 11px;
  color: #888;
}

/* Trigger Button */
.trigger-btn {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a1a;
  border: 2px solid var(--accent-color, #ef4444);
  border-radius: 50%;
  color: var(--accent-color, #ef4444);
  cursor: pointer;
  transition: all 0.1s;
}

.trigger-btn:hover {
  background: #222;
}

.trigger-btn.active {
  background: var(--accent-color, #ef4444);
  color: #000;
  transform: scale(0.95);
  box-shadow: 0 0 20px var(--accent-color, #ef4444);
}

/* XY Pad */
.xy-pad {
  width: 100%;
  flex: 1;
  min-height: 60px;
  background: #111;
  border: 1px solid #333;
  border-radius: 4px;
  position: relative;
  cursor: crosshair;
}

.xy-cursor {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--accent-color, #a855f7);
  border: 2px solid #fff;
  border-radius: 50%;
  transform: translate(-50%, 50%);
  pointer-events: none;
  box-shadow: 0 0 8px var(--accent-color, #a855f7);
}

.xy-values {
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 9px;
  color: #666;
  margin-top: 4px;
}

/* Constant Input */
.constant-input {
  width: 100%;
  max-width: 120px;
  padding: 8px;
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 18px;
  text-align: center;
  background: #111;
  border: 1px solid #333;
  border-radius: 4px;
  color: #aaa;
}

.constant-input:focus {
  outline: none;
  border-color: var(--accent-color, #888);
}

/* LFO Controls */
.lfo-controls {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: center;
}

/* Monitor */
.monitor-display {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 24px;
  font-weight: 500;
  color: var(--accent-color, #22c55e);
  text-align: center;
  background: #050505;
  padding: 12px 16px;
  border: 1px solid #222;
  border-radius: 4px;
  min-width: 120px;
}

/* Oscilloscope Canvas */
.scope-canvas {
  border: 1px solid #333;
  border-radius: 4px;
  background: #0a0a0a;
  max-width: 100%;
}

/* Main Output Canvas */
.output-canvas {
  border: 2px solid var(--accent-color, #3b82f6);
  border-radius: 4px;
  background: #000;
  max-width: 100%;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.3);
}

/* Live value indicator */
.live-value {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 10px;
  color: var(--accent-color, #3b82f6);
  background: rgba(59, 130, 246, 0.1);
  padding: 2px 6px;
  border-radius: 2px;
  margin-top: 4px;
  z-index: 1;
}

/* Resize Handle */
.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  opacity: 0.6;
  background: linear-gradient(135deg, transparent 50%, #3b82f6 50%);
  transition: opacity 0.15s;
  z-index: 20;
}

.resize-handle:hover {
  opacity: 1;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 48px;
  color: #666;
}

.empty-icon {
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-state h2 {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 14px;
  text-transform: uppercase;
  color: #888;
  margin-bottom: 8px;
}

.empty-state ul {
  list-style: none;
  padding: 0;
  margin: 16px 0;
}

.empty-state li {
  padding: 4px 0;
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 11px;
}

/* Footer */
.control-panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #111;
  border-top: 1px solid #222;
  flex-shrink: 0;
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.play-btn,
.stop-btn {
  padding: 8px 20px;
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}

.play-btn {
  background: #22c55e;
  color: #000;
}

.play-btn:hover {
  background: #16a34a;
}

.stop-btn {
  background: #ef4444;
  color: #fff;
}

.stop-btn:hover {
  background: #dc2626;
}

.fps-display {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 10px;
  color: #666;
}

.flow-info {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 10px;
  color: #666;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .control-panel-header {
    flex-wrap: wrap;
    gap: 8px;
  }

  .header-left h1 {
    font-size: 12px;
  }

  .edit-mode-btn,
  .back-btn {
    font-size: 10px;
    padding: 4px 8px;
  }
}
</style>
