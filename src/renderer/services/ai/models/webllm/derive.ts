/**
 * Derives the `WEBLLM_MODELS` catalog from the co-located `*.model.ts` specs.
 *
 * The WebLLM models are authored one-file-per-model under this directory and
 * collected by `modelRegistry`'s glob; `WEBLLM_MODEL_ORDER` pins the curated display
 * order (tiny → large, families grouped) that a glob sort can't reproduce. This is
 * the first catalog turned into derived data (EXTENSIBILITY §8, POLICIES §1); the
 * result is deep-equal gated against today's hand-authored array in
 * `tests/unit/registry/webllm-models.test.ts`.
 *
 * Both directions are checked at load: every ordered id must have a spec, and every
 * co-located `webllm` spec must be ordered — so dropping a `*.model.ts` without
 * adding it to `order.ts` (or vice-versa) fails loudly in CI rather than silently
 * shrinking the catalog.
 */

import { modelSpecs } from '../../modelRegistry'
import { WEBLLM_MODEL_ORDER } from './order'

/** The public `{ id, name, size }` shape consumers rely on (the modal + the node select). */
export interface WebllmModel {
  readonly id: string
  readonly name: string
  readonly size: string
}

export function deriveWebllmCatalog(): WebllmModel[] {
  const orderSet = new Set(WEBLLM_MODEL_ORDER)

  // Completeness: no co-located webllm model may be absent from the order list.
  const unordered = Object.values(modelSpecs)
    .filter((s) => s.family === 'webllm' && !orderSet.has(s.id))
    .map((s) => s.id)
  if (unordered.length > 0) {
    throw new Error(
      `[webllm derive] co-located webllm model(s) missing from WEBLLM_MODEL_ORDER: ${unordered.join(', ')}`
    )
  }

  return WEBLLM_MODEL_ORDER.map((id) => {
    const spec = modelSpecs[id]
    if (!spec) throw new Error(`[webllm derive] WEBLLM_MODEL_ORDER lists an id with no *.model.ts: ${id}`)
    if (spec.family !== 'webllm') {
      throw new Error(`[webllm derive] ${id} has family '${spec.family}', expected 'webllm'`)
    }
    return { id: spec.id, name: spec.name, size: spec.size }
  })
}
