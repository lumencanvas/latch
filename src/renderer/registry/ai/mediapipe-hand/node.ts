import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { mediaPipeService, extractFingerTips, recognizeGesture } from '@/services/ai/MediaPipeService'
import { getCached, setCached } from '../shared'

import { markRaw } from 'vue'
import MediaPipeHandNode from './MediaPipeHandNode.vue'

const definition: NodeDefinition = {
  id: 'mediapipe-hand',
  component: markRaw(MediaPipeHandNode),
  name: 'Hand Tracking',
  version: '1.0.0',
  category: 'ai',
  description: 'Detect and track hand landmarks using MediaPipe',
  icon: 'hand',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'video', type: 'video', label: 'Video' },
  ],
  outputs: [
    { id: 'landmarks', type: 'data', label: 'Landmarks' },
    { id: 'worldLandmarks', type: 'data', label: 'World Landmarks' },
    { id: 'handedness', type: 'string', label: 'Handedness' },
    { id: 'confidence', type: 'number', label: 'Confidence' },
    { id: 'gestureType', type: 'string', label: 'Gesture' },
    { id: 'fingerTips', type: 'data', label: 'Finger Tips' },
    { id: 'handCount', type: 'number', label: 'Hand Count' },
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
      id: 'handIndex',
      type: 'slider',
      label: 'Hand Index',
      default: 0,
      props: { min: 0, max: 1, step: 1 },
    },
    {
      id: 'showOverlay',
      type: 'toggle',
      label: 'Overlay',
      default: true,
    },
    {
      id: 'vizMode',
      type: 'select',
      label: 'Style',
      default: 'skeleton',
      props: {
        options: [
          { value: 'skeleton', label: 'Skeleton' },
          { value: 'mesh', label: 'Mesh' },
          { value: 'both', label: 'Both' },
          { value: 'bbox', label: 'Bounding Box' },
        ],
      },
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
      id: 'pointSize',
      type: 'slider',
      label: 'Point Size',
      default: 4,
      props: { min: 2, max: 10, step: 1 },
    },
    {
      id: 'colorByHand',
      type: 'toggle',
      label: 'Color by Hand',
      default: true,
    },
  ],
  tags: ['hand tracking', 'mediapipe', 'hand', 'landmarks', 'gesture', 'fingers', 'ai'],
  info: {
    overview: 'Tracks hand landmarks in real time from a video feed using MediaPipe. Outputs 21 landmark points per hand, world-space coordinates, handedness, and fingertip positions. Supports multiple visualization modes including skeleton, mesh, and bounding box.',
    tips: [
      'Use the fingerTips output to get just the five fingertip positions without parsing the full landmark array.',
      'Enable "Color by Hand" to visually distinguish left and right hands in the overlay.',
    ],
    pairsWith: ['webcam', 'mediapipe-gesture', 'mediapipe-pose', 'shader'],
  },
}

export const mediapipeHandExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true
  const handIndex = (ctx.controls.get('handIndex') as number) ?? 0

  if (!enabled || !videoInput) {
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('worldLandmarks', getCached(`${ctx.nodeId}:worldLandmarks`, []))
    outputs.set('handedness', getCached(`${ctx.nodeId}:handedness`, ''))
    outputs.set('confidence', getCached(`${ctx.nodeId}:confidence`, 0))
    outputs.set('gestureType', getCached(`${ctx.nodeId}:gestureType`, 'unknown'))
    outputs.set('fingerTips', getCached(`${ctx.nodeId}:fingerTips`, null))
    outputs.set('handCount', getCached(`${ctx.nodeId}:handCount`, 0))
    outputs.set('allHands', getCached(`${ctx.nodeId}:allHands`, []))
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('hand'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('hand')) {
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('worldLandmarks', getCached(`${ctx.nodeId}:worldLandmarks`, []))
    outputs.set('handedness', '')
    outputs.set('confidence', 0)
    outputs.set('gestureType', 'unknown')
    outputs.set('fingerTips', null)
    outputs.set('handCount', 0)
    outputs.set('allHands', getCached(`${ctx.nodeId}:allHands`, []))
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  try {
    const result = await mediaPipeService.detectHands(videoInput, ctx.totalTime * 1000)

    if (!result || result.landmarks.length === 0) {
      setCached(`${ctx.nodeId}:detected`, false)
      setCached(`${ctx.nodeId}:handCount`, 0)
      setCached(`${ctx.nodeId}:allHands`, [])
      outputs.set('landmarks', [])
      outputs.set('worldLandmarks', [])
      outputs.set('handedness', '')
      outputs.set('confidence', 0)
      outputs.set('gestureType', 'unknown')
      outputs.set('fingerTips', null)
      outputs.set('handCount', 0)
      outputs.set('allHands', [])
      outputs.set('detected', false)
      outputs.set('loading', false)
      return outputs
    }

    // Get the selected hand (for individual outputs)
    const idx = Math.min(handIndex, result.landmarks.length - 1)
    const landmarks = result.landmarks[idx] || []
    const worldLandmarks = result.worldLandmarks[idx] || []
    const handedness = result.handedness[idx]?.categoryName || ''
    const confidence = result.handedness[idx]?.score || 0

    // Extract gesture and finger tips
    const gestureType = recognizeGesture(landmarks)
    const fingerTips = extractFingerTips(landmarks)

    // Build all hands data for visualization
    const allHands = result.landmarks.map((lm, i) => ({
      landmarks: lm,
      worldLandmarks: result.worldLandmarks[i] || [],
      handedness: result.handedness[i]?.categoryName || '',
      confidence: result.handedness[i]?.score || 0,
    }))

    setCached(`${ctx.nodeId}:landmarks`, landmarks)
    setCached(`${ctx.nodeId}:worldLandmarks`, worldLandmarks)
    setCached(`${ctx.nodeId}:handedness`, handedness)
    setCached(`${ctx.nodeId}:confidence`, confidence)
    setCached(`${ctx.nodeId}:gestureType`, gestureType)
    setCached(`${ctx.nodeId}:fingerTips`, fingerTips)
    setCached(`${ctx.nodeId}:handCount`, result.landmarks.length)
    setCached(`${ctx.nodeId}:allHands`, allHands)
    setCached(`${ctx.nodeId}:detected`, true)

    outputs.set('landmarks', landmarks)
    outputs.set('worldLandmarks', worldLandmarks)
    outputs.set('handedness', handedness)
    outputs.set('confidence', confidence)
    outputs.set('gestureType', gestureType)
    outputs.set('fingerTips', fingerTips)
    outputs.set('handCount', result.landmarks.length)
    outputs.set('allHands', allHands)
    outputs.set('detected', true)
    outputs.set('loading', false)
  } catch (error) {
    console.error('[MediaPipe Hand] Detection error:', error)
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('worldLandmarks', getCached(`${ctx.nodeId}:worldLandmarks`, []))
    outputs.set('handedness', '')
    outputs.set('confidence', 0)
    outputs.set('gestureType', 'unknown')
    outputs.set('fingerTips', null)
    outputs.set('handCount', 0)
    outputs.set('allHands', getCached(`${ctx.nodeId}:allHands`, []))
    outputs.set('detected', false)
    outputs.set('loading', false)
    outputs.set('_error', error instanceof Error ? error.message : 'Detection failed')
  }

  return outputs
}

export default defineNode({ definition, executor: mediapipeHandExecutor })
