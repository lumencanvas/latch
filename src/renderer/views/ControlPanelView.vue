<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch, nextTick, inject } from 'vue'
import { useUIStore, type ControlLayout } from '@/stores/ui'
import { needsReflow, reflow, exposedControlSize, type LayoutItem } from '@/utils/controlPanelLayout'
import ControlRenderer from '@/components/controls/ControlRenderer.vue'
import type { ControlDefinition } from '@/stores/nodes'
import type { Node } from '@vue-flow/core'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'
import { Sliders, Zap, Settings, GripVertical, LayoutGrid } from 'lucide-vue-next'
import RotaryKnob from '@/components/controls/RotaryKnob.vue'
import EnvelopeEditor from '@/components/controls/EnvelopeEditor.vue'
import EQEditor from '@/components/controls/EQEditor.vue'
import WaveformEditor from '@/components/controls/WaveformEditor.vue'
import PianoKeyboard from '@/components/controls/PianoKeyboard.vue'
import GamepadDisplay from '@/components/controls/GamepadDisplay.vue'
import { emptyControllerState, type ControllerState } from '@/services/input/controllerState'
import * as THREE from 'three'
import { getExecutionEngine } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'

const uiStore = useUIStore()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()
const runtimeStore = useRuntimeStore()
// Play/Stop must drive the execution engine (App.vue provides it), not just the status flag:
// runtimeStore.start() alone showed LIVE at 0 fps with nothing running.
const executionControls = inject<{ start: () => unknown; stop: () => void }>('executionControls')
function play() {
  if (executionControls) void executionControls.start()
  else runtimeStore.start()
}
function stopPlayback() {
  if (executionControls) executionControls.stop()
  else runtimeStore.stop()
}

// Grid configuration - responsive
const CELL_SIZE = 60
const containerRef = ref<HTMLElement | null>(null)
const containerWidth = ref(1200)

// Columns follow the container width. Min 4 (not 6): 6 × 60px = 360px is wider
// than a phone's content box, which forced a horizontal scroll.
const GRID_COLS = computed(() => Math.max(4, Math.floor(containerWidth.value / CELL_SIZE)))

// Control node types that should auto-appear
const controlNodeTypes = ['slider', 'knob', 'trigger', 'xy-pad', 'constant', 'lfo', 'envelope-visual', 'parametric-eq', 'wavetable', 'keyboard', 'synth', 'gamepad-visual']
const monitorNodeTypes = ['monitor', 'oscilloscope', 'main-output']

// Edit mode
const editMode = ref(false)

// Drag / resize state - local (not the store) so a drag doesn't write
// localStorage on every pointermove; committed once on release.
const dragging = ref<{
  nodeId: string
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  currentX: number
  currentY: number
} | null>(null)

const resizing = ref<{ nodeId: string; startW: number; startH: number; startX: number; startY: number; currentW: number; currentH: number } | null>(null)

// Fader drag state (separate from control dragging)
const faderDrag = ref<{ nodeId: string; startY: number; startValue: number } | null>(null)

// XY pad drag state
const xyDrag = ref<{ nodeId: string; el: HTMLElement } | null>(null)

// Screen-reader announcements for keyboard tile moves.
const liveAnnounce = ref('')

// Accent colors by control type
const accentColors: Record<string, string> = {
  slider: '#00d4aa',
  knob: '#ff6b35',
  'xy-pad': '#ec4899',
  trigger: '#ef4444',
  monitor: '#22c55e',
  oscilloscope: '#3b82f6',
  constant: '#888888',
  lfo: '#f59e0b',
  'envelope-visual': '#ff6b35',
  'parametric-eq': '#06b6d4',
  wavetable: '#22c55e',
  keyboard: '#22c55e',
  synth: '#f59e0b',
  'main-output': '#3b82f6',
  'gamepad-visual': '#1A9A7A',
  'exposed-control': '#a78bfa',
}

