<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, markRaw, nextTick, inject } from 'vue'
import { VueFlow, useVueFlow, Panel, ConnectionMode } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls, ControlButton } from '@vue-flow/controls'
import { Eye, Network } from 'lucide-vue-next'
import { MiniMap } from '@vue-flow/minimap'
import type { Connection, NodeChange, XYPosition } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

// Named so <KeepAlive :include="['EditorView']"> in App.vue caches this view —
// keeps the graph (and a running Emulator node) alive when switching to Controls.
defineOptions({ name: 'EditorView' })

import { useFlowsStore } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'
import { useNodesStore, dataTypeMeta } from '@/stores/nodes'
import { flowSnippets, STARTER_FLOW_IDS, REQUIREMENT_LABELS } from '@/data/flow-snippets'
import { snippetToInsertableNodes, snippetOffsetToCenter } from '@/utils/snippets'
import { useFlowLibrary, looksLikeFlowText } from '@/composables/useFlowLibrary'
import { nodeTypeColor } from '@/utils/nodeColor'
import { suggestNodesForPort } from '@/utils/nodeSuggestions'
import FlowPreview from '@/components/preview/FlowPreview.vue'
import AnimatedEdge from '@/components/edges/AnimatedEdge.vue'
import WireSuggestionPopover, { type SuggestionItem } from '@/components/canvas/WireSuggestionPopover.vue'
import { validateConnection, getPortType, areTypesCompatible } from '@/utils/connections'
import { useFlowHistory } from '@/composables/useFlowHistory'
import { installAgentTools } from '@/services/agentTools'
import type { ToolEnv } from '@/services/agentTools/types'
import { useCanvasKeyboard } from '@/composables/useCanvasKeyboard'
import { useAutoArrange } from '@/composables/useAutoArrange'
import { useDialogA11y } from '@/composables/useDialogA11y'
import { getCustomNodeLoader } from '@/services/customNodes'

// Import node registry
import { initializeNodeRegistry, nodeTypes } from '@/registry'

// History for undo/redo
const { canUndo, canRedo, undo, redo, startBatch, endBatch } = useFlowHistory()

// Connection validation message
const connectionError = ref<string | null>(null)
let connectionErrorTimeout: ReturnType<typeof setTimeout> | null = null

// Clipboard for copy/paste
interface ClipboardData {
  nodes: Array<{ id: string; nodeType: string; position: { x: number; y: number }; data: Record<string, unknown> }>
  edges: Array<{ source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }>
  copyOffset: { x: number; y: number }
}
const clipboard = ref<ClipboardData | null>(null)

const flowsStore = useFlowsStore()
const uiStore = useUIStore()
const nodesStore = useNodesStore()

const vueFlow = useVueFlow()
const flowLibrary = useFlowLibrary()
const executionControls = inject<ToolEnv['execution']>('executionControls')
let uninstallAgentTools: (() => void) | null = null
const {
  onConnect,
  onConnectStart,
  onConnectEnd,
  addEdges,
  onNodeDragStart,
  onNodeDragStop,
  onPaneReady,
  onPaneClick,
  onNodeClick,
  project,
  fitView,
  setCenter,
  setViewport,
  getViewport,
  flowToScreenCoordinate,
  getSelectedEdges,
} = vueFlow

// The canvas keyboard model (navigate / move / wire, WCAG 2.1.1) lives in a
// composable; EditorView just binds it to the host and the live region.
const { canvasAnnounce, onCanvasKeydown, onCanvasFocus, onCanvasBlur } = useCanvasKeyboard({
  setCenter, getViewport, flowToScreenCoordinate, addEdges, startBatch, endBatch, showConnectionError,
  suggestNodeFromWire: openWireSuggestionsForNode,
})

// Tidy graph (layered auto-arrange; one undo step). Uses Vue Flow's measured
// node sizes where available; reframes the canvas after a whole-flow tidy.
const { arrange: tidyGraph } = useAutoArrange({
  getDimensions: (id) => vueFlow.findNode(id)?.dimensions,
  // Vue Flow syncs v-model positions a tick later; frame after it has them.
  onArranged: (_ids, scope) => { if (scope === 'all') setTimeout(() => fitView({ padding: 0.2, duration: 200 }), 60) },
})

// Track drag state for undo/redo
const dragStartSnapshot = ref<ReturnType<typeof startBatch>>(null)

// Edge types - use markRaw to prevent Vue reactivity warnings
const edgeTypes = {
  animated: markRaw(AnimatedEdge),
}

// Initialize node registry (registers all built-in nodes)
initializeNodeRegistry()

// Track initialization state
const isInitializing = ref(true)

// Initialize flows on mount
onMounted(async () => {
  // Picker-first first-run: land new users on the empty canvas's template picker
  // rather than auto-loading the full demo. The demo stays one click away via the
  // empty state's "Open the full Starter Flow" CTA (openStarterFlow). This is the
  // UX-audit recommendation — see docs/UX_EXPERIENCE_AUDIT_2026-07-13.md.
  if (!flowsStore.activeFlow) {
    flowsStore.createFlow('My First Flow')
  }
  isInitializing.value = false
})

// Connection validation
function isValidConnection(connection: Connection): boolean {
  const result = validateConnection(
    connection,
    (nodeType) => nodesStore.getDefinition(nodeType),
    (nodeId) => flowsStore.activeFlow?.nodes.find(n => n.id === nodeId)?.data as Record<string, unknown> | undefined
  )

  if (!result.valid && result.reason) {
    showConnectionError(result.reason)
  }

  return result.valid
}

function showConnectionError(message: string) {
  connectionError.value = message
  if (connectionErrorTimeout) {
    clearTimeout(connectionErrorTimeout)
  }
  connectionErrorTimeout = setTimeout(() => {
    connectionError.value = null
  }, 2000)
}

// Get node color for MiniMap based on category
function getNodeMinimapColor(node: { data?: Record<string, unknown> }): string {
  const nodeType = node.data?.nodeType as string | undefined
  if (!nodeType) return 'var(--color-neutral-400)'
  return nodeTypeColor(nodeType, (t) => nodesStore.getDefinition(t)?.category)
}

// ============================================================================
// Event Handlers
// ============================================================================

// Handle connections
onConnect((connection: Connection) => {
  connectionMade = true
  addEdges([connection])
  if (flowsStore.activeFlow) {
    flowsStore.addEdge(
      connection.source,
      connection.sourceHandle ?? '',
      connection.target,
      connection.targetHandle ?? ''
    )
  }
})

// ── Drag-a-wire-into-empty-space → compatible-node suggestions ───────────────
// When a wire is released on empty canvas (connectEnd fires without a preceding
// connect), offer the nodes whose ports are type-compatible with the dragged-from
// port; picking one inserts it at the drop point and auto-wires it.
let connectionMade = false
let connectOrigin: { nodeId: string; handleId: string; handleType: 'source' | 'target' } | null = null

