import { describe, it, expect } from 'vitest'
import { isChatModel } from '@/services/ai/textGenFormat'
import { AI_MODELS } from '@/services/ai/AIInference'

/**
 * Locks the catalog<->worker contract: every text-generation model shipped in
 * AI_MODELS must be detected as a chat/instruct model so the worker prompts it
 * with the messages format (which lets transformers.js apply the tokenizer's
 * chat template). A catalog addition that isn't detected here would be prompted
 * as a raw completion model and produce garbage — which is exactly how the
 * base-named Qwen3 entries slipped through before this guard.
 */
describe('isChatModel', () => {
  it('detects chat/instruct models across naming conventions', () => {
    for (const id of [
      'Xenova/TinyLlama-1.1B-Chat-v1.0',
      'onnx-community/Qwen2.5-0.5B-Instruct',
      'onnx-community/Qwen3-0.6B-ONNX',
      'onnx-community/Qwen3-0.6B-heretic-abliterated-uncensored-ONNX',
      'HuggingFaceTB/SmolLM2-360M-Instruct',
      'onnx-community/Llama-3.2-1B-Instruct-ONNX',
      'onnx-community/gemma-3-1b-it-ONNX',
      'onnx-community/gemma-3-270m-it-ONNX',
      'onnx-community/Phi-4-mini-instruct-ONNX',
    ]) {
      expect(isChatModel(id), id).toBe(true)
    }
  })

  it('treats plain completion / non-chat models as non-chat', () => {
    for (const id of ['Xenova/gpt2', 'Xenova/distilgpt2', 'Xenova/flan-t5-small']) {
      expect(isChatModel(id), id).toBe(false)
    }
  })

  it('classifies every shipped text-generation model as a chat model', () => {
    const textGen = AI_MODELS.find((m) => m.id === 'text-generation')!
    const ids = [textGen.defaultModel, ...textGen.alternateModels.map((a) => a.id)]
    for (const id of ids) {
      expect(isChatModel(id), `${id} must be detected as a chat model`).toBe(true)
    }
  })
})
