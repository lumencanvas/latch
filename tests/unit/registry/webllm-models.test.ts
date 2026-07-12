import { describe, it, expect } from 'vitest'
import { WEBLLM_MODELS, DEFAULT_WEBLLM_MODEL, llmNode } from '@/registry/ai/llm/node'
import { WEBLLM_MODEL_ORDER } from '@/services/ai/models/webllm/order'

/**
 * The WebLLM model catalog is curated from the installed @mlc-ai/web-llm
 * prebuiltAppConfig. These tests pin its shape so an id can't silently rot.
 */

/**
 * The derive gate (POLICIES §1). `WEBLLM_MODELS` is no longer a hand-authored
 * literal — it is derived from the co-located `*.model.ts` specs. This snapshot is
 * the intended catalog: the hand-authored array from `registry/ai/llm.ts` at commit
 * `c534c53` (verified byte-identical) MINUS `DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC`,
 * which the external anchor below flagged as absent from the installed `@mlc-ai/web-llm`
 * 0.2.84 (a dead id that would fail to load — removed). The derived catalog must
 * deep-equal this (same ids, names, sizes, and exact curated order). A typo in any
 * `*.model.ts`, a missing spec, or a reordered `order.ts` reds this.
 *
 * NOTE on independence: the snapshot and the `*.model.ts` files were both seeded from
 * the same source array, so this deep-equal alone can't catch a hypothetical common
 * generation-time error. The `external anchor` test below closes that gap for ids —
 * it checks every id against the installed `@mlc-ai/web-llm` `prebuiltAppConfig`,
 * a source with no shared provenance — which is the drift that actually matters (a
 * wrong id fails to load; a wrong size/name is cosmetic).
 */
const EXPECTED_WEBLLM_MODELS = [
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B', size: '~0.9 GB' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 0.5B', size: '~0.9 GB' },
  { id: 'Qwen3-0.6B-q4f16_1-MLC', name: 'Qwen3 0.6B', size: '~0.9 GB' },
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', name: 'SmolLM2 360M', size: '~0.4 GB' },
  { id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC', name: 'TinyLlama 1.1B', size: '~0.7 GB' },
  { id: 'OLMo-2-0425-1B-Instruct-q4f16_1-MLC', name: 'OLMo 2 1B', size: '~1.0 GB' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 1.5B', size: '~1.6 GB' },
  { id: 'Qwen3-1.7B-q4f16_1-MLC', name: 'Qwen3 1.7B', size: '~1.8 GB' },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', name: 'SmolLM2 1.7B', size: '~1.8 GB' },
  { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma 2 2B', size: '~1.9 GB' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B', size: '~2.3 GB' },
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 3B', size: '~2.5 GB' },
  { id: 'Hermes-3-Llama-3.2-3B-q4f16_1-MLC', name: 'Hermes 3 (Llama 3.2 3B)', size: '~2.3 GB' },
  { id: 'Qwen3-4B-q4f16_1-MLC', name: 'Qwen3 4B', size: '~3.3 GB' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi-3.5 Mini', size: '~3.7 GB' },
  { id: 'Phi-4-mini-instruct-q4f16_1-MLC', name: 'Phi-4 Mini', size: '~3.7 GB' },
  { id: 'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 Coder 0.5B', size: '~0.9 GB' },
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 Coder 1.5B', size: '~1.6 GB' },
  { id: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 Coder 3B', size: '~2.5 GB' },
  { id: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 Coder 7B', size: '~5.1 GB' },
  { id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC', name: 'DeepSeek R1 Distill 7B', size: '~5.1 GB' },
  { id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC', name: 'Mistral 7B v0.3', size: '~4.6 GB' },
  { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 7B', size: '~5.1 GB' },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', name: 'Llama 3.1 8B', size: '~5.0 GB' },
]

describe('WEBLLM_MODELS derive gate', () => {
  it('the derived catalog deep-equals the pre-derive snapshot (ids, names, sizes, order)', () => {
    expect(WEBLLM_MODELS).toEqual(EXPECTED_WEBLLM_MODELS)
  })

  it('the curated order list matches the derived catalog order', () => {
    expect(WEBLLM_MODEL_ORDER).toEqual(EXPECTED_WEBLLM_MODELS.map((m) => m.id))
  })

  it('external anchor: every derived id exists in the installed @mlc-ai/web-llm prebuiltAppConfig', async () => {
    // Truly independent of the snapshot/spec provenance: MLC's own model list. A
    // mistyped or hallucinated id (the one drift that breaks model loading) reds here.
    const { prebuiltAppConfig } = await import('@mlc-ai/web-llm')
    const upstream = new Set(prebuiltAppConfig.model_list.map((m) => m.model_id))
    const missing = WEBLLM_MODELS.filter((m) => !upstream.has(m.id)).map((m) => m.id)
    expect(missing).toEqual([])
  })
})
describe('WEBLLM_MODELS catalog', () => {
  it('offers a broad, well-formed q4f16_1 selection', () => {
    expect(WEBLLM_MODELS.length).toBeGreaterThanOrEqual(20)
    for (const m of WEBLLM_MODELS) {
      expect(m.id).toMatch(/-MLC$/) // MLC-compiled id
      expect(m.id).toContain('q4f16_1') // the browser sweet-spot quant
      expect(m.name).toBeTruthy()
      expect(m.size).toMatch(/GB|MB/)
    }
  })

  it('has unique ids and unique names', () => {
    const ids = WEBLLM_MODELS.map((m) => m.id)
    const names = WEBLLM_MODELS.map((m) => m.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('defaults to the smallest reliable model (Llama 3.2 1B) and it is in the list', () => {
    expect(DEFAULT_WEBLLM_MODEL).toBe('Llama-3.2-1B-Instruct-q4f16_1-MLC')
    expect(WEBLLM_MODELS.some((m) => m.id === DEFAULT_WEBLLM_MODEL)).toBe(true)
  })

  it('spans tiny → large and includes coder + reasoning families', () => {
    const ids = WEBLLM_MODELS.map((m) => m.id).join('|')
    expect(ids).toMatch(/SmolLM2-360M/) // sub-GB tier
    expect(ids).toMatch(/Qwen2.5-Coder/) // coder family
    expect(ids).toMatch(/DeepSeek-R1-Distill/) // reasoning family
    expect(ids).toMatch(/Qwen3-/) // current-gen
    expect(ids).toMatch(/8B|7B/) // a desktop-GPU tier exists
  })

  it('surfaces every model in the node’s select control', () => {
    const control = llmNode.controls.find((c) => c.id === 'model')
    const options = (control?.props as { options: Array<{ value: string }> }).options
    expect(options).toHaveLength(WEBLLM_MODELS.length)
    expect(options[0].value).toBe(DEFAULT_WEBLLM_MODEL)
  })
})
