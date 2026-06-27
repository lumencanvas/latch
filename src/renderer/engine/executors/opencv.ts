/**
 * OpenCV.js Node Executors
 *
 * CPU image-processing nodes backed by OpenCV.js (WASM). opencv.js is loaded and
 * every `cv.*` op runs in a Web Worker (`opencv.worker.ts`) — loading/running the
 * ~10 MB build on the main thread froze the UI. Each node, per frame:
 *   source -> sourceToImageData (main, capped) -> worker op -> RGBA ImageData
 *   -> held canvas -> THREE.Texture (on the ThreeShaderRenderer context).
 *
 * The op is fire-and-cache (mirrors the AI worker executors): throttled by
 * `interval`, guarded by a per-node pending flag, and the last result texture +
 * scalar outputs are served every frame, updated when the async result lands.
 *
 * MEMORY DISCIPLINE: all cv.Mat lifecycle now lives in the worker. Per-node state
 * here holds only a canvas + THREE.Texture + cached outputs; the texture is
 * disposed in `disposeOpenCVNode`/`gcOpenCVState`, and the worker's persistent
 * Mats (optical-flow prevGray, MOG2 subtractor) are freed via
 * `openCVService.dispose(nodeId)`/`disposeAll()` from those same paths.
 */

import * as THREE from 'three'
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { getThreeShaderRenderer } from './visual'
import { openCVService } from '@/services/visual/OpenCVService'

// ============================================================================
// Per-node state + cleanup (written BEFORE the ops, per project convention)
// ============================================================================

interface OpenCVState {
  canvas: HTMLCanvasElement
  texture: THREE.Texture | null
  lastFrame: number
  /** Cached scalar/array outputs (+ optional `_error`), re-served each frame. */
  outputs: Record<string, unknown>
}

const opencvState = new Map<string, OpenCVState>()

// One in-flight worker op per node (fire-and-cache throttle guard).
const pendingOperations = new Map<string, Promise<void>>()

// Nodes flagged disposed so a worker result that lands after teardown doesn't
// write into stale/cleared state. Cleared on engine start (stop→restart safety),
// mirroring the AI executors' resetAINodeDisposal().
const disposedNodes = new Set<string>()

function getState(nodeId: string): OpenCVState {
  let state = opencvState.get(nodeId)
  if (!state) {
    state = { canvas: document.createElement('canvas'), texture: null, lastFrame: -1, outputs: {} }
    opencvState.set(nodeId, state)
  }
  return state
}

/** True if a worker result for this node should be dropped (node torn down). */
function isOpenCVNodeDisposed(nodeId: string): boolean {
  return disposedNodes.has(nodeId)
}

/**
 * Clear the disposed-node guard so OpenCV nodes work again after a stop→restart.
 * disposeAllOpenCVNodes() (on stop) flags every node disposed so in-flight worker
 * results don't write into just-cleared state; on restart the same nodes are live
 * again. Called from ExecutionEngine.start().
 */
export function resetOpenCVNodeDisposal(): void {
  disposedNodes.clear()
}

/** Dispose a single OpenCV node's held canvas + texture (and worker-side Mats). */
export function disposeOpenCVNode(nodeId: string): void {
  const state = opencvState.get(nodeId)
  if (state) {
    if (state.texture) state.texture.dispose()
    state.canvas.width = 0
    state.canvas.height = 0
    opencvState.delete(nodeId)
  }
  // Free the worker's persistent Mats for this node (optical-flow / MOG2).
  openCVService.dispose(nodeId)
  pendingOperations.delete(nodeId)
  disposedNodes.add(nodeId)
}

/** Dispose all OpenCV node state (engine teardown). */
export function disposeAllOpenCVNodes(): void {
  for (const nodeId of pendingOperations.keys()) disposedNodes.add(nodeId)
  for (const nodeId of opencvState.keys()) {
    disposedNodes.add(nodeId)
    disposeOpenCVNode(nodeId)
  }
  // Free every persistent worker-side Mat in one message.
  openCVService.disposeAll()
  if (scratchCanvas) {
    scratchCanvas.width = 0
    scratchCanvas.height = 0
    scratchCanvas = null
  }
  if (imageDataCanvas) {
    imageDataCanvas.width = 0
    imageDataCanvas.height = 0
    imageDataCanvas = null
  }
}

/** Garbage-collect OpenCV state for nodes no longer in the graph. */
export function gcOpenCVState(validNodeIds: Set<string>): void {
  for (const nodeId of opencvState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposeOpenCVNode(nodeId)
    }
  }
}

