/**
 * OpenCV.js Node Executors
 *
 * CPU image-processing nodes backed by OpenCV.js (WASM). Each node:
 *   texture/video -> ImageData -> cv.matFromImageData -> op -> cv.imshow(canvas)
 *   -> THREE.Texture (kept on the ThreeShaderRenderer context).
 *
 * MEMORY DISCIPLINE: every cv.Mat lives in the WASM heap and MUST be
 * `.delete()`d. Per-node state holds only a canvas + THREE.Texture (no
 * persistent Mats); all Mats are transient and deleted in a `finally` within
 * each op, so nothing to free for Mats on teardown — but the THREE.Texture is
 * disposed in both `disposeOpenCVNode` and `gcOpenCVState` (written first,
 * below).
 */

import * as THREE from 'three'
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { getThreeShaderRenderer } from './visual'
import { openCVService, type OpenCVModule } from '@/services/visual/OpenCVService'

// ============================================================================
// Per-node state + cleanup (written BEFORE the ops, per project convention)
// ============================================================================

interface OpenCVState {
  canvas: HTMLCanvasElement
  texture: THREE.Texture | null
  lastFrame: number
  lastContours?: Array<{ area: number; x: number; y: number; width: number; height: number }>
}

const opencvState = new Map<string, OpenCVState>()

function getState(nodeId: string): OpenCVState {
  let state = opencvState.get(nodeId)
  if (!state) {
    state = { canvas: document.createElement('canvas'), texture: null, lastFrame: -1 }
    opencvState.set(nodeId, state)
  }
  return state
}

/** Dispose a single OpenCV node's held canvas + texture. */
export function disposeOpenCVNode(nodeId: string): void {
  const state = opencvState.get(nodeId)
  if (state) {
    if (state.texture) state.texture.dispose()
    state.canvas.width = 0
    state.canvas.height = 0
    opencvState.delete(nodeId)
  }
}