// O(1) node lookup — getControlValue is called many times per tile per render;
// the old `nodes.find` per call made a big panel O(n²) per frame.
const nodeById = computed(() => {
  const m = new Map<string, Node>()
  for (const n of flowsStore.activeFlow?.nodes ?? []) m.set(n.id, n)
  return m
})

interface TileSource {
  key: string
  node: Node
  nodeType: string
  label: string
  isMonitor: boolean
  accentColor: string
  /** Set for a single control exposed from the Properties panel. */
  control?: ControlDefinition
}

// Tile sources: whole control/monitor nodes, plus individual controls exposed
// from the Properties panel (the "Expose to Control Panel" toggle). Exposed
// controls were stored but never rendered here — the toggle did nothing.
const tileSources = computed<TileSource[]>(() => {
  const flow = flowsStore.activeFlow
  if (!flow) return []
  const out: TileSource[] = []
  for (const node of flow.nodes) {
    const nodeType = node.data?.nodeType as string
    if (!controlNodeTypes.includes(nodeType) && !monitorNodeTypes.includes(nodeType)) continue
    const definition = nodesStore.getDefinition(nodeType)
    out.push({
      key: node.id,
      node,
      nodeType,
      label: (node.data?.label as string) || definition?.name || nodeType,
      isMonitor: monitorNodeTypes.includes(nodeType),
      accentColor: accentColors[nodeType] || '#00d4aa',
    })
  }
  for (const exposed of uiStore.exposedControls) {
    const node = nodeById.value.get(exposed.nodeId)
    if (!node) continue // belongs to another flow (or a deleted node)
    const nodeType = node.data?.nodeType as string
    const definition = nodesStore.getDefinition(nodeType)
    const dyn = (node.data?._dynamicControls as ControlDefinition[] | undefined) ?? []
    const control = definition?.controls.find(c => c.id === exposed.controlId) ?? dyn.find(c => c.id === exposed.controlId)
    if (!control) continue
    const nodeLabel = (node.data?.label as string) || definition?.name || nodeType
    out.push({
      key: exposed.id,
      node,
      nodeType: 'exposed-control',
      label: `${nodeLabel} · ${exposed.label || control.label}`,
      isMonitor: false,
      accentColor: accentColors['exposed-control'],
      control,
    })
  }
  return out
})

const layoutItems = computed<LayoutItem[]>(() => tileSources.value.map(t => ({
  key: t.key,
  nodeType: t.nodeType,
  size: t.control ? exposedControlSize(t.control.type) : undefined,
})))

const tileKeys = computed(() => new Set(tileSources.value.map(t => t.key)))

// Create layouts for new tiles OUTSIDE of any computed (the old code mutated
// the store + wrote localStorage from inside the `controlNodes` getter), packed
// against this panel's tiles only — other flows' entries no longer block slots.
// Gated on the first real measurement so new tiles are packed for the actual
// container width, not a guess (which made a fresh panel open "re-packed").
const measured = ref(false)
watch([layoutItems, GRID_COLS, measured], ([items, cols, ready]) => {
  if (ready) uiStore.ensureControlLayouts(items, cols)
}, { immediate: true })

// This panel's saved layouts.
const savedLayouts = computed<ControlLayout[]>(() =>
  uiStore.controlPanelLayout.filter(l => tileKeys.value.has(l.nodeId)),
)

// A panel authored on a wide screen is re-packed (transiently, never saved)
// when the grid is narrower than its layout — e.g. opened on a phone/tablet.
const isReflowed = computed(() => needsReflow(savedLayouts.value, GRID_COLS.value))
const displayLayouts = computed(() => {
  const list = isReflowed.value ? reflow(savedLayouts.value, GRID_COLS.value) : savedLayouts.value
  return new Map(list.map(l => [l.nodeId, l]))
})

// Rendered tiles = sources joined with their (display) layout.
const controlNodes = computed(() => tileSources.value.flatMap(t => {
  const layout = displayLayouts.value.get(t.key)
  return layout ? [{ ...t, layout }] : []
}))