const wireSuggest = ref<{
  x: number
  y: number
  items: SuggestionItem[]
  originTypeLabel: string
  originGlyph: string
  originColor: string
  origin: { nodeId: string; handleId: string; direction: 'source' | 'target'; flowPosition: XYPosition }
} | null>(null)

onConnectStart((params) => {
  connectionMade = false
  connectOrigin = params.nodeId && params.handleId
    ? { nodeId: params.nodeId, handleId: params.handleId, handleType: params.handleType ?? 'source' }
    : null
})

onConnectEnd((event) => {
  const origin = connectOrigin
  connectOrigin = null
  // A valid drop already made the connection; only empty-space drops open the picker.
  if (connectionMade || !origin || !event || !flowsStore.activeFlow) return
  const point = 'clientX' in event ? event : event.changedTouches[0]
  if (!point) return
  // Only offer suggestions on a drop onto the EMPTY pane — not onto a node or one
  // of the canvas UI overlays (minimap/controls/panels). elementFromPoint is used
  // (not event.target) because a touchend's target is the touchstart element, not
  // the element under the release point.
  const dropEl = document.elementFromPoint(point.clientX, point.clientY)
  if (dropEl?.closest('.vue-flow__node, .vue-flow__minimap, .vue-flow__controls, .vue-flow__panel')) return
  openWireSuggestions(origin, point)
})

function openWireSuggestions(
  origin: { nodeId: string; handleId: string; handleType: 'source' | 'target' },
  point: { clientX: number; clientY: number },
) {
  const node = flowsStore.activeFlow?.nodes.find(n => n.id === origin.nodeId)
  const nodeType = node?.data?.nodeType as string | undefined
  if (!nodeType) return

  const def = nodesStore.getDefinition(nodeType)
  const direction = origin.handleType === 'source' ? 'output' : 'input'
  const originType = getPortType(def, origin.handleId, direction, node?.data as Record<string, unknown>)
  if (!originType) return

  const suggestions = suggestNodesForPort(
    { type: originType, direction: origin.handleType },
    nodesStore.allDefinitions,
    areTypesCompatible,
  )
  if (suggestions.length === 0) return

  const items: SuggestionItem[] = suggestions.map(s => ({
    nodeType: s.nodeType,
    name: nodesStore.getDefinition(s.nodeType)?.name ?? s.nodeType,
    color: nodeTypeColor(s.nodeType, t => nodesStore.getDefinition(t)?.category),
    port: s.port,
  }))

  const meta = dataTypeMeta[originType]
  // Place the new node so its wired handle lands near the drop rather than the
  // node's top-left corner: nudge up to the first port row, and for an input-drag
  // shift left a node-width so the new node's OUTPUT edge (not its left corner)
  // meets the cursor. Offsets are applied in screen space, then projected.
  // `project` expects pane-relative coordinates, so subtract the pane's offset
  // (the canvas is inset by the left toolbar) — otherwise the node lands a
  // sidebar-width off.
  const NODE_W = 170, PORT_ROW = 20
  const ox = origin.handleType === 'target' ? -NODE_W : 0
  const pane = document.querySelector('.vue-flow__pane')?.getBoundingClientRect()
  const flowPosition = project({
    x: point.clientX + ox - (pane?.left ?? 0),
    y: point.clientY - PORT_ROW - (pane?.top ?? 0),
  })
  wireSuggest.value = {
    // Clamp so the popover stays fully on-screen near the drop point (reserve its
    // full height: header + input + the 260px max-height list + borders).
    x: Math.min(point.clientX, window.innerWidth - 252),
    y: Math.min(point.clientY, window.innerHeight - 344),
    items,
    originTypeLabel: meta?.label ?? originType,
    originGlyph: meta?.glyph ?? '',
    originColor: meta?.color ?? 'var(--color-neutral-400)',
    origin: {
      nodeId: origin.nodeId,
      handleId: origin.handleId,
      direction: origin.handleType,
      flowPosition,
    },
  }
}

function pickWireSuggestion(item: SuggestionItem) {
  const ctx = wireSuggest.value
  if (!ctx || !flowsStore.activeFlow) return

  const before = startBatch()
  const node = flowsStore.addNode(item.nodeType, ctx.origin.flowPosition)
  if (node) {
    // Wire origin → new node in the direction the wire was dragged.
    if (ctx.origin.direction === 'source') {
      flowsStore.addEdge(ctx.origin.nodeId, ctx.origin.handleId, node.id, item.port.id)
    } else {
      flowsStore.addEdge(node.id, item.port.id, ctx.origin.nodeId, ctx.origin.handleId)
    }
    uiStore.selectNodes([node.id])
  }
  endBatch(before, 'Add connected node')
  closeWireSuggestions()
}

function closeWireSuggestions() {
  wireSuggest.value = null
  // Return focus to the canvas host so keyboard users aren't stranded.
  document.getElementById('flow-canvas-panel')?.focus()
}

// Keyboard entry point (canvas `n` during a wire): open the picker beside the
// source node — the keyboard equivalent of dropping a wire on empty canvas.
function openWireSuggestionsForNode(origin: { nodeId: string; handleId: string; handleType: 'source' }) {
  const el = document.querySelector<HTMLElement>(`.vue-flow__node[data-id="${origin.nodeId}"]`)
  const r = el?.getBoundingClientRect()
  const point = r
    ? { clientX: r.right + 24, clientY: r.top }
    : { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 }
  openWireSuggestions(origin, point)
}

// Handle node drag start - capture state for undo
onNodeDragStart(() => {
  dragStartSnapshot.value = startBatch()
})

// Handle node drag stop - update position and record history
onNodeDragStop(({ node }) => {
  flowsStore.updateNodePosition(node.id, node.position)
  // updateNodePosition skips dirty (it fires per-frame during drag); mark dirty
  // once here on drag stop so the new layout actually autosaves/persists.
  flowsStore.markDirty()

  // Record history for the position change
  if (dragStartSnapshot.value) {
    endBatch(dragStartSnapshot.value, 'Move node')
    dragStartSnapshot.value = null
  }
})

// Handle drop from sidebar
function onDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function onDrop(event: DragEvent) {
  const nodeType = event.dataTransfer?.getData('application/clasp-node')
  if (!nodeType) return
  event.preventDefault()
  addNodeAtClientPoint(nodeType, event.clientX, event.clientY)
}

// Add a node at a client (viewport) point over the canvas: sidebar drags (pointer-driven, see
// AppSidebar) and any HTML5 drop land here.
function addNodeAtClientPoint(nodeType: string, clientX: number, clientY: number) {
  const definition = nodesStore.getDefinition(nodeType)
  if (!definition) return
  const canvas = document.querySelector('.flow-canvas')
  if (!canvas) return
  const { left, top } = canvas.getBoundingClientRect()
  const position = project({ x: clientX - left, y: clientY - top })
  const before = startBatch()
  flowsStore.addNode(nodeType, position, {
    label: definition.name,
    nodeType: nodeType,
    definition: definition,
  })
  endBatch(before, `Add ${definition.name} node`)
}

