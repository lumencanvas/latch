import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { hasTriggerValue, runModelInference } from '../shared'

const definition: NodeDefinition = {
  id: 'text-transformation',
  name: 'Text Transform',
  version: '1.0.0',
  category: 'ai',
  description: 'Transform text - summarize, translate, or rewrite using T5/Flan models',
  icon: 'refresh-cw',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'text', type: 'string', label: 'Input Text' },
    { id: 'trigger', type: 'trigger', label: 'Transform' },
  ],
  outputs: [
    { id: 'result', type: 'string', label: 'Transformed Text' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'progress', type: 'number', label: 'Progress' },
    { id: 'done', type: 'trigger', label: 'Done' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'text', type: 'text', label: 'Input Text', default: '' },
    { id: 'task', type: 'select', label: 'Task', default: 'summarize', props: {
      options: [
        { value: 'summarize', label: 'Summarize' },
        { value: 'translate', label: 'Translate to French' },
        { value: 'paraphrase', label: 'Paraphrase' },
      ]
    }},
    { id: 'maxTokens', type: 'number', label: 'Max Tokens', default: 100, props: { min: 10, max: 500 } },
  ],
  tags: ['text transformation', 'summarize', 'translate', 'rewrite', 'paraphrase', 'ai'],
  info: {
    overview: 'Transforms text using T5/Flan models for summarization, translation, or paraphrasing. Select a task and the model rewrites the input accordingly. Runs locally in the browser with no external API calls.',
    tips: [
      'Increase max tokens for longer summaries or translations.',
      'Chain with String Template to add task-specific prefixes before the input text.',
    ],
    pairsWith: ['string-template', 'text-generation', 'sentiment-analysis', 'speech-recognition'],
  },
}

// Declares its model need — `defineNode` derives the populated `model` select + the
// standardized loading/progress/done/error outputs (deduped against those already
// declared) from the globally-injected AI catalog resolver.
export const textTransformationExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const trigger = ctx.inputs.get('trigger')

  // Get text from input or control
  let text = (ctx.inputs.get('text') as string) ?? ''
  if (!text) {
    text = (ctx.controls.get('text') as string) ?? ''
  }

  const taskName = (ctx.controls.get('task') as string) ?? 'summarize'
  const maxTokens = (ctx.controls.get('maxTokens') as number) ?? 100

  // Prepend the task instruction for T5/Flan models.
  let taskPrompt: string
  switch (taskName) {
    case 'summarize':
      taskPrompt = `summarize: ${text}`
      break
    case 'translate':
      taskPrompt = `translate English to French: ${text}`
      break
    case 'paraphrase':
      taskPrompt = `paraphrase: ${text}`
      break
    default:
      taskPrompt = text
  }

  // Transform only on an explicit trigger carrying non-empty text.
  const triggered = hasTriggerValue(trigger)
  const shouldRun = triggered && !!text.trim()
  const { result } = runModelInference<string>(ctx, outputs, {
    task: 'text2text-generation',
    shouldRun,
    infer: (modelId) => aiInference.text2text(taskPrompt, { maxLength: maxTokens }, modelId),
  })

  // Preserve prior behavior: empty/whitespace text clears the result unconditionally
  // (the original cleared on empty text regardless of trigger). Otherwise serve the latest.
  outputs.set('result', !text.trim() ? '' : (result ?? ''))
  return outputs
}

export default defineNode({ definition, executor: textTransformationExecutor, models: [{ task: 'text2text-generation' }] })
