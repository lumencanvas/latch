import type { NodeDefinition } from '../types'
import { deriveModelDefinition } from '@/engine/defineNode'
import { getModelSelectOptions } from '@/services/ai/AIInference'

const definition: NodeDefinition = {
  id: 'text-generation',
  name: 'Text Generate',
  version: '1.0.0',
  category: 'ai',
  description: 'Generate text using local language models',
  icon: 'message-square',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'prompt', type: 'string', label: 'Prompt' },
    { id: 'trigger', type: 'trigger', label: 'Generate' },
  ],
  outputs: [
    { id: 'text', type: 'string', label: 'Generated Text' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'progress', type: 'number', label: 'Progress' },
    { id: 'done', type: 'trigger', label: 'Done' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'prompt', type: 'text', label: 'Prompt', default: 'Once upon a time' },
    { id: 'maxTokens', type: 'number', label: 'Max Tokens', default: 50, props: { min: 10, max: 200 } },
    { id: 'temperature', type: 'slider', label: 'Temperature', default: 0.7, props: { min: 0.1, max: 2, step: 0.1 } },
  ],
  tags: ['text generation', 'llm', 'gpt', 'generate', 'language model', 'chat', 'ai'],
  info: {
    overview: 'Generates text using a local language model running in the browser. Takes a prompt and produces a completion with configurable length and temperature. Good for creative text, dialogue, or data augmentation tasks.',
    tips: [
      'Lower the temperature toward 0.1 for more predictable, deterministic outputs.',
      'Use String Template to build structured prompts from multiple inputs before feeding them in.',
    ],
    pairsWith: ['string-template', 'sentiment-analysis', 'speech-recognition', 'monitor'],
  },
}

// First AI node to flow through the A2 `models` derivation: the shared
// `deriveModelDefinition` appends the standardized model outputs (already declared
// here, so deduped to no-ops) and a registry-populated `model` select. Options are
// injected from the catalog (engine stays catalog-agnostic); default '' = the task
// default, so behavior is unchanged and old saved flows (no `model` control) resolve
// the same way — no `migrate()` needed. Full executor co-location remains Phase 6.
export const textGenerationNode: NodeDefinition = deriveModelDefinition(
  definition,
  [{ task: 'text-generation' }],
  (task) => ({ options: getModelSelectOptions(task), default: '' }),
)
