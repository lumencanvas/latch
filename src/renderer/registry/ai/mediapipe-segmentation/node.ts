import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { mediaPipeService } from '@/services/ai/MediaPipeService'
import { getCached, setCached } from '../shared'

import { markRaw } from 'vue'
import MediaPipeSegmentationNode from './MediaPipeSegmentationNode.vue'

const definition: NodeDefinition = {
  id: 'mediapipe-segmentation',
  component: markRaw(MediaPipeSegmentationNode),
  name: 'Selfie Segmentation',
  version: '1.0.0',
  category: 'ai',
  description: 'Segment person from background using MediaPipe',
  icon: 'layers',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'video', type: 'video', label: 'Video' },
  ],
  outputs: [
    { id: 'mask', type: 'data', label: 'Mask' },
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
      id: 'overlayMode',
      type: 'select',
      label: 'Overlay Mode',
      default: 'mask',
      props: {
        options: [
          { value: 'mask', label: 'Mask Only' },
          { value: 'cutout', label: 'Cutout' },
          { value: 'blur', label: 'Blur BG' },
        ],
      },
    },
    {
      id: 'overlayColor',
      type: 'color',
      label: 'Mask Color',
      default: '#00ff00',
    },
    {
      id: 'maskOpacity',
      type: 'slider',
      label: 'Mask Opacity',
      default: 0.5,
      props: { min: 0, max: 1, step: 0.05 },
    },
  ],
  tags: ['segmentation', 'mediapipe', 'selfie', 'background', 'mask', 'matte', 'ai'],
  info: {
    overview: 'Separates a person from the background in a video feed using MediaPipe Selfie Segmentation. Outputs a mask that can be used for cutout effects, background blur, or custom compositing. Runs in real time in the browser.',
    tips: [
      'Use the "Blur BG" overlay mode for a quick virtual background effect without additional nodes.',
      'Adjust mask opacity to blend the segmentation visualization with the original video.',
    ],
    pairsWith: ['webcam', 'shader', 'mediapipe-pose', 'mediapipe-face'],
  },
}

export const mediapipeSegmentationExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const videoInput = ctx.inputs.get('video') as HTMLVideoElement | null
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true

  if (!enabled || !videoInput) {
    outputs.set('mask', getCached(`${ctx.nodeId}:mask`, null))
    outputs.set('detected', false)
    outputs.set('loading', mediaPipeService.isLoading('segmentation'))
    return outputs
  }

  // Check if loading
  if (mediaPipeService.isLoading('segmentation')) {
    outputs.set('mask', getCached(`${ctx.nodeId}:mask`, null))
    outputs.set('detected', false)
    outputs.set('loading', true)
    return outputs
  }

  try {
    const result = await mediaPipeService.segmentImage(videoInput, ctx.totalTime * 1000)

    if (!result || !result.categoryMask) {
      setCached(`${ctx.nodeId}:detected`, false)
      outputs.set('mask', null)
      outputs.set('detected', false)
      outputs.set('loading', false)
      return outputs
    }

    setCached(`${ctx.nodeId}:mask`, result.categoryMask)
    setCached(`${ctx.nodeId}:detected`, true)

    outputs.set('mask', result.categoryMask)
    outputs.set('detected', true)
    outputs.set('loading', false)
  } catch (error) {
    console.error('[MediaPipe Segmentation] Error:', error)
    outputs.set('mask', getCached(`${ctx.nodeId}:mask`, null))
    outputs.set('detected', false)
    outputs.set('loading', false)
    outputs.set('_error', error instanceof Error ? error.message : 'Segmentation failed')
  }

  return outputs
}

export default defineNode({ definition, executor: mediapipeSegmentationExecutor })
