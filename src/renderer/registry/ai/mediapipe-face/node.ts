import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { mediaPipeService, extractHeadRotation, calculateFaceBox, extractBlendshapeValues } from '@/services/ai/MediaPipeService'
import { getCached, setCached } from '../shared'

import { markRaw } from 'vue'
import MediaPipeFaceNode from './MediaPipeFaceNode.vue'

const definition: NodeDefinition = {
  id: 'mediapipe-face',
  component: markRaw(MediaPipeFaceNode),
  name: 'Face Mesh',
  version: '1.0.0',
  category: 'ai',
  description: 'Detect face landmarks and blendshapes using MediaPipe',
  icon: 'smile',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'video', type: 'video', label: 'Video' },
  ],
  outputs: [
    { id: 'landmarks', type: 'data', label: 'Landmarks (468 pts)' },
    { id: 'blendshapes', type: 'data', label: 'Blendshapes' },
    { id: 'headRotation', type: 'data', label: 'Head Rotation' },
    { id: 'pitch', type: 'number', label: 'Pitch' },
    { id: 'yaw', type: 'number', label: 'Yaw' },
    { id: 'roll', type: 'number', label: 'Roll' },
    { id: 'faceBox', type: 'data', label: 'Face Box' },
    { id: 'mouthOpen', type: 'number', label: 'Mouth Open' },
    { id: 'eyeBlinkLeft', type: 'number', label: 'Eye Blink L' },
    { id: 'eyeBlinkRight', type: 'number', label: 'Eye Blink R' },
    { id: 'browRaise', type: 'number', label: 'Brow Raise' },
    { id: 'smile', type: 'number', label: 'Smile' },
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
      id: 'overlayColor',
      type: 'color',
      label: 'Color',
      default: '#00ff00',
    },
    {
      id: 'lineWidth',
      type: 'slider',
      label: 'Line Width',
      default: 1,
      props: { min: 0.5, max: 3, step: 0.5 },
    },
    {
      id: 'meshMode',
      type: 'select',
      label: 'Style',
      default: 'mesh',
      props: {
        options: [
          { value: 'mesh', label: 'Mesh' },
          { value: 'contours', label: 'Contours' },
          { value: 'points', label: 'Points' },
          { value: 'bbox', label: 'Bounding Box' },
        ],
      },
    },
    {
      id: 'showExpressions',
      type: 'toggle',
      label: 'Show Expressions',
      default: true,
    },
  ],
  tags: ['face mesh', 'mediapipe', 'face', 'landmarks', 'blendshapes', 'ai'],
  info: {
    overview: 'Detects 468 face landmarks and blendshapes from a video feed using MediaPipe Face Mesh. Provides head rotation angles, individual expression values like mouth open and eye blink, and multiple visualization styles. Runs in real time in the browser.',
    tips: [
      'Use the blendshape outputs like smile or mouthOpen to drive parameters in a Shader node.',
      'Switch the overlay style to "contours" for a cleaner visualization that highlights facial outlines only.',
    ],
    pairsWith: ['webcam', 'mediapipe-hand', 'mediapipe-pose', 'shader'],
  },
}