// Tap-to-add: place a node requested from the palette near the canvas center
// (the palette is outside the Vue Flow tree, so it can't project coordinates).
// Successive adds cascade diagonally so they don't stack on the exact center.
let tapAddCascade = 0
function addNodeAtCenter(nodeType: string) {
  const definition = nodesStore.getDefinition(nodeType)
  if (!definition) return
  const pane = document.querySelector('.vue-flow__pane') as HTMLElement | null
  const rect = pane?.getBoundingClientRect()
  const step = (tapAddCascade % 6) * 36
  tapAddCascade++
  const center = rect
    ? { x: rect.width / 2 + step, y: rect.height / 2 + step }
    : { x: 200 + step, y: 200 + step }
  const position = project(center)
  const before = startBatch()
  flowsStore.addNode(nodeType, position, {
    label: definition.name,
    nodeType,
    definition,
  })
  endBatch(before, `Add ${definition.name} node`)
}

watch(
  () => uiStore.nodeAddNonce,
  () => {
    const drops = [...uiStore.pendingNodeDrops]
    uiStore.pendingNodeDrops = []
    for (const d of drops) addNodeAtClientPoint(d.nodeType, d.clientX, d.clientY)
    if (uiStore.pendingNodeAdds.length === 0) return
    const types = [...uiStore.pendingNodeAdds]
    uiStore.pendingNodeAdds = []
    types.forEach(addNodeAtCenter)
  }
)

// A handful of beginner-friendly starter flows offered on the empty canvas so a
// blank document is an actionable starting point, not a dead end. Curated by id
// (STARTER_FLOW_IDS, pinned by tests/unit/data/starter-flows.test.ts) with a
// fallback to the first few snippets if any id is renamed.
const starterTemplates = computed(() => {
  const picked = STARTER_FLOW_IDS
    .map(id => flowSnippets.find(s => s.id === id))
    .filter((s): s is (typeof flowSnippets)[number] => s !== undefined)
  return picked.length > 0 ? picked : flowSnippets.slice(0, 6)
})

// Colour a preview node by its category, for the starter-template thumbnails.
const templateNodeColor = (nodeType: string) =>
  nodeTypeColor(nodeType, (t) => nodesStore.getDefinition(t)?.category)

// Card hint for what a starter needs (camera / mic / hardware / network / model).
const starterRequirements = (template: (typeof flowSnippets)[number]) =>
  (template.requires ?? []).map(r => REQUIREMENT_LABELS[r]).join(' · ')

// Insert a starter flow onto the empty canvas — reuses the same subgraph-insertion
// path as the node explorer's snippet insertion, centred on the current viewport,
// as ONE undoable step, then frames the result.
function insertStarterTemplate(snippetId: string) {
  const snippet = flowSnippets.find(s => s.id === snippetId)
  if (!snippet || !flowsStore.activeFlow) return
  const nodes = snippetToInsertableNodes(snippet, (type) => nodesStore.getDefinition(type))
  const pane = document.querySelector('.vue-flow__pane') as HTMLElement | null
  const rect = pane?.getBoundingClientRect()
  const center = project(rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 400, y: 300 })
  const before = startBatch()
  const { nodeIds } = flowsStore.insertSubgraph(nodes, snippet.edges, snippetOffsetToCenter(snippet, center))
  if (nodeIds.length === 0) return
  endBatch(before, `Insert ${snippet.name}`)
  uiStore.selectNodes(nodeIds)
  // The nodes are inserted at world coordinates that may fall outside the empty
  // canvas's viewport, so frame them — but only once Vue Flow has ingested the
  // v-model:nodes change and measured them (a bare nextTick fires too early, before
  // the nodes exist in the pane, and fitView would frame nothing).
  const stop = vueFlow.onNodesInitialized(() => {
    fitView({ padding: 0.2 })
    stop.off()
  })
}

// ── Example flows: place under the cursor, or open as a new flow ─────────────
// Insert from the Example Flows list puts the editor in placement mode: an outline of the whole
// example follows the pointer over the canvas and a click drops it there (Esc / right-click /
// a click outside the canvas cancels).
const PLACE_NODE = { width: 200, height: 120 } // matches snippetOffsetToCenter's node size
const placingSnippet = computed(() =>
  uiStore.placingSnippetId ? flowSnippets.find((s) => s.id === uiStore.placingSnippetId) ?? null : null,
)
const placePointer = ref<{ x: number; y: number } | null>(null)

/** The outline, in screen pixels relative to the pointer (scaled by the canvas zoom). */
const placementGhost = computed(() => {
  const snip = placingSnippet.value
  if (!snip || snip.nodes.length === 0) return null
  const zoom = vueFlow.viewport.value.zoom || 1
  const xs = snip.nodes.map((n) => n.position.x)
  const ys = snip.nodes.map((n) => n.position.y)
  const midX = (Math.min(...xs) + Math.max(...xs) + PLACE_NODE.width) / 2
  const midY = (Math.min(...ys) + Math.max(...ys) + PLACE_NODE.height) / 2
  const w = 180 * zoom
  const h = 70 * zoom
  const rects = new Map(snip.nodes.map((n) => [n.id, { x: (n.position.x - midX) * zoom, y: (n.position.y - midY) * zoom, w, h, type: n.type }]))
  const lines = snip.edges.map((e) => {
    const a = rects.get(e.source)
    const b = rects.get(e.target)
    return a && b ? { x1: a.x + a.w, y1: a.y + a.h / 2, x2: b.x, y2: b.y + b.h / 2 } : null
  }).filter((l): l is { x1: number; y1: number; x2: number; y2: number } => !!l)
  return { rects: [...rects.values()], lines, name: snip.name }
})

function overCanvas(clientX: number, clientY: number): boolean {
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  if (!el || el.closest('.snippet-ghost-label')) return false
  if (el.closest('.vue-flow__panel, .vue-flow__controls, .vue-flow__minimap')) return false
  return !!el.closest('.flow-canvas, .canvas-empty-state')
}

function placeSnippetAt(clientX: number, clientY: number) {
  const snippet = placingSnippet.value
  uiStore.cancelSnippetPlacement()
  if (!snippet || !flowsStore.activeFlow) return
  const canvas = document.querySelector('.flow-canvas')
  if (!canvas) return
  const { left, top } = canvas.getBoundingClientRect()
  const center = project({ x: clientX - left, y: clientY - top })
  const nodes = snippetToInsertableNodes(snippet, (type) => nodesStore.getDefinition(type))
  const before = startBatch()
  const { nodeIds } = flowsStore.insertSubgraph(nodes, snippet.edges, snippetOffsetToCenter(snippet, center, PLACE_NODE))
  if (nodeIds.length === 0) return
  endBatch(before, `Insert ${snippet.name}`)
  uiStore.selectNodes(nodeIds)
}

