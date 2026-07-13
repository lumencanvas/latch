/**
 * Flat list of every built-in node definition, aggregated from the per-category barrels.
 *
 * Extracted from `registry/index.ts` so `registry/components.ts` can derive the bespoke-SFC
 * routing map from `definition.component` WITHOUT importing `index.ts` (which re-exports
 * `nodeTypes` from `components.ts` — a cycle). This module imports only category barrels
 * (definitions + their co-located `.vue`), never `components.ts`, so the graph stays acyclic.
 */

import { categoryMeta } from '@/stores/nodes'
import { setCustomNodeTypeIds } from './nodeTypeIds'
import { discoveredCategories, applyDiscoveredCategories } from './categoryRegistry'
import { inputNodes } from './inputs'
import { debugNodes } from './debug'
import { mathNodes } from './math'
import { timingNodes } from './timing'
import { logicNodes } from './logic'
import { audioNodes } from './audio'
import { visualNodes } from './visual'
import { aiNodes } from './ai'
import { connectivityNodes } from './connectivity'
import { claspNodes } from './clasp'
import { dataNodes } from './data'
import { codeNodes } from './code'
import { subflowNodes } from './subflows'
import { threeDNodes } from './3d'
import { outputNodes } from './outputs'
import { stringNodes } from './string'
import { messagingNodes } from './messaging'
import { emulationNodes } from './emulation'
import { opencvNodes } from './opencv'
import { colocatedDefinitions } from './nodeRegistry'

// Legacy per-category definitions (the not-yet-co-located tail).
const legacyNodes = [
  ...inputNodes,
  ...debugNodes,
  ...mathNodes,
  ...timingNodes,
  ...logicNodes,
  ...audioNodes,
  ...visualNodes,
  ...aiNodes,
  ...connectivityNodes,
  ...claspNodes,
  ...dataNodes,
  ...codeNodes,
  ...subflowNodes,
  ...threeDNodes,
  ...outputNodes,
  ...stringNodes,
  ...messagingNodes,
  ...emulationNodes,
  ...opencvNodes,
]

// A co-located `registry/<cat>/<node>/node.ts` (ROADMAP Phase 6) is the single
// source of truth for its id and wins over any legacy copy — so migrating a node
// is "add its folder, delete its legacy definition" with the total count unchanged.
const colocatedIds = new Set(colocatedDefinitions.map((d) => d.id))
export const allNodes = [
  ...legacyNodes.filter((n) => !colocatedIds.has(n.id)),
  ...colocatedDefinitions,
]

// Push the bespoke-component id set into the leaf `nodeTypeIds` registry so `stores/flows.ts`
// can read it WITHOUT importing `components.ts` (which would re-enter the eager glob and close a
// load-time cycle once component nodes co-locate). One-way: nothing in nodeTypeIds imports back.
// `allNodes` is the earliest registry module, so this runs before any flow node-type resolution.
setCustomNodeTypeIds(allNodes.filter((d) => d.component).map((d) => d.id))

// Merge drop-in categories (`registry/<cat>/category.ts` via `defineCategory`) into the store's
// `categoryMeta` — a one-way registry→stores push (nothing in `stores/nodes` imports back), so
// adding a whole category is "drop a folder" with zero core-store edits. Built-in ids win; a
// drop-in never silently overrides a seeded category. `allNodes` is imported at boot (the palette
// needs it) before any UI reads `categoryMeta`.
const addedCategories = applyDiscoveredCategories(categoryMeta, discoveredCategories)

if (import.meta.env.DEV) {
  // A drop-in whose id collides with a seeded built-in is dropped by the merge (built-in wins) —
  // its label/icon/colour are discarded. The store-free category glob can't see the seed to reject
  // this at import, so surface it here (the one place that holds both the seed and the discoveries).
  const clashes = Object.keys(discoveredCategories).filter((id) => !addedCategories.includes(id))
  if (clashes.length > 0) {
    console.warn(
      `[registry] drop-in categor${clashes.length > 1 ? 'ies' : 'y'} reuse a built-in id and were ignored: ` +
        `${clashes.join(', ')}. Pick a unique category id.`,
    )
  }
}

// DEV guard (mirrors the dup-id throw, but a warn — the id may be a legitimate drop-in whose
// `category.ts` is simply absent): flag any node whose category isn't a registered one, so a typo
// or a forgotten `defineCategory` surfaces instead of the node rendering with fallback chrome.
if (import.meta.env.DEV) {
  const registered = new Set(Object.keys(categoryMeta))
  const unknown = [...new Set(allNodes.map((d) => d.category).filter((c) => !registered.has(c)))]
  if (unknown.length > 0) {
    console.warn(
      `[registry] node(s) declare unregistered categor${unknown.length > 1 ? 'ies' : 'y'}: ${unknown.join(', ')}. ` +
        `Add a registry/<cat>/category.ts (defineCategory) or fix the id.`,
    )
  }
}
