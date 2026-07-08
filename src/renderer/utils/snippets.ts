import type { FlowSnippet } from '@/data/flow-snippets'
import type { NodeDefinition } from '@/stores/nodes'

/** The node shape `flowsStore.insertSubgraph` accepts. */
export interface InsertableNode {
  id: string
  nodeType: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

/**
 * Map a snippet's stored nodes into the shape `flowsStore.insertSubgraph` expects,
 * enriching each with its live definition (label + definition ref) when the type is
 * known. `getDefinition` is injected so the helper stays store-agnostic and unit-
 * testable, and so the snippet-insertion path can't drift between call sites (the
 * node explorer modal and the empty-canvas starter templates both use this).
 */
export function snippetToInsertableNodes(
  snippet: FlowSnippet,
  getDefinition: (type: string) => NodeDefinition | undefined,
): InsertableNode[] {
  return snippet.nodes.map((node) => {
    const definition = getDefinition(node.type)
    return {
      id: node.id,
      nodeType: node.type,
      position: node.position,
      data: {
        ...node.data,
        nodeType: node.type,
        ...(definition ? { label: definition.name, definition } : {}),
      },
    }
  })
}