function onPlaceMove(e: PointerEvent) { placePointer.value = { x: e.clientX, y: e.clientY } }
function onPlaceDown(e: PointerEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (e.button === 0 && overCanvas(e.clientX, e.clientY)) placeSnippetAt(e.clientX, e.clientY)
  else uiStore.cancelSnippetPlacement()
}
function onPlaceKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); uiStore.cancelSnippetPlacement() }
}
function onPlaceContext(e: MouseEvent) { e.preventDefault() }
// A click that started the placement (or the pointerup of the placing click) must not reach the canvas.
function swallowClick(e: MouseEvent) { e.preventDefault(); e.stopPropagation() }

function stopPlacementListeners() {
  window.removeEventListener('pointermove', onPlaceMove, true)
  window.removeEventListener('pointerdown', onPlaceDown, true)
  window.removeEventListener('keydown', onPlaceKey, true)
  window.removeEventListener('contextmenu', onPlaceContext, true)
  window.removeEventListener('click', swallowClick, true)
  document.body.classList.remove('latch-placing-snippet')
}

watch(placingSnippet, (snip) => {
  stopPlacementListeners()
  if (!snip) { placePointer.value = null; return }
  window.addEventListener('pointermove', onPlaceMove, true)
  window.addEventListener('pointerdown', onPlaceDown, true)
  window.addEventListener('keydown', onPlaceKey, true)
  window.addEventListener('contextmenu', onPlaceContext, true)
  // Arm the click swallow after the current (button) click has finished dispatching.
  setTimeout(() => { if (placingSnippet.value) window.addEventListener('click', swallowClick, true) }, 0)
  document.body.classList.add('latch-placing-snippet')
})

// Focus a node on request (the loading indicator, the model prompt): select it and pan to it.
watch(
  () => uiStore.focusNodeRequest?.nonce,
  () => {
    const id = uiStore.focusNodeRequest?.id
    const node = id ? flowsStore.activeFlow?.nodes.find((n) => n.id === id) : undefined
    if (!node) return
    uiStore.selectNodes([node.id])
    vueFlow.setCenter(node.position.x + 100, node.position.y + 60, { zoom: Math.max(0.8, vueFlow.viewport.value.zoom), duration: 300 })
  },
)

// Open as a new flow: a fresh tab named after the example, framed once Vue Flow has measured it.
watch(
  () => uiStore.openSnippetRequest?.nonce,
  () => {
    const id = uiStore.openSnippetRequest?.id
    const snippet = id ? flowSnippets.find((s) => s.id === id) : undefined
    if (!snippet) return
    flowsStore.createFlow(snippet.name)
    const nodes = snippetToInsertableNodes(snippet, (type) => nodesStore.getDefinition(type))
    const { nodeIds } = flowsStore.insertSubgraph(nodes, snippet.edges, { x: 0, y: 0 })
    if (nodeIds.length === 0) return
    // Frame from the stored positions: with only-render-visible-elements, nodes outside the view
    // are never measured, so fitView would frame only what is already on screen.
    const xs = nodes.map((n) => n.position.x)
    const ys = nodes.map((n) => n.position.y)
    const rect = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs) + PLACE_NODE.width, height: Math.max(...ys) - Math.min(...ys) + PLACE_NODE.height }
    setTimeout(() => { vueFlow.fitBounds(rect, { padding: 0.12 }) }, 150)
  },
)

// Open the full "Starter Flow" showcase (the demo behind the empty-state CTA) as a NEW tab —
// 3D scene, keyboard→synth→analysis, and MediaPipe hand/face tracking. Non-destructive: imported
// with replace:false so any other open flows are untouched; the file's activeFlowId switches to it.
async function openStarterFlow() {
  try {
    const response = await fetch('./sample-flow.json')
    if (!response.ok) return
    // First-party bundled file — same trust as loadSampleFlow.
    const result = flowsStore.importFlows(await response.text(), { replace: false, codePolicy: 'trust' })
    if (!result.success) return
    const stop = vueFlow.onNodesInitialized(() => {
      fitView({ padding: 0.2 })
      stop.off()
    })
  } catch (error) {
    console.warn('[Editor] Failed to open Starter Flow:', error)
  }
}

// Sync zoom with UI store
watch(
  () => uiStore.zoom,
  (zoom) => {
    const viewport = getViewport()
    setViewport({ ...viewport, zoom })
  }
)

// Fit view on pane ready
onPaneReady(() => {
  if (flowsStore.activeNodes.length > 0) {
    fitView({ padding: 0.2 })
  }
})

// Watch for selection changes from Vue Flow
watch(
  () => vueFlow.getSelectedNodes.value,
  (nodes) => {
    const selectedIds = nodes.map(n => n.id)
    uiStore.selectNodes(selectedIds)

    // Set inspected node to first selected (or clear if none)
    if (selectedIds.length === 1) {
      uiStore.setInspectedNode(selectedIds[0])
    } else if (selectedIds.length === 0) {
      uiStore.setInspectedNode(null)
    }
  }
)

// Handle pane click (clear selection)
onPaneClick(() => {
  uiStore.clearSelection()
  uiStore.setInspectedNode(null)
})

// Handle node click for inspection
onNodeClick(({ node, event }) => {
  // If not holding shift, inspect this node
  if (!event.shiftKey) {
    uiStore.setInspectedNode(node.id)
  }
})

// Handle node changes (including deletion)
function onNodesChange(changes: NodeChange[]) {
  const removals = changes.filter(c => c.type === 'remove')

  if (removals.length > 0) {
    // Record history before deletion
    const before = startBatch()

    for (const change of removals) {
      // Node was deleted, sync with our store
      flowsStore.removeNode(change.id)
      uiStore.removeFromSelection(change.id)
      if (uiStore.inspectedNode === change.id) {
        uiStore.setInspectedNode(null)
      }
    }

    endBatch(before, `Delete ${removals.length} node${removals.length > 1 ? 's' : ''}`)
  }
}

