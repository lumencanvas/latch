/**
 * Node Component Registry
 *
 * Maps node type IDs to their Vue components for Vue Flow. Most nodes render with the generic
 * `BaseNode` (declaratively, via `ui`, or the auto-layout default); bespoke nodes declare a
 * `component` on their definition (the escape hatch — see DECLARATIVE_UI_NODEVIEW design §5).
 *
 * This map is DERIVED from `definition.component` — the single source of truth. To give a node a
 * bespoke SFC, set `component: markRaw(MyNode)` on its definition; it then routes here automatically.
 * (Previously this file hand-maintained the map, which had to be kept in sync by hand.)
 */

import { markRaw, type Component } from 'vue'
import BaseNode from '@/components/nodes/BaseNode.vue'
import { allNodes } from './allNodes'

/** Definitions that carry a bespoke SFC, in registry order. */
const customComponentNodes = allNodes.filter(
  (d): d is typeof d & { component: Component } => !!d.component,
)

/**
 * Node type to Vue component mapping. Used by Vue Flow to render nodes.
 * `default`/`custom` → BaseNode; each bespoke node → its declared `component`.
 */
export const nodeTypes: Record<string, Component> = {
  default: markRaw(BaseNode),
  custom: markRaw(BaseNode),
  ...Object.fromEntries(customComponentNodes.map((d) => [d.id, markRaw(d.component)])),
}

/**
 * Node type ids that have a dedicated custom component (everything except the generic BaseNode
 * renderers). Derived from the same `component` source as `nodeTypes`, so the flows store's
 * node-type decision (and the persistence rehydration path — which aliases this) can never drift from
 * the components. Frozen: it's a read-only lookup (`.includes`), and `PERSISTENCE_SPECIAL_NODE_TYPES`
 * aliases it — freezing forbids an accidental in-place `.push`/`.sort` from silently mutating both.
 */
export const CUSTOM_NODE_TYPE_IDS: readonly string[] = Object.freeze(customComponentNodes.map((d) => d.id))
