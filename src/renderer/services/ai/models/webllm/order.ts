// Curated display order for the WebLLM catalog (tiny → large, families grouped).
// deriveWebllmCatalog() reproduces WEBLLM_MODELS in exactly this order; the derive
// throws if a co-located webllm *.model.ts is missing here (or vice-versa), and the
// deep-equal gate in tests/unit/registry/webllm-models.test.ts pins the result.
export const WEBLLM_MODEL_ORDER: readonly string[] = [
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  'Qwen3-0.6B-q4f16_1-MLC',
  'SmolLM2-360M-Instruct-q4f16_1-MLC',
  'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
  'OLMo-2-0425-1B-Instruct-q4f16_1-MLC',
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'Qwen3-1.7B-q4f16_1-MLC',
  'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
  'gemma-2-2b-it-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  'Qwen2.5-3B-Instruct-q4f16_1-MLC',
  'Hermes-3-Llama-3.2-3B-q4f16_1-MLC',
  'Qwen3-4B-q4f16_1-MLC',
  'Phi-3.5-mini-instruct-q4f16_1-MLC',
  'Phi-4-mini-instruct-q4f16_1-MLC',
  'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC',
  'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC',
  'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC',
  'Mistral-7B-Instruct-v0.3-q4f16_1-MLC',
  'Qwen2.5-7B-Instruct-q4f16_1-MLC',
  'Llama-3.1-8B-Instruct-q4f16_1-MLC',
] as const
