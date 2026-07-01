import type { NodeDefinition } from '../types'
import { withModelSelect } from './modelSelect'

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

// Gains a registry-populated `model` select via the shared AI-registry seam; the
// standardized model outputs it already declares dedup to no-ops. Default '' = the
// task default, so behavior is unchanged and old saved flows resolve the same way.
export const textGenerationNode: NodeDefinition = withModelSelect(definition, 'text-generation')
