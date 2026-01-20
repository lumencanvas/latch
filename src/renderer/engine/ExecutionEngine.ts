import type { Node, Edge } from '@vue-flow/core'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowsStore } from '@/stores/flows'
import type { NodeDefinition } from '@/stores/nodes'
import { disposeAllAudioNodes, gcAudioState } from './executors/audio'
import { disposeAllVisualNodes, gcVisualState } from './executors/visual'
import {
  disposeAllTimingState,
  disposeAllDebugState,
  disposeAllInputState,
} from './executors/index'
import {
  disposeAllMessagingState,
  endMessagingFrame,
} from './executors/messaging'
import { gcCodeState, disposeAllCodeNodes } from './executors/code'
import { gc3DState, disposeAll3DNodes } from './executors/3d'
import { disposeAllConnectivityNodes, gcConnectivityState } from './executors/connectivity'
import { disposeAllAINodes, gcAIState } from './executors/ai'

/**
 * Result of executing a node
 */
export interface ExecutionResult {
  nodeId: string
  outputs: Map<string, unknown>
  error?: Error
  duration: number
}

/**
 * Context passed to node executors
 */
export interface ExecutionContext {
  nodeId: string
  inputs: Map<string, unknown>
  controls: Map<string, unknown>
  definition: NodeDefinition
  deltaTime: number
  totalTime: number
  frameCount: number
}

/**
 * Node executor function type
 */
export type NodeExecutorFn = (ctx: ExecutionContext) => Promise<Map<string, unknown>> | Map<string, unknown>

/**
 * Execution engine for running flow graphs
 */
export class ExecutionEngine {
  private nodes: Node[] = []
  private edges: Edge[] = []
  private executionOrder: string[] = []
  private nodeOutputs: Map<string, Map<string, unknown>> = new Map()
  private executors: Map<string, NodeExecutorFn> = new Map()
  private animationFrameId: number | null = null
  private startTime: number = 0
  private lastFrameTime: number = 0
  private frameCount: number = 0
  private runtimeStore = useRuntimeStore()

  /**
   * Register a node executor
   */
  registerExecutor(nodeType: string, executor: NodeExecutorFn): void {
    this.executors.set(nodeType, executor)
  }

  /**
   * Unregister a node executor
   */
  unregisterExecutor(nodeType: string): void {
    this.executors.delete(nodeType)
  }

  /**
   * Update the graph (nodes and edges)
   */
  updateGraph(nodes: Node[], edges: Edge[]): void {
    // Get current valid node IDs for GC
    const validNodeIds = new Set(nodes.map(n => n.id))

    // If we had previous nodes, GC any that were removed
    if (this.nodes.length > 0) {
      const previousNodeIds = new Set(this.nodes.map(n => n.id))
      const hasRemovedNodes = [...previousNodeIds].some(id => !validNodeIds.has(id))

      if (hasRemovedNodes) {
        // Run garbage collection for orphaned state
        gcAudioState(validNodeIds)
        gcVisualState(validNodeIds)
        gcCodeState(validNodeIds)
        gc3DState(validNodeIds)
        gcConnectivityState(validNodeIds)
        gcAIState(validNodeIds)
        // Clean up node metrics for deleted nodes
        this.runtimeStore.gcNodeMetrics(validNodeIds)
      }
    }

    this.nodes = nodes
    this.edges = edges
    this.executionOrder = this.topologicalSort()
  }

