/**
 * Derives the transformers `AI_MODELS` catalog from the co-located `*.model.ts` specs
 * (EXTENSIBILITY §8, POLICIES §1; the second catalog turned into derived data after
 * WebLLM). `AI_MODELS` is per-task, but a spec is per-model — so `TASK_CATALOG` holds
 * the per-task wrapper metadata + which model is the default + the ordered alternate
 * ids (memo fork 1a), and this rebuilds the `ModelDefinition[]` shape by grouping the
 * `family:'transformers'` specs under it. `defaultSize`/`defaultLicense` come from the
 * default model's own spec (never restated in the catalog).
 *
 * Both directions are checked at load: every id named in `TASK_CATALOG` must resolve
 * to a transformers spec, and every co-located transformers spec must be referenced
 * exactly once — so a dropped/duplicated/orphaned `*.model.ts` fails loudly in CI
 * rather than silently changing the catalog. Deep-equal gated against the frozen
 * git-original baseline in `tests/fixtures/ai-models.baseline.ts`.
 */

import type { ModelDefinition, ModelOption } from '../../AIInference'
import { modelSpecs } from '../../modelRegistry'
import { TASK_CATALOG } from './taskCatalog'

function specFor(id: string, role: string) {
  const spec = modelSpecs[id]
  if (!spec) throw new Error(`[transformers derive] TASK_CATALOG names an id with no *.model.ts (${role}): ${id}`)
  if (spec.family !== 'transformers') {
    throw new Error(`[transformers derive] ${id} has family '${spec.family}', expected 'transformers' (${role})`)
  }
  if (!spec.license) throw new Error(`[transformers derive] transformers spec ${id} is missing a license`)
  return spec
}

export function deriveAiModels(): ModelDefinition[] {
  // Reverse completeness: every co-located transformers spec must be referenced by the
  // catalog exactly once (as a default or an alternate). Catches an orphaned or
  // double-listed model file before it silently distorts the derived catalog.
  const referenced = new Map<string, number>()
  for (const t of TASK_CATALOG) {
    referenced.set(t.defaultModel, (referenced.get(t.defaultModel) ?? 0) + 1)
    for (const id of t.alternates) referenced.set(id, (referenced.get(id) ?? 0) + 1)
  }
  const transformersIds = Object.values(modelSpecs)
    .filter((s) => s.family === 'transformers')
    .map((s) => s.id)
  const orphaned = transformersIds.filter((id) => !referenced.has(id))
  if (orphaned.length > 0) {
    throw new Error(`[transformers derive] co-located transformers spec(s) not referenced by TASK_CATALOG: ${orphaned.join(', ')}`)
  }
  const duplicated = [...referenced.entries()].filter(([, n]) => n > 1).map(([id]) => id)
  if (duplicated.length > 0) {
    throw new Error(`[transformers derive] model(s) referenced more than once in TASK_CATALOG: ${duplicated.join(', ')}`)
  }

  return TASK_CATALOG.map((t) => {
    const defaultSpec = specFor(t.defaultModel, 'default')
    const alternateModels: ModelOption[] = t.alternates.map((id) => {
      const s = specFor(id, 'alternate')
      return { id: s.id, name: s.name, size: s.size, license: s.license as string }
    })
    return {
      id: t.id,
      name: t.name,
      task: t.task,
      description: t.description,
      defaultModel: t.defaultModel,
      defaultSize: defaultSpec.size,
      defaultLicense: defaultSpec.license as string,
      alternateModels,
      supportsWebGPU: t.supportsWebGPU,
      category: t.category,
    }
  })
}
