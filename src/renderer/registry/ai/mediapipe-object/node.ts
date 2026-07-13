import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { mediaPipeService } from '@/services/ai/MediaPipeService'
import { getCached, setCached } from '../shared'

import { markRaw } from 'vue'
import MediaPipeObjectNode from './MediaPipeObjectNode.vue'

const definition: NodeDefinition = {
  id: 'mediapipe-object',
  component: markRaw(MediaPipeObjectNode),
  name: 'Object Detection (MediaPipe)',
  version: '1.0.0',
  category: 'ai',
  description: 'Detect objects in video using MediaPipe EfficientDet',
  icon: 'scan',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'video', type: 'video', label: 'Video' },
  ],
  outputs: [
    { id: 'detections', type: 'data', label: 'Detections' },
    { id: 'count', type: 'number', label: 'Count' },
    { id: 'filtered', type: 'data', label: 'Filtered' },
    { id: 'topLabel', type: 'string', label: 'Top Label' },
    { id: 'topConfidence', type: 'number', label: 'Top Confidence' },
    { id: 'topBox', type: 'data', label: 'Top Bounding Box' },
    { id: 'detected', type: 'boolean', label: 'Detected' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    {
      id: 'enabled',
      type: 'toggle',
      label: 'Enabled',
      default: true,
    },
    {
      id: 'minConfidence',
      type: 'slider',
      label: 'Min Confidence',
      default: 0.5,
      props: { min: 0, max: 1, step: 0.05 },
    },
    {
      id: 'maxResults',
      type: 'slider',
      label: 'Max Results',
      default: 10,
      props: { min: 1, max: 20, step: 1 },
    },
    {
      id: 'labelFilter',
      type: 'text',
      label: 'Label Filter',
      default: '',
      props: { placeholder: 'e.g., person, car' },
    },
    {
      id: 'showOverlay',
      type: 'toggle',
      label: 'Overlay',
      default: true,
    },
    {
      id: 'overlayColor',
      type: 'color',
      label: 'Color',
      default: '#00ff00',
    },
    {
      id: 'lineWidth',
      type: 'slider',
      label: 'Line Width',
      default: 2,
      props: { min: 1, max: 5, step: 0.5 },
    },
    {
      id: 'showLabels',
      type: 'toggle',
      label: 'Show Labels',
      default: true,
    },
  ],
  tags: ['object detection', 'mediapipe', 'detect', 'realtime', 'vision', 'ai'],
  info: {
    overview: 'Detects objects in a video stream using the MediaPipe EfficientDet model. Returns bounding boxes, labels, and confidence scores for each detected object. Includes a label filter to focus on specific object categories.',
    tips: [
      'Use the label filter to restrict detections to only the categories you care about, like "person" or "car".',
      'Connect the topBox output to a Shader node to highlight the most confident detection visually.',
    ],
    pairsWith: ['webcam', 'object-detection', 'image-classification', 'gate'],
  },
}

export const mediapipeObjectExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true
  const minConfidence = (ctx.controls.get('minConfidence') as number) ?? 0.5
  const maxResults = (ctx.controls.get('maxResults') as number) ?? 10
  const labelFilter = (ctx.controls.get('labelFilter') as string) ?? ''

  if (!enabled || !videoInput) {
    outputs.set('detections', getCached(`${ctx.nodeId}:detections`, []))
    outputs.set('count', getCached(`${ctx.nodeId}:count`, 0))
    outputs.set('filtered', getCached(`${ctx.nodeId}:filtered`, []))
    outputs.set('topLabel', '')
    outputs.set('topConfidence', 0)
    outputs.set('topBox', null)
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('object'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('object')) {
    outputs.set('detections', [])
    outputs.set('count', 0)
    outputs.set('filtered', [])
    outputs.set('topLabel', '')
    outputs.set('topConfidence', 0)
    outputs.set('topBox', null)
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  try {
    const result = await mediaPipeService.detectObjects(videoInput, ctx.totalTime * 1000)

    if (!result || result.detections.length === 0) {
      outputs.set('detections', [])
      outputs.set('count', 0)
      outputs.set('filtered', [])
      outputs.set('topLabel', '')
      outputs.set('topConfidence', 0)
      outputs.set('topBox', null)
      outputs.set('detected', false)
      outputs.set('loading', false)
      return outputs
    }

    // Filter by confidence
    let detections = result.detections.filter(d =>
      d.categories.some(c => c.score >= minConfidence)
    )

    // Filter by label if specified
    const filterLabels = labelFilter.split(',').map(l => l.trim().toLowerCase()).filter(Boolean)
    if (filterLabels.length > 0) {
      detections = detections.filter(d =>
        d.categories.some(c => filterLabels.includes(c.categoryName.toLowerCase()))
      )
    }

    // Limit results
    detections = detections.slice(0, maxResults)

    // Get top detection
    const topDetection = detections[0]
    const topCategory = topDetection?.categories[0]

    setCached(`${ctx.nodeId}:detections`, detections)
    setCached(`${ctx.nodeId}:count`, detections.length)
    setCached(`${ctx.nodeId}:filtered`, detections)

    outputs.set('detections', detections)
    outputs.set('count', detections.length)
    outputs.set('filtered', detections)
    outputs.set('topLabel', topCategory?.categoryName || '')
    outputs.set('topConfidence', topCategory?.score || 0)
    outputs.set('topBox', topDetection?.boundingBox || null)
    outputs.set('detected', detections.length > 0)
    outputs.set('loading', false)
  } catch (error) {
    console.error('[MediaPipe Object] Detection error:', error)
    outputs.set('detections', getCached(`${ctx.nodeId}:detections`, []))
    outputs.set('count', 0)
    outputs.set('filtered', [])
    outputs.set('topLabel', '')
    outputs.set('topConfidence', 0)
    outputs.set('topBox', null)
    outputs.set('detected', false)
    outputs.set('loading', false)
    outputs.set('_error', error instanceof Error ? error.message : 'Detection failed')
  }

  return outputs
}

export default defineNode({ definition, executor: mediapipeObjectExecutor })
