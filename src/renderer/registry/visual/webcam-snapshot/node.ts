import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { webcamSnapshotState, initWebcamSnapshot } from '../shared'
import { risingEdge, isHigh } from '@/engine/trigger'

const definition: NodeDefinition = {
  id: 'webcam-snapshot',
  name: 'Webcam Snapshot',
  version: '1.0.0',
  category: 'visual',
  description: 'Capture snapshots from webcam on trigger',
  icon: 'camera',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'trigger', type: 'trigger', label: 'Capture' }],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'imageData', type: 'data', label: 'Image Data' },
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
    { id: 'captured', type: 'trigger', label: 'Captured' },
  ],
  controls: [
    {
      id: 'device',
      type: 'select',
      label: 'Camera',
      default: 'default',
      props: { deviceType: 'video-input' },
    },
    {
      id: 'resolution',
      type: 'select',
      label: 'Resolution',
      default: '720p',
      props: {
        options: [
          { value: '480p', label: '480p (640x480)' },
          { value: '720p', label: '720p (1280x720)' },
          { value: '1080p', label: '1080p (1920x1080)' },
        ],
      },
    },
    {
      id: 'mirror',
      type: 'toggle',
      label: 'Mirror',
      default: false,
    },
  ],
  tags: ['webcam snapshot', 'snapshot', 'still', 'capture', 'freeze', 'photo', 'camera'],
  info: {
    overview: 'Captures a single still frame from the webcam each time it receives a trigger. Unlike the continuous webcam node, this only updates on demand. Outputs the captured texture, raw image data, and dimensions.',
    tips: [
      'Connect an interval node to the trigger input to capture frames at a controlled rate lower than full video.',
      'Use the captured trigger output to chain actions that should happen only after a new frame is taken.',
      'The imageData output carries raw pixel data suitable for analysis nodes or the function node.',
    ],
    pairsWith: ['interval', 'blend', 'shader', 'start', 'color-correction'],
  },
}

const executor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const trigger = ctx.inputs.get('trigger')
  const deviceId = ctx.controls.get('device') as string | undefined
  const resolution = (ctx.controls.get('resolution') as string) ?? '720p'
  const mirror = (ctx.controls.get('mirror') as boolean) ?? false

  const outputs = new Map<string, unknown>()

  // RISING edge (was level-triggered: a held trigger re-captured — drawImage + a full-frame
  // getImageData + texture upload — every 100 ms debounce window). A non-empty string still
  // counts as high. Evaluated before the init await/early-return so the edge state stays live.
  const triggerHigh = (typeof trigger === 'string' && trigger.length > 0) || isHigh(trigger)
  const hasTrigger = risingEdge(ctx.nodeId, 'trigger', triggerHigh)

  // Initialize webcam if not already
  await initWebcamSnapshot(ctx.nodeId, deviceId, resolution)

  const state = webcamSnapshotState.get(ctx.nodeId)
  // Latch the edge: it stays pending until a capture actually happens (an edge landing while
  // the stream isn't painting yet, or inside the 100 ms debounce, used to be dropped).
  if (hasTrigger && state) state.pendingCapture = true
  if (!state || !state.initialized || !state.video || !state.canvas) {
    outputs.set('texture', null)
    outputs.set('imageData', null)
    outputs.set('width', 0)
    outputs.set('height', 0)
    outputs.set('captured', false)
    outputs.set('_error', 'Webcam not initialized')
    return outputs
  }

  let capturedThisFrame = false

  // videoWidth is 0 until the stream paints; getImageData(0,0,0,0) would throw.
  if (state.pendingCapture && state.video.videoWidth > 0) {
    const now = Date.now()
    // Debounce captures to prevent rapid-fire
    if (now - state.lastCaptureTime > 100) {
      // Capture frame to canvas
      const ctx2d = state.canvas.getContext('2d')!

      // Update canvas size to match video
      state.canvas.width = state.video.videoWidth
      state.canvas.height = state.video.videoHeight

      // Apply mirror transform if needed
      if (mirror) {
        ctx2d.save()
        ctx2d.scale(-1, 1)
        ctx2d.drawImage(state.video, -state.canvas.width, 0)
        ctx2d.restore()
      } else {
        ctx2d.drawImage(state.video, 0, 0)
      }

      // Get image data
      state.capturedImageData = ctx2d.getImageData(
        0,
        0,
        state.canvas.width,
        state.canvas.height
      )

      // Create or update THREE.Texture
      const renderer = getThreeShaderRenderer()
      if (state.texture) {
        renderer.updateTexture(state.texture, state.canvas)
      } else {
        state.texture = renderer.createTexture(state.canvas)
      }

      state.lastCaptureTime = now
      state.pendingCapture = false
      capturedThisFrame = true
    }
  }

  outputs.set('texture', state.texture)
  outputs.set('imageData', state.capturedImageData)
  outputs.set('width', state.canvas.width)
  outputs.set('height', state.canvas.height)
  outputs.set('captured', capturedThisFrame)

  return outputs
}

export default defineNode({ definition, executor })
