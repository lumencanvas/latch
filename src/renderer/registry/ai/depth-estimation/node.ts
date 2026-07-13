import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { pendingOperations, isNodeDisposed, getCached, setCached, hasTriggerValue, convertToImageData, depthEstimateState, depthColor, type DepthResult } from '../shared'

const definition: NodeDefinition = {
  id: 'depth-estimation',
  name: 'Depth Estimation',
  version: '1.0.0',
  category: 'ai',
  description: 'Estimate a per-pixel depth map from any image/video feed (Depth-Anything).',
  icon: 'layers',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'source', type: 'texture', label: 'Source' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Depth' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    {
      id: 'model',
      type: 'select',
      label: 'Model',
      default: 'Xenova/depth-anything-small-hf',
      props: {
        options: [
          { value: 'Xenova/depth-anything-small-hf', label: 'Depth-Anything Small (~50 MB)' },
          { value: 'onnx-community/depth-anything-v2-small', label: 'Depth-Anything V2 Small' },
          { value: 'Xenova/dpt-hybrid-midas', label: 'DPT Hybrid MiDaS (larger)' },
        ],
      },
    },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 30, props: { min: 1, max: 120, step: 1 } },
    { id: 'colorize', type: 'toggle', label: 'Colorize', default: false },
  ],
  tags: ['depth', 'depth estimation', 'midas', 'depth anything', '3d', 'parallax', 'ai', 'vision'],
  info: {
    overview:
      'Runs monocular depth estimation in the browser and outputs the depth map as a texture (white = near, black = far). Enable Colorize for a jet-style heatmap. The first run downloads the model; raise Frame Interval if it stutters on live video.',
    tips: [
      'Feed the depth texture into a Displacement or Shader node for 2D→3D parallax.',
      'Use a higher Frame Interval (or the Trigger input) for heavier models on a live feed.',
    ],
    pairsWith: ['webcam', 'displacement', 'shader', 'main-output'],
  },
}

export const depthEstimationExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const source = ctx.inputs.get('source')
  const trigger = ctx.inputs.get('trigger')
  const model = (ctx.controls.get('model') as string) || 'Xenova/depth-anything-small-hf'
  const interval = (ctx.controls.get('interval') as number) ?? 30
  const colorize = (ctx.controls.get('colorize') as boolean) ?? false

  let state = depthEstimateState.get(ctx.nodeId)
  if (!state) {
    state = { canvas: document.createElement('canvas'), texture: null }
    depthEstimateState.set(ctx.nodeId, state)
  }

  // A previously-swallowed inference failure, surfaced on the public `error` port (badge
  // via the engine latch); cleared by the next successful estimate. The transient
  // unsupported-source status stays on the internal `_error` channel.
  const depthError = getCached<string | null>(`${ctx.nodeId}:depthError`, null) ?? ''

  const imageData = convertToImageData(source)
  if (!imageData) {
    outputs.set('texture', state.texture)
    outputs.set('loading', pendingOperations.has(ctx.nodeId) || getCached(`${ctx.nodeId}:loading`, false))
    outputs.set('error', depthError)
    if (source) outputs.set('_error', 'Unsupported source. Connect a texture or video feed.')
    return outputs
  }

  // Throttle the async inference by frame interval (or run on trigger).
  const hasTrigger = hasTriggerValue(trigger)
  const currentFrame = ctx.frameCount
  const lastFrame = getCached<number>(`${ctx.nodeId}:lastFrame`, -1)
  const due = hasTrigger || lastFrame < 0 || currentFrame - lastFrame >= interval
  if (due && !pendingOperations.has(ctx.nodeId)) {
    setCached(`${ctx.nodeId}:lastFrame`, currentFrame)
    setCached(`${ctx.nodeId}:loading`, true)
    const operation = (async () => {
      try {
        const depth = await aiInference.estimateDepth(imageData, model)
        if (isNodeDisposed(ctx.nodeId)) return
        setCached(`${ctx.nodeId}:depth`, depth)
        setCached(`${ctx.nodeId}:loading`, false)
        setCached(`${ctx.nodeId}:depthError`, null)
      } catch (error) {
        console.error('[AI] Depth estimation error:', error)
        setCached(`${ctx.nodeId}:loading`, false)
        setCached(`${ctx.nodeId}:depthError`, error instanceof Error ? error.message : String(error))
      } finally {
        pendingOperations.delete(ctx.nodeId)
      }
    })()
    pendingOperations.set(ctx.nodeId, operation)
  }

  // Rebuild the depth texture from the last result each frame (grayscale or colorized).
  const depth = getCached<DepthResult | null>(`${ctx.nodeId}:depth`, null)
  if (depth && depth.width > 0 && depth.data.length > 0) {
    const { width, height, channels, data } = depth
    const rgba = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      const g = channels === 1 ? data[i] : data[i * channels]
      if (colorize) {
        const [r, gg, b] = depthColor(g / 255)
        rgba[i * 4] = r
        rgba[i * 4 + 1] = gg
        rgba[i * 4 + 2] = b
      } else {
        rgba[i * 4] = g
        rgba[i * 4 + 1] = g
        rgba[i * 4 + 2] = g
      }
      rgba[i * 4 + 3] = 255
    }
    state.canvas.width = width
    state.canvas.height = height
    const c2d = state.canvas.getContext('2d')
    if (c2d) {
      c2d.putImageData(new ImageData(rgba, width, height), 0, 0)
      const renderer = getThreeShaderRenderer()
      if (state.texture) renderer.updateTexture(state.texture, state.canvas)
      else state.texture = renderer.createTexture(state.canvas)
    }
  }

  outputs.set('texture', state.texture)
  outputs.set('loading', pendingOperations.has(ctx.nodeId) || getCached(`${ctx.nodeId}:loading`, false))
  outputs.set('error', depthError)
  return outputs
}

export default defineNode({ definition, executor: depthEstimationExecutor })