// Keyboard shortcuts
function handleKeyDown(event: KeyboardEvent) {
  // Ignore if typing in an input
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
    return
  }

  // Help: ? (Shift+/) toggles the shortcuts cheat sheet. Don't open it ON TOP of another
  // modal (every modal is aria-modal) — but still allow ? to toggle Help itself closed.
  if (event.key === '?') {
    if (document.querySelector('[aria-modal="true"]') && !uiStore.helpOpen) return
    event.preventDefault()
    uiStore.toggleHelp()
    return
  }

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modifier = isMac ? event.metaKey : event.ctrlKey

  // Undo: Ctrl/Cmd + Z
  if (modifier && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    if (canUndo.value) {
      undo()
    }
    return
  }

  // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
  if ((modifier && event.key === 'z' && event.shiftKey) || (modifier && event.key === 'y')) {
    event.preventDefault()
    if (canRedo.value) {
      redo()
    }
    return
  }

  // Select All: Ctrl/Cmd + A
  if (modifier && event.key === 'a') {
    event.preventDefault()
    const allNodeIds = flowsStore.activeNodes.map(n => n.id)
    uiStore.selectNodes(allNodeIds)
    // Also select in Vue Flow
    flowsStore.activeNodes.forEach(n => {
      (n as { selected?: boolean }).selected = true
    })
    return
  }

  // Copy: Ctrl/Cmd + C
  if (modifier && event.key === 'c') {
    event.preventDefault()
    copySelectedNodes()
    return
  }

  // Cut: Ctrl/Cmd + X
  if (modifier && event.key === 'x') {
    event.preventDefault()
    cutSelectedNodes()
    return
  }

  // Paste: Ctrl/Cmd + V is handled by the `paste` event (onPaste), which can read the system
  // clipboard: flow JSON opens as a new flow, otherwise copied nodes are pasted. Don't block it.
  if (modifier && event.key === 'v') return

  // Duplicate: Ctrl/Cmd + D
  if (modifier && event.key === 'd') {
    event.preventDefault()
    duplicateSelectedNodes()
    return
  }

  // Create Subflow from Selection: Ctrl/Cmd + G
  if (modifier && event.key === 'g') {
    event.preventDefault()
    createSubflowFromSelection()
    return
  }

  // Edit Subflow: Ctrl/Cmd + E (when a subflow instance is selected)
  if (modifier && event.key === 'e') {
    event.preventDefault()
    editSelectedSubflow()
    return
  }

  // Unpack Subflow: Ctrl/Cmd + Shift + G
  if (modifier && event.shiftKey && event.key === 'G') {
    event.preventDefault()
    unpackSelectedSubflow()
    return
  }

  // Tidy graph: Shift + Alt + L (selection if 2+ selected, else the whole flow)
  if (event.shiftKey && event.altKey && !modifier && event.code === 'KeyL') {
    event.preventDefault()
    tidyGraph()
    return
  }

  // Delete selected nodes/edges: Delete or Backspace
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    deleteSelected()
    return
  }
}

/**
 * Delete selected nodes and edges
 */
function deleteSelected() {
  const selectedNodeIds = uiStore.selectedNodes
  const selectedEdges = getSelectedEdges.value
  const selectedEdgeIds = selectedEdges.map(e => e.id)

  // Nothing selected
  if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return

  // Remove nodes from flow
  if (selectedNodeIds.length > 0) {
    flowsStore.removeNodes(selectedNodeIds)

    // Exposed controls + tile positions are NOT pruned here, so Undo brings a deleted node's
    // panel tile back where it was. The Control Panel skips tiles whose node is gone and
    // prunes them (across all flows) when it mounts.

    // Clear selection
    uiStore.clearSelection()

    // Clear inspected node if it was deleted
    if (uiStore.inspectedNode && selectedNodeIds.includes(uiStore.inspectedNode)) {
      uiStore.setInspectedNode(null)
    }
  }

  // Remove selected edges
  if (selectedEdgeIds.length > 0) {
    flowsStore.removeEdges(selectedEdgeIds)
  }
}

/**
 * Copy selected nodes to clipboard
 */
function copySelectedNodes() {
  // serializeSelection captures the selected nodes AND the wires between them
  // (boundary-crossing edges excluded). Tested in the flows store.
  const { nodes, edges } = flowsStore.serializeSelection(uiStore.selectedNodes)
  if (nodes.length === 0) return

  // Normalize positions to the selection's bounding box so paste can re-anchor.
  const minX = Math.min(...nodes.map(n => n.position.x))
  const minY = Math.min(...nodes.map(n => n.position.y))

  clipboard.value = {
    nodes: nodes.map(n => ({
      ...n,
      position: { x: n.position.x - minX, y: n.position.y - minY },
    })),
    edges,
    copyOffset: { x: 20, y: 20 }, // Offset for pasted nodes
  }
}

/**
 * Cut selected nodes (copy + delete)
 */
function cutSelectedNodes() {
  copySelectedNodes()

  if (clipboard.value && clipboard.value.nodes.length > 0) {
    const before = startBatch()

    const nodeIds = uiStore.selectedNodes.slice()
    flowsStore.removeNodes(nodeIds)
    uiStore.clearSelection()

    endBatch(before, `Cut ${nodeIds.length} node${nodeIds.length > 1 ? 's' : ''}`)
  }
}

/**
 * Paste nodes from clipboard
 */
function pasteNodes() {
  if (!clipboard.value || clipboard.value.nodes.length === 0) return

  const before = startBatch()

  // Get paste position (center of viewport or offset from original)
  const viewport = getViewport()
  const baseX = -viewport.x / viewport.zoom + 100
  const baseY = -viewport.y / viewport.zoom + 100

  // Build the clone payload, attaching label/definition like every other
  // add-node path. Unknown node types are skipped; insertSubgraph drops any
  // edge whose endpoint was skipped.
  const nodes = clipboard.value.nodes
    .map(nodeData => {
      const definition = nodesStore.getDefinition(nodeData.nodeType)
      if (!definition) return null
      return {
        id: nodeData.id,
        nodeType: nodeData.nodeType,
        position: nodeData.position,
        data: {
          ...nodeData.data,
          label: definition.name,
          nodeType: nodeData.nodeType,
          definition,
        },
      }
    })
    .filter((n): n is NonNullable<typeof n> => n !== null)

  const { nodeIds: newNodeIds } = flowsStore.insertSubgraph(nodes, clipboard.value.edges, {
    x: baseX + clipboard.value.copyOffset.x,
    y: baseY + clipboard.value.copyOffset.y,
  })

  // Increase offset for next paste
  clipboard.value.copyOffset.x += 20
  clipboard.value.copyOffset.y += 20

  // Select pasted nodes
  uiStore.selectNodes(newNodeIds)
  flowsStore.activeNodes.forEach(n => {
    (n as { selected?: boolean }).selected = newNodeIds.includes(n.id)
  })

  endBatch(before, `Paste ${newNodeIds.length} node${newNodeIds.length > 1 ? 's' : ''}`)
}

/**
 * Duplicate selected nodes in place
 */
function duplicateSelectedNodes() {
  // Capture the selection + the wires between its nodes (tested in the store),
  // then re-attach a fresh label/definition before cloning.
  const { nodes: selNodes, edges } = flowsStore.serializeSelection(uiStore.selectedNodes)
  if (selNodes.length === 0) return

  const before = startBatch()

  const nodes = selNodes
    .map(n => {
      const definition = nodesStore.getDefinition(n.nodeType)
      if (!definition) return null
      return {
        id: n.id,
        nodeType: n.nodeType,
        position: n.position,
        data: {
          ...n.data,
          label: definition.name,
          nodeType: n.nodeType,
          definition,
        },
      }
    })
    .filter((n): n is NonNullable<typeof n> => n !== null)

  const { nodeIds: newNodeIds } = flowsStore.insertSubgraph(nodes, edges, { x: 20, y: 20 })

  // Select duplicated nodes
  uiStore.selectNodes(newNodeIds)
  flowsStore.activeNodes.forEach(n => {
    (n as { selected?: boolean }).selected = newNodeIds.includes(n.id)
  })

  endBatch(before, `Duplicate ${newNodeIds.length} node${newNodeIds.length > 1 ? 's' : ''}`)
}

