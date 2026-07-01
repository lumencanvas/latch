/**
 * Auto-discovery registry — collects every co-located AI model from a glob
 * (EXTENSIBILITY_ARCHITECTURE §8, POLICIES §1).
 *
 * The end state is that adding a model means dropping a single `models/<slug>.model.ts`
 * exporting `defineModel({...})` — no edit to `AI_MODELS`/`WEBLLM_MODELS`/MediaPipe.
 * This is that collector, added NOW (the scaffold) alongside the three hand-authored
 * catalogs so the count + prompt-format gates exist from the first commit.
 *
 * The glob is now LIVE for the webllm AND transformers families: the co-located
 * `models/webllm/*.model.ts` + `models/transformers/*.model.ts` specs are collected here,
 * and both `WEBLLM_MODELS` and `AI_MODELS` are derived from them (see
 * `models/webllm/derive.ts` + `models/transformers/derive.ts`;
 * `docs/plans/MODEL_REGISTRY_IMPL_2026-06-30.md`). Only the MediaPipe URLs remain
 * hand-authored pending their own derive.
 *
 * This collector stays SHAPE-AGNOSTIC — it just gathers `ModelSpec`s by id. Each
 * catalog's per-family rollup (order, task grouping, projection) lives beside its
 * specs, e.g. `models/webllm/derive.ts` + `order.ts`, not here.
 *
 * Mirrors `services/connections/protocolRegistry.ts`; lives under `src/renderer` so
 * Vite's `import.meta.glob` and `vite/client` types resolve and the relative glob is correct.
 */

import type { ModelSpec } from './defineModel'

// Eager so the registry is ready synchronously at import; `import: 'default'` pulls
// each file's `export default defineModel(...)`. A file with only named exports yields
// `undefined` here and is flagged below (the default-export guard). Files are named by
// a free slug (model ids contain `/`); the id lives inside the spec.
const modules = import.meta.glob<ModelSpec>('./models/**/*.model.ts', {
  eager: true,
  import: 'default',
})

const specsById: Record<string, ModelSpec> = {}
const duplicateIds: string[] = []
const missingDefault: string[] = []

// Deterministic order so any error message / iteration is stable.
for (const path of Object.keys(modules).sort()) {
  const spec = modules[path] as ModelSpec | undefined
  if (!spec || typeof spec !== 'object' || !spec.id || !spec.family || !spec.task) {
    missingDefault.push(path)
    continue
  }
  if (spec.id in specsById) duplicateIds.push(spec.id)
  else specsById[spec.id] = spec
}

// Fail loudly at import (CI-caught) rather than silently dropping a model.
if (missingDefault.length > 0) {
  throw new Error(
    `[modelRegistry] *.model.ts without a default defineModel() export: ${missingDefault.join(', ')}`
  )
}
if (duplicateIds.length > 0) {
  throw new Error(`[modelRegistry] duplicate model id(s) across *.model.ts files: ${duplicateIds.join(', ')}`)
}

/** Every co-located model spec, keyed by its model id. */
export const modelSpecs: Readonly<Record<string, ModelSpec>> = specsById

/** The co-located model ids (a subset of the catalogs' union until the derive completes). */
export const colocatedModelIds: readonly string[] = Object.keys(specsById)

/** Co-located model specs — what the derive will roll up into the catalog shapes. */
export const colocatedModelSpecs: ModelSpec[] = Object.values(specsById)
