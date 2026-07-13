import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { hasTriggerValue, runModelInference } from '../shared'

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

// Declares its model need — `defineNode` derives the populated `model` select + the
// standardized loading/progress/done/error outputs (deduped against those already
// declared) from the globally-injected AI catalog resolver.
export const textGenerationExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const trigger = ctx.inputs.get('trigger')

  // Get prompt from: 1) prompt input, 2) trigger value if string, 3) control
  let prompt = (ctx.inputs.get('prompt') as string) ?? ''

  // If trigger is a non-empty string and no prompt input, use trigger as prompt
  if (!prompt && typeof trigger === 'string' && trigger.trim()) {
    prompt = trigger
  }

  // Fall back to control value if still no prompt
  if (!prompt) {
    prompt = (ctx.controls.get('prompt') as string) ?? ''
  }

  const maxTokens = (ctx.controls.get('maxTokens') as number) ?? 50
  const temperature = (ctx.controls.get('temperature') as number) ?? 0.7

  // Generate only on an explicit trigger carrying a non-empty prompt; the shared
  // helper owns the model-loaded gate, the in-flight dedup, and the loading/progress/
  // done/error latching (previously open-coded here, with the error swallowed).
  const triggered = hasTriggerValue(trigger)
  const shouldRun = triggered && !!prompt.trim()
  const { result } = runModelInference<string>(ctx, outputs, {
    task: 'text-generation',
    shouldRun,
    infer: (modelId) => aiInference.generateText(prompt, { maxLength: maxTokens, temperature }, modelId),
  })

  // Preserve prior behavior: an explicit empty-prompt trigger clears the text;
  // otherwise serve the latest generation.
  outputs.set('text', triggered && !prompt.trim() ? '' : (result ?? ''))
  return outputs
}

export default defineNode({ definition, executor: textGenerationExecutor, models: [{ task: 'text-generation' }] })