/** Dispose all OpenCV node state (engine teardown). */
export function disposeAllOpenCVNodes(): void {
  for (const nodeId of opencvState.keys()) {
    disposeOpenCVNode(nodeId)
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
// Shared helpers
// ============================================================================

/** Normalize a texture/video/canvas/ImageData source to ImageData. */
function sourceToImageData(source: unknown): ImageData | null {
  if (!source) return null

  if (source instanceof ImageData) return source

  if (source instanceof HTMLCanvasElement) {
    const ctx = source.getContext('2d')
    return ctx ? ctx.getImageData(0, 0, source.width, source.height) : null
  }

  if (source instanceof HTMLVideoElement) {
    const w = source.videoWidth || source.width || 640
    const h = source.videoHeight || source.height || 480
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(source, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h)
  }

  if (source instanceof THREE.Texture) {
    const image = source.image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | undefined
    const w = image?.width || image?.videoWidth || 512
    const h = image?.height || image?.videoHeight || 512
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    getThreeShaderRenderer().renderToCanvas(source, canvas)
    const ctx = canvas.getContext('2d')
    return ctx ? ctx.getImageData(0, 0, w, h) : null
  }

  return null
}

/** Force a kernel/block size to an odd integer >= min. */
function oddKernel(value: number, min = 1): number {
  let k = Math.max(min, Math.round(value))
  if (k % 2 === 0) k += 1
  return k
}

/** Parse a #rrggbb hex string into an OpenCV RGBA Scalar. */
function hexToScalar(cv: OpenCVModule, hex: string): OpenCVModule {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  const r = m ? parseInt(m[1], 16) : 0
  const g = m ? parseInt(m[2], 16) : 255
  const b = m ? parseInt(m[3], 16) : 0
  return new cv.Scalar(r, g, b, 255)
}

/**
 * Shared scaffold for filter nodes that map a source frame to a single output
 * texture. Handles lazy CV load, frame-skip throttle, Mat lifecycle of the
 * src/dst pair, imshow, and texture creation. `apply` runs the op into `dst`
 * (creating + deleting any extra Mats itself).
 */
function runFilter(
  ctx: ExecutionContext,
  apply: (cv: OpenCVModule, src: OpenCVModule, dst: OpenCVModule) => void
): Map<string, unknown> {
  const outputs = new Map<string, unknown>()
  const source = ctx.inputs.get('source')
  const interval = (ctx.controls.get('interval') as number) ?? 2
  const state = getState(ctx.nodeId)

  // Lazy-load OpenCV on first use; emit held texture meanwhile.
  if (!openCVService.isReady()) {
    void openCVService.load().catch((err) => console.error('[OpenCV]', err))
    outputs.set('texture', state.texture)
    outputs.set('width', state.canvas.width)
    outputs.set('height', state.canvas.height)
    outputs.set('loading', true)
    return outputs
  }

  const imageData = sourceToImageData(source)
  if (!imageData) {
    outputs.set('texture', state.texture)
    outputs.set('width', state.canvas.width)
    outputs.set('height', state.canvas.height)
    outputs.set('loading', false)
    if (source) outputs.set('_error', 'Unsupported source. Connect a texture or video feed.')
    return outputs
  }

  // Frame-skip throttle (CPU ops are expensive on large frames).
  const currentFrame = ctx.frameCount
  const due = state.lastFrame < 0 || currentFrame - state.lastFrame >= interval
  if (due) {
    state.lastFrame = currentFrame
    const cv = openCVService.getCV()!
    const src = cv.matFromImageData(imageData)
    const dst = new cv.Mat()
    try {
      apply(cv, src, dst)
      cv.imshow(state.canvas, dst)
    } catch (err) {
      console.error('[OpenCV] op failed:', err)
    } finally {
      src.delete()
      dst.delete()
    }

    const renderer = getThreeShaderRenderer()
    if (state.texture) {
      renderer.updateTexture(state.texture, state.canvas)
    } else {
      state.texture = renderer.createTexture(state.canvas)
    }
  }

  outputs.set('texture', state.texture)
  outputs.set('width', state.canvas.width)
  outputs.set('height', state.canvas.height)
  outputs.set('loading', false)
  return outputs
}

// ============================================================================
// Filter nodes
// ============================================================================

export const cvGrayscaleExecutor: NodeExecutorFn = (ctx) =>
  runFilter(ctx, (cv, src, dst) => {
    cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY)
  })

export const cvCannyExecutor: NodeExecutorFn = (ctx) => {
  const lo = (ctx.controls.get('lowThreshold') as number) ?? 50
  const hi = (ctx.controls.get('highThreshold') as number) ?? 150
  return runFilter(ctx, (cv, src, dst) => {
    const gray = new cv.Mat()
    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      cv.Canny(gray, dst, lo, hi)
    } finally {
      gray.delete()
    }
  })
}

export const cvThresholdExecutor: NodeExecutorFn = (ctx) => {
  const mode = (ctx.controls.get('mode') as string) ?? 'binary'
  const thresh = (ctx.controls.get('threshold') as number) ?? 127
  const invert = (ctx.controls.get('invert') as boolean) ?? false
  const blockSize = oddKernel((ctx.controls.get('blockSize') as number) ?? 11, 3)
  const c = (ctx.controls.get('c') as number) ?? 2
  return runFilter(ctx, (cv, src, dst) => {
    const gray = new cv.Mat()
    try {
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      const baseType = invert ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY
      if (mode === 'adaptive') {
        cv.adaptiveThreshold(gray, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, baseType, blockSize, c)
      } else if (mode === 'otsu') {
        cv.threshold(gray, dst, 0, 255, baseType | cv.THRESH_OTSU)
      } else {
        cv.threshold(gray, dst, thresh, 255, baseType)
      }
    } finally {
      gray.delete()
    }
  })
}

export const cvBlurExecutor: NodeExecutorFn = (ctx) => {
  const mode = (ctx.controls.get('mode') as string) ?? 'gaussian'
  const kernel = oddKernel((ctx.controls.get('kernel') as number) ?? 5, 1)
  return runFilter(ctx, (cv, src, dst) => {
    if (mode === 'median') {
      cv.medianBlur(src, dst, kernel)
    } else {
      cv.GaussianBlur(src, dst, new cv.Size(kernel, kernel), 0, 0, cv.BORDER_DEFAULT)
    }
  })
}

