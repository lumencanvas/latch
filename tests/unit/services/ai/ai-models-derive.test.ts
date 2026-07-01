import { describe, it, expect } from 'vitest'
import { AI_MODELS } from '@/services/ai/AIInference'
import { AI_MODELS_BASELINE } from '../../../fixtures/ai-models.baseline'

/**
 * The AI_MODELS derive gate (POLICIES §1). `AI_MODELS` is no longer a hand-authored
 * literal — `deriveAiModels()` reconstructs it from the co-located
 * `models/transformers/*.model.ts` specs + `taskCatalog.ts`.
 *
 * `AI_MODELS_BASELINE` is the pre-derive array copied VERBATIM (whole objects) from
 * `git show c534c53:src/renderer/services/ai/AIInference.ts` — an anchor independent of
 * the per-model spec generation (it is the original object, not reconstructed from the
 * split specs), so a generation bug surfaces here as a deep-equal diff. `getModelSelectOptions()`
 * derives from `AI_MODELS`, so this deep-equal also pins the AI nodes' model-select options.
 */
describe('AI_MODELS derive gate', () => {
  it('deep-equals the frozen c534c53 baseline (per-task shape, defaults, ordered alternates)', () => {
    expect(AI_MODELS).toEqual(AI_MODELS_BASELINE)
  })

  it('every task derives defaultSize + defaultLicense from a real default-model spec', () => {
    // Guards fork-1a specifically: the wrapper never restates default size/license — they
    // come from the default model's own *.model.ts. A missing default spec would have thrown
    // in deriveAiModels(); this asserts the values are non-empty for every task.
    for (const def of AI_MODELS) {
      expect(def.defaultSize).toBeTruthy()
      expect(def.defaultLicense).toBeTruthy()
      expect(def.defaultModel).toBeTruthy()
    }
  })
})
