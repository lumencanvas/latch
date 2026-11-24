import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { getCached, setCached, triggerFired, runModelInference, imageForInference, isSupportedImageInput } from '../shared'

const definition: NodeDefinition = {
  id: 'image-classification',
  name: 'Classify Image',
  version: '1.0.0',
  category: 'ai',
  description: 'Classify images using Vision Transformer',
  icon: 'scan',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'image', type: 'data', label: 'Image' },
    { id: 'trigger', type: 'trigger', label: 'Classify' },
  ],
  outputs: [
    { id: 'labels', type: 'data', label: 'Labels' },
    { id: 'topLabel', type: 'string', label: 'Top Label' },
    { id: 'topScore', type: 'number', label: 'Top Score' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'progress', type: 'number', label: 'Progress' },
    { id: 'done', type: 'trigger', label: 'Done' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'topK', type: 'number', label: 'Top K', default: 5, props: { min: 1, max: 10 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 30, props: { min: 1, max: 120 } },
  ],
  tags: ['image classification', 'classify', 'recognition', 'vit', 'vision', 'label', 'ai'],
  info: {
    overview: 'Classifies images using a Vision Transformer model and returns ranked labels with confidence scores. Outputs the top K predictions along with the highest-scoring label and its score. Useful for sorting, filtering, or reacting to visual content.',
    tips: [
      'Lower the Top K value to reduce noise when you only care about the most likely class.',
      'Connect the topLabel output to a Gate node to trigger actions only when a specific class is detected.',
    ],
    pairsWith: ['webcam', 'object-detection', 'image-captioning', 'gate'],
  },
}

// Declares its model need — `defineNode` derives the populated `model` select + the
// standardized loading/progress/done/error outputs (deduped against those already
// declared) from the globally-injected AI catalog resolver.
export const imageClassificationExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const imageInput = ctx.inputs.get('image')
  const trigger = ctx.inputs.get('trigger')
  const topK = (ctx.controls.get('topK') as number) ?? 5

  // Cheap type check every frame (for the error/clear paths); the expensive pixel readback
  // happens only on frames that actually start an inference (imageForInference).
  const supported = isSupportedImageInput(imageInput)

  // Run on an explicit trigger or after a frame interval, only with valid image data.
  const currentFrame = ctx.frameCount
  const lastFrame = getCached<number>(`${ctx.nodeId}:lastFrame`, 0)
  const interval = (ctx.controls.get('interval') as number) ?? 60
  const intervalElapsed = !lastFrame || (currentFrame - lastFrame) >= interval
  const fired = triggerFired(ctx.nodeId, trigger) // edge-deduped; a held trigger no longer loops
  const imageData = imageForInference(ctx, 'image-classification', imageInput, fired || intervalElapsed, fired)
  const shouldRun = !!imageData

  const { result, started, state } = runModelInference<Array<{ label: string; score: number }>>(ctx, outputs, {
    task: 'image-classification',
    shouldRun,
    infer: (modelId) => aiInference.classifyImage(imageData as ImageData, topK, modelId),
  })
  if (started) setCached(`${ctx.nodeId}:lastFrame`, currentFrame)

  const labels = result ?? []
  outputs.set('labels', labels)
  outputs.set('topLabel', labels[0]?.label ?? '')
  outputs.set('topScore', labels[0]?.score ?? 0)
  // A present-but-unconvertible image is a node input error (distinct from "no input").
  // Only when the model is loaded — otherwise "model not loaded" takes precedence.
  if (state !== 'not-loaded' && imageInput && !supported) {
    outputs.set('error', 'Unsupported image input type. Use Webcam Snapshot or Texture to Data node.')
  }
  return outputs
}

export default defineNode({ definition, executor: imageClassificationExecutor, models: [{ task: 'image-classification' }] })
