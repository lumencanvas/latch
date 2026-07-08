import { ref, watch, onScopeDispose } from 'vue'
import type { Node, Connection } from '@vue-flow/core'
import { useFlowsStore } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'
import { useNodesStore } from '@/stores/nodes'
import { validateConnection } from '@/utils/connections'
import type { useFlowHistory } from '@/composables/useFlowHistory'
import { useApplicationKeyboard } from './useApplicationKeyboard'

type FlowHistory = ReturnType<typeof useFlowHistory>

/**
 * The node canvas's keyboard interaction model (WCAG 2.1.1) — extracted out of
 * `EditorView.vue`, which had grown a ~485-line inlined state machine. Owns three
 * modes on the `role="application"` canvas host:
 *
 *  - NAVIGATE: an arrow-key "cursor" roves nodes (distinct from selection);
 *    Enter/Space selects (Shift = additive), Escape clears.
 *  - MOVE: with a selection, arrows nudge by grid step (Shift = coarse); a burst of
 *    nudges collapses into one `Move node` undo entry.
 *  - WIRE: `w` starts a keyboard wire; a source-output → target-node → target-port
 *    stage machine commits a connection through the same path the pointer uses.
 *
 * Every write reuses an existing store path so keyboard and mouse can't diverge.
 * Vue-Flow viewport helpers, the history batch, and the connection-error toast are
 * injected so the machine is store-mockable and unit-testable in isolation.
 */
export interface CanvasKeyboardDeps {
  setCenter: (x: number, y: number, opts: { zoom: number; duration: number }) => void
  getViewport: () => { zoom: number }
  flowToScreenCoordinate: (p: { x: number; y: number }) => { x: number; y: number }
  addEdges: (edges: Connection[]) => void
  startBatch: FlowHistory['startBatch']
  endBatch: FlowHistory['endBatch']
  showConnectionError: (message: string) => void
  /** Open the compatible-node picker for the wire's source port (keyboard `n`),
   *  so keyboard users get the same "drag into empty space" suggestions the mouse
   *  does. Optional — when absent, `n` during a wire is a no-op. */
  suggestNodeFromWire?: (origin: { nodeId: string; handleId: string; handleType: 'source' }) => void
}

