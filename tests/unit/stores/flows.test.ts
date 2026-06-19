import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFlowsStore } from '@/stores/flows'
import { useHistoryStore } from '@/stores/history'

describe('Flows Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('frees the deleted flow\'s undo/redo history (no memory leak)', () => {
    const flows = useFlowsStore()
    const history = useHistoryStore()
    const flow = flows.createFlow('Doomed')
    history.undoStacks.set(flow.id, [{} as never])
    history.redoStacks.set(flow.id, [{} as never])

    flows.deleteFlow(flow.id)

    expect(history.undoStacks.has(flow.id)).toBe(false)
    expect(history.redoStacks.has(flow.id)).toBe(false)
  })

  it('should create a new flow', () => {
    const store = useFlowsStore()

    expect(store.flows).toHaveLength(0)
    expect(store.activeFlowId).toBeNull()

    const flow = store.createFlow('Test Flow')

    expect(store.flows).toHaveLength(1)
    expect(store.activeFlowId).toBe(flow.id)
    expect(flow.name).toBe('Test Flow')
    expect(flow.nodes).toHaveLength(0)
    expect(flow.edges).toHaveLength(0)
    expect(flow.dirty).toBe(false)
  })

  it('should set active flow correctly', () => {
    const store = useFlowsStore()

    const flow1 = store.createFlow('Flow 1')
    const flow2 = store.createFlow('Flow 2')

    expect(store.activeFlowId).toBe(flow2.id) // Most recent

    store.setActiveFlow(flow1.id)
    expect(store.activeFlowId).toBe(flow1.id)
    expect(store.activeFlow).toEqual(flow1)
  })

  it('should add and remove nodes', () => {
    const store = useFlowsStore()
    store.createFlow('Test Flow')

    const node = store.addNode('constant', { x: 100, y: 200 }, { label: 'Test' })

    expect(node).not.toBeNull()
    expect(store.activeNodes).toHaveLength(1)
    expect(store.activeNodes[0].position).toEqual({ x: 100, y: 200 })
    expect(store.hasUnsavedChanges).toBe(true)

    store.removeNode(node!.id)
    expect(store.activeNodes).toHaveLength(0)
  })

  it('should add and remove edges', () => {
    const store = useFlowsStore()
    store.createFlow('Test Flow')

    const node1 = store.addNode('constant', { x: 100, y: 100 })
    const node2 = store.addNode('monitor', { x: 300, y: 100 })

    const edge = store.addEdge(node1!.id, 'value', node2!.id, 'value')

    expect(edge).not.toBeNull()
    expect(store.activeEdges).toHaveLength(1)

    store.removeEdge(edge!.id)
    expect(store.activeEdges).toHaveLength(0)
  })

  it('should remove connected edges when removing a node', () => {
    const store = useFlowsStore()
    store.createFlow('Test Flow')

    const node1 = store.addNode('constant', { x: 100, y: 100 })
    const node2 = store.addNode('monitor', { x: 300, y: 100 })
    store.addEdge(node1!.id, 'value', node2!.id, 'value')

    expect(store.activeEdges).toHaveLength(1)

    store.removeNode(node1!.id)

    expect(store.activeNodes).toHaveLength(1)
    expect(store.activeEdges).toHaveLength(0) // Edge should be removed
  })

  it('should export and import flows', () => {
    const store = useFlowsStore()
    store.createFlow('Export Test')

    store.addNode('constant', { x: 100, y: 100 }, { label: 'Const' })
    store.addNode('monitor', { x: 300, y: 100 }, { label: 'Monitor' })

    const exported = store.exportFlow()
    const parsed = JSON.parse(exported)

    expect(parsed.name).toBe('Export Test')
    expect(parsed.nodes).toHaveLength(2)

    // Import into fresh store
    const store2 = useFlowsStore()
    const imported = store2.importFlow(exported)

    expect(imported).not.toBeNull()
    expect(imported!.name).toBe('Export Test')
    expect(imported!.nodes).toHaveLength(2)
  })

  it('should delete flows', () => {
    const store = useFlowsStore()

    const flow1 = store.createFlow('Flow 1')
    store.createFlow('Flow 2')

    expect(store.flows).toHaveLength(2)

    store.deleteFlow(flow1.id)

    expect(store.flows).toHaveLength(1)
    expect(store.flows[0].name).toBe('Flow 2')
  })

  it('should rename flows', () => {
    const store = useFlowsStore()
    const flow = store.createFlow('Original Name')

    store.renameFlow(flow.id, 'New Name')

    expect(store.activeFlow?.name).toBe('New Name')
    expect(store.hasUnsavedChanges).toBe(true)
  })
})
