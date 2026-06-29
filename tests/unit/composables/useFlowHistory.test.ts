import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFlowsStore } from '@/stores/flows'
import { useHistoryStore } from '@/stores/history'
import { useFlowHistory } from '@/composables/useFlowHistory'

/**
 * Undo for parameter (control) edits. These fire many times per second, so they
 * are coalesced into one debounced history entry; a burst commits early when the
 * edit target changes, when another history action begins, or on undo/redo.
 */
describe('useFlowHistory param edits', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    // Drop any pending burst so module-level state doesn't leak between tests.
    useFlowHistory().cancelParamEdit()
    vi.useRealTimers()
  })

  function setup() {
    const flows = useFlowsStore()
    const history = useHistoryStore()
    flows.createFlow('Test')
    const node = flows.addNode('const', { x: 0, y: 0 }, { value: 1 })!
    return { flows, history, node, h: useFlowHistory() }
  }

  it('coalesces rapid edits into one entry after the debounce', () => {
    const { flows, history, node, h } = setup()
    const set = (v: number) =>
      h.recordParamEdit(node.id, 'Change', () => flows.updateNodeData(node.id, { value: v }))

    set(2)
    set(3)
    set(4)
    expect(history.undoStackSize(flows.activeFlowId!)).toBe(0) // nothing recorded mid-burst

    vi.advanceTimersByTime(500)
    expect(history.undoStackSize(flows.activeFlowId!)).toBe(1)
    expect(flows.activeFlow!.nodes[0].data.value).toBe(4)
  })

  it('undo reverts a committed burst to the pre-edit value', () => {
    const { flows, history, node, h } = setup()
    h.recordParamEdit(node.id, 'Change', () => flows.updateNodeData(node.id, { value: 99 }))
    vi.advanceTimersByTime(500)
    expect(flows.activeFlow!.nodes[0].data.value).toBe(99)

    h.undo()
    expect(flows.activeFlow!.nodes[0].data.value).toBe(1)
    expect(history.canRedo(flows.activeFlowId!)).toBe(true)
  })

  it('undo flushes a still-pending burst, then reverts it', () => {
    const { flows, node, h } = setup()
    h.recordParamEdit(node.id, 'Change', () => flows.updateNodeData(node.id, { value: 50 }))
    // No timer advance — the burst is still pending when undo fires.
    h.undo()
    expect(flows.activeFlow!.nodes[0].data.value).toBe(1)
  })

  it('a structural action commits the pending burst first (correct order)', () => {
    const { flows, history, node, h } = setup()
    h.recordParamEdit(node.id, 'Change', () => flows.updateNodeData(node.id, { value: 7 }))

    const before = h.startBatch()
    flows.addNode('const', { x: 10, y: 10 })
    h.endBatch(before, 'Add node')

    expect(history.undoStackSize(flows.activeFlowId!)).toBe(2) // param edit, then add
  })

  it('editing a different node commits the previous burst', () => {
    const { flows, history, node, h } = setup()
    const nodeB = flows.addNode('const', { x: 5, y: 5 }, { value: 10 })!

    h.recordParamEdit(node.id, 'Change A', () => flows.updateNodeData(node.id, { value: 2 }))
    h.recordParamEdit(nodeB.id, 'Change B', () => flows.updateNodeData(nodeB.id, { value: 20 }))

    expect(history.undoStackSize(flows.activeFlowId!)).toBe(1) // A flushed when B began
    vi.advanceTimersByTime(500)
    expect(history.undoStackSize(flows.activeFlowId!)).toBe(2)
  })

  it('does not record a no-op edit', () => {
    const { flows, history, node, h } = setup()
    h.recordParamEdit(node.id, 'Change', () => flows.updateNodeData(node.id, { value: 1 })) // unchanged
    vi.advanceTimersByTime(500)
    expect(history.undoStackSize(flows.activeFlowId!)).toBe(0)
  })

  it('mutates but does not record when there is no active flow', () => {
    const flows = useFlowsStore()
    const h = useFlowHistory()
    let ran = false
    h.recordParamEdit('whatever', 'Change', () => { ran = true })
    expect(ran).toBe(true)
    expect(flows.activeFlowId).toBeNull()
  })
})