/**
 * Create a subflow from selected nodes
 */
// Subflow-name modal (replaces the native window.prompt — styled + focus-trapped + validated).
const subflowNameModal = ref<{ visible: boolean; name: string; nodeIds: string[] }>({
  visible: false,
  name: '',
  nodeIds: [],
})
const subflowNameInput = ref<HTMLInputElement | null>(null)
const subflowDialogRef = ref<HTMLElement | null>(null)
const { onKeydown: onSubflowNameKeydown } = useDialogA11y({
  isOpen: () => subflowNameModal.value.visible,
  container: subflowDialogRef,
  onClose: cancelSubflowName,
})

function createSubflowFromSelection() {
  const selectedNodeIds = uiStore.selectedNodes
  if (selectedNodeIds.length < 1) {
    showConnectionError('Select at least one node to create a subflow')
    return
  }
  // Open the name modal; the actual creation happens on confirm (see confirmSubflowName).
  subflowNameModal.value = { visible: true, name: 'My Subflow', nodeIds: [...selectedNodeIds] }
  nextTick(() => {
    subflowNameInput.value?.focus()
    subflowNameInput.value?.select()
  })
}

function cancelSubflowName() {
  subflowNameModal.value.visible = false
}

function confirmSubflowName() {
  const name = subflowNameModal.value.name.trim()
  const nodeIds = subflowNameModal.value.nodeIds
  if (!name || nodeIds.length < 1) return // empty name: keep the modal open for correction

  subflowNameModal.value.visible = false

  const before = startBatch()
  const result = flowsStore.createSubflowFromSelection(nodeIds, name)

  if (result) {
    uiStore.clearSelection()
    uiStore.selectNodes([result.instanceNodeId])
    showConnectionError(`Created subflow "${name}"`) // Reusing the toast for feedback
    endBatch(before, `Create subflow "${name}"`)
  } else {
    showConnectionError('Failed to create subflow')
  }
}

/**
 * Edit the selected subflow (open it for editing)
 */
function editSelectedSubflow() {
  if (uiStore.selectedNodes.length !== 1) {
    showConnectionError('Select a single subflow instance to edit')
    return
  }

  const nodeId = uiStore.selectedNodes[0]
  const node = flowsStore.activeNodes.find(n => n.id === nodeId)

  if (!node || node.data?.nodeType !== 'subflow') {
    showConnectionError('Selected node is not a subflow')
    return
  }

  const subflowId = node.data.subflowId as string
  const subflow = flowsStore.getFlowById(subflowId)

  if (!subflow) {
    showConnectionError('Subflow not found')
    return
  }

  // Switch to the subflow for editing
  flowsStore.setActiveFlow(subflowId)
}

/**
 * Unpack a subflow instance back to its constituent nodes
 */
function unpackSelectedSubflow() {
  if (uiStore.selectedNodes.length !== 1) {
    showConnectionError('Select a single subflow instance to unpack')
    return
  }

  const nodeId = uiStore.selectedNodes[0]
  const node = flowsStore.activeNodes.find(n => n.id === nodeId)

  if (!node || node.data?.nodeType !== 'subflow') {
    showConnectionError('Selected node is not a subflow')
    return
  }

  const before = startBatch()

  const newNodeIds = flowsStore.unpackSubflowInstance(nodeId)

  if (newNodeIds && newNodeIds.length > 0) {
    uiStore.clearSelection()
    uiStore.selectNodes(newNodeIds)
    flowsStore.activeNodes.forEach(n => {
      (n as { selected?: boolean }).selected = newNodeIds.includes(n.id)
    })

    endBatch(before, `Unpack subflow`)
  } else {
    showConnectionError('Failed to unpack subflow')
  }
}

/** Paste: LATCH flow JSON on the clipboard opens as a new flow; anything else pastes copied nodes. */
async function onPaste(e: ClipboardEvent) {
  const t = e.target as HTMLElement | null
  if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) return
  if (t?.closest('.modal-overlay, .monaco-editor')) return
  const text = e.clipboardData?.getData('text/plain') ?? ''
  if (text && looksLikeFlowText(text)) {
    e.preventDefault()
    await flowLibrary.importText(text)
    return
  }
  e.preventDefault()
  pasteNodes()
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('paste', onPaste)

  // AI agent tools (WebMCP): registered only while the person has agent access on.
  uninstallAgentTools = installAgentTools({
    execution: executionControls,
    viewCenter: () => {
      const pane = document.querySelector('.vue-flow__pane') as HTMLElement | null
      const rect = pane?.getBoundingClientRect()
      return project(rect ? { x: rect.width / 2, y: rect.height / 2 } : { x: 400, y: 300 })
    },
    frame: (ids) => {
      const nodes = flowsStore.activeFlow?.nodes.filter((n) => !ids?.length || ids.includes(n.id)) ?? []
      if (nodes.length === 0) return
      const xs = nodes.map((n) => n.position.x)
      const ys = nodes.map((n) => n.position.y)
      const rect = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs) + PLACE_NODE.width, height: Math.max(...ys) - Math.min(...ys) + PLACE_NODE.height }
      setTimeout(() => { vueFlow.fitBounds(rect, { padding: 0.15, duration: 200 }) }, 80)
    },
  })

  // Initialize custom node loader (loads custom nodes from custom-nodes folder)
  try {
    const customNodeLoader = getCustomNodeLoader()
    await customNodeLoader.initialize()

    // Log any load errors
    const errors = customNodeLoader.getLoadErrors()
    if (errors.length > 0) {
      console.warn('Custom node load errors:', errors)
    }
  } catch (error) {
    console.error('Failed to initialize custom node loader:', error)
  }
})

onUnmounted(() => {
  uninstallAgentTools?.()
  uninstallAgentTools = null
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('paste', onPaste)
  stopPlacementListeners()
  uiStore.cancelSnippetPlacement()
  // Clear any pending connection error timeout
  if (connectionErrorTimeout) {
    clearTimeout(connectionErrorTimeout)
    connectionErrorTimeout = null
  }
})
</script>

