import type { NodeDefinition } from '../types'

export const textTransformationNode: NodeDefinition = {
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