// ============================================================================
// Shared helpers (source readback stays on the main thread)
// ============================================================================

// Cap CV processing resolution. A high-res source (a 4K image, a 1080p webcam)
// otherwise makes every op allocate full-res Mats and ships more pixels across
// the worker boundary every frame. We downscale the source to this longest-side
// limit; the result texture displays upscaled, which is fine for live visuals.
const CV_MAX_DIM = 1280

function fitDims(w: number, h: number): { w: number; h: number } {
  const m = Math.max(w, h)
  if (m <= CV_MAX_DIM || m <= 0) return { w: Math.max(1, w), h: Math.max(1, h) }
  const s = CV_MAX_DIM / m
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) }
}

// Shared scratch canvas for texture/video readback. Reused across all cv nodes
// (executors run sequentially in topo order, and each readback's ImageData is
// copied out immediately) so we avoid allocating a canvas every frame.
let scratchCanvas: HTMLCanvasElement | null = null
function getScratch(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!scratchCanvas) scratchCanvas = document.createElement('canvas')
  scratchCanvas.width = width
  scratchCanvas.height = height
  const ctx = scratchCanvas.getContext('2d')
  return ctx ? { canvas: scratchCanvas, ctx } : null
}

// Second canvas, only used to shrink an oversized raw ImageData source (rare).
let imageDataCanvas: HTMLCanvasElement | null = null
function imageDataToCanvas(id: ImageData): HTMLCanvasElement | null {
  if (!imageDataCanvas) imageDataCanvas = document.createElement('canvas')
  imageDataCanvas.width = id.width
  imageDataCanvas.height = id.height
  const c = imageDataCanvas.getContext('2d')
  if (!c) return null
  c.putImageData(id, 0, 0)
  return imageDataCanvas
}

/** Normalize a texture/video/canvas/ImageData source to ImageData, capped to CV_MAX_DIM. */
function sourceToImageData(source: unknown): ImageData | null {
  if (!source) return null

  // THREE.Texture renders straight into a capped-size scratch (renderToCanvas
  // scales to the canvas), so no full-res intermediate is ever allocated.
  if (source instanceof THREE.Texture) {
    const image = source.image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | undefined
    // A video-backed texture renders BLACK until the video has real frames
    // (readyState >= 2, non-zero dimensions). Skip until then so the worker isn't
    // fed an all-black startup frame (mirrors resolveEffectSource in visual.ts).
    if (source.image instanceof HTMLVideoElement && (source.image.readyState < 2 || !source.image.videoWidth)) {
      return null
    }
    const { w, h } = fitDims(image?.width || image?.videoWidth || 512, image?.height || image?.videoHeight || 512)
    const scratch = getScratch(w, h)
    if (!scratch) return null
    getThreeShaderRenderer().renderToCanvas(source, scratch.canvas)
    return scratch.ctx.getImageData(0, 0, w, h)
  }

  // Resolve a drawable source + its native size.
  let drawable: CanvasImageSource | null = null
  let nativeW = 0
  let nativeH = 0
  if (source instanceof ImageData) {
    const fit = fitDims(source.width, source.height)
    if (fit.w === source.width && fit.h === source.height) return source // already within cap
    drawable = imageDataToCanvas(source)
    nativeW = source.width
    nativeH = source.height
  } else if (source instanceof HTMLCanvasElement) {
    drawable = source
    nativeW = source.width
    nativeH = source.height
  } else if (source instanceof HTMLVideoElement) {
    drawable = source
    nativeW = source.videoWidth || source.width || 640
    nativeH = source.videoHeight || source.height || 480
  }
  if (!drawable) return null

  const { w, h } = fitDims(nativeW, nativeH)
  const scratch = getScratch(w, h)
  if (!scratch) return null
  scratch.ctx.drawImage(drawable, 0, 0, w, h) // scales down to the cap
  return scratch.ctx.getImageData(0, 0, w, h)
}

/** Force a kernel/block size to an odd integer >= min. */
export function oddKernel(value: number, min = 1): number {
  let k = Math.max(min, Math.round(value))
  if (k % 2 === 0) k += 1
  return k
}

// ============================================================================
// Shared deferred (fire-and-cache) op runner
// ============================================================================

interface CvNodeSpec {
  /** Emit `width`/`height` outputs from the held canvas (filter nodes do). */
  emitDimensions?: boolean
  /** Scalar/array outputs to serve each frame from cache, with their defaults. */
  extras?: Array<{ key: string; fallback: unknown }>
}