<template>
  <div
    id="flow-canvas-panel"
    class="editor-view"
    role="application"
    tabindex="0"
    aria-roledescription="node canvas"
    :aria-label="`Node canvas, ${flowsStore.activeNodes.length} nodes`"
    :aria-valuetext="canvasAnnounce"
    @focus="onCanvasFocus"
    @blur="onCanvasBlur"
    @keydown="onCanvasKeydown"
  >
    <!-- Polite live region: announces cursor movement, selection, etc. to AT. -->
    <span
      class="sr-only"
      aria-live="polite"
    >{{ canvasAnnounce }}</span>
    <VueFlow
      v-if="flowsStore.activeFlow"
      v-model:nodes="flowsStore.activeFlow.nodes"
      v-model:edges="flowsStore.activeFlow.edges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :default-edge-options="{
        type: 'animated',
      }"
      :is-valid-connection="isValidConnection"
      :connection-mode="ConnectionMode.Loose"
      :snap-to-grid="uiStore.snapToGrid"
      :snap-grid="[uiStore.gridSize, uiStore.gridSize]"
      :connection-line-style="{ stroke: 'var(--color-primary-400)', strokeWidth: 2 }"
      :selection-key-code="'Shift'"
      :multi-selection-key-code="['Meta', 'Control']"
      :delete-key-code="'Delete'"
      :edges-updatable="true"
      :selectable-edges="true"
      :only-render-visible-elements="true"
      :min-zoom="0.1"
      :max-zoom="4"
      fit-view-on-init
      class="flow-canvas"
      @dragover="onDragOver"
      @drop="onDrop"
      @nodes-change="onNodesChange"
    >
      <Background
        v-if="uiStore.showGrid"
        :gap="uiStore.gridSize"
        :size="1"
        pattern-color="var(--color-neutral-300)"
      />

      <Controls
        position="bottom-right"
        :show-zoom="true"
        :show-fit-view="true"
        :show-interactive="false"
      >
        <!-- On-wire debugging: toggle the live per-port value overlay. -->
        <ControlButton
          class="port-values-toggle"
          :class="{ 'is-active': uiStore.showPortValues }"
          title="Show live port values"
          aria-label="Show live port values on output ports"
          :aria-pressed="uiStore.showPortValues"
          @click="uiStore.togglePortValues()"
        >
          <Eye :size="14" />
        </ControlButton>
        <!-- Tidy graph: layered auto-arrange (selection if 2+ selected, else all). -->
        <ControlButton
          class="tidy-graph-btn"
          title="Tidy graph (Shift+Alt+L)"
          aria-label="Tidy graph: auto-arrange the selection, or the whole flow"
          @click="tidyGraph()"
        >
          <Network :size="14" />
        </ControlButton>
      </Controls>

      <MiniMap
        v-if="uiStore.showMinimap && flowsStore.activeNodes.length > 0"
        position="bottom-left"
        :pannable="true"
        :zoomable="true"
        :node-color="getNodeMinimapColor"
      />

      <Panel
        position="top-right"
        class="canvas-panel"
      >
        <div class="panel-info">
          <span>{{ flowsStore.activeNodes.length }} nodes</span>
          <span>{{ flowsStore.activeEdges.length }} connections</span>
        </div>
      </Panel>
    </VueFlow>

    <!-- Example flow being placed: follows the pointer until a click drops it -->
    <Teleport to="body">
      <div
        v-if="placementGhost && placePointer"
        class="snippet-ghost"
        :style="{ left: `${placePointer.x}px`, top: `${placePointer.y}px` }"
        aria-hidden="true"
      >
        <svg
          class="snippet-ghost-wires"
          overflow="visible"
        >
          <line
            v-for="(l, i) in placementGhost.lines"
            :key="i"
            :x1="l.x1"
            :y1="l.y1"
            :x2="l.x2"
            :y2="l.y2"
          />
        </svg>
        <div
          v-for="(r, i) in placementGhost.rects"
          :key="i"
          class="snippet-ghost-node"
          :style="{ left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, borderColor: templateNodeColor(r.type) }"
        />
      </div>
    </Teleport>
    <div
      v-if="placingSnippet"
      class="snippet-ghost-label"
      role="status"
    >
      Click to place <strong>{{ placingSnippet.name }}</strong> · Esc to cancel
    </div>

    <!-- Empty state -->
    <div
      v-if="flowsStore.activeNodes.length === 0"
      class="empty-state canvas-empty-state"
      @dragover="onDragOver"
      @drop="onDrop"
    >
      <h2 class="empty-title">
        Start from a template
      </h2>
      <p class="empty-hint">
        Pick a starter flow, or drag nodes from the sidebar to build your own.
      </p>
      <div class="starter-templates">
        <button
          v-for="template in starterTemplates"
          :key="template.id"
          class="starter-template"
          @click="insertStarterTemplate(template.id)"
        >
          <FlowPreview
            class="starter-thumb"
            :nodes="template.nodes"
            :edges="template.edges"
            :get-color="templateNodeColor"
          />
          <span class="starter-name">{{ template.name }}</span>
          <span
            class="starter-desc"
            :title="template.description"
          >{{ template.description }}</span>
          <span
            v-if="template.requires?.length"
            class="starter-needs"
          >Needs: {{ starterRequirements(template) }}</span>
        </button>
      </div>
      <div class="empty-actions">
        <button
          class="browse-examples"
          @click="uiStore.openNodeExplorer('snippets')"
        >
          Browse all {{ flowSnippets.length }} example flows →
        </button>
        <button
          class="open-starter-flow"
          @click="openStarterFlow()"
        >
          ✨ Open the full demo — live 3D, a playable synth, and hand tracking
        </button>
        <button
          class="browse-library"
          @click="uiStore.openNodeExplorer('nodes')"
        >
          Browse the node library
        </button>
      </div>
    </div>

    <!-- Connection error toast -->
    <Transition name="toast">
      <div
        v-if="connectionError"
        class="connection-error"
        role="alert"
      >
        {{ connectionError }}
      </div>
    </Transition>

    <!-- Name-a-new-subflow modal (replaces window.prompt) -->
    <Teleport to="body">
      <div
        v-if="subflowNameModal.visible"
        class="modal-overlay"
        @click.self="cancelSubflowName"
        @keydown="onSubflowNameKeydown"
      >
        <div
          ref="subflowDialogRef"
          class="subflow-name-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="subflow-name-title"
        >
          <h3 id="subflow-name-title">
            Name the subflow
          </h3>
          <input
            ref="subflowNameInput"
            v-model="subflowNameModal.name"
            type="text"
            class="subflow-name-input"
            placeholder="Subflow name"
            aria-label="Subflow name"
            @keydown.enter.prevent="confirmSubflowName"
          >
          <div class="modal-actions">
            <button
              class="btn btn-secondary"
              @click="cancelSubflowName"
            >
              Cancel
            </button>
            <button
              class="btn btn-primary"
              :disabled="!subflowNameModal.name.trim()"
              @click="confirmSubflowName"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Drag-a-wire-into-empty-space → compatible-node suggestions -->
    <Teleport to="body">
      <WireSuggestionPopover
        v-if="wireSuggest"
        :items="wireSuggest.items"
        :x="wireSuggest.x"
        :y="wireSuggest.y"
        :origin-type-label="wireSuggest.originTypeLabel"
        :origin-glyph="wireSuggest.originGlyph"
        :origin-color="wireSuggest.originColor"
        @pick="pickWireSuggestion"
        @close="closeWireSuggestions"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.snippet-ghost {
  position: fixed;
  z-index: 3000;
  pointer-events: none;
}

