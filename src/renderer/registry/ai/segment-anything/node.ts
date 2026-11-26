import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { aiInference } from '@/services/ai/AIInference'
import { reportModelNeed, clearModelNeed } from '@/services/ai/modelNeeds'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
import { liveRunDue, liveRunStarted, liveRunFinished, pendingOperations, isNodeDisposed, getCached, setCached, triggerFired, convertToImageData, isSupportedImageInput, segmentState } from '../shared'

type MaskResult = { width: number; height: number; data: Uint8Array; score: number }

const definition: NodeDefinition = {
  id: 'segment-anything',
  name: 'Segment Anything',
  version: '1.0.0',
  category: 'ai',
  description: 'Cut out whatever is under a point: outputs its mask and the cut-out (SlimSAM, on-device).',
  icon: 'scissors',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'source', type: 'texture', label: 'Source' },
    { id: 'x', type: 'number', label: 'Point X (0–1)' },
    { id: 'y', type: 'number', label: 'Point Y (0–1)' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  outputs: [
    { id: 'cutout', type: 'texture', label: 'Cut-out' },
    { id: 'mask', type: 'texture', label: 'Mask' },
    { id: 'score', type: 'number', label: 'Confidence' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'x', type: 'slider', label: 'Point X', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'y', type: 'slider', label: 'Point Y (0 = top)', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 15, props: { min: 1, max: 300, step: 1 } },
    { id: 'background', type: 'select', label: 'Cut-out background', default: 'transparent', props: { options: ['transparent', 'black', 'white'] } },
  ],
  tags: ['segment', 'segmentation', 'sam', 'slimsam', 'cut out', 'mask', 'matte', 'background removal', 'ai', 'vision'],
  info: {
    overview:
      'Point at something in an image or video and this cuts it out. Segment Anything (SlimSAM, ~40 MB) finds the object under the point and outputs its mask (white = object) and the cut-out. Wire an XY Pad, a mouse position or a detection box centre into Point X/Y to pick what to cut out live.',
    tips: [
      'Point Y counts from the top (0 = top, 1 = bottom).',
      'On a still image, moving the point is fast: the image is only encoded again when it changes or on Trigger.',
      'Feed the Mask into Blend or a Shader to composite the object over something else.',
    ],
    pairsWith: ['webcam', 'xy-pad', 'blend', 'object-detection-live', 'main-output'],
  },
}

