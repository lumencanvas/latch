import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { mediaPipeService } from '@/services/ai/MediaPipeService'
import { getCached, setCached } from '../shared'

import { markRaw } from 'vue'
import MediaPipeGestureNode from './MediaPipeGestureNode.vue'

const definition: NodeDefinition = {
  id: 'mediapipe-gesture',
  component: markRaw(MediaPipeGestureNode),
  name: 'Gesture Recognition',
  version: '1.0.0',
  category: 'ai',
  description: 'Recognize hand gestures using MediaPipe',
  icon: 'hand',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'video', type: 'video', label: 'Video' },
  ],
  outputs: [
    { id: 'gesture', type: 'string', label: 'Gesture' },
    { id: 'confidence', type: 'number', label: 'Confidence' },
    { id: 'landmarks', type: 'data', label: 'Landmarks' },
    { id: 'handedness', type: 'string', label: 'Hand' },
    { id: 'handCount', type: 'number', label: 'Hand Count' },
    { id: 'allGestures', type: 'data', label: 'All Gestures' },
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
      id: 'showOverlay',
      type: 'toggle',
      label: 'Show Overlay',
      default: true,
    },
    {
      id: 'overlayColor',
      type: 'color',
      label: 'Overlay Color',
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
      id: 'confidenceThreshold',
      type: 'slider',
      label: 'Min Confidence',
      default: 0.5,
      props: { min: 0, max: 1, step: 0.05 },
    },
  ],
  tags: ['gesture recognition', 'mediapipe', 'gesture', 'hand', 'ai'],
  info: {
    overview: 'Recognizes hand gestures from a video feed using MediaPipe. Identifies common gestures like thumbs up, open palm, and pointing, and outputs the gesture name, confidence, and hand landmarks. Can track multiple hands simultaneously.',
    tips: [
      'Increase the min confidence threshold to reduce false positives in noisy environments.',
      'Use the gesture string output with a Gate node to trigger different actions for different gestures.',
    ],
    pairsWith: ['webcam', 'mediapipe-hand', 'gate', 'monitor'],
  },
}

export const mediapipeGestureExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true
  const confidenceThreshold = (ctx.controls.get('confidenceThreshold') as number) ?? 0.5

  if (!enabled || !videoInput) {
    outputs.set('gesture', 'None')
    outputs.set('confidence', 0)
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('handedness', '')
    outputs.set('handCount', 0)
    outputs.set('allGestures', [])
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('gesture'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('gesture')) {
    outputs.set('gesture', getCached(`${ctx.nodeId}:gesture`, 'None'))
    outputs.set('confidence', getCached(`${ctx.nodeId}:confidence`, 0))
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('handedness', '')
    outputs.set('handCount', 0)
    outputs.set('allGestures', [])
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  try {
    const result = await mediaPipeService.recognizeGestures(videoInput, ctx.totalTime * 1000)

    if (!result || result.gestures.length === 0) {
      setCached(`${ctx.nodeId}:detected`, false)
      outputs.set('gesture', 'None')
      outputs.set('confidence', 0)
      outputs.set('landmarks', [])
      outputs.set('handedness', '')
      outputs.set('handCount', 0)
      outputs.set('allGestures', [])
      outputs.set('detected', false)
      outputs.set('loading', false)
      return outputs
    }

    // Build all gestures data for visualization
    const allGestures = result.gestures.map((gestureArray, i) => {
      const topGesture = gestureArray[0]
      return {
        gesture: topGesture?.categoryName || 'None',
        confidence: topGesture?.score || 0,
        handedness: result.handedness[i]?.categoryName || '',
        landmarks: result.landmarks[i] || [],
      }
    }).filter(g => g.confidence >= confidenceThreshold)

    // Get top gesture from first hand
    const topGesture = result.gestures[0]?.[0]
    const topGestureName = topGesture?.categoryName || 'None'
    const topConfidence = topGesture?.score || 0

    setCached(`${ctx.nodeId}:gesture`, topGestureName)
    setCached(`${ctx.nodeId}:confidence`, topConfidence)
    setCached(`${ctx.nodeId}:landmarks`, result.landmarks[0] || [])
    setCached(`${ctx.nodeId}:allGestures`, allGestures)
    setCached(`${ctx.nodeId}:detected`, topGestureName !== 'None')

    outputs.set('gesture', topGestureName)
    outputs.set('confidence', topConfidence)
    outputs.set('landmarks', result.landmarks[0] || [])
    outputs.set('handedness', result.handedness[0]?.categoryName || '')
    outputs.set('handCount', result.landmarks.length)
    outputs.set('allGestures', allGestures)
    outputs.set('detected', topGestureName !== 'None' && topConfidence >= confidenceThreshold)
    outputs.set('loading', false)
  } catch (error) {
    console.error('[MediaPipe Gesture] Recognition error:', error)
    outputs.set('gesture', getCached(`${ctx.nodeId}:gesture`, 'None'))
    outputs.set('confidence', 0)
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('handedness', '')
    outputs.set('handCount', 0)
    outputs.set('allGestures', [])
    outputs.set('detected', false)
    outputs.set('loading', false)
    outputs.set('_error', error instanceof Error ? error.message : 'Recognition failed')
  }

  return outputs
}

export default defineNode({ definition, executor: mediapipeGestureExecutor })
