/**
 * Prompt-format detection for in-browser text-generation models.
 *
 * Chat/instruct models must be prompted with the messages format so
 * transformers.js applies the model's tokenizer chat template; plain completion
 * models take a raw prompt. The worker only has the repo id (not the loaded
 * tokenizer config), so detection is by id substring. Keep this in sync with the
 * text-generation entries in `AI_MODELS` — `text-gen-format.test.ts` enforces
 * that every shipped text-gen model is detected as chat.
 */
export function isChatModel(modelId: string): boolean {
  const id = modelId.toLowerCase()
  return (
    id.includes('chat') ||
    id.includes('instruct') ||
    id.includes('llama') ||
    id.includes('qwen') || // Qwen2.5-Instruct + base-named Qwen3 (no "instruct" in id)
    id.includes('-it-') || // Gemma instruction-tuned (e.g. gemma-3-1b-it)
    id.includes('-it_') ||
    id.endsWith('-it') ||
    id.includes('phi-')
  )
}
