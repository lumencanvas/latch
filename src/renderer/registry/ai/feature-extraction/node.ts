import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { getCached, setCached, hasTriggerValue, runModelInference } from '../shared'

const definition: NodeDefinition = {
  id: 'feature-extraction',
  name: 'Text Embed',
  version: '1.0.0',
  category: 'ai',
  description: 'Convert text to embedding vectors',
  icon: 'hash',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'text', type: 'string', label: 'Text' },
    { id: 'trigger', type: 'trigger', label: 'Extract' },
  ],
  outputs: [
    { id: 'embedding', type: 'data', label: 'Embedding' },
    { id: 'dimensions', type: 'number', label: 'Dimensions' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'progress', type: 'number', label: 'Progress' },
    { id: 'done', type: 'trigger', label: 'Done' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [],
  tags: ['text embed', 'feature extraction', 'embedding', 'embed', 'vector', 'similarity', 'nlp', 'ai'],
  info: {
    overview: 'Converts text into a numeric embedding vector using a transformer model. The resulting high-dimensional vector captures semantic meaning, making it useful for similarity comparisons and clustering. Runs entirely in the browser.',
    tips: [
      'Connect the trigger input to control when extraction runs, since it can be computationally expensive.',
      'Use the dimensions output to verify the embedding size matches what downstream nodes expect.',
    ],
    pairsWith: ['sentiment-analysis', 'string-template', 'text-generation', 'monitor'],
  },
}

// Declares its model need — `defineNode` derives the populated `model` select + the
// standardized loading/progress/done/error outputs (deduped against those already
// declared) from the globally-injected AI catalog resolver.
export const featureExtractionExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const text = (ctx.inputs.get('text') as string) ?? ''
  const trigger = ctx.inputs.get('trigger')

  // Run on an explicit trigger or when the (non-empty) text changes.
  const textChanged = text !== getCached<string>(`${ctx.nodeId}:lastText`, '')
  const shouldRun = !!text.trim() && (hasTriggerValue(trigger) || textChanged)

  const { result, started } = runModelInference<number[]>(ctx, outputs, {
    task: 'feature-extraction',
    shouldRun,
    infer: (modelId) => aiInference.extractFeatures(text, modelId),
  })
  if (started) setCached(`${ctx.nodeId}:lastText`, text)

  // Empty/whitespace text clears the embedding to [] — the original cleared unconditionally
  // on empty text (independent of any trigger). Otherwise serve the latest.
  const embedding = !text.trim() ? [] : (result ?? [])
  outputs.set('embedding', embedding)
  outputs.set('dimensions', embedding.length)
  return outputs
}

export default defineNode({ definition, executor: featureExtractionExecutor, models: [{ task: 'feature-extraction' }] })
