/**
 * Subflow Executors
 *
 * These executors handle subflow execution:
 * - SubflowInput: Receives values from the parent flow
 * - SubflowOutput: Sends values back to the parent flow
 * - Subflow: Executes an entire subflow as a single node
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import type { FlowState } from '@/stores/flows'
import type { Node, Edge } from '@vue-flow/core'

// Cache for subflow execution contexts
const subflowContexts = new Map<string, Map<string, unknown>>()

/**
 * Get or create a context for a subflow instance
 */
function getSubflowContext(instanceId: string): Map<string, unknown> {
  if (!subflowContexts.has(instanceId)) {
    subflowContexts.set(instanceId, new Map())
  }
  return subflowContexts.get(instanceId)!
}

/**
 * Clear subflow context (call when execution stops)
 */
export function clearSubflowContext(instanceId: string): void {
  subflowContexts.delete(instanceId)
}

/**
 * Clear all subflow contexts
 */
export function clearAllSubflowContexts(): void {
  subflowContexts.clear()
}

/**
 * Garbage-collect contexts for subflow instances that no longer exist in the graph.
 * Contexts are keyed by the subflow instance node id (see subflowExecutor), so any
 * key not in the set of valid node ids belongs to a deleted node.
 */
export function gcSubflowState(validNodeIds: Set<string>): void {
  for (const instanceId of subflowContexts.keys()) {
    if (!validNodeIds.has(instanceId)) {
      subflowContexts.delete(instanceId)
    }
  }
}

// ============================================================================
// SubflowInput Node
// ============================================================================

/**
 * SubflowInput executor - receives values from the parent flow
 * This node is used inside subflows to define input ports
 */
export const subflowInputExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()

  // The value is passed in via the subflow context
  // The subflow executor sets this before running the subflow
  const portId = ctx.controls.get('portId') as string
  const subflowInstanceId = ctx.controls.get('_subflowInstanceId') as string

  if (subflowInstanceId && portId) {
    const subflowCtx = getSubflowContext(subflowInstanceId)
    const inputValue = subflowCtx.get(`input:${portId}`)
    outputs.set('value', inputValue)
  } else {
    // Default value when not running in a subflow context
    outputs.set('value', ctx.controls.get('defaultValue') ?? null)
  }

  return outputs
}

// ============================================================================
// SubflowOutput Node
// ============================================================================

/**
 * SubflowOutput executor - sends values back to the parent flow
 * This node is used inside subflows to define output ports
 */
export const subflowOutputExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()

  // Get the input value and store it in the subflow context
  const value = ctx.inputs.get('value')
  const portId = ctx.controls.get('portId') as string
  const subflowInstanceId = ctx.controls.get('_subflowInstanceId') as string

  if (subflowInstanceId && portId) {
    const subflowCtx = getSubflowContext(subflowInstanceId)
    subflowCtx.set(`output:${portId}`, value)
  }

  // Pass through for display purposes
  outputs.set('_display', value)

  return outputs
}

// ============================================================================
// Subflow Instance Node
// ============================================================================

/**
 * Execute a subflow - this is the complex part
 * We need to:
 * 1. Get the subflow definition
 * 2. Pass inputs to subflow-input nodes
 * 3. Execute the subflow's internal graph
 * 4. Collect outputs from subflow-output nodes
 */
export const subflowExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()

  // Get the subflow ID from node data
  const subflowId = ctx.controls.get('subflowId') as string
  if (!subflowId) {
    outputs.set('_error', 'No subflow ID specified')
    return outputs
  }

  // Get the subflow definition
  // Note: This requires access to the flows store, which we'll inject via the execution context
  const getSubflow = ctx.controls.get('_getSubflow') as ((id: string) => FlowState | undefined) | undefined
  if (!getSubflow) {
    outputs.set('_error', 'Subflow resolver not available')
    return outputs
  }

  const subflow = getSubflow(subflowId)
  if (!subflow) {
    outputs.set('_error', `Subflow not found: ${subflowId}`)
    return outputs
  }

  // Get the executor function for running nodes
  const executeNode = ctx.controls.get('_executeNode') as ((
    nodeId: string,
    nodeType: string,
    inputs: Map<string, unknown>,
    controls: Map<string, unknown>
  ) => Map<string, unknown>) | undefined

  if (!executeNode) {
    // Fallback: just return the inputs as-is (for testing)
    subflow.subflowOutputs.forEach(port => {
      outputs.set(port.id, null)
    })
    return outputs
  }

  // Set up subflow context with input values
  const subflowCtx = getSubflowContext(ctx.nodeId)

  // Pass input values to the subflow context
  for (const inputPort of subflow.subflowInputs) {
    const inputValue = ctx.inputs.get(inputPort.id)
    subflowCtx.set(`input:${inputPort.id}`, inputValue)
  }

  // Build a simple execution order (topological sort of subflow nodes)
  const executionOrder = topologicalSort(subflow.nodes, subflow.edges)

  // Store node outputs
  const nodeOutputs = new Map<string, Map<string, unknown>>()

  // Execute each node in order
  for (const nodeId of executionOrder) {
    const node = subflow.nodes.find(n => n.id === nodeId)
    if (!node) continue

    const nodeType = node.data?.nodeType as string
    if (!nodeType) continue

    // Gather inputs from connected nodes
    const nodeInputs = new Map<string, unknown>()
    for (const edge of subflow.edges) {
      if (edge.target === nodeId) {
        const sourceOutputs = nodeOutputs.get(edge.source)
        if (sourceOutputs && edge.sourceHandle) {
          nodeInputs.set(edge.targetHandle ?? '', sourceOutputs.get(edge.sourceHandle))
        }
      }
    }

    // Gather controls from node data
    const nodeControls = new Map<string, unknown>()
    if (node.data) {
      Object.entries(node.data).forEach(([key, value]) => {
        if (key !== 'nodeType' && key !== 'label' && key !== 'definition') {
          nodeControls.set(key, value)
        }
      })
    }

    // Inject subflow instance ID for subflow-input and subflow-output nodes
    nodeControls.set('_subflowInstanceId', ctx.nodeId)

    // Execute the node
    const result = executeNode(nodeId, nodeType, nodeInputs, nodeControls)
    nodeOutputs.set(nodeId, result)
  }

  // Collect outputs from subflow-output nodes
  for (const outputPort of subflow.subflowOutputs) {
    const outputValue = subflowCtx.get(`output:${outputPort.id}`)
    outputs.set(outputPort.id, outputValue)
  }

  return outputs
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Topological sort for subflow nodes
 */
function topologicalSort(nodes: Node[], edges: Edge[]): string[] {
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  // Initialize
  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  // Build adjacency list and calculate in-degrees
  for (const edge of edges) {
    const targets = adjacency.get(edge.source) ?? []
    targets.push(edge.target)
    adjacency.set(edge.source, targets)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  // Kahn's algorithm
  const queue: string[] = []
  const result: string[] = []

  // Start with nodes that have no incoming edges
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId)
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    result.push(nodeId)

    const neighbors = adjacency.get(nodeId) ?? []
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) ?? 0) - 1
      inDegree.set(neighbor, newDegree)
      if (newDegree === 0) {
        queue.push(neighbor)
      }
    }
  }

  return result
}

// ============================================================================
// Registry
// ============================================================================

export const subflowExecutors: Record<string, NodeExecutorFn> = {
  'subflow-input': subflowInputExecutor,
  'subflow-output': subflowOutputExecutor,
  'subflow': subflowExecutor,
}
