import type { NodeDefinition } from '../types'

/**
 * WebLLM (MLC) model ids. All are q4f16_1 variants (the practical browser sweet
 * spot) and verified present in the installed `@mlc-ai/web-llm`
 * `prebuiltAppConfig.model_list`. Ordered roughly small → large, with coder and
 * reasoning families grouped. Sizes are approximate download/VRAM. Llama-3.2-1B
 * stays the default (smallest reliable, low-resource flag upstream). Mobile-class
 * GPUs realistically handle the ≤2 GB tier; 7-8B needs a desktop GPU.
 */
export const WEBLLM_MODELS = [
  // — tiny / mobile-friendly (≤ ~1 GB) —
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B', size: '~0.9 GB' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 0.5B', size: '~0.9 GB' },
  { id: 'Qwen3-0.6B-q4f16_1-MLC', name: 'Qwen3 0.6B', size: '~0.9 GB' },
  { id: 'SmolLM2-360M-Instruct-q4f16_1-MLC', name: 'SmolLM2 360M', size: '~0.4 GB' },
  { id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC', name: 'TinyLlama 1.1B', size: '~0.7 GB' },
  { id: 'OLMo-2-0425-1B-Instruct-q4f16_1-MLC', name: 'OLMo 2 1B', size: '~1.0 GB' },
  // — small (≤ ~2 GB) —
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 1.5B', size: '~1.6 GB' },
  { id: 'Qwen3-1.7B-q4f16_1-MLC', name: 'Qwen3 1.7B', size: '~1.8 GB' },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', name: 'SmolLM2 1.7B', size: '~1.8 GB' },
  { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma 2 2B', size: '~1.9 GB' },
  // — mid (≤ ~4 GB) —
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B', size: '~2.3 GB' },
  { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 3B', size: '~2.5 GB' },
  { id: 'Hermes-3-Llama-3.2-3B-q4f16_1-MLC', name: 'Hermes 3 (Llama 3.2 3B)', size: '~2.3 GB' },
  { id: 'Qwen3-4B-q4f16_1-MLC', name: 'Qwen3 4B', size: '~3.3 GB' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi-3.5 Mini', size: '~3.7 GB' },
  { id: 'Phi-4-mini-instruct-q4f16_1-MLC', name: 'Phi-4 Mini', size: '~3.7 GB' },
  // — coder —
  { id: 'Qwen2.5-Coder-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 Coder 0.5B', size: '~0.9 GB' },
  { id: 'Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 Coder 1.5B', size: '~1.6 GB' },
  { id: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 Coder 3B', size: '~2.5 GB' },
  { id: 'Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 Coder 7B', size: '~5.1 GB' },
  // — reasoning (DeepSeek-R1 distills emit <think> traces) —
  { id: 'DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC', name: 'DeepSeek R1 Distill 1.5B', size: '~1.6 GB' },
  { id: 'DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC', name: 'DeepSeek R1 Distill 7B', size: '~5.1 GB' },
  // — large (desktop GPU) —
  { id: 'Mistral-7B-Instruct-v0.3-q4f16_1-MLC', name: 'Mistral 7B v0.3', size: '~4.6 GB' },
  { id: 'Qwen2.5-7B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 7B', size: '~5.1 GB' },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', name: 'Llama 3.1 8B', size: '~5.0 GB' },
] as const

export const DEFAULT_WEBLLM_MODEL = WEBLLM_MODELS[0].id

export const llmNode: NodeDefinition = {
  id: 'llm',
  name: 'LLM (Streaming)',
  version: '1.0.0',
  category: 'ai',
  description: 'Stream text from a local WebGPU LLM (WebLLM / MLC)',
  icon: 'sparkles',
  platforms: ['web', 'electron'],
  requires: ['webgpu'],
  inputs: [
    { id: 'prompt', type: 'string', label: 'Prompt' },
    { id: 'system', type: 'string', label: 'System' },
    { id: 'trigger', type: 'trigger', label: 'Generate' },
  ],
  outputs: [
    { id: 'text', type: 'string', label: 'Text' },
    { id: 'generating', type: 'boolean', label: 'Generating' },
    { id: 'done', type: 'trigger', label: 'Done' },
    { id: 'supported', type: 'boolean', label: 'Supported' },
  ],
  controls: [
    {
      id: 'model',
      type: 'select',
      label: 'Model',
      default: DEFAULT_WEBLLM_MODEL,
      props: { options: WEBLLM_MODELS.map((m) => ({ value: m.id, label: `${m.name} (${m.size})` })) },
    },
    { id: 'prompt', type: 'text', label: 'Prompt', default: '' },
    { id: 'system', type: 'text', label: 'System Prompt', default: '' },
    { id: 'maxTokens', type: 'number', label: 'Max Tokens', default: 512, props: { min: 16, max: 4096 } },
    { id: 'temperature', type: 'slider', label: 'Temperature', default: 0.7, props: { min: 0, max: 2, step: 0.1 } },
  ],
  info: {
    overview:
      'Streams text from a full chat LLM running locally on your GPU via WebLLM (MLC). Pulse Generate to stream tokens into the Text output in real time. Requires WebGPU (Chrome/Edge desktop, or other WebGPU-capable browsers); without it the Supported output is false. Weights download once (~1–4 GB) and are cached.',
    tips: [
      'Start with Llama 3.2 1B — it is the smallest/fastest; larger models need more VRAM.',
      'Wire a Retrieve node’s Context into the Prompt (or System) to ground answers in your own documents (RAG).',
      'Watch the Generating output to drive a "thinking" indicator; Done pulses when the stream finishes.',
    ],
    pairsWith: ['retrieve', 'vector-memory', 'feature-extraction', 'template'],
  },
}