.snippet-ghost-node {
  position: absolute;
  border: 2px dashed var(--color-neutral-500);
  background: color-mix(in srgb, var(--color-neutral-0) 55%, transparent);
  border-radius: var(--radius-xs);
}

.snippet-ghost-wires {
  position: absolute;
  left: 0;
  top: 0;
  width: 1px;
  height: 1px;
  overflow: visible;
}

.snippet-ghost-wires line {
  stroke: var(--color-neutral-500);
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
}

.snippet-ghost-label {
  position: absolute;
  top: var(--space-3);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-800);
  color: var(--color-neutral-0);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  pointer-events: none;
}

.editor-view {
  width: 100%;
  height: 100%;
  position: relative;
}

/* Keyboard focus ring on the canvas host. Inset because the host is full-bleed.
   :focus-visible only (mouse clicks into the canvas stay ring-free). */
.editor-view:focus {
  outline: none;
}
.editor-view:focus-visible {
  outline: 2px solid var(--color-primary-400);
  outline-offset: -2px;
}

/* Visually-hidden live region (screen-reader only). */
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

/* Keyboard cursor ring — the roved node (distinct from the solid selected ring). */
.flow-canvas :deep(.vue-flow__node.kbd-cursor) {
  outline: 2px dashed var(--color-primary-400);
  outline-offset: 4px;
  border-radius: 2px;
}

.flow-canvas {
  width: 100%;
  height: 100%;
  background: var(--canvas-background);
}

/* Touch: bigger connection handles so they can be tapped/dragged with a finger.
   Only applies on coarse pointers, so desktop visuals are unchanged. */
@media (pointer: coarse) {
  .flow-canvas :deep(.vue-flow__handle) {
    width: 18px;
    height: 18px;
  }
}

/* Override Vue Flow styles */
.flow-canvas :deep(.vue-flow__background) {
  background: var(--canvas-background);
}

.flow-canvas :deep(.vue-flow__controls) {
  box-shadow: var(--shadow-subtle);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-none);
}

.flow-canvas :deep(.vue-flow__controls-button) {
  background: var(--color-neutral-0);
  border: none;
  border-bottom: 1px solid var(--color-neutral-200);
}

.flow-canvas :deep(.vue-flow__controls-button:hover) {
  background: var(--color-neutral-100);
}

/* On-wire debugging toggle: highlight when active. */
.flow-canvas :deep(.vue-flow__controls-button.port-values-toggle.is-active) {
  background: var(--color-primary-500);
  color: var(--color-neutral-0);
}

.flow-canvas :deep(.vue-flow__controls-button.port-values-toggle.is-active svg) {
  stroke: var(--color-neutral-0);
}

.flow-canvas :deep(.vue-flow__minimap) {
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-none);
  box-shadow: var(--shadow-subtle);
}

.canvas-panel {
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
}

.panel-info {
  display: flex;
  gap: var(--space-4);
}

.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  width: min(720px, 90vw);
  text-align: center;
  color: var(--color-neutral-400);
  font-size: var(--font-size-base);
  /* The overlay itself stays click-through so empty canvas around the widget still
     pans; only the interactive controls below opt back into pointer events. */
  pointer-events: none;
}

.empty-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-600);
}

.empty-hint {
  margin: 0;
  font-size: var(--font-size-sm);
  /* neutral-600 (not the inherited neutral-400) so the first line a new user reads clears
     the WCAG AA 4.5:1 contrast floor on the light canvas. */
  color: var(--color-neutral-600);
}

.starter-templates {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
  width: 100%;
}

.starter-thumb {
  width: 100%;
  height: 48px;
  margin-bottom: var(--space-2);
  background: var(--color-neutral-50);
  border-radius: var(--radius-xs);
}

.starter-template {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-3);
  text-align: left;
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  cursor: pointer;
  pointer-events: auto;
  transition: border-color 0.1s, box-shadow 0.1s;
}

.starter-template:hover {
  border-color: var(--color-primary-400);
  box-shadow: 2px 2px 0 0 var(--color-neutral-200);
}

.starter-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-800);
}

.starter-desc {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  line-height: 1.3;
  /* Long descriptions are cut (full text on hover) so the six cards stay one height. */
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Permission / hardware hint, so a camera or mic prompt is never a surprise. */
.starter-needs {
  margin-top: var(--space-1);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-600);
}

@media (max-width: 640px) {
  .starter-templates {
    grid-template-columns: repeat(2, 1fr);
  }
}

.browse-library {
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-primary-600);
  background: none;
  border: none;
  cursor: pointer;
  pointer-events: auto;
  text-decoration: underline;
}

.browse-library:hover {
  color: var(--color-primary-700);
}

.empty-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.browse-examples {
  padding: 8px 16px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: #fff;
  background: var(--color-primary-600);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  pointer-events: auto;
}

.browse-examples:hover {
  background: var(--color-primary-700);
}

.open-starter-flow {
  padding: 8px 16px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-primary-700);
  background: transparent;
  border: 1px solid var(--color-primary-600);
  border-radius: 6px;
  cursor: pointer;
  pointer-events: auto;
}

.open-starter-flow:hover {
  background: var(--color-primary-50);
}

.connection-error {
  position: absolute;
  bottom: var(--space-6);
  left: 50%;
  transform: translateX(-50%);
  background: var(--color-error);
  color: var(--color-neutral-0);
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-offset);
  z-index: 100;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

/* Subflow-name modal (mirrors the FlowTabs rename modal for a consistent styled prompt). */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}
.subflow-name-modal {
  width: 320px;
  padding: var(--space-4);
  background: var(--color-neutral-800);
  border: 1px solid var(--color-neutral-600);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  font-family: var(--font-mono);
}
.subflow-name-modal h3 {
  margin: 0 0 var(--space-3) 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-100);
}
.subflow-name-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-100);
  background: var(--color-neutral-900);
  border: 1px solid var(--color-neutral-600);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-4);
}
.subflow-name-input:focus {
  outline: none;
  border-color: var(--color-primary-500);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
.modal-actions .btn {
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-sm);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
}
.modal-actions .btn-secondary {
  background: var(--color-neutral-700);
  border: 1px solid var(--color-neutral-600);
  color: var(--color-neutral-200);
}
.modal-actions .btn-secondary:hover {
  background: var(--color-neutral-600);
}
.modal-actions .btn-primary {
  background: var(--color-primary-500);
  border: 1px solid var(--color-primary-500);
  color: white;
}
.modal-actions .btn-primary:hover:not(:disabled) {
  background: var(--color-primary-600);
}
.modal-actions .btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

<style>
/* Example flow placement: crosshair everywhere while the outline follows the pointer. */
body.latch-placing-snippet,
body.latch-placing-snippet * {
  cursor: crosshair !important;
}
</style>