/**
 * Run an OpenCV op for a node: throttle by `interval`, post to the worker when
 * due (and not already pending), and serve the last cached texture + scalar
 * outputs every frame. The worker result updates the held canvas/texture and
 * caches the op's `extra` outputs when it lands (unless the node was disposed).
 */
function runCvNode(
  ctx: ExecutionContext,
  op: string,
  params: Record<string, unknown>,
  spec: CvNodeSpec = {}
): Map<string, unknown> {
  const outputs = new Map<string, unknown>()
  const source = ctx.inputs.get('source')
  const interval = (ctx.controls.get('interval') as number) ?? 2
  const nodeId = ctx.nodeId
  const state = getState(nodeId)

  const serve = (loading: boolean): Map<string, unknown> => {
    outputs.set('texture', state.texture)
    if (spec.emitDimensions) {
      outputs.set('width', state.canvas.width)
      outputs.set('height', state.canvas.height)
    }
    for (const e of spec.extras ?? []) {
      outputs.set(e.key, state.outputs[e.key] ?? e.fallback)
    }
    const err = state.outputs._error
    if (err) outputs.set('_error', err)
    outputs.set('loading', loading)
    return outputs
  }

  // Lazy-load opencv.js in the worker on first use; emit held texture meanwhile.
  if (!openCVService.isReady()) {
    const loadErr = openCVService.getLoadError()
    if (loadErr) {
      // Surface the failure ON the node (not just the console) so it's diagnosable.
      const out = serve(false)
      out.set('_error', `OpenCV failed to load: ${loadErr}`)
      return out
    }
    void openCVService.load().catch(() => {}) // failure captured in getLoadError()
    return serve(true)
  }

  const imageData = sourceToImageData(source)
  if (!imageData) {
    const out = serve(false)
    // Only flag genuinely unsupported inputs; a supported-but-not-yet-ready source
    // (e.g. a webcam texture still warming up) just keeps serving the held texture.
    const supported =
      source instanceof THREE.Texture ||
      source instanceof HTMLVideoElement ||
      source instanceof HTMLCanvasElement ||
      source instanceof ImageData
    if (source && !supported) out.set('_error', 'Unsupported source. Connect a texture or video feed.')
    return out
  }

  // Frame-skip throttle (CPU ops are expensive on large frames).
  const currentFrame = ctx.frameCount
  const due = state.lastFrame < 0 || currentFrame - state.lastFrame >= interval
  if (due && !pendingOperations.has(nodeId)) {
    state.lastFrame = currentFrame
    const operation = (async () => {
      try {
        const { imageData: result, extra } = await openCVService.process(nodeId, op, params, imageData)
        if (isOpenCVNodeDisposed(nodeId)) return
        if (result) {
          state.canvas.width = result.width
          state.canvas.height = result.height
          const c2d = state.canvas.getContext('2d')
          if (c2d) {
            c2d.putImageData(result, 0, 0)
            const renderer = getThreeShaderRenderer()
            if (state.texture) renderer.updateTexture(state.texture, state.canvas)
            else state.texture = renderer.createTexture(state.canvas)
          }
        }
        // Cache scalar/array outputs; clear a stale _error when this op had none.
        for (const [k, v] of Object.entries(extra)) state.outputs[k] = v
        if (!('_error' in extra)) delete state.outputs._error
      } catch (err) {
        console.error('[OpenCV] op failed:', err)
        // Surface the op failure ON the node (a later successful op clears it via
        // the `_error` reset above) so it's diagnosable without the console.
        state.outputs._error = `OpenCV op failed: ${err instanceof Error ? err.message : String(err)}`
      } finally {
        pendingOperations.delete(nodeId)
      }
    })()
    pendingOperations.set(nodeId, operation)
  }

  return serve(pendingOperations.has(nodeId))
}

// ============================================================================
// Filter nodes (texture + width/height)
// ============================================================================

const FILTER_SPEC: CvNodeSpec = { emitDimensions: true }

export const cvGrayscaleExecutor: NodeExecutorFn = (ctx) => runCvNode(ctx, 'grayscale', {}, FILTER_SPEC)

export const cvCannyExecutor: NodeExecutorFn = (ctx) =>
  runCvNode(
    ctx,
    'canny',
    {
      lowThreshold: (ctx.controls.get('lowThreshold') as number) ?? 50,
      highThreshold: (ctx.controls.get('highThreshold') as number) ?? 150,
    },
    FILTER_SPEC
  )

