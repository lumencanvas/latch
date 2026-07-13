import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { mediaPipeService } from '@/services/ai/MediaPipeService'
import { getCached, setCached, POSE_LANDMARKS } from '../shared'

import { markRaw } from 'vue'
import MediaPipePoseNode from './MediaPipePoseNode.vue'

const definition: NodeDefinition = {
  id: 'mediapipe-pose',
  component: markRaw(MediaPipePoseNode),
  name: 'Pose Estimation',
  version: '1.0.0',
  category: 'ai',
  description: 'Detect body pose landmarks using MediaPipe',
  icon: 'accessibility',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'video', type: 'video', label: 'Video' },
  ],
  outputs: [
    { id: 'landmarks', type: 'data', label: 'Landmarks (33 pts)' },
    { id: 'worldLandmarks', type: 'data', label: 'World Landmarks' },
    { id: 'visibility', type: 'data', label: 'Visibility' },
    // Key body points for easy access
    { id: 'nose', type: 'data', label: 'Nose' },
    { id: 'leftShoulder', type: 'data', label: 'Left Shoulder' },
    { id: 'rightShoulder', type: 'data', label: 'Right Shoulder' },
    { id: 'leftElbow', type: 'data', label: 'Left Elbow' },
    { id: 'rightElbow', type: 'data', label: 'Right Elbow' },
    { id: 'leftWrist', type: 'data', label: 'Left Wrist' },
    { id: 'rightWrist', type: 'data', label: 'Right Wrist' },
    { id: 'leftHip', type: 'data', label: 'Left Hip' },
    { id: 'rightHip', type: 'data', label: 'Right Hip' },
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
          { value: 'points', label: 'Points' },
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
      id: 'showVisibility',
      type: 'toggle',
      label: 'Fade by Visibility',
      default: true,
    },
  ],
  tags: ['pose estimation', 'mediapipe', 'pose', 'body', 'skeleton', 'landmarks', 'ai'],
  info: {
    overview: 'Detects 33 body pose landmarks from a video feed using MediaPipe Pose. Provides both normalized and world-space coordinates, per-landmark visibility scores, and convenient outputs for key body points like shoulders, elbows, and hips.',
    tips: [
      'Enable "Fade by Visibility" to make occluded or low-confidence landmarks less prominent in the overlay.',
      'Use the individual joint outputs like leftWrist directly instead of parsing the full landmarks array.',
    ],
    pairsWith: ['webcam', 'mediapipe-hand', 'mediapipe-face', 'shader'],
  },
}

export const mediapipePoseExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true

  if (!enabled || !videoInput) {
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('worldLandmarks', getCached(`${ctx.nodeId}:worldLandmarks`, []))
    outputs.set('visibility', getCached(`${ctx.nodeId}:visibility`, {}))
    outputs.set('nose', null)
    outputs.set('leftShoulder', null)
    outputs.set('rightShoulder', null)
    outputs.set('leftElbow', null)
    outputs.set('rightElbow', null)
    outputs.set('leftWrist', null)
    outputs.set('rightWrist', null)
    outputs.set('leftHip', null)
    outputs.set('rightHip', null)
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('pose'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('pose')) {
    outputs.set('landmarks', [])
    outputs.set('worldLandmarks', [])
    outputs.set('visibility', {})
    outputs.set('nose', null)
    outputs.set('leftShoulder', null)
    outputs.set('rightShoulder', null)
    outputs.set('leftElbow', null)
    outputs.set('rightElbow', null)
    outputs.set('leftWrist', null)
    outputs.set('rightWrist', null)
    outputs.set('leftHip', null)
    outputs.set('rightHip', null)
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  try {
    const result = await mediaPipeService.detectPose(videoInput, ctx.totalTime * 1000)

    if (!result || result.landmarks.length === 0) {
      outputs.set('landmarks', [])
      outputs.set('worldLandmarks', [])
      outputs.set('visibility', {})
      outputs.set('nose', null)
      outputs.set('leftShoulder', null)
      outputs.set('rightShoulder', null)
      outputs.set('leftElbow', null)
      outputs.set('rightElbow', null)
      outputs.set('leftWrist', null)
      outputs.set('rightWrist', null)
      outputs.set('leftHip', null)
      outputs.set('rightHip', null)
      outputs.set('detected', false)
      outputs.set('loading', false)
      return outputs
    }

    const landmarks = result.landmarks[0] || []
    const worldLandmarks = result.worldLandmarks[0] || []

    // Build visibility map
    const visibility: Record<string, number> = {}
    landmarks.forEach((lm, i) => {
      visibility[`landmark_${i}`] = (lm as { visibility?: number }).visibility ?? 1
    })

    // Extract key body points
    const getPoint = (idx: number) => landmarks[idx] || null

    setCached(`${ctx.nodeId}:landmarks`, landmarks)
    setCached(`${ctx.nodeId}:worldLandmarks`, worldLandmarks)
    setCached(`${ctx.nodeId}:visibility`, visibility)

    outputs.set('landmarks', landmarks)
    outputs.set('worldLandmarks', worldLandmarks)
    outputs.set('visibility', visibility)
    outputs.set('nose', getPoint(POSE_LANDMARKS.NOSE))
    outputs.set('leftShoulder', getPoint(POSE_LANDMARKS.LEFT_SHOULDER))
    outputs.set('rightShoulder', getPoint(POSE_LANDMARKS.RIGHT_SHOULDER))
    outputs.set('leftElbow', getPoint(POSE_LANDMARKS.LEFT_ELBOW))
    outputs.set('rightElbow', getPoint(POSE_LANDMARKS.RIGHT_ELBOW))
    outputs.set('leftWrist', getPoint(POSE_LANDMARKS.LEFT_WRIST))
    outputs.set('rightWrist', getPoint(POSE_LANDMARKS.RIGHT_WRIST))
    outputs.set('leftHip', getPoint(POSE_LANDMARKS.LEFT_HIP))
    outputs.set('rightHip', getPoint(POSE_LANDMARKS.RIGHT_HIP))
    outputs.set('detected', true)
    outputs.set('loading', false)
  } catch (error) {
    console.error('[MediaPipe Pose] Detection error:', error)
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('worldLandmarks', [])
    outputs.set('visibility', {})
    outputs.set('nose', null)
    outputs.set('leftShoulder', null)
    outputs.set('rightShoulder', null)
    outputs.set('leftElbow', null)
    outputs.set('rightElbow', null)
    outputs.set('leftWrist', null)
    outputs.set('rightWrist', null)
    outputs.set('leftHip', null)
    outputs.set('rightHip', null)
    outputs.set('detected', false)
    outputs.set('loading', false)
    outputs.set('_error', error instanceof Error ? error.message : 'Detection failed')
  }

  return outputs
}

export default defineNode({ definition, executor: mediapipePoseExecutor })
