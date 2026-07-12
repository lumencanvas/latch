/**
 * Flat list of every built-in node definition, aggregated from the per-category barrels.
 *
 * Extracted from `registry/index.ts` so `registry/components.ts` can derive the bespoke-SFC
 * routing map from `definition.component` WITHOUT importing `index.ts` (which re-exports
 * `nodeTypes` from `components.ts` — a cycle). This module imports only category barrels
 * (definitions + their co-located `.vue`), never `components.ts`, so the graph stays acyclic.
 */

import { setCustomNodeTypeIds } from './nodeTypeIds'
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
