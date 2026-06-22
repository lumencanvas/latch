import { defineStore } from 'pinia'
import { nanoid } from 'nanoid'
import type { Node, Edge, XYPosition } from '@vue-flow/core'
import { CUSTOM_NODE_TYPE_IDS } from '@/registry/components'
import { useHistoryStore } from './history'

/**
 * Resolve the Vue Flow node `type`: a node whose nodeType has a dedicated custom
 * component renders with that component; everything else uses 'custom' (BaseNode).
 */
function resolveVueFlowType(nodeType: string): string {
  return CUSTOM_NODE_TYPE_IDS.includes(nodeType) ? nodeType : 'custom'
}

/**
 * Port definition for subflow inputs/outputs
 */
export interface SubflowPort {
  id: string
  name: string
  type: string // 'number', 'string', 'any', 'texture', 'audio', etc.
  nodeId: string // ID of the SubflowInput/SubflowOutput node inside the subflow
}

export interface FlowState {
  id: string
  name: string
  description: string
  nodes: Node[]
  edges: Edge[]
  createdAt: Date
  updatedAt: Date
  dirty: boolean
  // Subflow-specific properties
  isSubflow: boolean
  subflowInputs: SubflowPort[]
  subflowOutputs: SubflowPort[]
  // Icon and category for when used as a node
  icon?: string
  category?: string
}

interface FlowsStoreState {
  flows: FlowState[]
  activeFlowId: string | null
}

