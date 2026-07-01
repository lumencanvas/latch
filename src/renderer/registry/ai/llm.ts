import type { NodeDefinition } from '../types'
import { deriveWebllmCatalog } from '../../services/ai/models/webllm/derive'

/**
 * WebLLM (MLC) model catalog — derived from the co-located `*.model.ts` specs under
 * `services/ai/models/webllm/` (EXTENSIBILITY §8; the first catalog turned into
 * derived data). All are q4f16_1 variants (the practical browser sweet spot) verified
 * present in the installed `@mlc-ai/web-llm` `prebuiltAppConfig.model_list`. The
 * curated order (tiny → large, coder + reasoning families grouped) lives in
 * `models/webllm/order.ts`; Llama-3.2-1B stays first, so `DEFAULT_WEBLLM_MODEL` is
 * unchanged. Mobile-class GPUs realistically handle the ≤2 GB tier; 7-8B needs a
 * desktop GPU. Adding a model = drop one `*.model.ts` + append its id to `order.ts`.
 */
export const WEBLLM_MODELS = deriveWebllmCatalog()

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
  tags: ['llm', 'language model', 'chat', 'webllm', 'gpt', 'generate', 'ai'],
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
