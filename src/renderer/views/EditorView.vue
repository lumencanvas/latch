<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, markRaw } from 'vue'
import { VueFlow, useVueFlow, Panel, ConnectionMode } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import type { Connection, NodeChange, Node } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

// Named so <KeepAlive :include="['EditorView']"> in App.vue caches this view —
// keeps the graph (and a running Emulator node) alive when switching to Controls.
defineOptions({ name: 'EditorView' })

import { useFlowsStore } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'
import { useNodesStore, categoryMeta, type NodeCategory } from '@/stores/nodes'
import AnimatedEdge from '@/components/edges/AnimatedEdge.vue'
import { validateConnection } from '@/utils/connections'
import { useFlowHistory } from '@/composables/useFlowHistory'
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

// Canvas keyboard navigation (Theme F / WCAG 2.1.1): the .editor-view host is a
// focusable role="application" surface with an arrow-key "cursor" that roves
// nodes (distinct from selection). `canvasAnnounce` feeds the live region.
const canvasFocused = ref(false)
const canvasAnnounce = ref('')

const flowsStore = useFlowsStore()
const uiStore = useUIStore()
const nodesStore = useNodesStore()

const vueFlow = useVueFlow()
const {
  onConnect,
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
  getSelectedEdges,
} = vueFlow

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
  // Try to load sample flow for first-time users
  if (!flowsStore.activeFlow) {
    const loaded = await flowsStore.loadSampleFlowIfFirstVisit()
    if (!loaded && !flowsStore.activeFlow) {
      // Not first visit or failed to load, create empty flow
      flowsStore.createFlow('My First Flow')
    }
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

  const definition = nodesStore.getDefinition(nodeType)
  if (!definition) return 'var(--color-neutral-400)'

  const category = definition.category as NodeCategory
  return categoryMeta[category]?.color ?? 'var(--color-neutral-400)'
}

// ============================================================================
// Event Handlers
// ============================================================================

// Handle connections
onConnect((connection: Connection) => {
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

  const definition = nodesStore.getDefinition(nodeType)
  if (!definition) return

  // Get drop position in flow coordinates
  const { left, top } = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const position = project({
    x: event.clientX - left,
    y: event.clientY - top,
  })

  // Record history before adding node
  const before = startBatch()

  // Add node
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
    if (uiStore.pendingNodeAdds.length === 0) return
    const types = [...uiStore.pendingNodeAdds]
    uiStore.pendingNodeAdds = []
    types.forEach(addNodeAtCenter)
  }
)

// ── Canvas keyboard navigation (Theme F, WCAG 2.1.1) ─────────────────────────
// Increment 1: focus + cursor roving + select + announcements. Mirrors the
// role="application" idiom used by the 4 canvas control editors. Keyboard MOVE
// and WIRE are deferred to later increments.

/** Nodes in a stable reading order: top-to-bottom, then left-to-right. */
function sortedNodes(): Node[] {
  return [...flowsStore.activeNodes].sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x
  )
}

function nodeName(n: Node | undefined): string {
  if (!n) return 'node'
  return (n.data?.label as string) || (n.data?.nodeType as string) || 'node'
}

/** Keep the cursor node on-screen — off-screen nodes aren't rendered
 *  (:only-render-visible-elements), so the ring/announce need it centred. */
function panCursorIntoView(n: Node) {
  try {
    setCenter(n.position.x, n.position.y, { zoom: getViewport().zoom, duration: 150 })
  } catch {
    // pane not ready yet — ignore
  }
}

function moveCursor(delta: 1 | -1) {
  const list = sortedNodes()
  if (list.length === 0) {
    canvasAnnounce.value = 'Canvas is empty.'
    return
  }
  const curIndex = list.findIndex(n => n.id === uiStore.canvasCursor)
  const nextIndex = (Math.max(0, curIndex) + delta + list.length) % list.length
  const next = list[nextIndex]
  uiStore.setCanvasCursor(next.id)
  panCursorIntoView(next)
  canvasAnnounce.value = `${nodeName(next)}, node ${nextIndex + 1} of ${list.length}. Enter to select.`
}

/** Select the cursor node. Mirrors the Cmd+A path: writes `node.selected` (the
 *  getSelectedNodes watcher fans it out) plus the ui store, belt-and-suspenders. */
function selectCursorNode(additive: boolean) {
  const id = uiStore.canvasCursor
  if (!id) return
  // `selected` is a runtime flag Vue Flow adds, not on the input Node type — cast
  // it the same way the Cmd+A select-all path does.
  const nodes = flowsStore.activeNodes as Array<Node & { selected?: boolean }>
  if (!additive) nodes.forEach(n => { n.selected = false })
  const target = nodes.find(n => n.id === id)
  if (!target) return
  target.selected = true
  const selectedIds = nodes.filter(n => n.selected).map(n => n.id)
  uiStore.selectNodes(selectedIds)
  uiStore.setInspectedNode(selectedIds.length === 1 ? selectedIds[0] : null)
  canvasAnnounce.value =
    selectedIds.length > 1
      ? `${nodeName(target)} added to selection, ${selectedIds.length} selected.`
      : `Selected ${nodeName(target)}.`
}

