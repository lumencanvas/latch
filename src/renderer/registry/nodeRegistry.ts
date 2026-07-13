/**
 * Auto-discovery registry — collects every co-located node from a glob.
 *
 * The end state (ROADMAP Phase 6) is that adding a built-in node means dropping a
 * single `registry/<cat>/<node>/node.ts` exporting `defineNode({...})` — no central
 * edits. This module is that collector, added NOW (Phase 0) alongside the legacy
 * `registry/index.ts` + `components.ts` so the guard tests exist from the first
 * commit (EXTENSIBILITY_ARCHITECTURE §6, POLICIES §1).
 *
 * This collector is now authoritative (ROADMAP Phase 6 complete): all 241 built-in
 * nodes are co-located `registry/<cat>/<id>/node.ts` files the glob discovers; the
 * category barrels are empty and `builtinExecutors` = `{...colocatedExecutors, ...}`.
 *
 * MUST live under `src/renderer` so Vite's `import.meta.glob` and `vite/client`
 * types resolve and the relative glob is correct.
 */

import { defineNode, type NodeSpec } from '@/engine/defineNode'
// Side-effect: wires `defineNode`'s global model-select resolver (AIInference calls
// `setModelSelectResolver` at module scope). AIInference imports no store/registry, so this is
// acyclic. NOTE: Vite PREPENDS the eager glob's node imports above this one, so this does NOT run
// before the glob — but it guarantees the resolver is set by the time THIS module's body runs, which
// is where the re-derivation below happens. AI nodes also self-wire (their executor import pulls
// AIInference before their own `defineNode()`), so their selects are already populated at glob time.
import '@/services/ai/AIInference'

// Eager so the registry is ready synchronously at import. `import: 'default'` pulls each
// file's default export: a single `defineNode(...)` from a `node.ts`, OR a `defineNodes([...])`
// ARRAY (a one-file node family) from a `nodes.ts`. Arrays are flattened below, so "one unit
// registers many nodes" needs no special casing downstream. A file with only named exports
// yields `undefined` and is flagged (the default-export guard).
const isValidSpec = (s: unknown): s is NodeSpec =>
  !!s && typeof s === 'object' && !!(s as NodeSpec).definition && !!(s as NodeSpec).executor

/**
 * Flatten + validate the glob's module defaults into a spec-by-id map. A default may be a
 * single `NodeSpec` (a `node.ts`) or a `NodeSpec[]` (a `nodes.ts` family) — arrays are
 * flattened, and the dup-id / missing-default guards apply per spec. Pure + exported so the
 * multi-node-unit guard test can exercise it with fixtures without a real registry file.
 */
export function collectSpecs(modules: Record<string, NodeSpec | NodeSpec[] | undefined>): {
  specsById: Record<string, NodeSpec>
  duplicateIds: string[]
  missingDefault: string[]
} {
  const specsById: Record<string, NodeSpec> = {}
  const duplicateIds: string[] = []
  const missingDefault: string[] = []
  // Deterministic order so any error message / iteration is stable.
  for (const path of Object.keys(modules).sort()) {
    const def = modules[path]
    const specs = Array.isArray(def) ? def : [def]
    // A missing default, a malformed spec, or an empty `defineNodes([])` all fail loudly.
    if (specs.length === 0 || !specs.every(isValidSpec)) {
      missingDefault.push(path)
      continue
    }
    for (const spec of specs) {
      const id = spec.definition.id
      if (id in specsById) duplicateIds.push(id)
      else specsById[id] = spec
    }
  }
  return { specsById, duplicateIds, missingDefault }
}

const modules = import.meta.glob<NodeSpec | NodeSpec[]>(
  ['./**/node.ts', './**/nodes.ts'],
  { eager: true, import: 'default' },
)
const { specsById, duplicateIds, missingDefault } = collectSpecs(modules)

// Fail loudly at import (CI-caught) rather than silently dropping a node.
if (missingDefault.length > 0) {
  throw new Error(
    `[nodeRegistry] node.ts/nodes.ts without a valid default defineNode()/defineNodes() export: ${missingDefault.join(', ')}`
  )
}
if (duplicateIds.length > 0) {
  throw new Error(`[nodeRegistry] duplicate node id(s) across node.ts/nodes.ts files: ${duplicateIds.join(', ')}`)
}

// Re-derive `models:`-bearing specs now the global model-select resolver is guaranteed present (the
// `@/services/ai/AIInference` side-effect import above has run — this body executes after ALL imports,
// glob-prepended or not). This is the registry-assembly injection seam: it guarantees a populated
// `model` select for ANY node declaring `models:` — including a hand-authored non-AI node that didn't
// self-wire via an AI executor import. Idempotent for the 7 AI nodes (their select is already
// populated from glob-time self-wiring, so `deriveModelDefinition` leaves it untouched).
for (const id of Object.keys(specsById)) {
  if (specsById[id].models?.length) specsById[id] = defineNode(specsById[id])
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
