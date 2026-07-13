import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { getCached, setCached, hasTriggerValue, runModelInference, convertToImageData } from '../shared'

const definition: NodeDefinition = {
  id: 'image-captioning',
  name: 'Caption Image',
  version: '1.0.0',
  category: 'ai',
  description: 'Generate captions for images',
  icon: 'image',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'image', type: 'data', label: 'Image' },
    { id: 'trigger', type: 'trigger', label: 'Caption' },
  ],
  outputs: [
    { id: 'caption', type: 'string', label: 'Caption' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'progress', type: 'number', label: 'Progress' },
    { id: 'done', type: 'trigger', label: 'Done' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 60, props: { min: 1, max: 300 } },
  ],
  tags: ['image captioning', 'caption', 'describe', 'vision', 'blip', 'ai'],
  info: {
    overview: 'Generates a natural language description of an image using a vision-language model. Takes image data as input and produces a text caption. The frame interval control limits how often captioning runs on video streams.',
    tips: [
      'Increase the frame interval when processing live video to reduce CPU and memory usage.',
      'Feed the caption output into Text Generate or Sentiment Analysis for further language processing.',
    ],
    pairsWith: ['webcam', 'image-classification', 'text-generation', 'sentiment-analysis'],
  },
}

// Declares its model need — `defineNode` derives the populated `model` select + the
// standardized loading/progress/done/error outputs (deduped against those already
// declared) from the globally-injected AI catalog resolver.
export const imageCaptioningExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const imageInput = ctx.inputs.get('image')
  const trigger = ctx.inputs.get('trigger')
  const modelId = ctx.controls.get('model') as string | undefined

  // Defer the (potentially expensive) image conversion until the model is loaded.
  const imageData = aiInference.isModelLoaded('image-to-text', modelId)
    ? convertToImageData(imageInput)
    : null

  // Run on an explicit trigger or after a frame interval, only with valid image data.
  const currentFrame = ctx.frameCount
  const lastFrame = getCached<number>(`${ctx.nodeId}:lastFrame`, 0)
  const interval = (ctx.controls.get('interval') as number) ?? 120
  const intervalElapsed = !lastFrame || (currentFrame - lastFrame) >= interval
  const shouldRun = !!imageData && (hasTriggerValue(trigger) || intervalElapsed)

  const { result, started, state } = runModelInference<string>(ctx, outputs, {
    task: 'image-to-text',
    shouldRun,
    infer: (modelId) => aiInference.captionImage(imageData as ImageData, modelId),
  })
  if (started) setCached(`${ctx.nodeId}:lastFrame`, currentFrame)

  outputs.set('caption', result ?? '')
  // A bad/absent image (once the model is loaded) clears the stale caption — the original
  // cleared caption unconditionally on any `!imageData`. The error only flags a *present*
  // unsupported input; an absent image is not an error ("model not loaded" wins while unloaded).
  if (state !== 'not-loaded' && !imageData) {
    outputs.set('caption', '')
    if (imageInput) {
      outputs.set('error', 'Unsupported image input type. Use Webcam Snapshot or Texture to Data node.')
    }
  }
  return outputs
}

export default defineNode({ definition, executor: imageCaptioningExecutor, models: [{ task: 'image-to-text' }] })
