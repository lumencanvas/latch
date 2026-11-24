import { SNIPPET_PERSONAS, type FlowSnippet, type SnippetPersona } from '@/data/flow-snippets'
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
        // A snippet-authored label ("BPM", "Hands") names the node's role in the flow, so it
        // wins over the generic definition name.
        ...(definition ? { label: (node.data.label as string | undefined) || definition.name, definition } : {}),
      },
    }
  })
}

/**
 * The offset that centres a snippet's node bounding box on `center` (world coordinates),
 * so an insertion lands where the user is looking instead of at a fixed spot that may be
 * off-screen. Nodes are placed by their top-left corner, so the box is approximated with a
 * typical node footprint on the right/bottom edge.
 */
export function snippetOffsetToCenter(
  snippet: Pick<FlowSnippet, 'nodes'>,
  center: { x: number; y: number },
  nodeSize: { width: number; height: number } = { width: 200, height: 120 },
): { x: number; y: number } {
  if (snippet.nodes.length === 0) return { x: center.x, y: center.y }
  const xs = snippet.nodes.map((n) => n.position.x)
  const ys = snippet.nodes.map((n) => n.position.y)
  const midX = (Math.min(...xs) + Math.max(...xs) + nodeSize.width) / 2
  const midY = (Math.min(...ys) + Math.max(...ys) + nodeSize.height) / 2
  return { x: Math.round(center.x - midX), y: Math.round(center.y - midY) }
}

/** Snippets grouped by persona, in the canonical persona order, empty groups omitted. */
export function groupSnippetsByPersona<T extends Pick<FlowSnippet, 'persona'>>(
  snippets: T[],
): Array<{ persona: SnippetPersona; snippets: T[] }> {
  return SNIPPET_PERSONAS
    .map((persona) => ({ persona, snippets: snippets.filter((s) => s.persona === persona) }))
    .filter((g) => g.snippets.length > 0)
}