export const segmentAnythingExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const source = ctx.inputs.get('source')
  const x = clamp01(Number(ctx.inputs.get('x') ?? ctx.controls.get('x') ?? 0.5))
  const y = clamp01(Number(ctx.inputs.get('y') ?? ctx.controls.get('y') ?? 0.5))
  const interval = (ctx.controls.get('interval') as number) ?? 15
  const background = (ctx.controls.get('background') as string) ?? 'transparent'
  const model = (ctx.controls.get('model') as string) || aiInference.getDefaultModel('mask-generation')

  let state = segmentState.get(ctx.nodeId)
  if (!state) {
    state = { maskCanvas: document.createElement('canvas'), cutCanvas: document.createElement('canvas'), mask: null, cutout: null, builtFrom: null }
    segmentState.set(ctx.nodeId, state)
  }
  const fired = triggerFired(ctx.nodeId, ctx.inputs.get('trigger'))
  const segError = getCached<string | null>(`${ctx.nodeId}:segError`, null) ?? ''
  const emit = (loading: boolean, error: string) => {
    outputs.set('cutout', state!.cutout)
    // The node's own preview shows the cut-out (TexturePreview reads `_display` first).
    if (state!.cutout) outputs.set('_display', state!.cutCanvas)
    outputs.set('mask', state!.mask)
    outputs.set('score', getCached(`${ctx.nodeId}:score`, 0))
    outputs.set('loading', loading)
    outputs.set('error', error)
    return outputs
  }

  if (!isSupportedImageInput(source)) {
    if (source) outputs.set('_error', 'Unsupported source. Connect a texture or video feed.')
    return emit(pendingOperations.has(ctx.nodeId), segError)
  }

  if (!aiInference.isModelLoaded('mask-generation', model)) {
    reportModelNeed(ctx.nodeId, 'mask-generation', model)
    const downloading = aiInference.getModelInfo('mask-generation', model)?.state === 'loading'
    return emit(downloading, downloading ? '' : 'Model not loaded. Open AI Model Manager to load.')
  }
  clearModelNeed(ctx.nodeId)

  // The image encoder is the expensive part: re-encode on the frame interval or a trigger; a moved
  // point alone (same image) only re-runs the small prompt decoder.
  const lastFrame = getCached<number>(`${ctx.nodeId}:lastFrame`, -1)
  const imageDue = fired || lastFrame < 0 || ctx.frameCount - lastFrame >= interval
  const lastPoint = getCached<string>(`${ctx.nodeId}:point`, '')
  const point = `${x.toFixed(3)},${y.toFixed(3)}`
  const pointMoved = point !== lastPoint
  if (!pendingOperations.has(ctx.nodeId) && liveRunDue(ctx.nodeId, imageDue || pointMoved, ctx.deltaTime)) {
    const imageData = convertToImageData(source)
    if (imageData) {
      const reuse = !imageDue
      if (imageDue) setCached(`${ctx.nodeId}:lastFrame`, ctx.frameCount)
      setCached(`${ctx.nodeId}:point`, point)
      liveRunStarted(ctx.nodeId)
      const startedAt = performance.now()
      const op = (async () => {
        try {
          // The worker gets a copy: its pixels are transferred (zero-copy) and the original is kept for the cut-out.
          const res = await aiInference.segment(new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height), [{ x, y, label: 1 }], { modelId: model, reuseEmbedding: reuse })
          liveRunFinished(ctx.nodeId, performance.now() - startedAt)
          if (isNodeDisposed(ctx.nodeId)) return
          setCached(`${ctx.nodeId}:result`, { res, image: imageData })
          setCached(`${ctx.nodeId}:score`, res.score)
          setCached(`${ctx.nodeId}:segError`, null)
        } catch (error) {
          setCached(`${ctx.nodeId}:segError`, error instanceof Error ? error.message : String(error))
        } finally {
          pendingOperations.delete(ctx.nodeId)
        }
      })()
      pendingOperations.set(ctx.nodeId, op)
    }
  }

  const latest = getCached<{ res: MaskResult; image: ImageData } | null>(`${ctx.nodeId}:result`, null)
  if (latest && state.builtFrom !== latest) {
    state.builtFrom = latest
    buildTextures(state, latest.res, latest.image, background)
  }
  return emit(pendingOperations.has(ctx.nodeId), segError)
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5
}

/** Mask → white-on-black texture; the source pixels where the mask is set → the cut-out. */
function buildTextures(state: NonNullable<ReturnType<typeof segmentState.get>>, res: MaskResult, image: ImageData, background: string) {
  const { width, height, data } = res
  const mask = new Uint8ClampedArray(width * height * 4)
  const cut = new Uint8ClampedArray(width * height * 4)
  const bg = background === 'white' ? 255 : 0
  const sameSize = image.width === width && image.height === height
  for (let i = 0; i < width * height; i++) {
    const on = data[i] > 0
    const v = on ? 255 : 0
    mask[i * 4] = mask[i * 4 + 1] = mask[i * 4 + 2] = v
    mask[i * 4 + 3] = 255
    // Masks come back at the source size; if not, sample the source by position.
    const si = sameSize ? i : (Math.floor(((i / width) | 0) * image.height / height) * image.width + Math.floor((i % width) * image.width / width))
    cut[i * 4] = on ? image.data[si * 4] : bg
    cut[i * 4 + 1] = on ? image.data[si * 4 + 1] : bg
    cut[i * 4 + 2] = on ? image.data[si * 4 + 2] : bg
    cut[i * 4 + 3] = on || background !== 'transparent' ? 255 : 0
  }
  const renderer = getThreeShaderRenderer()
  for (const [canvas, pixels, key] of [[state.maskCanvas, mask, 'mask'], [state.cutCanvas, cut, 'cutout']] as const) {
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.putImageData(new ImageData(pixels, width, height), 0, 0)
    if (state[key]) renderer.updateTexture(state[key]!, canvas)
    else state[key] = renderer.createTexture(canvas)
  }
}

export default defineNode({ definition, executor: segmentAnythingExecutor, models: [{ task: 'mask-generation' }] })
