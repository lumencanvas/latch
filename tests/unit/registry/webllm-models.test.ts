import { describe, it, expect } from 'vitest'
import { WEBLLM_MODELS, DEFAULT_WEBLLM_MODEL, llmNode } from '@/registry/ai/llm'

/**
 * The WebLLM model catalog is curated from the installed @mlc-ai/web-llm
 * prebuiltAppConfig. These tests pin its shape so an id can't silently rot.
 */
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
