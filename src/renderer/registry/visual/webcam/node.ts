import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { webcamCapture } from '@/services/visual/WebcamCapture'
import { nodeTextures } from '../shared'

const definition: NodeDefinition = {
  id: 'webcam',
  name: 'Webcam',
  version: '1.0.0',
  category: 'inputs',
  description: 'Capture video from camera',
  icon: 'camera',
  platforms: ['web', 'electron'],
  requires: ['camera'],
  inputs: [],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'video', type: 'video', label: 'Video' },
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
  ],
  controls: [
    { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
    {
      id: 'device',
      type: 'select',
      label: 'Device',
      default: 'default',
      props: { deviceType: 'video-input' },
    },
  ],
  tags: ['webcam', 'camera', 'video', 'live', 'input', 'capture', 'source'],
  info: {
    overview: 'Streams live video from a camera and outputs it as a continuously updating texture. Also provides a raw video element and the current resolution. This is the primary node for getting real-time camera input into a visual flow.',
    tips: [
      'Disable the node when not in use to release the camera and free system resources.',
      'If you have multiple cameras, use the device selector to pick a specific one rather than relying on the default.',
      'The video element output can be fed into both shader and blend nodes simultaneously for parallel processing.',
    ],
    pairsWith: ['shader', 'blend', 'color-correction', 'displacement', 'texture-display'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true
  const deviceId = ctx.controls.get('device') as string | undefined

  if (!enabled) {
    const outputs = new Map<string, unknown>()
    outputs.set('texture', null)
    outputs.set('video', null)
    return outputs
  }

  // Start webcam if not already
  if (!webcamCapture.isCapturing) {
    try {
      await webcamCapture.start(deviceId)
    } catch {
      const outputs = new Map<string, unknown>()
      outputs.set('texture', null)
      outputs.set('video', null)
      outputs.set('_error', 'Webcam access denied')
      return outputs
    }
  }

  const video = webcamCapture.getVideo()
  if (!video) {
    const outputs = new Map<string, unknown>()
    outputs.set('texture', null)
    outputs.set('video', null)
    return outputs
  }

  // Get or create THREE.Texture for this node
  const threeRenderer = getThreeShaderRenderer()
  let texture = nodeTextures.get(ctx.nodeId)

  if (!texture) {
    texture = threeRenderer.createTexture(video)
    nodeTextures.set(ctx.nodeId, texture)
  } else {
    // Update texture with current frame
    threeRenderer.updateTexture(texture, video)
  }

  const outputs = new Map<string, unknown>()
  outputs.set('texture', texture)
  outputs.set('video', video)
  outputs.set('width', video.videoWidth)
  outputs.set('height', video.videoHeight)
  return outputs
}

export default defineNode({ definition, executor })