  /**
   * Perform topological sort to determine execution order
   * Uses Kahn's algorithm
   */
  private topologicalSort(): string[] {
    // Build adjacency list and in-degree count
    const inDegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()

    // Initialize
    for (const node of this.nodes) {
      inDegree.set(node.id, 0)
      adjacency.set(node.id, [])
    }

    // Build graph from edges
    for (const edge of this.edges) {
      const neighbors = adjacency.get(edge.source) ?? []
      neighbors.push(edge.target)
      adjacency.set(edge.source, neighbors)

      const degree = inDegree.get(edge.target) ?? 0
      inDegree.set(edge.target, degree + 1)
    }

    // Find all nodes with no incoming edges
    const queue: string[] = []
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId)
      }
    }

    // Process queue
    const result: string[] = []
    while (queue.length > 0) {
      const nodeId = queue.shift()!
      result.push(nodeId)

      const neighbors = adjacency.get(nodeId) ?? []
      for (const neighbor of neighbors) {
        const degree = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, degree)
        if (degree === 0) {
          queue.push(neighbor)
        }
      }
    }

    // Check for cycles
    if (result.length !== this.nodes.length) {
      console.warn('Graph contains cycles, some nodes will not be executed')
    }

    return result
  }

  /**
   * Get inputs for a node from connected outputs
   */
  private getNodeInputs(nodeId: string): Map<string, unknown> {
    const inputs = new Map<string, unknown>()

    // Find all edges that target this node
    for (const edge of this.edges) {
      if (edge.target === nodeId && edge.targetHandle && edge.sourceHandle) {
        const sourceOutputs = this.nodeOutputs.get(edge.source)
        // Debug: log edge connections for main-output nodes (every 60 frames)
        if (this.frameCount % 60 === 0 && nodeId.includes('output')) {
          console.log(`[ExecutionEngine] Edge: ${edge.source}:${edge.sourceHandle} -> ${nodeId}:${edge.targetHandle}`)
          console.log(`[ExecutionEngine] Source outputs available:`, sourceOutputs ? [...sourceOutputs.keys()] : 'none')
        }
        if (sourceOutputs) {
          const value = sourceOutputs.get(edge.sourceHandle)
          if (value !== undefined) {
            inputs.set(edge.targetHandle, value)
          }
        }
      }
    }

    return inputs
  }

  /**
   * Execute a single node
   */
  private async executeNode(node: Node, deltaTime: number): Promise<ExecutionResult> {
    const startTime = performance.now()
    const nodeType = node.data?.nodeType as string
    const definition = node.data?.definition as NodeDefinition | undefined

    // Get executor
    const executor = this.executors.get(nodeType)
    if (!executor) {
      return {
        nodeId: node.id,
        outputs: new Map(),
        duration: 0,
      }
    }

    // Build context
    // Controls are stored directly in node.data, not in node.data.controls
    // Start with defaults from definition, then override with actual values
    const controlEntries: [string, unknown][] = []

    // First, populate defaults from definition
    if (definition?.controls) {
      for (const control of definition.controls) {
        if (control.default !== undefined) {
          controlEntries.push([control.id, control.default])
        }
      }
    }

    // Then override with actual node.data values
    const controlMap = new Map(controlEntries)
    if (node.data) {
      for (const [key, value] of Object.entries(node.data)) {
        // Exclude metadata fields
        if (key !== 'label' && key !== 'nodeType' && key !== 'definition') {
          controlMap.set(key, value)
        }
      }
    }

    const context: ExecutionContext = {
      nodeId: node.id,
      inputs: this.getNodeInputs(node.id),
      controls: controlMap,
      definition: definition!,
      deltaTime,
      totalTime: (performance.now() - this.startTime) / 1000,
      frameCount: this.frameCount,
    }

    try {
      // Execute
      const outputs = await executor(context)
      this.nodeOutputs.set(node.id, outputs)

      // Handle special executor outputs for dynamic port updates
      // These allow executors to signal node data changes (e.g., shader preset selection)
      this.handleSpecialOutputs(node.id, outputs)

      // Update runtime metrics
      this.runtimeStore.updateNodeMetrics(node.id, {
        lastExecutionTime: performance.now() - startTime,
        outputValues: Object.fromEntries(outputs),
      })

      return {
        nodeId: node.id,
        outputs,
        duration: performance.now() - startTime,
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))

      this.runtimeStore.addError({
        nodeId: node.id,
        message: err.message,
        timestamp: Date.now(),
      })

      return {
        nodeId: node.id,
        outputs: new Map(),
        error: err,
        duration: performance.now() - startTime,
      }
    }
  }

  /**
   * Handle special executor outputs that trigger node data updates
   * These are outputs prefixed with _ that signal the engine to update the node
   */
  private handleSpecialOutputs(nodeId: string, outputs: Map<string, unknown>): void {
    const flowsStore = useFlowsStore()
    const updates: Record<string, unknown> = {}
    let hasUpdates = false

    // Check for dynamic inputs update (shader nodes)
    if (outputs.has('_dynamicInputs')) {
      updates._dynamicInputs = outputs.get('_dynamicInputs')
      hasUpdates = true
    }

    // Check for dynamic controls update (shader nodes)
    if (outputs.has('_dynamicControls')) {
      updates._dynamicControls = outputs.get('_dynamicControls')
      hasUpdates = true
    }

    // Check for preset code update (shader nodes)
    if (outputs.has('_preset_code')) {
      updates.code = outputs.get('_preset_code')
      hasUpdates = true
    }

    // Apply updates if any
    if (hasUpdates) {
      flowsStore.updateNodeData(nodeId, updates)
    }
  }

  /**
   * Execute one frame of the graph
   */
  async executeFrame(): Promise<void> {
    const now = performance.now()
    const deltaTime = this.lastFrameTime > 0 ? (now - this.lastFrameTime) / 1000 : 1 / 60
    this.lastFrameTime = now
    this.frameCount++

    // Snapshot execution order and nodes to prevent race conditions
    // if updateGraph() is called during execution
    const executionOrderSnapshot = [...this.executionOrder]
    const nodesSnapshot = [...this.nodes]

    // Execute nodes in topological order
    for (const nodeId of executionOrderSnapshot) {
      const node = nodesSnapshot.find(n => n.id === nodeId)
      if (node) {
        await this.executeNode(node, deltaTime)
      }
    }

    // End-of-frame cleanup for messaging (reset change flags)
    endMessagingFrame()

    // Update FPS
    this.runtimeStore.updateFps(deltaTime)
  }

  /**
   * Start the execution loop
   */
  start(): void {
    if (this.runtimeStore.isRunning) return

    this.startTime = performance.now()
    this.lastFrameTime = 0
    this.frameCount = 0
    // Clear stale outputs from previous execution
    this.nodeOutputs.clear()
    this.runtimeStore.start()

    const loop = async () => {
      if (!this.runtimeStore.isRunning) return

      await this.executeFrame()

      this.animationFrameId = requestAnimationFrame(loop)
    }

    loop()
  }

  /**
   * Stop the execution loop
   */
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    this.runtimeStore.stop()
    this.nodeOutputs.clear()
    this.frameCount = 0

    // Clean up all executor state to prevent memory leaks and stop audio
    disposeAllAudioNodes()
    disposeAllVisualNodes()
    disposeAllTimingState()
    disposeAllDebugState()
    disposeAllInputState()
    disposeAllMessagingState()
    disposeAllCodeNodes()
    disposeAll3DNodes()
    disposeAllConnectivityNodes()
    disposeAllAINodes()
  }

  /**
   * Pause the execution loop
   */
  pause(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    this.runtimeStore.pause()
  }

  /**
   * Resume the execution loop
   */
  resume(): void {
    if (!this.runtimeStore.isPaused) return

    this.runtimeStore.resume()
    this.lastFrameTime = performance.now()

    const loop = async () => {
      if (!this.runtimeStore.isRunning) return

      await this.executeFrame()

      this.animationFrameId = requestAnimationFrame(loop)
    }

    loop()
  }

  /**
   * Get current output value for a node port
   */
  getOutputValue(nodeId: string, portId: string): unknown {
    return this.nodeOutputs.get(nodeId)?.get(portId)
  }

  /**
   * Get all outputs for a node
   */
  getNodeOutputs(nodeId: string): Map<string, unknown> | undefined {
    return this.nodeOutputs.get(nodeId)
  }

  /**
   * Get texture output for a node (direct access for display components)
   * This bypasses Vue reactivity issues with Object.fromEntries()
   */
  getNodeTexture(nodeId: string): unknown {
    const outputs = this.nodeOutputs.get(nodeId)
    if (!outputs) return null

    // Try common texture output names
    return outputs.get('texture') ?? outputs.get('_input_texture') ?? outputs.get('_display') ?? null
  }

  /**
   * Get all node outputs as Map (preserves texture references)
   * Use this instead of nodeMetrics.outputValues for texture access
   */
  getAllNodeOutputs(): Map<string, Map<string, unknown>> {
    return this.nodeOutputs
  }

  /**
   * Check if execution engine has outputs for a node
   */
  hasNodeOutputs(nodeId: string): boolean {
    return this.nodeOutputs.has(nodeId)
  }
}

// Singleton instance
let engineInstance: ExecutionEngine | null = null

export function getExecutionEngine(): ExecutionEngine {
  if (!engineInstance) {
    engineInstance = new ExecutionEngine()
  }
  return engineInstance
}