export const useFlowsStore = defineStore('flows', {
  state: (): FlowsStoreState => ({
    flows: [],
    activeFlowId: null,
  }),

  getters: {
    activeFlow: (state): FlowState | null => {
      return state.flows.find((f) => f.id === state.activeFlowId) ?? null
    },

    activeNodes(): Node[] {
      return this.activeFlow?.nodes ?? []
    },

    activeEdges(): Edge[] {
      return this.activeFlow?.edges ?? []
    },

    flowList: (state): FlowState[] => {
      return state.flows
    },

    hasUnsavedChanges(): boolean {
      return this.activeFlow?.dirty ?? false
    },

    getFlowById: (state) => (id: string): FlowState | undefined => {
      return state.flows.find((f) => f.id === id)
    },

    /**
     * Get all subflows (flows that can be used as nodes)
     */
    subflows: (state): FlowState[] => {
      return state.flows.filter((f) => f.isSubflow)
    },

    /**
     * Get all main flows (not subflows)
     */
    mainFlows: (state): FlowState[] => {
      return state.flows.filter((f) => !f.isSubflow)
    },
  },

  actions: {
    createFlow(name: string = 'Untitled Flow', isSubflow: boolean = false): FlowState {
      const now = new Date()
      const flow: FlowState = {
        id: nanoid(),
        name,
        description: '',
        nodes: [],
        edges: [],
        createdAt: now,
        updatedAt: now,
        dirty: false,
        isSubflow,
        subflowInputs: [],
        subflowOutputs: [],
        icon: isSubflow ? 'box' : undefined,
        category: isSubflow ? 'subflows' : undefined,
      }
      this.flows.push(flow)
      this.activeFlowId = flow.id
      return flow
    },

    /**
     * Create a new empty subflow
     */
    createSubflow(name: string = 'New Subflow'): FlowState {
      return this.createFlow(name, true)
    },

    deleteFlow(flowId: string) {
      const index = this.flows.findIndex((f) => f.id === flowId)
      if (index !== -1) {
        this.flows.splice(index, 1)
        if (this.activeFlowId === flowId) {
          this.activeFlowId = this.flows[0]?.id ?? null
        }
        // Free the deleted flow's undo/redo snapshots (can be several MB each).
        useHistoryStore().clearHistory(flowId)
      }
    },

    setActiveFlow(flowId: string) {
      const flow = this.flows.find((f) => f.id === flowId)
      if (flow) {
        this.activeFlowId = flowId
        this.healNodeTypes(flow)
      }
    },

    /**
     * Heal nodes whose custom-component Vue Flow `type` was lost — e.g. a node added
     * before its component was registered, then persisted with type 'custom'/'default'.
     * Without this they'd render as a generic BaseNode (no custom UI, no resize).
     */
    healNodeTypes(flow: FlowState) {
      for (const node of flow.nodes) {
        const nt = (node.data as Record<string, unknown> | undefined)?.nodeType as string | undefined
        if (nt && CUSTOM_NODE_TYPE_IDS.includes(nt) && node.type !== nt) {
          node.type = nt
        }
      }
    },

    renameFlow(flowId: string, name: string) {
      const flow = this.flows.find((f) => f.id === flowId)
      if (flow) {
        flow.name = name
        flow.updatedAt = new Date()
        flow.dirty = true
      }
    },

    duplicateFlow(flowId: string): FlowState | null {
      const source = this.flows.find((f) => f.id === flowId)
      if (!source) return null

      const now = new Date()
      const flow: FlowState = {
        id: nanoid(),
        name: `${source.name} (Copy)`,
        description: source.description,
        nodes: JSON.parse(JSON.stringify(source.nodes)),
        edges: JSON.parse(JSON.stringify(source.edges)),
        createdAt: now,
        updatedAt: now,
        dirty: false,
        isSubflow: source.isSubflow,
        subflowInputs: JSON.parse(JSON.stringify(source.subflowInputs)),
        subflowOutputs: JSON.parse(JSON.stringify(source.subflowOutputs)),
        icon: source.icon,
        category: source.category,
      }
      this.flows.push(flow)
      return flow
    },

    // Node operations
    addNode(
      nodeType: string,
      position: XYPosition,
      data: Record<string, unknown> = {}
    ): Node | null {
      if (!this.activeFlow) return null

      // Nodes with a dedicated custom component render with it; others use BaseNode.
      const vueFlowType = resolveVueFlowType(nodeType)

      const node: Node = {
        id: nanoid(),
        type: vueFlowType,
        position,
        data: {
          ...data,
          nodeType,
        },
      }

      this.activeFlow.nodes.push(node)
      this.activeFlow.updatedAt = new Date()
      this.activeFlow.dirty = true
      return node
    },

    removeNode(nodeId: string) {
      if (!this.activeFlow) return

      // Remove the node
      this.activeFlow.nodes = this.activeFlow.nodes.filter((n) => n.id !== nodeId)

      // Remove connected edges
      this.activeFlow.edges = this.activeFlow.edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId
      )

      this.activeFlow.updatedAt = new Date()
      this.activeFlow.dirty = true
    },

    removeNodes(nodeIds: string[]) {
      if (!this.activeFlow) return

      const idsSet = new Set(nodeIds)
      this.activeFlow.nodes = this.activeFlow.nodes.filter((n) => !idsSet.has(n.id))
      this.activeFlow.edges = this.activeFlow.edges.filter(
        (e) => !idsSet.has(e.source) && !idsSet.has(e.target)
      )

      this.activeFlow.updatedAt = new Date()
      this.activeFlow.dirty = true
    },

    updateNodePosition(nodeId: string, position: XYPosition) {
      if (!this.activeFlow) return

      const node = this.activeFlow.nodes.find((n) => n.id === nodeId)
      if (node) {
        node.position = position
        // Don't mark dirty for position changes (too frequent)
      }
    },

    updateNodeData(nodeId: string, data: Record<string, unknown>) {
      if (!this.activeFlow) return

      const node = this.activeFlow.nodes.find((n) => n.id === nodeId)
      if (node) {
        node.data = { ...node.data, ...data }
        this.activeFlow.updatedAt = new Date()
        this.activeFlow.dirty = true
      }
    },

    /**
     * Update dynamic input ports for a node (used by shader nodes)
     * These ports are stored in node.data._dynamicInputs and merged with
     * static definition ports by BaseNode.vue
     */
    updateNodeDynamicInputs(
      nodeId: string,
      dynamicInputs: Array<{ id: string; type: string; label: string; default?: unknown }>
    ) {
      if (!this.activeFlow) return

      const node = this.activeFlow.nodes.find((n) => n.id === nodeId)
      if (node) {
        node.data = {
          ...node.data,
          _dynamicInputs: dynamicInputs,
        }
        this.activeFlow.updatedAt = new Date()
        this.activeFlow.dirty = true
      }
    },

    /**
     * Update dynamic controls for a node (used by shader nodes)
     * These controls are stored in node.data._dynamicControls
     */
    updateNodeDynamicControls(
      nodeId: string,
      dynamicControls: Array<{
        id: string
        type: string
        label: string
        default: unknown
        props?: Record<string, unknown>
      }>
    ) {
      if (!this.activeFlow) return

      const node = this.activeFlow.nodes.find((n) => n.id === nodeId)
      if (node) {
        node.data = {
          ...node.data,
          _dynamicControls: dynamicControls,
        }
        this.activeFlow.updatedAt = new Date()
        this.activeFlow.dirty = true
      }
    },

    /**
     * Get a node by ID from the active flow
     */
    getNode(nodeId: string): Node | null {
      if (!this.activeFlow) return null
      return this.activeFlow.nodes.find((n) => n.id === nodeId) ?? null
    },

    // Edge operations
    addEdge(
      sourceNode: string,
      sourceHandle: string,
      targetNode: string,
      targetHandle: string
    ): Edge | null {
      if (!this.activeFlow) return null

      // Check if connection already exists
      const exists = this.activeFlow.edges.some(
        (e) =>
          e.source === sourceNode &&
          e.sourceHandle === sourceHandle &&
          e.target === targetNode &&
          e.targetHandle === targetHandle
      )

      if (exists) return null

      const edge: Edge = {
        id: nanoid(),
        source: sourceNode,
        sourceHandle,
        target: targetNode,
        targetHandle,
      }

      this.activeFlow.edges.push(edge)
      this.activeFlow.updatedAt = new Date()
      this.activeFlow.dirty = true
      return edge
    },

    removeEdge(edgeId: string) {
      if (!this.activeFlow) return

      this.activeFlow.edges = this.activeFlow.edges.filter((e) => e.id !== edgeId)
      this.activeFlow.updatedAt = new Date()
      this.activeFlow.dirty = true
    },

    removeEdges(edgeIds: string[]) {
      if (!this.activeFlow || edgeIds.length === 0) return

      const idsSet = new Set(edgeIds)
      this.activeFlow.edges = this.activeFlow.edges.filter((e) => !idsSet.has(e.id))
      this.activeFlow.updatedAt = new Date()
      this.activeFlow.dirty = true
    },

    /**
     * Clone a set of nodes plus the edges *between* them into the active flow
     * with fresh ids, preserving the internal wiring. Used by copy/paste,
     * duplicate, and snippet insertion — all of which previously dropped edges.
     *
     * Each node's `data` should already carry whatever the caller wants on the
     * clone (label/definition/nodeType/control values). Only edges whose BOTH
     * endpoints are in `nodes` are recreated; edges crossing the selection
     * boundary are intentionally dropped. `offset` is added to every position.
     * Returns the new node/edge ids (node ids in input order).
     */
    insertSubgraph(
      nodes: Array<{ id: string; nodeType: string; position: XYPosition; data?: Record<string, unknown> }>,
      edges: Array<{ source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }>,
      offset: XYPosition = { x: 0, y: 0 }
    ): { nodeIds: string[]; edgeIds: string[] } {
      if (!this.activeFlow) return { nodeIds: [], edgeIds: [] }

      const idMap = new Map<string, string>() // original id -> freshly created id
      const nodeIds: string[] = []
      for (const n of nodes) {
        const created = this.addNode(
          n.nodeType,
          { x: n.position.x + offset.x, y: n.position.y + offset.y },
          { ...(n.data ?? {}) }
        )
        if (created) {
          idMap.set(n.id, created.id)
          nodeIds.push(created.id)
        }
      }

      const edgeIds: string[] = []
      for (const e of edges) {
        const newSource = idMap.get(e.source)
        const newTarget = idMap.get(e.target)
        // Only re-wire edges whose endpoints both made it into the clone.
        if (!newSource || !newTarget) continue
        const created = this.addEdge(
          newSource,
          e.sourceHandle ?? '',
          newTarget,
          e.targetHandle ?? ''
        )
        if (created) edgeIds.push(created.id)
      }

      return { nodeIds, edgeIds }
    },

    /**
     * Capture a set of the active flow's nodes plus the edges *between* them as
     * a portable payload (for copy/paste and duplicate). Edges that cross the
     * selection boundary are excluded — only fully-internal wiring travels with
     * the selection. Positions are absolute; the caller applies any offset.
     *
     * This is the capture half of the copy/paste/duplicate flow; pairing it with
     * `insertSubgraph` round-trips a selection while preserving its wires.
     */
    serializeSelection(nodeIds: string[]): {
      nodes: Array<{ id: string; nodeType: string; position: XYPosition; data: Record<string, unknown> }>
      edges: Array<{ source: string; sourceHandle?: string | null; target: string; targetHandle?: string | null }>
    } {
      if (!this.activeFlow) return { nodes: [], edges: [] }

      const idSet = new Set(nodeIds)
      const nodes = this.activeFlow.nodes
        .filter((n) => idSet.has(n.id))
        .map((n) => ({
          id: n.id,
          nodeType: n.data?.nodeType as string,
          position: { x: n.position.x, y: n.position.y },
          data: { ...n.data },
        }))
      const edges = this.activeFlow.edges
        .filter((e) => idSet.has(e.source) && idSet.has(e.target))
        .map((e) => ({
          source: e.source,
          sourceHandle: e.sourceHandle,
          target: e.target,
          targetHandle: e.targetHandle,
        }))

      return { nodes, edges }
    },

    // Sync with Vue Flow
    setNodes(nodes: Node[]) {
      if (!this.activeFlow) return
      this.activeFlow.nodes = nodes
    },

    setEdges(edges: Edge[]) {
      if (!this.activeFlow) return
      this.activeFlow.edges = edges
    },

    // Save state
    markSaved() {
      if (this.activeFlow) {
        this.activeFlow.dirty = false
      }
    },

    /**
     * Clear the dirty flag on a SPECIFIC flow. The persistence layer saves
     * asynchronously, so clearing the *active* flow (markSaved) could clear the
     * wrong flow's dirty if the user switched flows mid-save — losing the new
     * flow's edits. Clear the flow that was actually persisted instead.
     */
    markFlowSaved(flowId: string) {
      const flow = this.flows.find((f) => f.id === flowId)
      if (flow) flow.dirty = false
    },

    /**
     * Mark the active flow dirty. Used where a mutation otherwise skips dirty —
     * notably node dragging (`updateNodePosition` intentionally skips it to avoid
     * per-frame churn), which must still trigger autosave on drag stop.
     */
    markDirty() {
      if (this.activeFlow) {
        this.activeFlow.dirty = true
        this.activeFlow.updatedAt = new Date()
      }
    },

    // Serialization
    exportFlow(flowId?: string): string {
      const flow = flowId ? this.flows.find((f) => f.id === flowId) : this.activeFlow
      if (!flow) return '{}'

      return JSON.stringify({
        version: '1.0',
        name: flow.name,
        description: flow.description,
        nodes: flow.nodes,
        edges: flow.edges,
        exportedAt: new Date().toISOString(),
      }, null, 2)
    },

    importFlow(json: string): FlowState | null {
      try {
        const data = JSON.parse(json)
        const now = new Date()

        const flow: FlowState = {
          id: nanoid(),
          name: data.name ?? 'Imported Flow',
          description: data.description ?? '',
          nodes: data.nodes ?? [],
          edges: data.edges ?? [],
          createdAt: now,
          updatedAt: now,
          dirty: false,
          isSubflow: data.isSubflow ?? false,
          subflowInputs: data.subflowInputs ?? [],
          subflowOutputs: data.subflowOutputs ?? [],
          icon: data.icon,
          category: data.category,
        }

        this.flows.push(flow)
        this.activeFlowId = flow.id
        return flow
      } catch (e) {
        console.error('Failed to import flow:', e)
        return null
      }
    },

    // =========================================================================
    // Subflow Operations
    // =========================================================================

    /**
     * Add an input port to a subflow
     */
    addSubflowInput(flowId: string, name: string, type: string = 'any'): SubflowPort | null {
      const flow = this.flows.find((f) => f.id === flowId)
      if (!flow || !flow.isSubflow) return null

      // Create a SubflowInput node inside the subflow
      const nodeId = nanoid()
      const portId = nanoid()

      // Add the SubflowInput node
      const inputNode: Node = {
        id: nodeId,
        type: 'custom',
        position: { x: 50, y: 50 + flow.subflowInputs.length * 100 },
        data: {
          nodeType: 'subflow-input',
          label: name,
          portName: name,
          portType: type,
          portId: portId,
        },
      }
      flow.nodes.push(inputNode)

      // Create the port definition
      const port: SubflowPort = {
        id: portId,
        name,
        type,
        nodeId,
      }
      flow.subflowInputs.push(port)
      flow.updatedAt = new Date()
      flow.dirty = true

      return port
    },

    /**
     * Add an output port to a subflow
     */
    addSubflowOutput(flowId: string, name: string, type: string = 'any'): SubflowPort | null {
      const flow = this.flows.find((f) => f.id === flowId)
      if (!flow || !flow.isSubflow) return null

      // Create a SubflowOutput node inside the subflow
      const nodeId = nanoid()
      const portId = nanoid()

      // Add the SubflowOutput node
      const outputNode: Node = {
        id: nodeId,
        type: 'custom',
        position: { x: 400, y: 50 + flow.subflowOutputs.length * 100 },
        data: {
          nodeType: 'subflow-output',
          label: name,
          portName: name,
          portType: type,
          portId: portId,
        },
      }
      flow.nodes.push(outputNode)

      // Create the port definition
      const port: SubflowPort = {
        id: portId,
        name,
        type,
        nodeId,
      }
      flow.subflowOutputs.push(port)
      flow.updatedAt = new Date()
      flow.dirty = true

      return port
    },

    /**
     * Remove a subflow port (and its associated node)
     */
    removeSubflowPort(flowId: string, portId: string, isInput: boolean) {
      const flow = this.flows.find((f) => f.id === flowId)
      if (!flow || !flow.isSubflow) return

      const ports = isInput ? flow.subflowInputs : flow.subflowOutputs
      const portIndex = ports.findIndex((p) => p.id === portId)
      if (portIndex === -1) return

      const port = ports[portIndex]

      // Remove the associated node and its edges
      flow.nodes = flow.nodes.filter((n) => n.id !== port.nodeId)
      flow.edges = flow.edges.filter(
        (e) => e.source !== port.nodeId && e.target !== port.nodeId
      )

      // Remove the port
      ports.splice(portIndex, 1)
      flow.updatedAt = new Date()
      flow.dirty = true
    },

    /**
     * Update a subflow port's properties
     */
    updateSubflowPort(flowId: string, portId: string, updates: { name?: string; type?: string }) {
      const flow = this.flows.find((f) => f.id === flowId)
      if (!flow || !flow.isSubflow) return

      // Find the port in inputs or outputs
      let port = flow.subflowInputs.find((p) => p.id === portId)
      if (!port) {
        port = flow.subflowOutputs.find((p) => p.id === portId)
      }
      if (!port) return

      // Update port
      if (updates.name !== undefined) port.name = updates.name
      if (updates.type !== undefined) port.type = updates.type

      // Update the associated node's data
      const node = flow.nodes.find((n) => n.id === port!.nodeId)
      if (node) {
        if (updates.name !== undefined) {
          node.data = { ...node.data, label: updates.name, portName: updates.name }
        }
        if (updates.type !== undefined) {
          node.data = { ...node.data, portType: updates.type }
        }
      }

      flow.updatedAt = new Date()
      flow.dirty = true
    },

    /**
     * Create a subflow from selected nodes in the active flow
     * Returns the new subflow and replaces selected nodes with a subflow instance
     */
    createSubflowFromSelection(
      nodeIds: string[],
      name: string = 'New Subflow'
    ): { subflow: FlowState; instanceNodeId: string } | null {
      if (!this.activeFlow || nodeIds.length === 0) return null

      const sourceFlow = this.activeFlow

      // Get selected nodes
      const selectedNodes = sourceFlow.nodes.filter((n) => nodeIds.includes(n.id))
      if (selectedNodes.length === 0) return null

      // Get edges between selected nodes
      const nodeIdSet = new Set(nodeIds)
      const internalEdges = sourceFlow.edges.filter(
        (e) => nodeIdSet.has(e.source) && nodeIdSet.has(e.target)
      )

      // Find edges that cross the selection boundary (inputs/outputs)
      const incomingEdges = sourceFlow.edges.filter(
        (e) => !nodeIdSet.has(e.source) && nodeIdSet.has(e.target)
      )
      const outgoingEdges = sourceFlow.edges.filter(
        (e) => nodeIdSet.has(e.source) && !nodeIdSet.has(e.target)
      )

      // Calculate bounding box for positioning
      const minX = Math.min(...selectedNodes.map((n) => n.position.x))
      const minY = Math.min(...selectedNodes.map((n) => n.position.y))

      // Create the subflow
      const subflow = this.createSubflow(name)

      // Copy nodes with adjusted positions
      const nodeIdMap = new Map<string, string>() // old ID -> new ID
      for (const node of selectedNodes) {
        const newId = nanoid()
        nodeIdMap.set(node.id, newId)

        const newNode: Node = {
          ...JSON.parse(JSON.stringify(node)),
          id: newId,
          position: {
            x: node.position.x - minX + 150, // Offset to leave room for input nodes
            y: node.position.y - minY + 50,
          },
        }
        subflow.nodes.push(newNode)
      }

      // Copy internal edges with updated IDs
      for (const edge of internalEdges) {
        const newSource = nodeIdMap.get(edge.source)
        const newTarget = nodeIdMap.get(edge.target)
        if (!newSource || !newTarget) continue // Skip edges with missing nodes

        const newEdge: Edge = {
          id: nanoid(),
          source: newSource,
          sourceHandle: edge.sourceHandle,
          target: newTarget,
          targetHandle: edge.targetHandle,
        }
        subflow.edges.push(newEdge)
      }

      // Create subflow inputs for incoming connections
      const inputPortMap = new Map<string, SubflowPort>() // "targetNodeId:targetHandle" -> port
      for (const edge of incomingEdges) {
        const key = `${edge.target}:${edge.targetHandle}`
        if (!inputPortMap.has(key)) {
          const port = this.addSubflowInput(subflow.id, edge.targetHandle ?? 'input', 'any')
          if (port) {
            inputPortMap.set(key, port)

            // Connect the input node to the internal node
            const targetId = nodeIdMap.get(edge.target)
            if (targetId) {
              subflow.edges.push({
                id: nanoid(),
                source: port.nodeId,
                sourceHandle: 'value',
                target: targetId,
                targetHandle: edge.targetHandle,
              })
            }
          }
        }
      }

      // Create subflow outputs for outgoing connections
      const outputPortMap = new Map<string, SubflowPort>() // "sourceNodeId:sourceHandle" -> port
      for (const edge of outgoingEdges) {
        const key = `${edge.source}:${edge.sourceHandle}`
        if (!outputPortMap.has(key)) {
          const port = this.addSubflowOutput(subflow.id, edge.sourceHandle ?? 'output', 'any')
          if (port) {
            outputPortMap.set(key, port)

            // Connect the internal node to the output node
            const sourceId = nodeIdMap.get(edge.source)
            if (sourceId) {
              subflow.edges.push({
                id: nanoid(),
                source: sourceId,
                sourceHandle: edge.sourceHandle,
                target: port.nodeId,
                targetHandle: 'value',
              })
            }
          }
        }
      }

      // Calculate center position of selected nodes for subflow instance placement
      const centerX = selectedNodes.reduce((sum, n) => sum + n.position.x, 0) / selectedNodes.length
      const centerY = selectedNodes.reduce((sum, n) => sum + n.position.y, 0) / selectedNodes.length

      // Remove selected nodes and their edges from source flow
      sourceFlow.nodes = sourceFlow.nodes.filter((n) => !nodeIdSet.has(n.id))
      sourceFlow.edges = sourceFlow.edges.filter(
        (e) => !nodeIdSet.has(e.source) && !nodeIdSet.has(e.target)
      )

      // Add subflow instance node to source flow
      const instanceNodeId = nanoid()
      const instanceNode: Node = {
        id: instanceNodeId,
        type: 'custom',
        position: { x: centerX, y: centerY },
        data: {
          nodeType: 'subflow',
          label: name,
          subflowId: subflow.id,
        },
      }
      sourceFlow.nodes.push(instanceNode)

      // Reconnect incoming edges to the subflow instance
      for (const edge of incomingEdges) {
        const key = `${edge.target}:${edge.targetHandle}`
        const port = inputPortMap.get(key)
        if (port) {
          sourceFlow.edges.push({
            id: nanoid(),
            source: edge.source,
            sourceHandle: edge.sourceHandle,
            target: instanceNodeId,
            targetHandle: port.id, // Use port ID as handle
          })
        }
      }

      // Reconnect outgoing edges from the subflow instance
      for (const edge of outgoingEdges) {
        const key = `${edge.source}:${edge.sourceHandle}`
        const port = outputPortMap.get(key)
        if (port) {
          sourceFlow.edges.push({
            id: nanoid(),
            source: instanceNodeId,
            sourceHandle: port.id, // Use port ID as handle
            target: edge.target,
            targetHandle: edge.targetHandle,
          })
        }
      }

      sourceFlow.updatedAt = new Date()
      sourceFlow.dirty = true

      // Switch back to source flow
      this.activeFlowId = sourceFlow.id

      return { subflow, instanceNodeId }
    },

    /**
     * Convert a subflow back to its constituent nodes (unpack/explode)
     */
    unpackSubflowInstance(instanceNodeId: string): string[] | null {
      if (!this.activeFlow) return null

      const flow = this.activeFlow
      const instanceNode = flow.nodes.find((n) => n.id === instanceNodeId)
      if (!instanceNode || instanceNode.data?.nodeType !== 'subflow') return null

      const subflowId = instanceNode.data.subflowId as string
      const subflow = this.flows.find((f) => f.id === subflowId)
      if (!subflow) return null

      // Get edges connected to the instance
      const incomingEdges = flow.edges.filter((e) => e.target === instanceNodeId)
      const outgoingEdges = flow.edges.filter((e) => e.source === instanceNodeId)

      // Copy subflow nodes (excluding subflow-input and subflow-output nodes)
      const nodeIdMap = new Map<string, string>()
      const newNodeIds: string[] = []

      for (const node of subflow.nodes) {
        if (node.data?.nodeType === 'subflow-input' || node.data?.nodeType === 'subflow-output') {
          continue
        }

        const newId = nanoid()
        nodeIdMap.set(node.id, newId)
        newNodeIds.push(newId)

        const newNode: Node = {
          ...JSON.parse(JSON.stringify(node)),
          id: newId,
          position: {
            x: instanceNode.position.x + node.position.x - 150,
            y: instanceNode.position.y + node.position.y - 50,
          },
        }
        flow.nodes.push(newNode)
      }

      // Copy internal edges (excluding those connected to input/output nodes)
      for (const edge of subflow.edges) {
        const sourceNode = subflow.nodes.find((n) => n.id === edge.source)
        const targetNode = subflow.nodes.find((n) => n.id === edge.target)

        if (
          sourceNode?.data?.nodeType === 'subflow-input' ||
          targetNode?.data?.nodeType === 'subflow-output'
        ) {
          continue
        }

        const newSource = nodeIdMap.get(edge.source)
        const newTarget = nodeIdMap.get(edge.target)
        if (newSource && newTarget) {
          flow.edges.push({
            id: nanoid(),
            source: newSource,
            sourceHandle: edge.sourceHandle,
            target: newTarget,
            targetHandle: edge.targetHandle,
          })
        }
      }

      // Reconnect incoming edges
      for (const edge of incomingEdges) {
        // Find which input port this was connected to
        const inputPort = subflow.subflowInputs.find((p) => p.id === edge.targetHandle)
        if (inputPort) {
          // Find what the input node was connected to inside the subflow
          const internalEdge = subflow.edges.find(
            (e) => e.source === inputPort.nodeId
          )
          const newTarget = internalEdge ? nodeIdMap.get(internalEdge.target) : undefined
          if (internalEdge && newTarget) {
            flow.edges.push({
              id: nanoid(),
              source: edge.source,
              sourceHandle: edge.sourceHandle,
              target: newTarget,
              targetHandle: internalEdge.targetHandle,
            })
          }
        }
      }

      // Reconnect outgoing edges
      for (const edge of outgoingEdges) {
        // Find which output port this was connected from
        const outputPort = subflow.subflowOutputs.find((p) => p.id === edge.sourceHandle)
        if (outputPort) {
          // Find what was connected to the output node inside the subflow
          const internalEdge = subflow.edges.find(
            (e) => e.target === outputPort.nodeId
          )
          const newSource = internalEdge ? nodeIdMap.get(internalEdge.source) : undefined
          if (internalEdge && newSource) {
            flow.edges.push({
              id: nanoid(),
              source: newSource,
              sourceHandle: internalEdge.sourceHandle,
              target: edge.target,
              targetHandle: edge.targetHandle,
            })
          }
        }
      }

      // Remove the instance node and its edges
      flow.nodes = flow.nodes.filter((n) => n.id !== instanceNodeId)
      flow.edges = flow.edges.filter(
        (e) => e.source !== instanceNodeId && e.target !== instanceNodeId
      )

      flow.updatedAt = new Date()
      flow.dirty = true

      return newNodeIds
    },

    /**
     * Export all flows to a JSON file and trigger download
     */
    exportAllFlows(): void {
      const exportData = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        activeFlowId: this.activeFlowId,
        flows: this.flows.map(flow => ({
          ...flow,
          // Convert dates to ISO strings for JSON
          createdAt: flow.createdAt instanceof Date ? flow.createdAt.toISOString() : flow.createdAt,
          updatedAt: flow.updatedAt instanceof Date ? flow.updatedAt.toISOString() : flow.updatedAt,
          // Mark as not dirty on export
          dirty: false,
        })),
      }

      const json = JSON.stringify(exportData, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `latch-project-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log(`[Flows] Exported ${this.flows.length} flows`)
    },

    /**
     * Import flows from a JSON file
     */
    importFlows(jsonString: string, options: { replace?: boolean } = {}): { success: boolean; message: string; count: number } {
      try {
        const data = JSON.parse(jsonString)

        // Validate structure
        if (!data.flows || !Array.isArray(data.flows)) {
          return { success: false, message: 'Invalid file format: missing flows array', count: 0 }
        }

        // Parse and validate each flow
        const importedFlows: FlowState[] = data.flows.map((flow: Record<string, unknown>) => ({
          id: flow.id as string || nanoid(),
          name: flow.name as string || 'Imported Flow',
          description: flow.description as string || '',
          nodes: (flow.nodes as Node[]) || [],
          edges: (flow.edges as Edge[]) || [],
          createdAt: flow.createdAt ? new Date(flow.createdAt as string) : new Date(),
          updatedAt: new Date(),
          dirty: false,
          isSubflow: flow.isSubflow as boolean || false,
          subflowInputs: (flow.subflowInputs as SubflowPort[]) || [],
          subflowOutputs: (flow.subflowOutputs as SubflowPort[]) || [],
          icon: flow.icon as string | undefined,
          category: flow.category as string | undefined,
        }))

        if (options.replace) {
          // Replace all existing flows
          this.flows = importedFlows
        } else {
          // Merge: add imported flows, skip duplicates by ID
          const existingIds = new Set(this.flows.map(f => f.id))
          for (const flow of importedFlows) {
            if (existingIds.has(flow.id)) {
              // Generate new ID for duplicate
              flow.id = nanoid()
              flow.name = `${flow.name} (imported)`
            }
            this.flows.push(flow)
          }
        }

        // Set active flow if specified and exists
        if (data.activeFlowId && this.flows.some(f => f.id === data.activeFlowId)) {
          this.activeFlowId = data.activeFlowId
        } else if (this.flows.length > 0 && !this.activeFlowId) {
          this.activeFlowId = this.flows[0].id
        }

        console.log(`[Flows] Imported ${importedFlows.length} flows`)
        return { success: true, message: `Imported ${importedFlows.length} flows`, count: importedFlows.length }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('[Flows] Import failed:', message)
        return { success: false, message: `Import failed: ${message}`, count: 0 }
      }
    },

    /**
     * Load sample flow from public folder
     */
    async loadSampleFlow(): Promise<boolean> {
      try {
        const response = await fetch('./sample-flow.json')
        if (!response.ok) {
          console.warn('[Flows] Sample flow not found')
          return false
        }

        const text = await response.text()
        const result = this.importFlows(text, { replace: true })

        if (result.success) {
          console.log('[Flows] Loaded sample flow')
          for (const flow of this.flows) {
            flow.dirty = true
          }
          return true
        }

        return false
      } catch (error) {
        console.warn('[Flows] Failed to load sample flow:', error)
        return false
      }
    },

    /**
     * Load sample flow from public folder for first-time users
     * Only loads if this is the first visit (checks localStorage)
     */
    async loadSampleFlowIfFirstVisit(): Promise<boolean> {
      const FIRST_VISIT_KEY = 'latch_has_visited'

      if (localStorage.getItem(FIRST_VISIT_KEY)) {
        return false
      }

      const loaded = await this.loadSampleFlow()
      if (loaded) {
        localStorage.setItem(FIRST_VISIT_KEY, 'true')
        console.log('[Flows] Loaded sample flow for first-time user')
      }
      return loaded
    },

    /**
     * Trigger file picker for import
     */
    async promptImport(options: { replace?: boolean } = {}): Promise<{ success: boolean; message: string; count: number }> {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'

        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (!file) {
            resolve({ success: false, message: 'No file selected', count: 0 })
            return
          }

          try {
            const text = await file.text()
            const result = this.importFlows(text, options)
            resolve(result)
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error'
            resolve({ success: false, message: `Failed to read file: ${message}`, count: 0 })
          }
        }

        input.oncancel = () => {
          resolve({ success: false, message: 'Import cancelled', count: 0 })
        }

        input.click()
      })
    },
  },
})
