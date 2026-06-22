import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFlowsStore } from '@/stores/flows'
import { useHistoryStore } from '@/stores/history'
import { CUSTOM_NODE_TYPE_IDS } from '@/registry/components'

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

  describe('insertSubgraph (copy/paste, duplicate, snippet)', () => {
    it('clones nodes with fresh ids and preserves the wires between them', () => {
      const store = useFlowsStore()
      store.createFlow('Target')

      const { nodeIds, edgeIds } = store.insertSubgraph(
        [
          { id: 'old-a', nodeType: 'constant', position: { x: 0, y: 0 }, data: { tag: 'A' } },
          { id: 'old-b', nodeType: 'monitor', position: { x: 200, y: 0 }, data: { tag: 'B' } },
        ],
        // Distinct handle names so a source/target or handle swap would fail.
        [{ source: 'old-a', sourceHandle: 'out', target: 'old-b', targetHandle: 'in' }]
      )

      expect(nodeIds).toHaveLength(2)
      expect(edgeIds).toHaveLength(1)
      // New ids must NOT reuse the source ids
      expect(nodeIds).not.toContain('old-a')
      expect(nodeIds).not.toContain('old-b')

      // Resolve clones by their data tag, not array position — this asserts the
      // id-mapping CONTRACT (old-a→source, old-b→target) rather than an ordering
      // coincidence in the clone loop.
      const cloneA = store.activeNodes.find(n => n.data?.tag === 'A')!
      const cloneB = store.activeNodes.find(n => n.data?.tag === 'B')!
      expect(cloneA.id).not.toBe('old-a')
      const edge = store.activeEdges[0]
      expect(edge.source).toBe(cloneA.id)
      expect(edge.target).toBe(cloneB.id)
      expect(edge.sourceHandle).toBe('out')
      expect(edge.targetHandle).toBe('in')
    })

    it('applies the position offset and preserves node data', () => {
      const store = useFlowsStore()
      store.createFlow('Target')

      const { nodeIds } = store.insertSubgraph(
        [{ id: 'x', nodeType: 'constant', position: { x: 10, y: 20 }, data: { value: 42 } }],
        [],
        { x: 100, y: 5 }
      )

      const node = store.activeNodes.find(n => n.id === nodeIds[0])
      expect(node?.position).toEqual({ x: 110, y: 25 })
      expect(node?.data?.value).toBe(42)
    })

    it('drops edges that cross the selection boundary', () => {
      const store = useFlowsStore()
      store.createFlow('Target')

      // Only node "a" is in the payload; the edge references an outside node "ghost"
      const { edgeIds } = store.insertSubgraph(
        [{ id: 'a', nodeType: 'constant', position: { x: 0, y: 0 } }],
        [{ source: 'a', sourceHandle: 'value', target: 'ghost', targetHandle: 'value' }]
      )

      expect(edgeIds).toHaveLength(0)
      expect(store.activeEdges).toHaveLength(0)
    })
  })

  describe('serializeSelection (the copy/duplicate capture half)', () => {
    function graph() {
      const store = useFlowsStore()
      store.createFlow('Main')
      const a = store.addNode('constant', { x: 10, y: 20 }, { tag: 'A' })
      const b = store.addNode('monitor', { x: 110, y: 20 }, { tag: 'B' })
      const outside = store.addNode('monitor', { x: 300, y: 20 }, { tag: 'OUT' })
      store.addEdge(a!.id, 'value', b!.id, 'value') // internal to {a,b}
      store.addEdge(b!.id, 'value', outside!.id, 'value') // crosses the boundary
      return { store, a, b, outside }
    }

    it('captures the selected nodes and ONLY the edges between them', () => {
      const { store, a, b } = graph()
      const sel = store.serializeSelection([a!.id, b!.id])

      expect(sel.nodes.map(n => n.data.tag).sort()).toEqual(['A', 'B'])
      expect(sel.nodes.find(n => n.id === a!.id)?.position).toEqual({ x: 10, y: 20 })
      // The b->outside boundary edge must be excluded; only a->b travels.
      expect(sel.edges).toHaveLength(1)
      expect(sel.edges[0].source).toBe(a!.id)
      expect(sel.edges[0].target).toBe(b!.id)
    })

    it('round-trips through insertSubgraph preserving the internal wire (the bug this fixes)', () => {
      const { store, a, b } = graph()
      const sel = store.serializeSelection([a!.id, b!.id])
      const edgesBefore = store.activeEdges.length

      const { nodeIds } = store.insertSubgraph(sel.nodes, sel.edges, { x: 500, y: 0 })

      expect(nodeIds).toHaveLength(2)
      // Exactly one new edge — wiring the two clones, not the boundary edge.
      expect(store.activeEdges.length).toBe(edgesBefore + 1)
      const cloneA = store.activeNodes.find(n => n.data?.tag === 'A' && nodeIds.includes(n.id))!
      const cloneB = store.activeNodes.find(n => n.data?.tag === 'B' && nodeIds.includes(n.id))!
      expect(store.activeEdges.some(e => e.source === cloneA.id && e.target === cloneB.id)).toBe(true)
    })

    it('returns empty when there is no active flow', () => {
      const fresh = useFlowsStore()
      expect(fresh.serializeSelection(['x'])).toEqual({ nodes: [], edges: [] })
    })
  })

  describe('node + edge actions', () => {
    it('addEdge returns null with no active flow and dedupes identical edges', () => {
      const store = useFlowsStore()
      // No active flow yet
      expect(store.addEdge('a', 'x', 'b', 'y')).toBeNull()

      store.createFlow('Edges')
      const n1 = store.addNode('constant', { x: 0, y: 0 })
      const n2 = store.addNode('monitor', { x: 100, y: 0 })
      const first = store.addEdge(n1!.id, 'value', n2!.id, 'value')
      const dup = store.addEdge(n1!.id, 'value', n2!.id, 'value')
      expect(first).not.toBeNull()
      expect(dup).toBeNull() // identical edge rejected
      expect(store.activeEdges).toHaveLength(1)
    })

    it('updateNodePosition, updateNodeData and getNode mutate/read the node', () => {
      const store = useFlowsStore()
      store.createFlow('Nodes')
      const n = store.addNode('constant', { x: 0, y: 0 }, { value: 1 })

      store.updateNodePosition(n!.id, { x: 42, y: 7 })
      store.updateNodeData(n!.id, { value: 99 })

      const got = store.getNode(n!.id)
      expect(got?.position).toEqual({ x: 42, y: 7 })
      expect(got?.data?.value).toBe(99)
      expect(store.getNode('nope')).toBeNull()
    })

    it('removeNodes removes multiple nodes and their connected edges', () => {
      const store = useFlowsStore()
      store.createFlow('Remove')
      const a = store.addNode('constant', { x: 0, y: 0 })
      const b = store.addNode('monitor', { x: 100, y: 0 })
      const c = store.addNode('monitor', { x: 200, y: 0 })
      store.addEdge(a!.id, 'value', b!.id, 'value')
      store.addEdge(a!.id, 'value', c!.id, 'value')

      store.removeNodes([a!.id, b!.id])
      expect(store.activeNodes.map(n => n.id)).toEqual([c!.id])
      expect(store.activeEdges).toHaveLength(0) // both edges touched a removed node
    })

    it('markSaved clears the dirty flag', () => {
      const store = useFlowsStore()
      store.createFlow('Dirty')
      store.addNode('constant', { x: 0, y: 0 })
      expect(store.hasUnsavedChanges).toBe(true)
      store.markSaved()
      expect(store.hasUnsavedChanges).toBe(false)
    })
  })

  describe('duplicateFlow / healNodeTypes / exportFlow', () => {
    it('duplicateFlow deep-clones a flow under a new id', () => {
      const store = useFlowsStore()
      const src = store.createFlow('Orig')
      store.addNode('constant', { x: 0, y: 0 })

      const copy = store.duplicateFlow(src.id)
      expect(copy).not.toBeNull()
      expect(copy!.id).not.toBe(src.id)
      expect(copy!.name).toBe('Orig (Copy)')
      expect(copy!.nodes).toHaveLength(1)
      // Deep clone: mutating the copy must not touch the source
      copy!.nodes[0].position.x = 999
      expect(store.flows.find(f => f.id === src.id)!.nodes[0].position.x).toBe(0)
      expect(store.duplicateFlow('missing')).toBeNull()
    })

    it('healNodeTypes restores a custom node type lost to BaseNode', () => {
      const customType = CUSTOM_NODE_TYPE_IDS[0]
      const store = useFlowsStore()
      const flow = store.createFlow('Heal')
      // Simulate a persisted node whose vue-flow type fell back to 'custom'
      flow.nodes.push({
        id: 'heal-1',
        type: 'custom',
        position: { x: 0, y: 0 },
        data: { nodeType: customType },
      } as never)

      store.healNodeTypes(flow)
      expect(flow.nodes.find(n => n.id === 'heal-1')!.type).toBe(customType)
    })

    it('healNodeTypes leaves correct and non-custom nodes untouched', () => {
      const customType = CUSTOM_NODE_TYPE_IDS[0]
      const store = useFlowsStore()
      const flow = store.createFlow('Heal2')
      flow.nodes.push(
        { id: 'ok', type: customType, position: { x: 0, y: 0 }, data: { nodeType: customType } } as never,
        // A plain node whose nodeType is NOT a custom component must stay 'custom'
        { id: 'plain', type: 'custom', position: { x: 0, y: 0 }, data: { nodeType: 'constant' } } as never,
      )

      store.healNodeTypes(flow)
      expect(flow.nodes.find(n => n.id === 'ok')!.type).toBe(customType) // already correct
      expect(flow.nodes.find(n => n.id === 'plain')!.type).toBe('custom') // not force-renamed
    })

    it('duplicateFlow deep-clones edges too (not just nodes)', () => {
      const store = useFlowsStore()
      const src = store.createFlow('WithEdge')
      const a = store.addNode('constant', { x: 0, y: 0 })
      const b = store.addNode('monitor', { x: 100, y: 0 })
      store.addEdge(a!.id, 'value', b!.id, 'value')

      const copy = store.duplicateFlow(src.id)!
      expect(copy.edges).toHaveLength(1)
      // Mutating the copy's edge must not bleed into the source (proves deep clone)
      copy.edges[0].sourceHandle = 'MUTATED'
      expect(store.flows.find(f => f.id === src.id)!.edges[0].sourceHandle).toBe('value')
    })

    it('exportFlow serializes a specific flow by id', () => {
      const store = useFlowsStore()
      const a = store.createFlow('A')
      store.createFlow('B') // B becomes active
      store.setActiveFlow(a.id)
      store.addNode('constant', { x: 0, y: 0 })

      const json = store.exportFlow(a.id)
      const parsed = JSON.parse(json)
      expect(parsed.name).toBe('A')
      expect(parsed.nodes).toHaveLength(1)
    })
  })

  describe('subflow ports', () => {
    it('adds, updates and removes input/output ports (with their nodes)', () => {
      const store = useFlowsStore()
      const sub = store.createSubflow('Sub')
      expect(sub.isSubflow).toBe(true)

      const inPort = store.addSubflowInput(sub.id, 'freq', 'number')
      const outPort = store.addSubflowOutput(sub.id, 'out', 'any')
      expect(inPort).not.toBeNull()
      expect(outPort).not.toBeNull()
      expect(sub.subflowInputs).toHaveLength(1)
      expect(sub.subflowOutputs).toHaveLength(1)
      // Each port created a backing node inside the subflow
      expect(sub.nodes.some(n => n.id === inPort!.nodeId)).toBe(true)

      store.updateSubflowPort(sub.id, inPort!.id, { name: 'frequency' })
      expect(sub.subflowInputs[0].name).toBe('frequency')
      const inNode = sub.nodes.find(n => n.id === inPort!.nodeId)
      expect(inNode?.data?.portName).toBe('frequency')

      store.removeSubflowPort(sub.id, inPort!.id, true)
      expect(sub.subflowInputs).toHaveLength(0)
      expect(sub.nodes.some(n => n.id === inPort!.nodeId)).toBe(false)

      // Guard: non-subflow flow rejects port ops
      const plain = store.createFlow('Plain')
      expect(store.addSubflowInput(plain.id, 'x')).toBeNull()
    })
  })

  describe('createSubflowFromSelection / unpackSubflowInstance', () => {
    function buildGraph() {
      const store = useFlowsStore()
      store.createFlow('Main')
      const ext = store.addNode('constant', { x: -200, y: 0 }) // external source (stays)
      const a = store.addNode('compare', { x: 0, y: 0 }) // selected
      const b = store.addNode('gate', { x: 200, y: 0 }) // selected
      const sink = store.addNode('monitor', { x: 400, y: 0 }) // external sink (stays)
      store.addEdge(ext!.id, 'value', a!.id, 'a') // incoming -> boundary
      store.addEdge(a!.id, 'result', b!.id, 'gate') // internal
      store.addEdge(b!.id, 'value', sink!.id, 'value') // outgoing -> boundary
      return { store, ext, a, b, sink }
    }

    it('extracts selected nodes into a subflow instance with boundary ports', () => {
      const { store, ext, a, b, sink } = buildGraph()

      const result = store.createSubflowFromSelection([a!.id, b!.id], 'Grouped')
      expect(result).not.toBeNull()
      const { subflow, instanceNodeId } = result!

      // Subflow holds the two clones + one input node + one output node
      expect(subflow.isSubflow).toBe(true)
      expect(subflow.subflowInputs).toHaveLength(1)
      expect(subflow.subflowOutputs).toHaveLength(1)
      expect(subflow.nodes).toHaveLength(4)

      // Source flow: selected nodes gone, instance + the two externals remain
      const ids = store.activeNodes.map(n => n.id)
      expect(ids).not.toContain(a!.id)
      expect(ids).not.toContain(b!.id)
      expect(ids).toContain(ext!.id)
      expect(ids).toContain(sink!.id)
      const instance = store.getNode(instanceNodeId)
      expect(instance?.data?.nodeType).toBe('subflow')
      expect(instance?.data?.subflowId).toBe(subflow.id)

      // Boundary edges were rewired onto the instance
      expect(store.activeEdges.some(e => e.source === ext!.id && e.target === instanceNodeId)).toBe(true)
      expect(store.activeEdges.some(e => e.source === instanceNodeId && e.target === sink!.id)).toBe(true)
    })

    it('unpackSubflowInstance restores the inner nodes and removes the instance', () => {
      const { store, a, b } = buildGraph()
      const result = store.createSubflowFromSelection([a!.id, b!.id], 'Grouped')!
      const { instanceNodeId } = result

      const beforeCount = store.activeNodes.length
      const newIds = store.unpackSubflowInstance(instanceNodeId)
      expect(newIds).not.toBeNull()
      expect(newIds).toHaveLength(2) // the two non-port inner nodes
      expect(store.getNode(instanceNodeId)).toBeNull() // instance removed
      // instance (1) replaced by 2 unpacked nodes => net +1
      expect(store.activeNodes.length).toBe(beforeCount + 1)

      expect(store.unpackSubflowInstance('not-an-instance')).toBeNull()
    })

    it('collapses multiple incoming edges into the same handle to one input port', () => {
      const store = useFlowsStore()
      store.createFlow('Main')
      const x1 = store.addNode('constant', { x: -200, y: 0 })
      const x2 = store.addNode('constant', { x: -200, y: 100 })
      const a = store.addNode('compare', { x: 0, y: 0 })
      // Two external sources into the SAME target handle 'a' → one shared port.
      store.addEdge(x1!.id, 'value', a!.id, 'a')
      store.addEdge(x2!.id, 'value', a!.id, 'a')

      const { subflow } = store.createSubflowFromSelection([a!.id], 'Grp')!
      expect(subflow.subflowInputs).toHaveLength(1)
    })

    it('creates a distinct input port per distinct incoming handle', () => {
      const store = useFlowsStore()
      store.createFlow('Main')
      const x = store.addNode('constant', { x: -200, y: 0 })
      const a = store.addNode('compare', { x: 0, y: 0 })
      // Same source, two DIFFERENT target handles → two ports.
      store.addEdge(x!.id, 'value', a!.id, 'a')
      store.addEdge(x!.id, 'value', a!.id, 'b')

      const { subflow } = store.createSubflowFromSelection([a!.id], 'Grp')!
      expect(subflow.subflowInputs).toHaveLength(2)
    })
  })

  it('should rename flows', () => {
    const store = useFlowsStore()
    const flow = store.createFlow('Original Name')

    store.renameFlow(flow.id, 'New Name')

    expect(store.activeFlow?.name).toBe('New Name')
    expect(store.hasUnsavedChanges).toBe(true)
  })
})