// Calculate grid height based on content
const gridHeight = computed(() => {
  if (controlNodes.value.length === 0) return 400
  const maxY = Math.max(...controlNodes.value.map(c => c.layout.y + getControlSize(c.key, c.layout).h))
  return Math.max(400, (maxY + 2) * CELL_SIZE)
})

// Get control value
function getControlValue(nodeId: string, controlId: string, defaultVal: unknown = 0): unknown {
  const node = nodeById.value.get(nodeId)
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

// Update node label (committed on change/blur — not per keystroke, which
// marked the flow dirty on every character)
function updateNodeLabel(nodeId: string, label: string) {
  const trimmed = label.trim()
  if (trimmed) flowsStore.updateNodeData(nodeId, { label: trimmed })
}

// Entering edit mode on a reflowed (narrower-than-authored) panel adopts the
// re-packed arrangement as the saved layout for this width, so what you drag
// is what you see.
function toggleEditMode() {
  if (!editMode.value && isReflowed.value) {
    uiStore.replaceControlLayouts([...displayLayouts.value.values()])
  }
  editMode.value = !editMode.value
}

// Drag handlers (pointer events: mouse, pen and touch). In edit mode the whole
// tile is the drag handle.
function startDrag(e: PointerEvent, nodeId: string, layout: ControlLayout) {
  if (!editMode.value || e.button > 0) return
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

function setXYFromPointer(nodeId: string, el: HTMLElement, e: PointerEvent) {
  const rect = el.getBoundingClientRect()
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height))
  flowsStore.updateNodeData(nodeId, { x, y })
}

function onPointerMove(e: PointerEvent) {
  if (dragging.value) {
    const d = dragging.value
    const layout = displayLayouts.value.get(d.nodeId)
    const w = layout?.w ?? 1
    const dx = Math.round((e.clientX - d.offsetX) / CELL_SIZE)
    const dy = Math.round((e.clientY - d.offsetY) / CELL_SIZE)
    d.currentX = Math.max(0, Math.min(GRID_COLS.value - w, d.startX + dx))
    d.currentY = Math.max(0, d.startY + dy)
  }
  if (resizing.value) {
    const r = resizing.value
    const layout = displayLayouts.value.get(r.nodeId)
    const maxW = GRID_COLS.value - (layout?.x ?? 0)
    const dx = Math.round((e.clientX - r.startX) / CELL_SIZE)
    const dy = Math.round((e.clientY - r.startY) / CELL_SIZE)
    r.currentW = Math.max(2, Math.min(maxW, r.startW + dx))
    r.currentH = Math.max(2, r.startH + dy)
  }
  if (faderDrag.value) {
    const deltaY = faderDrag.value.startY - e.clientY
    const sensitivity = 1 / 150 // 150px for full range
    let newValue = faderDrag.value.startValue + deltaY * sensitivity
    newValue = Math.max(0, Math.min(1, newValue))
    updateControlValue(faderDrag.value.nodeId, 'value', newValue)
  }
  if (xyDrag.value) setXYFromPointer(xyDrag.value.nodeId, xyDrag.value.el, e)
}

function onPointerUp() {
  if (dragging.value) {
    const d = dragging.value
    const layout = displayLayouts.value.get(d.nodeId)
    if (layout && (d.currentX !== layout.x || d.currentY !== layout.y)) {
      // Lands in the nearest free cell instead of stacking on another tile.
      uiStore.placeControlTile(d.nodeId, { x: d.currentX, y: d.currentY, w: layout.w, h: layout.h }, GRID_COLS.value, tileKeys.value, 'move')
    }
    dragging.value = null
  }
  if (resizing.value) {
    const r = resizing.value
    const layout = displayLayouts.value.get(r.nodeId)
    if (layout && (r.currentW !== layout.w || r.currentH !== layout.h)) {
      // A resize that would overlap a neighbour is rejected (keeps the old size).
      uiStore.placeControlTile(r.nodeId, { x: layout.x, y: layout.y, w: r.currentW, h: r.currentH }, GRID_COLS.value, tileKeys.value, 'resize')
    }
    resizing.value = null
  }
  faderDrag.value = null
  xyDrag.value = null
}

