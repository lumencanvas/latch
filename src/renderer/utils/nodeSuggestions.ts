import type { DataType, NodeDefinition } from '@/stores/nodes'

export interface SuggestionPort {
  id: string
  type: DataType
}

export interface NodeSuggestion {
  /** The candidate node's definition id. */
  nodeType: string
  /** The port on the candidate to auto-wire (the first compatible one). */
  port: SuggestionPort
}

/**
 * Given the port a wire was dragged FROM, list the node types that have at least
 * one compatible port — plus the specific port to auto-wire to.
 *
 * `direction` is the dragged-from handle's role:
 * - `'source'` → the wire started at an OUTPUT, so we look for candidates with a
 *   compatible INPUT (origin out → candidate in);
 * - `'target'` → the wire started at an INPUT, so we look for candidates with a
 *   compatible OUTPUT (candidate out → origin in).
 *
 * The compatibility test is injected (`areTypesCompatible`) so the helper stays
 * store-agnostic and unit-testable — the same idiom as the other connection utils.
 */
export function suggestNodesForPort(
  origin: { type: DataType; direction: 'source' | 'target' },
  definitions: NodeDefinition[],
  isCompatible: (sourceType: DataType, targetType: DataType) => boolean,
): NodeSuggestion[] {
  const suggestions: NodeSuggestion[] = []

  for (const def of definitions) {
    const candidatePorts = origin.direction === 'source' ? def.inputs : def.outputs
    const match = candidatePorts.find(port =>
      origin.direction === 'source'
        ? isCompatible(origin.type, port.type) // origin OUTPUT → candidate INPUT
        : isCompatible(port.type, origin.type), // candidate OUTPUT → origin INPUT
    )
    if (match) {
      suggestions.push({ nodeType: def.id, port: { id: match.id, type: match.type } })
    }
  }

  return suggestions
}