export const cvThresholdExecutor: NodeExecutorFn = (ctx) =>
  runCvNode(
    ctx,
    'threshold',
    {
      mode: (ctx.controls.get('mode') as string) ?? 'binary',
      threshold: (ctx.controls.get('threshold') as number) ?? 127,
      invert: (ctx.controls.get('invert') as boolean) ?? false,
      blockSize: oddKernel((ctx.controls.get('blockSize') as number) ?? 11, 3),
      c: (ctx.controls.get('c') as number) ?? 2,
    },
    FILTER_SPEC
  )

export const cvBlurExecutor: NodeExecutorFn = (ctx) => {
  const mode = (ctx.controls.get('mode') as string) ?? 'gaussian'
  const rawKernel = (ctx.controls.get('kernel') as number) ?? 5
  // medianBlur asserts ksize > 1, so floor a median kernel at 3 (odd).
  const kernel = mode === 'median' ? oddKernel(rawKernel, 3) : oddKernel(rawKernel, 1)
  return runCvNode(ctx, 'blur', { mode, kernel }, FILTER_SPEC)
}

export const cvMorphologyExecutor: NodeExecutorFn = (ctx) =>
  runCvNode(
    ctx,
    'morphology',
    {
      operation: (ctx.controls.get('operation') as string) ?? 'dilate',
      kernel: oddKernel((ctx.controls.get('kernel') as number) ?? 3, 1),
      iterations: Math.max(1, Math.round((ctx.controls.get('iterations') as number) ?? 1)),
    },
    FILTER_SPEC
  )

// ============================================================================
// Contours node (annotated texture + contour data)
// ============================================================================

export const cvContoursExecutor: NodeExecutorFn = (ctx) =>
  runCvNode(
    ctx,
    'contours',
    {
      threshold: (ctx.controls.get('threshold') as number) ?? 127,
      minArea: (ctx.controls.get('minArea') as number) ?? 100,
      lineWidth: Math.max(1, Math.round((ctx.controls.get('lineWidth') as number) ?? 2)),
      color: (ctx.controls.get('color') as string) || '#00ff00',
    },
    { extras: [{ key: 'contours', fallback: [] }, { key: 'count', fallback: 0 }] }
  )

// ============================================================================
// Corner / feature detection (Shi-Tomasi goodFeaturesToTrack)
// ============================================================================

export const cvCornersExecutor: NodeExecutorFn = (ctx) =>
  runCvNode(
    ctx,
    'corners',
    {
      maxCorners: Math.max(1, Math.round((ctx.controls.get('maxCorners') as number) ?? 100)),
      quality: Math.min(1, Math.max(0.001, (ctx.controls.get('quality') as number) ?? 0.01)),
      minDistance: Math.max(1, (ctx.controls.get('minDistance') as number) ?? 10),
      radius: Math.max(1, Math.round((ctx.controls.get('radius') as number) ?? 4)),
      color: (ctx.controls.get('color') as string) || '#ff3030',
    },
    { extras: [{ key: 'count', fallback: 0 }] }
  )

// ============================================================================
// Dense optical flow (Farneback) — worker retains a previous-frame Mat per node
// ============================================================================

export const cvOpticalFlowExecutor: NodeExecutorFn = (ctx) =>
  runCvNode(
    ctx,
    'optical-flow',
    {
      winSize: Math.max(3, Math.round((ctx.controls.get('winSize') as number) ?? 15)),
      levels: Math.max(1, Math.round((ctx.controls.get('levels') as number) ?? 3)),
    },
    { extras: [{ key: 'motion', fallback: 0 }] }
  )

// ============================================================================
// Background subtraction (MOG2) — worker retains a persistent subtractor per node
// ============================================================================

export const cvBackgroundSubtractionExecutor: NodeExecutorFn = (ctx) =>
  runCvNode(
    ctx,
    'background-subtraction',
    {
      history: Math.max(1, Math.round((ctx.controls.get('history') as number) ?? 500)),
      varThreshold: (ctx.controls.get('varThreshold') as number) ?? 16,
      detectShadows: (ctx.controls.get('detectShadows') as boolean) ?? true,
    },
    { extras: [{ key: 'foreground', fallback: 0 }] }
  )

// ============================================================================
// Registry
// ============================================================================

export const opencvExecutors: Record<string, NodeExecutorFn> = {
  'cv-grayscale': cvGrayscaleExecutor,
  'cv-canny': cvCannyExecutor,
  'cv-threshold': cvThresholdExecutor,
  'cv-blur': cvBlurExecutor,
  'cv-morphology': cvMorphologyExecutor,
  'cv-contours': cvContoursExecutor,
  'cv-corners': cvCornersExecutor,
  'cv-optical-flow': cvOpticalFlowExecutor,
  'cv-background-subtraction': cvBackgroundSubtractionExecutor,
}