export const cvMorphologyExecutor: NodeExecutorFn = (ctx) => {
  const op = (ctx.controls.get('operation') as string) ?? 'dilate'
  const kernelSize = oddKernel((ctx.controls.get('kernel') as number) ?? 3, 1)
  const iterations = Math.max(1, Math.round((ctx.controls.get('iterations') as number) ?? 1))
  return runFilter(ctx, (cv, src, dst) => {
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelSize, kernelSize))
    const anchor = new cv.Point(-1, -1)
    try {
      if (op === 'erode') {
        cv.erode(src, dst, kernel, anchor, iterations, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue())
      } else if (op === 'dilate') {
        cv.dilate(src, dst, kernel, anchor, iterations, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue())
      } else {
        const mode = op === 'open' ? cv.MORPH_OPEN : op === 'close' ? cv.MORPH_CLOSE : cv.MORPH_GRADIENT
        cv.morphologyEx(src, dst, mode, kernel, anchor, iterations)
      }
    } finally {
      kernel.delete()
    }
  })
}

// ============================================================================
// Contours node (annotated texture + contour data)
// ============================================================================

export const cvContoursExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const outputs = new Map<string, unknown>()
  const source = ctx.inputs.get('source')
  const interval = (ctx.controls.get('interval') as number) ?? 2
  const thresh = (ctx.controls.get('threshold') as number) ?? 127
  const minArea = (ctx.controls.get('minArea') as number) ?? 100
  const lineWidth = Math.max(1, Math.round((ctx.controls.get('lineWidth') as number) ?? 2))
  const color = (ctx.controls.get('color') as string) || '#00ff00'
  const state = getState(ctx.nodeId)

  if (!openCVService.isReady()) {
    void openCVService.load().catch((err) => console.error('[OpenCV]', err))
    outputs.set('texture', state.texture)
    outputs.set('contours', [])
    outputs.set('count', 0)
    outputs.set('loading', true)
    return outputs
  }

  const imageData = sourceToImageData(source)
  if (!imageData) {
    outputs.set('texture', state.texture)
    outputs.set('contours', [])
    outputs.set('count', 0)
    outputs.set('loading', false)
    if (source) outputs.set('_error', 'Unsupported source. Connect a texture or video feed.')
    return outputs
  }

  const currentFrame = ctx.frameCount
  const due = state.lastFrame < 0 || currentFrame - state.lastFrame >= interval
  if (!due) {
    outputs.set('texture', state.texture)
    outputs.set('contours', state.lastContours ?? [])
    outputs.set('count', (state.lastContours ?? []).length)
    outputs.set('loading', false)
    return outputs
  }
  state.lastFrame = currentFrame

  const cv = openCVService.getCV()!
  const src = cv.matFromImageData(imageData)
  const gray = new cv.Mat()
  const binary = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const found: Array<{ area: number; x: number; y: number; width: number; height: number }> = []
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.threshold(gray, binary, thresh, 255, cv.THRESH_BINARY)
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const drawColor = hexToScalar(cv, color)
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i)
      const area = cv.contourArea(contour)
      if (area >= minArea) {
        cv.drawContours(src, contours, i, drawColor, lineWidth, cv.LINE_8, hierarchy, 0)
        const rect = cv.boundingRect(contour)
        found.push({ area, x: rect.x, y: rect.y, width: rect.width, height: rect.height })
      }
      contour.delete()
    }
    cv.imshow(state.canvas, src)
  } catch (err) {
    console.error('[OpenCV] contours op failed:', err)
  } finally {
    src.delete()
    gray.delete()
    binary.delete()
    contours.delete()
    hierarchy.delete()
  }

  const renderer = getThreeShaderRenderer()
  if (state.texture) {
    renderer.updateTexture(state.texture, state.canvas)
  } else {
    state.texture = renderer.createTexture(state.canvas)
  }

  state.lastContours = found
  outputs.set('texture', state.texture)
  outputs.set('contours', found)
  outputs.set('count', found.length)
  outputs.set('loading', false)
  return outputs
}

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
}
