import { describe, it, expect } from 'vitest'
import {
  modelSpecs,
  colocatedModelIds,
  colocatedModelSpecs,
} from '@/services/ai/modelRegistry'
import { AI_MODELS } from '@/services/ai/AIInference'
import { WEBLLM_MODELS } from '@/registry/ai/llm'

/**
 * Guard tests for the AI-model auto-discovery glob (EXTENSIBILITY §8, POLICIES §1).
 *
 * While zero `*.model.ts` files are co-located the collected set is empty and the
 * count / orphan / prompt-format checks pass vacuously; once models are co-located
 * (and the catalogs become derived) they are the real gates. The dup-id and
 * default-export guards run at module load (the import above would throw). Mirrors
 * `protocolRegistry` / `nodeRegistry`.
 */

// The model-id universe the catalogs ship today (transformers `AI_MODELS` defaults +
// alternates, and `WEBLLM_MODELS`). Derived live so it can't drift. MediaPipe asset
// ids join this set when those models are co-located (the derive step).
const legacyModelIds = new Set<string>()
for (const def of AI_MODELS) {
  legacyModelIds.add(def.defaultModel)
  for (const alt of def.alternateModels) legacyModelIds.add(alt.id)
}
for (const m of WEBLLM_MODELS) legacyModelIds.add(m.id)

const VALID_FAMILIES = new Set(['transformers', 'webllm', 'mediapipe'])

describe('modelRegistry auto-glob', () => {
  it('imports without throwing (no duplicate ids, no missing default exports)', () => {
    // Reaching here means the module-load guards in modelRegistry.ts passed.
    expect(typeof modelSpecs).toBe('object')
    expect(Array.isArray(colocatedModelSpecs)).toBe(true)
  })

  it('has no duplicate co-located model ids', () => {
    expect(new Set(colocatedModelIds).size).toBe(colocatedModelIds.length)
  })

  it('every co-located spec has a valid family + a task', () => {
    for (const spec of colocatedModelSpecs) {
      expect(VALID_FAMILIES.has(spec.family)).toBe(true)
      expect(typeof spec.task).toBe('string')
      expect(spec.task.length).toBeGreaterThan(0)
    }
  })

  it('prompt-format contract: every co-located text-generation spec declares a valid load.promptFormat', () => {
    for (const spec of colocatedModelSpecs) {
      if (spec.task === 'text-generation') {
        expect(['chat', 'completion']).toContain(spec.load?.promptFormat)
      }
    }
  })

  it('count guard: co-located models never exceed the catalogs union (no orphans)', () => {
    expect(colocatedModelIds.length).toBeLessThanOrEqual(legacyModelIds.size)
    for (const id of colocatedModelIds) expect(legacyModelIds.has(id)).toBe(true)
    // TODO(derive): tighten to whole-catalog set-equality once transformers `AI_MODELS`
    // and MediaPipe are also co-located + derived (add MediaPipe ids to the universe
    // then). WebLLM is already there — see the set-equality block below.
  })

  // WebLLM is the first fully co-located + derived family (POLICIES §1). Compare full
  // {id,name,size} tuples in BOTH directions so the derive can never silently gain,
  // drop, or mis-project a WebLLM model relative to the shipped `WEBLLM_MODELS`
  // catalog — this guards that `deriveWebllmCatalog` keeps copying name+size faithfully
  // from the specs, not just the ids.
  it('WebLLM set-equality: co-located webllm specs exactly match the derived catalog (id, name, size)', () => {
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)
    const colocatedWebllm = colocatedModelSpecs
      .filter((s) => s.family === 'webllm')
      .map((s) => ({ id: s.id, name: s.name, size: s.size }))
      .sort(byId)
    const catalog = WEBLLM_MODELS.map((m) => ({ id: m.id, name: m.name, size: m.size })).sort(byId)
    expect(colocatedWebllm).toEqual(catalog)
  })

  // transformers is the second fully co-located + derived family. Assert the co-located
  // spec ids exactly match AI_MODELS' full model set (each default + every alternate),
  // so the derive can never silently gain/drop a transformers model relative to the catalog.
  it('transformers set-equality: co-located transformers specs exactly match AI_MODELS (default + alternates)', () => {
    const colocated = new Set(
      colocatedModelSpecs.filter((s) => s.family === 'transformers').map((s) => s.id)
    )
    const catalog = new Set<string>()
    for (const def of AI_MODELS) {
      catalog.add(def.defaultModel)
      for (const a of def.alternateModels) catalog.add(a.id)
    }
    expect(colocated).toEqual(catalog)
  })
})
