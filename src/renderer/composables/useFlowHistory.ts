import { computed } from 'vue'
import { useFlowsStore } from '@/stores/flows'
import { useHistoryStore, createSnapshot, type FlowSnapshot } from '@/stores/history'

/**
 * Module-level singleton state for coalescing rapid parameter (control) edits
 * into a single undo entry. Control edits — typing in a number, dragging a
 * slider — fire many times per second; recording each one would make undo
 * useless. A burst stays open until it has been idle for PARAM_DEBOUNCE_MS, the
 * edit target (flow+node) changes, or any other history action begins.
 */
const PARAM_DEBOUNCE_MS = 500
let paramBefore: FlowSnapshot | null = null
let paramKey: string | null = null
let paramFlowId: string | null = null
let paramDescription = ''
let paramTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Composable for managing flow undo/redo history
 */
export function useFlowHistory() {
  const flowsStore = useFlowsStore()
  const historyStore = useHistoryStore()

  /**
   * Commit a pending coalesced param edit as one history entry, if anything
   * actually changed. Dropped (not recorded) if the active flow changed since
   * the burst started — the "after" snapshot would belong to a different flow.
   */
  function flushParamEdit() {
    if (paramTimer) {
      clearTimeout(paramTimer)
      paramTimer = null
    }
    if (!paramBefore) return

    const before = paramBefore
    const flowId = paramFlowId
    const description = paramDescription
    paramBefore = null
    paramKey = null
    paramFlowId = null

    if (flowId && flowsStore.activeFlowId === flowId && flowsStore.activeFlow) {
      const after = createSnapshot(flowsStore.activeFlow.nodes, flowsStore.activeFlow.edges)
      // Compare content only — FlowSnapshot.timestamp always differs between the
      // burst start and the (debounced) flush, so it can't be part of the diff.
      const changed =
        JSON.stringify(before.nodes) !== JSON.stringify(after.nodes) ||
        JSON.stringify(before.edges) !== JSON.stringify(after.edges)
      if (changed) {
        historyStore.recordChange(flowId, before, after, description)
      }
    }
  }

  /** Discard a pending param burst without recording it. */
  function cancelParamEdit() {
    if (paramTimer) {
      clearTimeout(paramTimer)
      paramTimer = null
    }
    paramBefore = null
    paramKey = null
    paramFlowId = null
  }

  /**
   * Apply a control/param edit and (debounced) record it for undo. Successive
   * edits to the same node coalesce into one entry; editing a different node
   * commits the previous burst first. The mutation runs even with no active
   * flow (it just isn't recorded).
   */
  function recordParamEdit(nodeId: string, description: string, mutate: () => void) {
    if (!flowsStore.activeFlow || !flowsStore.activeFlowId) {
      mutate()
      return
    }

    const key = `${flowsStore.activeFlowId}:${nodeId}`
    if (paramBefore && paramKey !== key) flushParamEdit()

    if (!paramBefore) {
      paramBefore = createSnapshot(flowsStore.activeFlow.nodes, flowsStore.activeFlow.edges)
      paramKey = key
      paramFlowId = flowsStore.activeFlowId
    }
    paramDescription = description

    mutate()

    if (paramTimer) clearTimeout(paramTimer)
    paramTimer = setTimeout(flushParamEdit, PARAM_DEBOUNCE_MS)
  }

  // Computed properties for current flow
  const canUndo = computed(() => {
    const flowId = flowsStore.activeFlowId
    return flowId ? historyStore.canUndo(flowId) : false
  })

  const canRedo = computed(() => {
    const flowId = flowsStore.activeFlowId
    return flowId ? historyStore.canRedo(flowId) : false
  })

  const undoDescription = computed(() => {
    const flowId = flowsStore.activeFlowId
    return flowId ? historyStore.lastUndoDescription(flowId) : null
  })

  const redoDescription = computed(() => {
    const flowId = flowsStore.activeFlowId
    return flowId ? historyStore.lastRedoDescription(flowId) : null
  })

  /**
   * Take a snapshot before an action
   */
  function beforeAction(): FlowSnapshot | null {
    // Commit any in-flight param burst first so a structural action records as
    // its own entry, after the param edit, in the right order.
    flushParamEdit()
    if (!flowsStore.activeFlow) return null
    return createSnapshot(flowsStore.activeFlow.nodes, flowsStore.activeFlow.edges)
  }

  /**
   * Record the action after it completes
   */
  function afterAction(before: FlowSnapshot | null, description: string) {
    if (!before || !flowsStore.activeFlow || !flowsStore.activeFlowId) return

    const after = createSnapshot(flowsStore.activeFlow.nodes, flowsStore.activeFlow.edges)

    // Only record if something actually changed
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      historyStore.recordChange(flowsStore.activeFlowId, before, after, description)
    }
  }

  /**
   * Wrap an action with history recording
   */
  function withHistory<T>(description: string, action: () => T): T {
    const before = beforeAction()
    const result = action()
    afterAction(before, description)
    return result
  }

  /**
   * Undo the last action
   */
  function undo() {
    if (!flowsStore.activeFlow || !flowsStore.activeFlowId) return false

    // Commit any pending param burst so it becomes an undoable entry first.
    flushParamEdit()

    const snapshot = historyStore.undo(flowsStore.activeFlowId)
    if (!snapshot) return false

    // Apply the snapshot
    historyStore.setUndoingOrRedoing(true)
    try {
      flowsStore.activeFlow.nodes = JSON.parse(JSON.stringify(snapshot.nodes))
      flowsStore.activeFlow.edges = JSON.parse(JSON.stringify(snapshot.edges))
    } finally {
      historyStore.setUndoingOrRedoing(false)
    }

    return true
  }

  /**
   * Redo the last undone action
   */
  function redo() {
    if (!flowsStore.activeFlow || !flowsStore.activeFlowId) return false

    flushParamEdit()

    const snapshot = historyStore.redo(flowsStore.activeFlowId)
    if (!snapshot) return false

    // Apply the snapshot
    historyStore.setUndoingOrRedoing(true)
    try {
      flowsStore.activeFlow.nodes = JSON.parse(JSON.stringify(snapshot.nodes))
      flowsStore.activeFlow.edges = JSON.parse(JSON.stringify(snapshot.edges))
    } finally {
      historyStore.setUndoingOrRedoing(false)
    }

    return true
  }

  /**
   * Start tracking changes (call before a batch of changes)
   */
  function startBatch(): FlowSnapshot | null {
    return beforeAction()
  }

  /**
   * End tracking changes (call after a batch of changes)
   */
  function endBatch(before: FlowSnapshot | null, description: string) {
    afterAction(before, description)
  }

  return {
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    beforeAction,
    afterAction,
    withHistory,
    recordParamEdit,
    flushParamEdit,
    cancelParamEdit,
    undo,
    redo,
    startBatch,
    endBatch,
  }
}
