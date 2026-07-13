import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { getCached, setCached, hasTriggerValue, runModelInference, convertToImageData } from '../shared'

const definition: NodeDefinition = {
  id: 'object-detection',
  name: 'Detect Objects',
  version: '1.0.0',
  category: 'ai',
  description: 'Detect and locate objects in images',
  icon: 'box',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'image', type: 'data', label: 'Image' },
    { id: 'trigger', type: 'trigger', label: 'Detect' },
  ],
  outputs: [
    { id: 'objects', type: 'data', label: 'Objects' },
    { id: 'count', type: 'number', label: 'Count' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'progress', type: 'number', label: 'Progress' },
    { id: 'done', type: 'trigger', label: 'Done' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'threshold', type: 'slider', label: 'Threshold', default: 0.5, props: { min: 0.1, max: 1, step: 0.05 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 30, props: { min: 1, max: 120 } },
  ],
  tags: ['object detection', 'detect', 'yolo', 'bounding box', 'vision', 'ai'],
  info: {
    overview: 'Detects and locates objects in images using a transformer-based model. Returns a list of detected objects with bounding boxes, labels, and confidence scores. The threshold control filters out low-confidence detections.',
    tips: [
      'Lower the threshold to catch more objects at the cost of more false positives.',
      'Use the count output to trigger logic only when a certain number of objects are in the scene.',
    ],
    pairsWith: ['webcam', 'image-classification', 'mediapipe-object', 'gate'],
  },
}

// Declares its model need — `defineNode` derives the populated `model` select + the
// standardized loading/progress/done/error outputs (deduped against those already
// declared) from the globally-injected AI catalog resolver.
export const objectDetectionExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const imageInput = ctx.inputs.get('image')
  const trigger = ctx.inputs.get('trigger')
  const modelId = ctx.controls.get('model') as string | undefined
  const threshold = (ctx.controls.get('threshold') as number) ?? 0.5

  // Defer the (potentially expensive) image conversion until the model is loaded.
  const imageData = aiInference.isModelLoaded('object-detection', modelId)
    ? convertToImageData(imageInput)
    : null

  // Run on an explicit trigger or after a frame interval, only with valid image data.
  const currentFrame = ctx.frameCount
  const lastFrame = getCached<number>(`${ctx.nodeId}:lastFrame`, 0)
  const interval = (ctx.controls.get('interval') as number) ?? 60
  const intervalElapsed = !lastFrame || (currentFrame - lastFrame) >= interval
  const shouldRun = !!imageData && (hasTriggerValue(trigger) || intervalElapsed)

  const { result, started, state } = runModelInference<unknown[]>(ctx, outputs, {
    task: 'object-detection',
    shouldRun,
    infer: (m) => aiInference.detectObjects(imageData as ImageData, threshold, m),
  })
  if (started) setCached(`${ctx.nodeId}:lastFrame`, currentFrame)

  const objects = result ?? []
  outputs.set('objects', objects)
  outputs.set('count', objects.length)
  if (state !== 'not-loaded' && imageInput && !imageData) {
    outputs.set('error', 'Unsupported image input type. Use Webcam Snapshot or Texture to Data node.')
  }
  return outputs
}

export default defineNode({ definition, executor: objectDetectionExecutor, models: [{ task: 'object-detection' }] })