function startResize(e: PointerEvent, nodeId: string, layout: ControlLayout) {
  if (!editMode.value) return
  e.preventDefault()
  e.stopPropagation()
  resizing.value = {
    nodeId,
    startW: layout.w,
    startH: layout.h,
    startX: e.clientX,
    startY: e.clientY,
    currentW: layout.w,
    currentH: layout.h,
  }
}

// Keyboard layout editing (edit mode): arrows move a focused tile one cell,
// Shift+arrows resize it. Same collision rules as pointer drag/resize.
function onTileKeydown(e: KeyboardEvent, key: string, label: string, layout: ControlLayout) {
  if (!editMode.value || e.target !== e.currentTarget) return
  const dirs: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const dir = dirs[e.key]
  if (!dir) return
  e.preventDefault()
  const [dx, dy] = dir
  const placed = e.shiftKey
    ? uiStore.placeControlTile(key, { x: layout.x, y: layout.y, w: layout.w + dx, h: layout.h + dy }, GRID_COLS.value, tileKeys.value, 'resize')
    : uiStore.placeControlTile(key, { x: layout.x + dx, y: layout.y + dy, w: layout.w, h: layout.h }, GRID_COLS.value, tileKeys.value, 'move')
  if (placed) {
    liveAnnounce.value = `${label}: column ${placed.x + 1}, row ${placed.y + 1}, ${placed.w} by ${placed.h}`
  }
}

