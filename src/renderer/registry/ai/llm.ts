import type { NodeDefinition } from '../types'

/**
 * WebLLM (MLC) model ids, verified present in `prebuiltAppConfig.model_list`
 * (2026-06). q4f16_1 variants — the practical browser sweet spot (~0.9–3.7 GB
 * VRAM). Llama-3.2-1B is the default (smallest, low-resource flag upstream).
 */
export const WEBLLM_MODELS = [
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B', size: '~0.9 GB' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 0.5B', size: '~0.9 GB' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 1.5B', size: '~1.6 GB' },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', name: 'SmolLM2 1.7B', size: '~1.8 GB' },
  { id: 'gemma-2-2b-it-q4f16_1-MLC', name: 'Gemma 2 2B', size: '~1.9 GB' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi-3.5 Mini', size: '~3.7 GB' },
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
