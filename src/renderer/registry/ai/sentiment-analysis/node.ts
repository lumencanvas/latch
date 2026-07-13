import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { getCached, setCached, hasTriggerValue, runModelInference } from '../shared'

const definition: NodeDefinition = {
  id: 'sentiment-analysis',
  name: 'Sentiment',
  version: '1.0.0',
  category: 'ai',
  description: 'Analyze text sentiment (positive/negative)',
  icon: 'smile',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'text', type: 'string', label: 'Text' },
    { id: 'trigger', type: 'trigger', label: 'Analyze' },
  ],
  outputs: [
    { id: 'sentiment', type: 'string', label: 'Sentiment' },
    { id: 'score', type: 'number', label: 'Score' },
    { id: 'positive', type: 'number', label: 'Positive' },
    { id: 'negative', type: 'number', label: 'Negative' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'progress', type: 'number', label: 'Progress' },
    { id: 'done', type: 'trigger', label: 'Done' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [],
  tags: ['sentiment', 'sentiment analysis', 'emotion', 'positive', 'negative', 'tone', 'nlp', 'ai'],
  info: {
    overview: 'Analyzes text and classifies it as positive or negative, outputting both a label and numeric scores. Returns separate positive and negative confidence values. Useful for monitoring tone in chat messages, reviews, or transcribed speech.',
    tips: [
      'Connect this after Speech to Text to get real-time sentiment from spoken input.',
      'Use the score output with an Expression node to create custom thresholds for sentiment-based branching.',
    ],
    pairsWith: ['speech-recognition', 'text-generation', 'string-template', 'expression'],
  },
}

// Declares its model need — `defineNode` derives the populated `model` select + the
// standardized loading/progress/done/error outputs (deduped against those already
// declared) from the globally-injected AI catalog resolver.
export const sentimentAnalysisExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const text = (ctx.inputs.get('text') as string) ?? ''
  const trigger = ctx.inputs.get('trigger')

  // Run on an explicit trigger or when the (non-empty) text changes.
  const textChanged = text !== getCached<string>(`${ctx.nodeId}:lastText`, '')
  const shouldRun = !!text.trim() && (hasTriggerValue(trigger) || textChanged)

  const { result, started } = runModelInference<Array<{ label: string; score: number }>>(ctx, outputs, {
    task: 'sentiment-analysis',
    shouldRun,
    infer: (modelId) => aiInference.analyzeSentiment(text, modelId),
  })
  if (started) setCached(`${ctx.nodeId}:lastText`, text)

  // Empty/whitespace text clears the outputs to zero — the original cleared these ports
  // unconditionally on empty text (independent of any trigger). Otherwise serve the latest.
  const results = !text.trim() ? [] : (result ?? [])
  let positive = 0
  let negative = 0
  for (const r of results) {
    if (r.label.toLowerCase().includes('positive')) positive = r.score
    else if (r.label.toLowerCase().includes('negative')) negative = r.score
  }
  outputs.set('sentiment', results[0]?.label ?? '')
  outputs.set('score', results[0]?.score ?? 0)
  outputs.set('positive', positive)
  outputs.set('negative', negative)
  return outputs
}

export default defineNode({ definition, executor: sentimentAnalysisExecutor, models: [{ task: 'sentiment-analysis' }] })