function clearCanvasSelection() {
  const nodes = flowsStore.activeNodes as Array<Node & { selected?: boolean }>
  nodes.forEach(n => { n.selected = false })
  uiStore.clearSelection()
  uiStore.setInspectedNode(null)
  canvasAnnounce.value = 'Selection cleared.'
}

function onCanvasKeydown(event: KeyboardEvent) {
  // Let node rename fields / control inputs keep their own keys.
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  // Cmd/Ctrl chords belong to the window handler (undo/copy/select-all/…).
  if (event.metaKey || event.ctrlKey) return
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      moveCursor(1)
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      moveCursor(-1)
      break
    case 'Enter':
    case ' ':
      selectCursorNode(event.shiftKey)
      break
    case 'Escape':
      if (uiStore.selectedNodes.length === 0) return // nothing to clear — let it bubble
      clearCanvasSelection()
      break
    default:
      return // bubble Tab, Delete/Backspace (window handler owns it), everything else
  }
  event.preventDefault()
  event.stopPropagation()
}

function onCanvasFocus() {
  canvasFocused.value = true
  const list = sortedNodes()
  if (!uiStore.canvasCursor && list.length) {
    uiStore.setCanvasCursor(uiStore.selectedNodes[0] ?? list[0].id)
  }
  canvasAnnounce.value = list.length
    ? `Node canvas, ${list.length} node${list.length > 1 ? 's' : ''}. Arrow keys to browse, Enter to select.`
    : 'Node canvas, empty. Add a node from the palette.'
}

// Show the cursor ring (a class on the node's Vue Flow wrapper) only while the
// canvas is focused — matching the editors' `focused && selected` gate. No other
// code manages `node.class`, so toggling it here is safe.
watch(
  () => [uiStore.canvasCursor, canvasFocused.value] as const,
  (_cur, prev) => {
    const prevId = prev?.[0]
    const nodes = flowsStore.activeNodes
    if (prevId) {
      const p = nodes.find(n => n.id === prevId)
      if (p && p.class === 'kbd-cursor') p.class = undefined
    }
    const id = uiStore.canvasCursor
    if (id && canvasFocused.value) {
      const c = nodes.find(n => n.id === id)
      if (c) c.class = 'kbd-cursor'
    }
  }
)

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

  // Paste: Ctrl/Cmd + V
  if (modifier && event.key === 'v') {
    event.preventDefault()
    pasteNodes()
    return
  }

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

    // Clean up exposed controls for deleted nodes
    const remainingNodeIds = flowsStore.activeNodes.map(n => n.id)
    uiStore.cleanupExposedControls(remainingNodeIds)

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
function createSubflowFromSelection() {
  const selectedNodeIds = uiStore.selectedNodes
  if (selectedNodeIds.length < 1) {
    showConnectionError('Select at least one node to create a subflow')
    return
  }

  // Prompt for subflow name
  const name = window.prompt('Enter name for the new subflow:', 'My Subflow')
  if (!name) return // User cancelled

  const before = startBatch()

  const result = flowsStore.createSubflowFromSelection(selectedNodeIds, name)

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

onMounted(async () => {
  window.addEventListener('keydown', handleKeyDown)

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
  window.removeEventListener('keydown', handleKeyDown)
  // Clear any pending connection error timeout
  if (connectionErrorTimeout) {
    clearTimeout(connectionErrorTimeout)
    connectionErrorTimeout = null
  }
})
</script>

<template>
  <div
    class="editor-view"
    role="application"
    tabindex="0"
    aria-roledescription="node canvas"
    :aria-label="`Node canvas, ${flowsStore.activeNodes.length} nodes`"
    :aria-valuetext="canvasAnnounce"
    @focus="onCanvasFocus"
    @blur="canvasFocused = false"
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
      :selection-key-code="null"
      :multi-selection-key-code="null"
      :delete-key-code="'Delete'"
      :edges-updatable="true"
      :selectable-edges="true"
      :only-render-visible-elements="true"
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
      />

      <MiniMap
        v-if="uiStore.showMinimap"
        position="bottom-right"
        :style="{ marginBottom: '50px' }"
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

    <!-- Empty state -->
    <div
      v-if="flowsStore.activeNodes.length === 0"
      class="empty-state"
    >
      <p>Drag nodes from the sidebar to get started</p>
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
  </div>
</template>

<style scoped>
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
  text-align: center;
  color: var(--color-neutral-400);
  font-size: var(--font-size-base);
  pointer-events: none;
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
</style>
