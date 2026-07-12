/**
 * Leaf registry of bespoke-component node-type ids — the cycle-breaker for co-located
 * component nodes (ROADMAP Phase 6).
 *
 * WHY THIS EXISTS: `stores/flows.ts` needs a synchronous "does this id have a bespoke SFC?"
 * check, historically via `CUSTOM_NODE_TYPE_IDS` imported from `@/registry/components`. But
 * `components.ts` imports `allNodes` → `nodeRegistry` (the EAGER co-location glob). Once a
 * component node co-locates, its `node.ts` imports its `.vue`, the `.vue` imports
 * `@/stores/flows`, and `flows → components → allNodes → nodeRegistry (mid-glob)` closes a
 * load-time cycle that crashes boot. This module has NO imports, so `flows.ts` can depend on
 * it without pulling the registry graph — breaking the cycle. `allNodes.ts` (the earliest
 * registry module, loaded before any flow interaction) PUSHES the derived id set here.
 *
 * The push is one-way (allNodes → here); nothing here imports allNodes, so the graph stays
 * acyclic. `components.ts` still owns `CUSTOM_NODE_TYPE_IDS` (the governed public export +
 * `nodeTypes` map); this is the internal fast-path flows reads.
 */

let ids: ReadonlySet<string> = new Set()

/** Called once by `allNodes.ts` after the full definition list is built. */
export function setCustomNodeTypeIds(list: readonly string[]): void {
  ids = new Set(list)
}

/** Synchronous: does this node-type id have a bespoke SFC (vs the generic BaseNode)? */
export function isCustomNodeTypeId(nodeType: string): boolean {
  return ids.has(nodeType)
}