// Fader handlers
function startFaderDrag(e: PointerEvent, nodeId: string) {
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

// Keyboard: fader is an ARIA slider (arrows ±0.01, Shift ±0.1, Home/End, PageUp/Down ±0.1).
function onFaderKeydown(e: KeyboardEvent, nodeId: string) {
  const cur = getControlValue(nodeId, 'value', 0.5) as number
  const step = e.shiftKey ? 0.1 : 0.01
  let next: number | null = null
  switch (e.key) {
    case 'ArrowUp': case 'ArrowRight': next = cur + step; break
    case 'ArrowDown': case 'ArrowLeft': next = cur - step; break
    case 'PageUp': next = cur + 0.1; break
    case 'PageDown': next = cur - 0.1; break
    case 'Home': next = 0; break
    case 'End': next = 1; break
  }
  if (next === null) return
  e.preventDefault()
  updateControlValue(nodeId, 'value', Math.round(Math.max(0, Math.min(1, next)) * 1000) / 1000)
}

function startXYDrag(e: PointerEvent, nodeId: string) {
  if (editMode.value) return
  const el = e.currentTarget as HTMLElement
  e.preventDefault()
  xyDrag.value = { nodeId, el }
  setXYFromPointer(nodeId, el, e)
}

function onXYKeydown(e: KeyboardEvent, nodeId: string) {
  const step = e.shiftKey ? 0.1 : 0.01
  const x = getControlValue(nodeId, 'x', 0.5) as number
  const y = getControlValue(nodeId, 'y', 0.5) as number
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000
  const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
  const m = moves[e.key]
  if (!m) return
  e.preventDefault()
  flowsStore.updateNodeData(nodeId, { x: clamp(x + m[0]), y: clamp(y + m[1]) })
}

// Trigger: pointer press/release + Space/Enter so it works from the keyboard.
function setTrigger(nodeId: string, on: boolean) {
  if (editMode.value) return
  if ((getControlValue(nodeId, 'value', false) as boolean) !== on) updateControlValue(nodeId, 'value', on)
}

function onTriggerKey(e: KeyboardEvent, nodeId: string, on: boolean) {
  if (e.key !== ' ' && e.key !== 'Enter') return
  e.preventDefault()
  if (on && e.repeat) return
  setTrigger(nodeId, on)
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

// Visual size (live preview while resizing)
function getControlSize(nodeId: string, layout: ControlLayout) {
  if (resizing.value?.nodeId === nodeId) return { w: resizing.value.currentW, h: resizing.value.currentH }
  return { w: layout.w, h: layout.h }
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

// Auto-layout function (this panel's tiles only, for the current width)
function autoLayoutAll() {
  uiStore.autoLayoutAll(layoutItems.value.map(i => ({ id: i.key, nodeType: i.nodeType, size: i.size })), GRID_COLS.value)
}

// ResizeObserver to track container width
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  // Drop layout entries / exposed controls whose node no longer exists in any
  // open flow (deleted nodes used to leave tiles in localStorage forever).
  uiStore.cleanupExposedControls(flowsStore.flows.flatMap(f => f.nodes.map(n => n.id)))
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
        // contentRect already excludes the 16px padding — subtracting 32 again
        // (as before) under-counted the width, so the grid lost a column on the
        // first observer tick and a freshly-packed panel tipped into reflow.
        containerWidth.value = entry.contentRect.width
      }
    })
    resizeObserver.observe(containerRef.value)
  }
  measured.value = true
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
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
          v-if="editMode || isReflowed"
          class="auto-layout-btn"
          :title="isReflowed ? 'Re-pack and save the layout for this screen width' : 'Auto-arrange all controls'"
          @click="autoLayoutAll"
        >
          <LayoutGrid :size="16" />
          Auto Layout
        </button>
        <button
          class="edit-mode-btn"
          :class="{ active: editMode }"
          :aria-pressed="editMode"
          :title="isReflowed && !editMode ? 'This layout was made on a wider screen and is shown re-packed; editing saves the re-packed layout for this width' : 'Move and resize tiles (keyboard: focus a tile, arrows move, Shift+arrows resize)'"
          @click="toggleEditMode"
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

        <span
          class="sr-only"
          aria-live="polite"
        >{{ liveAnnounce }}</span>

        <!-- Control Items - Cardless floating controls -->
        <div
          v-for="{ key, node, nodeType, label, layout, isMonitor, accentColor, control } in controlNodes"
          :key="key"
          class="control-item"
          :class="[nodeType, {
            dragging: dragging?.nodeId === key,
            resizing: resizing?.nodeId === key,
            'edit-mode-item': editMode
          }]"
          :style="{
            left: (getControlPosition(key, layout).x * CELL_SIZE) + 'px',
            top: (getControlPosition(key, layout).y * CELL_SIZE) + 'px',
            width: (getControlSize(key, layout).w * CELL_SIZE - 16) + 'px',
            height: (getControlSize(key, layout).h * CELL_SIZE - 16) + 'px',
            '--accent-color': accentColor,
          }"
          role="group"
          :aria-label="editMode ? `${label} tile, column ${layout.x + 1}, row ${layout.y + 1}, ${layout.w} by ${layout.h}. Arrows move, Shift+arrows resize.` : label"
          :tabindex="editMode ? 0 : undefined"
          @pointerdown="editMode ? startDrag($event, key, layout) : undefined"
          @keydown="onTileKeydown($event, key, label, layout)"
        >
          <!-- Edit mode overlay for dragging -->
          <div
            v-if="editMode"
            class="edit-overlay"
            aria-hidden="true"
          >
            <GripVertical :size="20" />
            <span class="edit-hint">Drag to move</span>
          </div>

          <!-- Label -->
          <div
            class="control-label"
            @pointerdown.stop
          >
            <input
              v-if="editMode && !control"
              type="text"
              class="label-input"
              :value="label"
              :aria-label="`Rename ${label}`"
              @change="updateNodeLabel(node.id, ($event.target as HTMLInputElement).value)"
              @pointerdown.stop
            >
            <span
              v-else
              :title="label"
            >{{ label }}</span>
          </div>

          <!-- Control Widget -->
          <div
            class="control-widget"
            @pointerdown.stop
          >
            <!-- A single control exposed from the Properties panel -->
            <template v-if="control">
              <div
                class="exposed-control"
                data-theme="dark"
              >
                <ControlRenderer
                  :control="control"
                  :model-value="getControlValue(node.id, control.id, control.default)"
                  context="panel"
                  @update="(v: unknown) => updateControlValue(node.id, control.id, v)"
                />
              </div>
            </template>

            <!-- Slider as Fader -->
            <template v-else-if="nodeType === 'slider'">
              <div class="fader-container">
                <div
                  class="fader-track"
                  role="slider"
                  tabindex="0"
                  :aria-label="label"
                  aria-valuemin="0"
                  aria-valuemax="1"
                  :aria-valuenow="(getControlValue(node.id, 'value', 0.5) as number)"
                  :aria-valuetext="(getControlValue(node.id, 'value', 0.5) as number).toFixed(2)"
                  @pointerdown="startFaderDrag($event, node.id)"
                  @keydown="onFaderKeydown($event, node.id)"
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
                :aria-label="`${label} (hold)`"
                :aria-pressed="!!getControlValue(node.id, 'value', false)"
                @pointerdown="setTrigger(node.id, true)"
                @pointerup="setTrigger(node.id, false)"
                @pointerleave="setTrigger(node.id, false)"
                @pointercancel="setTrigger(node.id, false)"
                @keydown="onTriggerKey($event, node.id, true)"
                @keyup="onTriggerKey($event, node.id, false)"
                @blur="setTrigger(node.id, false)"
              >
                <Zap :size="24" />
              </button>
            </template>

            <!-- XY Pad -->
            <template v-else-if="nodeType === 'xy-pad'">
              <div
                class="xy-pad"
                tabindex="0"
                role="application"
                :aria-label="`${label} XY pad: X ${(getControlValue(node.id, 'x', 0.5) as number).toFixed(2)}, Y ${(getControlValue(node.id, 'y', 0.5) as number).toFixed(2)}. Arrow keys move.`"
                @pointerdown="startXYDrag($event, node.id)"
                @keydown="onXYKeydown($event, node.id)"
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

            <!-- Visual Gamepad -->
            <template v-else-if="nodeType === 'gamepad-visual'">
              <GamepadDisplay
                :display-state="(runtimeStore.nodeMetrics.get(node.id)?.outputValues?.state as ControllerState) ?? (getControlValue(node.id, 'interactive', emptyControllerState()) as ControllerState)"
                :interactive-state="(getControlValue(node.id, 'interactive', emptyControllerState()) as ControllerState)"
                @update:interactive-state="(v) => updateControlValue(node.id, 'interactive', v)"
              />
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

            <!-- Synth -->
            <template v-else-if="nodeType === 'synth'">
              <div class="synth-control">
                <!-- Instrument selector -->
                <div class="synth-instrument">
                  <select
                    :value="getControlValue(node.id, 'instrument', 'sine')"
                    @change="updateControlValue(node.id, 'instrument', ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="sine">
                      Sine
                    </option>
                    <option value="moog">
                      Moog Bass
                    </option>
                    <option value="piano">
                      Piano
                    </option>
                    <option value="organ">
                      Organ
                    </option>
                    <option value="pluck">
                      Pluck
                    </option>
                    <option value="pad">
                      Pad
                    </option>
                  </select>
                </div>
                <!-- Knobs grid -->
                <div class="synth-knobs">
                  <RotaryKnob
                    :model-value="getControlValue(node.id, 'volume', -6) as number"
                    :min="-60"
                    :max="0"
                    label="VOL"
                    size="small"
                    accent-color="#f59e0b"
                    @update:model-value="v => updateControlValue(node.id, 'volume', v)"
                  />
                  <RotaryKnob
                    :model-value="getControlValue(node.id, 'attack', 0.01) as number"
                    :min="0.001"
                    :max="2"
                    label="ATK"
                    size="small"
                    accent-color="#f59e0b"
                    @update:model-value="v => updateControlValue(node.id, 'attack', v)"
                  />
                  <RotaryKnob
                    :model-value="getControlValue(node.id, 'decay', 0.1) as number"
                    :min="0.001"
                    :max="2"
                    label="DEC"
                    size="small"
                    accent-color="#f59e0b"
                    @update:model-value="v => updateControlValue(node.id, 'decay', v)"
                  />
                  <RotaryKnob
                    :model-value="getControlValue(node.id, 'sustain', 0.7) as number"
                    :min="0"
                    :max="1"
                    label="SUS"
                    size="small"
                    accent-color="#f59e0b"
                    @update:model-value="v => updateControlValue(node.id, 'sustain', v)"
                  />
                  <RotaryKnob
                    :model-value="getControlValue(node.id, 'release', 0.3) as number"
                    :min="0.001"
                    :max="5"
                    label="REL"
                    size="small"
                    accent-color="#f59e0b"
                    @update:model-value="v => updateControlValue(node.id, 'release', v)"
                  />
                  <!-- Moog filter controls -->
                  <template v-if="getControlValue(node.id, 'instrument', 'sine') === 'moog'">
                    <RotaryKnob
                      :model-value="getControlValue(node.id, 'filterCutoff', 2000) as number"
                      :min="20"
                      :max="20000"
                      label="CUT"
                      size="small"
                      accent-color="#ec4899"
                      @update:model-value="v => updateControlValue(node.id, 'filterCutoff', v)"
                    />
                    <RotaryKnob
                      :model-value="getControlValue(node.id, 'filterResonance', 1) as number"
                      :min="0.1"
                      :max="20"
                      label="RES"
                      size="small"
                      accent-color="#ec4899"
                      @update:model-value="v => updateControlValue(node.id, 'filterResonance', v)"
                    />
                  </template>
                </div>
              </div>
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
            aria-hidden="true"
            @pointerdown.stop="startResize($event, key, layout)"
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
        <p>Control and monitor nodes appear here automatically. Add any of these in the editor:</p>
        <ul>
          <li>Slider, Knob, Trigger, XY Pad, LFO</li>
          <li>Keyboard, Synth, Wavetable, Envelope</li>
          <li>Monitor, Oscilloscope, Main Output</li>
        </ul>
        <p>Or expose any single control from a node's Properties panel (the crosshair button).</p>
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
          @click="play"
        >
          PLAY
        </button>
        <button
          v-else
          class="stop-btn"
          @click="stopPlayback"
        >
          STOP
        </button>
        <span class="fps-display">{{ runtimeStore.fps }} FPS</span>
      </div>
      <div class="flow-info">
        <span>{{ controlNodes.length }} controls</span>
        <span
          v-if="isReflowed"
          class="reflow-note"
        > · re-packed for this screen</span>
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
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  background: var(--accent-color, #ec4899);
  border: 2px solid #fff;
  border-radius: 50%;
  transform: translate(-50%, 50%);
  pointer-events: none;
  box-shadow: 0 0 8px var(--accent-color, #ec4899);
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

/* Synth Control */
.synth-control {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.synth-instrument {
  display: flex;
  justify-content: center;
}

.synth-instrument select {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 4px 8px;
  background: #1a1a1a;
  color: #f59e0b;
  border: 1px solid #333;
  border-radius: 4px;
  cursor: pointer;
}

.synth-instrument select:focus {
  outline: none;
  border-color: #f59e0b;
}

.synth-knobs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
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

/* Touch: pointer drags must not scroll/zoom the page. */
.control-item.edit-mode-item,
.fader-track,
.xy-pad,
.resize-handle {
  touch-action: none;
}

.control-item:focus-visible,
.fader-track:focus-visible,
.xy-pad:focus-visible,
.trigger-btn:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

/* Exposed single control (ControlRenderer, panel context, dark tokens) */
.exposed-control {
  width: 100%;
  padding: 4px 2px;
  background: transparent;
}

.reflow-note {
  color: #f59e0b;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