export const mediapipeFaceExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true

  if (!enabled || !videoInput) {
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('blendshapes', getCached(`${ctx.nodeId}:blendshapes`, {}))
    outputs.set('headRotation', getCached(`${ctx.nodeId}:headRotation`, null))
    outputs.set('pitch', 0)
    outputs.set('yaw', 0)
    outputs.set('roll', 0)
    outputs.set('faceBox', getCached(`${ctx.nodeId}:faceBox`, null))
    outputs.set('mouthOpen', 0)
    outputs.set('eyeBlinkLeft', 0)
    outputs.set('eyeBlinkRight', 0)
    outputs.set('browRaise', 0)
    outputs.set('smile', 0)
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('face'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('face')) {
    outputs.set('landmarks', [])
    outputs.set('blendshapes', {})
    outputs.set('headRotation', null)
    outputs.set('pitch', 0)
    outputs.set('yaw', 0)
    outputs.set('roll', 0)
    outputs.set('faceBox', null)
    outputs.set('mouthOpen', 0)
    outputs.set('eyeBlinkLeft', 0)
    outputs.set('eyeBlinkRight', 0)
    outputs.set('browRaise', 0)
    outputs.set('smile', 0)
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  try {
    const result = await mediaPipeService.detectFace(videoInput, ctx.totalTime * 1000)

    if (!result || result.landmarks.length === 0) {
      outputs.set('landmarks', [])
      outputs.set('blendshapes', {})
      outputs.set('headRotation', null)
      outputs.set('pitch', 0)
      outputs.set('yaw', 0)
      outputs.set('roll', 0)
      outputs.set('faceBox', null)
      outputs.set('mouthOpen', 0)
      outputs.set('eyeBlinkLeft', 0)
      outputs.set('eyeBlinkRight', 0)
      outputs.set('browRaise', 0)
      outputs.set('smile', 0)
      outputs.set('detected', false)
      outputs.set('loading', false)
      return outputs
    }

    const landmarks = result.landmarks[0] || []
    // faceBlendshapes[0] is a Classifications object with a 'categories' array
    const blendshapeCategories = result.blendshapes[0]?.categories
    const blendshapes = blendshapeCategories ? extractBlendshapeValues(blendshapeCategories) : {}
    const headRotation = result.transformationMatrixes[0] ? extractHeadRotation(result.transformationMatrixes[0]) : { pitch: 0, yaw: 0, roll: 0 }
    const faceBox = calculateFaceBox(landmarks)

    // Extract specific blendshape values
    const mouthOpen = blendshapes['jawOpen'] || blendshapes['mouthOpen'] || 0
    const eyeBlinkLeft = blendshapes['eyeBlinkLeft'] || 0
    const eyeBlinkRight = blendshapes['eyeBlinkRight'] || 0
    const browRaise = ((blendshapes['browInnerUp'] || 0) + (blendshapes['browOuterUpLeft'] || 0) + (blendshapes['browOuterUpRight'] || 0)) / 3
    const smile = ((blendshapes['mouthSmileLeft'] || 0) + (blendshapes['mouthSmileRight'] || 0)) / 2

    setCached(`${ctx.nodeId}:landmarks`, landmarks)
    setCached(`${ctx.nodeId}:blendshapes`, blendshapes)
    setCached(`${ctx.nodeId}:headRotation`, headRotation)
    setCached(`${ctx.nodeId}:faceBox`, faceBox)

    outputs.set('landmarks', landmarks)
    outputs.set('blendshapes', blendshapes)
    outputs.set('headRotation', headRotation)
    outputs.set('pitch', headRotation.pitch)
    outputs.set('yaw', headRotation.yaw)
    outputs.set('roll', headRotation.roll)
    outputs.set('faceBox', faceBox)
    outputs.set('mouthOpen', mouthOpen)
    outputs.set('eyeBlinkLeft', eyeBlinkLeft)
    outputs.set('eyeBlinkRight', eyeBlinkRight)
    outputs.set('browRaise', browRaise)
    outputs.set('smile', smile)
    outputs.set('detected', true)
    outputs.set('loading', false)
  } catch (error) {
    console.error('[MediaPipe Face] Detection error:', error)
    outputs.set('landmarks', getCached(`${ctx.nodeId}:landmarks`, []))
    outputs.set('blendshapes', {})
    outputs.set('headRotation', null)
    outputs.set('pitch', 0)
    outputs.set('yaw', 0)
    outputs.set('roll', 0)
    outputs.set('faceBox', null)
    outputs.set('mouthOpen', 0)
    outputs.set('eyeBlinkLeft', 0)
    outputs.set('eyeBlinkRight', 0)
    outputs.set('browRaise', 0)
    outputs.set('smile', 0)
    outputs.set('detected', false)
    outputs.set('loading', false)
    outputs.set('_error', error instanceof Error ? error.message : 'Detection failed')
  }

  return outputs
}

export default defineNode({ definition, executor: mediapipeFaceExecutor })