export function useCanvasKeyboard(deps: CanvasKeyboardDeps) {
  const { setCenter, getViewport, flowToScreenCoordinate, addEdges, startBatch, endBatch, showConnectionError, suggestNodeFromWire } = deps

  const flowsStore = useFlowsStore()
  const uiStore = useUIStore()
  const nodesStore = useNodesStore()

  // The .editor-view host is a focusable role="application" surface with an arrow-key
  // "cursor" that roves nodes (distinct from selection). `canvasFocused` gates the
  // cursor ring; `canvasAnnounce` is the canvas's imperative live-region string (the
  // announce mechanism is surface-specific, so it lives here, not in the primitive).
  const { focused: canvasFocused, onFocus, onBlur } = useApplicationKeyboard()
  const canvasAnnounce = ref('')

  // Keyboard MOVE: a burst of arrow-nudges collapses into one undo entry (opened on
  // the first nudge, closed after an idle gap / on any other key / on blur / on
  // unmount), mirroring the pointer drag-stop batch.
  const moveBatchSnapshot = ref<ReturnType<FlowHistory['startBatch']>>(null)
  let moveBatchTimer: ReturnType<typeof setTimeout> | null = null
  const NUDGE_COARSE_FACTOR = 5

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
    // Bare modifier keydowns (Shift/Alt/Meta/Control) are the leading half of a
    // chord in progress — ignore them without flushing, so holding Shift to
    // coarse-move doesn't split the move-history batch.
    if (event.key === 'Shift' || event.key === 'Alt' || event.key === 'Meta' || event.key === 'Control') return
    // Cmd/Ctrl chords belong to the window handler (undo/copy/select-all/…).
    if (event.metaKey || event.ctrlKey) {
      flushMoveBatch() // an undo/redo etc. mid-move should close the burst first
      return
    }

    // While a wire is in progress, the wire state machine owns the keys.
    if (wire.value) {
      onWireKeydown(event)
      return
    }

    const isArrow =
      event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown'
    // With a selection, arrows MOVE the selected node(s); otherwise they rove the
    // navigation cursor (Escape deselects to return to browsing).
    const isMove = isArrow && uiStore.selectedNodes.length > 0
    if (!isMove) flushMoveBatch() // any non-move key ends the current move burst
    const step = event.shiftKey ? uiStore.gridSize * NUDGE_COARSE_FACTOR : uiStore.gridSize

    switch (event.key) {
      case 'ArrowRight':
        if (isMove) nudgeSelected(step, 0)
        else moveCursor(1)
        break
      case 'ArrowLeft':
        if (isMove) nudgeSelected(-step, 0)
        else moveCursor(-1)
        break
      case 'ArrowDown':
        if (isMove) nudgeSelected(0, step)
        else moveCursor(1)
        break
      case 'ArrowUp':
        if (isMove) nudgeSelected(0, -step)
        else moveCursor(-1)
        break
      case 'Enter':
      case ' ':
        selectCursorNode(event.shiftKey)
        break
      case 'Escape':
        if (uiStore.selectedNodes.length === 0) return // nothing to clear — let it bubble
        clearCanvasSelection()
        break
      case 'w':
      case 'W':
        startWire() // begin keyboard wiring from the cursor node
        break
      default:
        return // bubble Tab, Delete/Backspace (window handler owns it), everything else
    }
    event.preventDefault()
    event.stopPropagation()
  }

  function onCanvasFocus() {
    onFocus()
    const list = sortedNodes()
    if (!uiStore.canvasCursor && list.length) {
      uiStore.setCanvasCursor(uiStore.selectedNodes[0] ?? list[0].id)
    }
    canvasAnnounce.value = list.length
      ? `Node canvas, ${list.length} node${list.length > 1 ? 's' : ''}. Arrow keys to browse, Enter to select.`
      : 'Node canvas, empty. Add a node from the palette.'
  }

  function onCanvasBlur() {
    flushMoveBatch()
    if (wire.value) cancelWire(false)
    onBlur()
  }

  /** Pan only when a node has drifted near/past the viewport edge — unlike
   *  navigation, MOVE must NOT re-centre every keystroke (that would make the node
   *  look stationary while the canvas slides under it). */
  function ensureNodeVisible(n: Node) {
    try {
      const pane = document.querySelector('.vue-flow__pane') as HTMLElement | null
      const rect = pane?.getBoundingClientRect()
      if (!rect) return
      const screen = flowToScreenCoordinate({ x: n.position.x, y: n.position.y })
      const margin = 80
      const outside =
        screen.x < rect.left + margin ||
        screen.x > rect.right - margin ||
        screen.y < rect.top + margin ||
        screen.y > rect.bottom - margin
      if (outside) setCenter(n.position.x, n.position.y, { zoom: getViewport().zoom, duration: 150 })
    } catch {
      // pane / transform not ready — skip panning
    }
  }

  /** Nudge every selected node by (dx, dy), persisting + batching like a drag. */
  function nudgeSelected(dx: number, dy: number) {
    const ids = uiStore.selectedNodes
    if (ids.length === 0) return
    if (!moveBatchSnapshot.value) moveBatchSnapshot.value = startBatch()
    const nodes = flowsStore.activeNodes
    let primary: Node | undefined
    for (const id of ids) {
      const n = nodes.find(nn => nn.id === id)
      if (!n) continue
      flowsStore.updateNodePosition(id, { x: n.position.x + dx, y: n.position.y + dy })
      if (!primary) primary = n
    }
    // updateNodePosition intentionally skips dirty (it fires per-frame during drag);
    // mark once here so the new layout autosaves — same as drag-stop.
    flowsStore.markDirty()
    if (primary) ensureNodeVisible(primary)
    if (ids.length > 1) {
      canvasAnnounce.value = `Moved ${ids.length} nodes.`
    } else if (primary) {
      canvasAnnounce.value = `${nodeName(primary)} moved to ${Math.round(primary.position.x)}, ${Math.round(primary.position.y)}.`
    }
    scheduleMoveBatchFlush()
  }

  function scheduleMoveBatchFlush() {
    if (moveBatchTimer) clearTimeout(moveBatchTimer)
    moveBatchTimer = setTimeout(flushMoveBatch, 600)
  }

  /** Close the current move burst into a single 'Move node' history entry. */
  function flushMoveBatch() {
    if (moveBatchTimer) {
      clearTimeout(moveBatchTimer)
      moveBatchTimer = null
    }
    if (moveBatchSnapshot.value) {
      endBatch(moveBatchSnapshot.value, 'Move node')
      moveBatchSnapshot.value = null
    }
  }

  // ── Canvas keyboard WIRE ─────────────────────────────────────────────────────
  // Create a connection by keyboard, reusing the pointer onConnect + validation
  // path. `ui.wireDraft` mirrors the source/target handle so BaseNode can glow the
  // exact ports; the stage machine lives here.
  interface WirePort {
    id: string
    type: string
    label: string
  }
  interface WireState {
    stage: 'source' | 'target-node' | 'target-port'
    sourceId: string
    sourcePortIdx: number
    targetId: string | null
    targetPortIdx: number
  }
  const wire = ref<WireState | null>(null)

  function nodeById(id: string | null | undefined): Node | undefined {
    return id ? flowsStore.activeNodes.find(n => n.id === id) : undefined
  }

  /** Ports for a node, merging static definition + dynamic (mirrors BaseNode). */
  function portsOf(node: Node | undefined, kind: 'inputs' | 'outputs'): WirePort[] {
    if (!node) return []
    const def = nodesStore.getDefinition(node.data?.nodeType as string)
    const staticPorts = ((def?.[kind] ?? []) as WirePort[])
    const dynKey = kind === 'inputs' ? '_dynamicInputs' : '_dynamicOutputs'
    const dyn = (node.data?.[dynKey] as WirePort[] | undefined) ?? []
    const ids = new Set(staticPorts.map(p => p.id))
    return [...staticPorts, ...dyn.filter(d => !ids.has(d.id))]
  }

  /** Silent validity check (no error toast) — used to filter candidates. */
  function connValid(sourceId: string, sourceHandle: string, targetId: string, targetHandle: string): boolean {
    return validateConnection(
      { source: sourceId, sourceHandle, target: targetId, targetHandle },
      (nt) => nodesStore.getDefinition(nt),
      (nid) => flowsStore.activeFlow?.nodes.find(n => n.id === nid)?.data as Record<string, unknown> | undefined
    ).valid
  }

  function wireSourcePorts(): WirePort[] {
    return wire.value ? portsOf(nodeById(wire.value.sourceId), 'outputs') : []
  }
  function wireSourcePort(): WirePort | undefined {
    return wireSourcePorts()[wire.value?.sourcePortIdx ?? -1]
  }
  function wireCandidateTargets(): Node[] {
    const w = wire.value
    const src = wireSourcePort()
    if (!w || !src) return []
    return flowsStore.activeNodes.filter(
      n => n.id !== w.sourceId && portsOf(n, 'inputs').some(inp => connValid(w.sourceId, src.id, n.id, inp.id))
    )
  }
  function wireTargetPorts(): WirePort[] {
    const w = wire.value
    const src = wireSourcePort()
    if (!w || !src || !w.targetId) return []
    const tid = w.targetId
    return portsOf(nodeById(tid), 'inputs').filter(inp => connValid(w.sourceId, src.id, tid, inp.id))
  }

  function syncWireDraft() {
    const w = wire.value
    if (!w) {
      uiStore.clearWireDraft()
      return
    }
    const src = wireSourcePort()
    const tgtPort = w.stage === 'target-port' ? wireTargetPorts()[w.targetPortIdx] : undefined
    uiStore.setWireDraft({
      sourceId: w.sourceId,
      sourceHandle: src?.id ?? '',
      targetId: w.stage === 'target-port' ? w.targetId : null,
      targetHandle: tgtPort?.id ?? null,
    })
  }

  function announceWire() {
    const w = wire.value
    if (!w) return
    const src = wireSourcePort()
    const srcName = nodeName(nodeById(w.sourceId))
    if (w.stage === 'source') {
      const newNodeHint = suggestNodeFromWire ? ' N to add a new node.' : ''
      canvasAnnounce.value = `Wiring from ${srcName}, output ${src?.label ?? ''}. Up/Down to pick an output, Enter to continue,${newNodeHint} Escape to cancel.`
    } else if (w.stage === 'target-node') {
      canvasAnnounce.value = `Connect ${src?.label ?? ''} to ${nodeName(nodeById(w.targetId))}. Left/Right for another target, Enter to pick its input.`
    } else {
      const tp = wireTargetPorts()[w.targetPortIdx]
      canvasAnnounce.value = `Connect ${src?.label ?? ''} to ${nodeName(nodeById(w.targetId))}, input ${tp?.label ?? ''}. Enter to connect, Escape to cancel.`
    }
  }

  function startWire() {
    const node = nodeById(uiStore.canvasCursor)
    if (!node) return
    if (portsOf(node, 'outputs').length === 0) {
      canvasAnnounce.value = `${nodeName(node)} has no outputs to wire from.`
      return
    }
    wire.value = { stage: 'source', sourceId: node.id, sourcePortIdx: 0, targetId: null, targetPortIdx: 0 }
    if (portsOf(node, 'outputs').length === 1) advanceFromSource()
    else {
      syncWireDraft()
      announceWire()
    }
  }

  function advanceFromSource() {
    const w = wire.value
    if (!w) return
    const candidates = wireCandidateTargets()
    if (candidates.length === 0) {
      const hint = suggestNodeFromWire ? ' Press N to add a new node.' : ''
      canvasAnnounce.value = `No compatible target for ${wireSourcePort()?.label ?? 'this output'}.${hint}`
      return
    }
    w.stage = 'target-node'
    w.targetId = candidates[0].id
    uiStore.setCanvasCursor(candidates[0].id)
    panCursorIntoView(candidates[0])
    syncWireDraft()
    announceWire()
  }

  function cycleSourcePort(delta: 1 | -1) {
    const w = wire.value
    if (!w) return
    const ports = wireSourcePorts()
    if (ports.length === 0) return
    w.sourcePortIdx = (w.sourcePortIdx + delta + ports.length) % ports.length
    syncWireDraft()
    announceWire()
  }

  function cycleTargetNode(delta: 1 | -1) {
    const w = wire.value
    if (!w) return
    const candidates = wireCandidateTargets()
    if (candidates.length === 0) return
    const cur = candidates.findIndex(n => n.id === w.targetId)
    const next = candidates[(Math.max(0, cur) + delta + candidates.length) % candidates.length]
    w.targetId = next.id
    uiStore.setCanvasCursor(next.id)
    panCursorIntoView(next)
    syncWireDraft()
    announceWire()
  }

  function enterTargetPorts() {
    const w = wire.value
    if (!w || !w.targetId || wireTargetPorts().length === 0) return
    w.stage = 'target-port'
    w.targetPortIdx = 0
    syncWireDraft()
    announceWire()
  }

  function cycleTargetPort(delta: 1 | -1) {
    const w = wire.value
    if (!w) return
    const ports = wireTargetPorts()
    if (ports.length === 0) return
    w.targetPortIdx = (w.targetPortIdx + delta + ports.length) % ports.length
    syncWireDraft()
    announceWire()
  }

  function commitWire() {
    const w = wire.value
    if (!w || w.stage !== 'target-port' || !w.targetId) return
    const src = wireSourcePort()
    const tgt = wireTargetPorts()[w.targetPortIdx]
    if (!src || !tgt) return
    if (!connValid(w.sourceId, src.id, w.targetId, tgt.id)) {
      showConnectionError('Incompatible connection')
      return
    }
    const connection: Connection = { source: w.sourceId, sourceHandle: src.id, target: w.targetId, targetHandle: tgt.id }
    const before = startBatch()
    addEdges([connection])
    flowsStore.addEdge(connection.source, connection.sourceHandle ?? '', connection.target, connection.targetHandle ?? '')
    flowsStore.markDirty()
    endBatch(before, 'Add connection')
    const targetId = w.targetId
    canvasAnnounce.value = `Connected ${src.label} to ${nodeName(nodeById(targetId))} ${tgt.label}.`
    cancelWire(false)
    uiStore.setCanvasCursor(targetId)
  }

  function cancelWire(announce = true) {
    wire.value = null
    uiStore.clearWireDraft()
    if (announce) canvasAnnounce.value = 'Wiring cancelled.'
  }

  function stepBackWire() {
    const w = wire.value
    if (!w) return
    if (w.stage === 'target-port') {
      w.stage = 'target-node'
      syncWireDraft()
      announceWire()
    } else if (w.stage === 'target-node') {
      w.stage = 'source'
      w.targetId = null
      uiStore.setCanvasCursor(w.sourceId)
      const s = nodeById(w.sourceId)
      if (s) panCursorIntoView(s)
      syncWireDraft()
      announceWire()
    } else {
      cancelWire()
    }
  }

  function onWireKeydown(event: KeyboardEvent) {
    const w = wire.value
    if (!w) return
    switch (event.key) {
      case 'Escape':
        cancelWire()
        break
      case 'Backspace':
        stepBackWire()
        break
      case 'Enter':
      case ' ':
        if (w.stage === 'source') advanceFromSource()
        else if (w.stage === 'target-node') enterTargetPorts()
        else commitWire()
        break
      case 'n':
      case 'N': {
        // Hand off to the compatible-node picker for the chosen source output —
        // the keyboard equivalent of dropping a wire on empty canvas. Works at any
        // stage (also the escape hatch when there is no compatible existing target).
        const src = wireSourcePort()
        if (src && suggestNodeFromWire) {
          suggestNodeFromWire({ nodeId: w.sourceId, handleId: src.id, handleType: 'source' })
          cancelWire(false)
        }
        break
      }
      case 'ArrowUp':
        if (w.stage === 'source') cycleSourcePort(-1)
        else if (w.stage === 'target-port') cycleTargetPort(-1)
        break
      case 'ArrowDown':
        if (w.stage === 'source') cycleSourcePort(1)
        else if (w.stage === 'target-port') cycleTargetPort(1)
        break
      case 'ArrowLeft':
        if (w.stage === 'target-node') cycleTargetNode(-1)
        break
      case 'ArrowRight':
        if (w.stage === 'target-node') cycleTargetNode(1)
        break
      default:
        return // let other keys bubble
    }
    event.preventDefault()
    event.stopPropagation()
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

  // Close any open keyboard-move history batch when the surface goes away so it
  // isn't orphaned (was EditorView's onUnmounted; now owned here).
  onScopeDispose(flushMoveBatch)

  return { canvasAnnounce, canvasFocused, onCanvasKeydown, onCanvasFocus, onCanvasBlur }
}
