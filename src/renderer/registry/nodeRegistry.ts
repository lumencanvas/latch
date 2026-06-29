/**
 * Auto-discovery registry — collects every co-located node from a glob.
 *
 * The end state (ROADMAP Phase 6) is that adding a built-in node means dropping a
 * single `registry/<cat>/<node>/node.ts` exporting `defineNode({...})` — no central
 * edits. This module is that collector, added NOW (Phase 0) alongside the legacy
 * `registry/index.ts` + `components.ts` so the guard tests exist from the first
 * commit (EXTENSIBILITY_ARCHITECTURE §6, POLICIES §1).
 *
 * Today the glob matches ZERO files (the tree is still `<name>.ts` + category
 * barrels), so this is inert — the app continues to use the legacy registry. The
 * collector becomes authoritative only as co-location authors `node.ts` files.
 *
 * MUST live under `src/renderer` so Vite's `import.meta.glob` and `vite/client`
 * types resolve and the relative glob is correct.
 */

import type { NodeSpec } from '@/engine/defineNode'

// Eager so the registry is ready synchronously at import; `import: 'default'`
// pulls each file's `export default defineNode(...)`. A file with only named
// exports yields `undefined` here and is flagged below (the default-export guard).
const modules = import.meta.glob<NodeSpec>('./**/node.ts', { eager: true, import: 'default' })

const specsById: Record<string, NodeSpec> = {}
const duplicateIds: string[] = []
const missingDefault: string[] = []

// Deterministic order so any error message / iteration is stable.
for (const path of Object.keys(modules).sort()) {
  const spec = modules[path] as NodeSpec | undefined
  if (!spec || typeof spec !== 'object' || !spec.definition || !spec.executor) {
    missingDefault.push(path)
    continue
  }
  const id = spec.definition.id
  if (id in specsById) duplicateIds.push(id)
  else specsById[id] = spec
}

// Fail loudly at import (CI-caught) rather than silently dropping a node.
if (missingDefault.length > 0) {
  throw new Error(
    `[nodeRegistry] node.ts without a default defineNode() export: ${missingDefault.join(', ')}`
  )
}
if (duplicateIds.length > 0) {
  throw new Error(`[nodeRegistry] duplicate node id(s) across node.ts files: ${duplicateIds.join(', ')}`)
}

/** Every co-located spec, keyed by its definition id. */
export const nodeSpecs: Readonly<Record<string, NodeSpec>> = specsById

/** The co-located node ids (a subset of the legacy set until Phase 6 completes). */
export const colocatedNodeIds: readonly string[] = Object.keys(specsById)

/** Co-located node definitions (parallels the legacy `allNodes`). */
export const colocatedDefinitions = Object.values(specsById).map((s) => s.definition)

/** id → executor, for the engine to register (parallels `builtinExecutors`). */
export const colocatedExecutors: Readonly<Record<string, NodeSpec['executor']>> = Object.fromEntries(
  Object.values(specsById).map((s) => [s.definition.id, s.executor])
)

/** Derived pure set — will replace the hand-maintained `PURE_NODE_TYPES` (Phase 1). */
export const COLOCATED_PURE_NODE_TYPES: ReadonlySet<string> = new Set(
  Object.values(specsById)
    .filter((s) => s.pure)
    .map((s) => s.definition.id)
)
