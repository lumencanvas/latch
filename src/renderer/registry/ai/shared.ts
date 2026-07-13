/**
 * AI shared state, helpers & lifecycle (Workstream B co-location).
 *
 * The model/result caches + per-node state Maps/Sets, the shared helpers (runModelInference, getCached/
 * setCached, convertToImageData, hasTriggerValue, isNodeDisposed, runLiveDetection, …), and the gc/dispose
 * lifecycle live here so each AI node's executor can co-locate in its own registry/ai/<id>/node.ts.
 * Moved verbatim from engine/executors/ai.ts (now a thin re-export shim). Store-free leaf.
 */

import * as Tone from 'tone'
import * as THREE from 'three'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import { defineLifecycle } from '@/engine/nodeState'
import { drawBoundingBox } from '@/registry/ai/utils/mediapipe-drawing'
import { aiInference } from '@/services/ai/AIInference'
import { textToSpeechService } from '@/services/ai/TextToSpeechService'
import { COCO_LABELS } from '@/services/ai/yolo'
import { AudioBufferServiceImpl } from '@/services/audio/AudioBufferService'
import { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'



// Cache for node state and results
export const nodeCache = new Map<string, unknown>()

// Track pending async operations per node
export const pendingOperations = new Map<string, Promise<void>>()

// Track disposed nodes to prevent async callbacks from updating stale state
export const disposedNodes = new Set<string>()

// Per-node held canvas + texture for the live object-detection node. Kept in a
// dedicated map (not nodeCache) so the THREE.Texture can be disposed on cleanup.
export interface LiveDetectState {
  canvas: HTMLCanvasElement
  texture: THREE.Texture | null
}
export const liveDetectState = new Map<string, LiveDetectState>()

export function disposeLiveDetectNode(nodeId: string): void {
  const state = liveDetectState.get(nodeId)
  if (state) {
    if (state.texture) state.texture.dispose()
    state.canvas.width = 0
    state.canvas.height = 0
    liveDetectState.delete(nodeId)
  }
}

// Check if a node has been disposed (for use in async callbacks)
export function isNodeDisposed(nodeId: string): boolean {
  return disposedNodes.has(nodeId)
}

export function getCached<T>(key: string, defaultValue: T): T {
  const val = nodeCache.get(key)
  return val !== undefined ? (val as T) : defaultValue
}

export function setCached(key: string, value: unknown): void {
  nodeCache.set(key, value)
}

// Helper to check for truthy trigger values
export function hasTriggerValue(trigger: unknown): boolean {
  return trigger !== undefined && trigger !== null && trigger !== false && trigger !== 0 && trigger !== ''
}

/** Coarse lifecycle state of a model-backed node, for callers that branch on it. */
export type InferenceState = 'not-loaded' | 'idle' | 'running' | 'ready'

export interface InferenceOutcome<T> {
  /** Latest successful result, cached across frames (undefined until the first run). */
  result: T | undefined
  state: InferenceState
  /** True only on the frame a fresh inference op was kicked off — lets interval/
   *  change-gated executors update their own throttle bookkeeping (lastFrame/lastText). */
  started: boolean
}

/**
 * Shared inference lifecycle for model-backed AI executors (the §8 `runModelInference`).
 *
 * Resolves the node's selected `model` control, gates on the model being loaded,
 * runs `infer` as a per-node deduped async op (via `pendingOperations`), and latches
 * the standardized `loading`/`progress`/`done`/`error` outputs into `outputs`. Returns
 * the latest cached result for the caller to map onto its domain output ports.
 *
 * This replaces the ~50-line preamble each AI executor copied — and crucially the
 * silently-swallowed `catch` (it only `console.error`'d): an inference exception now
 * surfaces on the public `error` output, which the engine routes to the node badge.
 *
 * State is held in the existing module-level `nodeCache`/`pendingOperations` keyed by
 * `${nodeId}:…`, so the existing `disposeAINode`/`gcAIState` cleanup covers it with no
 * new teardown path. `done` is a one-frame rising edge after a successful resolve.
 * Transient/connecting states are NOT this function's concern — those belong on
 * `loading`, never `error` (a model that needs loading is a user-action error, kept).
 */
export function runModelInference<T>(
  ctx: ExecutionContext,
  outputs: Map<string, unknown>,
  opts: {
    task: string
    infer: (modelId: string | undefined) => Promise<T>
    shouldRun: boolean
    /** Overrides the default 'Model not loaded…' error text (e.g. a task-specific hint). */
    notLoadedMessage?: string
  },
): InferenceOutcome<T> {
  const nodeId = ctx.nodeId
  const modelId = ctx.controls.get('model') as string | undefined
  const resultKey = `${nodeId}:lastResult`
  const errorKey = `${nodeId}:lastError`
  const doneKey = `${nodeId}:done`
  const result = getCached<T | undefined>(resultKey, undefined)

  // Write the standardized ports. `error` is '' (not absent) when clear so the badge
  // latch clears; `done` is read-once so it pulses for a single frame.
  const emit = (loading: boolean, error: string | null) => {
    outputs.set('loading', loading)
    outputs.set('progress', aiInference.getModelInfo(opts.task, modelId)?.progress ?? 0)
    const done = getCached(doneKey, false)
    if (done) setCached(doneKey, false)
    outputs.set('done', done)
    outputs.set('error', error ?? '')
  }

  // Model isn't ready. Distinguish two cases (per §3): a model actively downloading
  // (e.g. from the Model Manager) is a transient — show the spinner, no error; an
  // unloaded model is a needs-user-action error (matches the prior `_error`).
  if (!aiInference.isModelLoaded(opts.task, modelId)) {
    const downloading = aiInference.getModelInfo(opts.task, modelId)?.state === 'loading'
    emit(downloading, downloading ? null : (opts.notLoadedMessage ?? 'Model not loaded. Open AI Model Manager to load.'))
    return { result, state: 'not-loaded', started: false }
  }

  // An op is already in flight: hold `loading` until it resolves (no new op).
  if (pendingOperations.has(nodeId)) {
    emit(true, null)
    return { result, state: 'running', started: false }
  }

  // Nothing to run this frame: reflect the last latched error (if any) and idle.
  if (!opts.shouldRun) {
    emit(false, getCached<string | null>(errorKey, null))
    return { result, state: result !== undefined ? 'ready' : 'idle', started: false }
  }

  // Kick off a fresh tracked inference. result/error/done land in cache and are read
  // on subsequent frames (the executor runs every frame). The disposed guard prevents
  // a late resolve from writing stale state after the node is gone.
  const operation = (async () => {
    try {
      const value = await opts.infer(modelId)
      if (isNodeDisposed(nodeId)) return
      setCached(resultKey, value)
      setCached(errorKey, null)
      setCached(doneKey, true)
    } catch (err) {
      if (isNodeDisposed(nodeId)) return
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[AI Executor] ${opts.task} error:`, err)
      setCached(errorKey, message)
    } finally {
      pendingOperations.delete(nodeId)
    }
  })()
  pendingOperations.set(nodeId, operation)

  emit(true, null)
  return { result, state: 'running', started: true }
}

// ============================================================================
// Image Input Type Conversion
// ============================================================================

/**
 * Type guards for image input types
 */
export function isImageData(input: unknown): input is ImageData {
  return input instanceof ImageData
}

export function isHTMLCanvasElement(input: unknown): input is HTMLCanvasElement {
  return input instanceof HTMLCanvasElement
}

export function isHTMLVideoElement(input: unknown): input is HTMLVideoElement {
  return input instanceof HTMLVideoElement
}

export function isWebGLTexture(input: unknown): input is WebGLTexture {
  // WebGLTexture doesn't have a global constructor in all environments
  // Use ThreeShaderRenderer's context to check (avoids creating extra WebGL contexts)
  if (!input || typeof input !== 'object') return false
  // Quick check: THREE.Texture is not a WebGLTexture
  if (input instanceof THREE.Texture) return false
  try {
    const renderer = getThreeShaderRenderer()
    const gl = renderer.getContext()
    return gl !== null && gl.isTexture(input as WebGLTexture)
  } catch {
    return false
  }
}

export function isThreeTexture(input: unknown): input is THREE.Texture {
  return input instanceof THREE.Texture
}

/**
 * Convert WebGLTexture to ImageData (legacy fallback)
 * Uses ThreeShaderRenderer's context to avoid creating extra WebGL contexts
 */
export function webglTextureToImageData(texture: WebGLTexture): ImageData | null {
  try {
    const renderer = getThreeShaderRenderer()
    const gl = renderer.getContext()
    if (!gl) return null

    const canvas = renderer.getCanvas()
    const width = canvas.width
    const height = canvas.height

    // Create a framebuffer to read the texture
    const fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

    // Check framebuffer status
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.deleteFramebuffer(fbo)
      return null
    }

    // Read pixels from texture
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    // Clean up
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(fbo)

    // WebGL texture is upside down, need to flip vertically
    const flipped = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      const srcRow = (height - 1 - y) * width * 4
      const dstRow = y * width * 4
      flipped.set(pixels.subarray(srcRow, srcRow + width * 4), dstRow)
    }

    return new ImageData(new Uint8ClampedArray(flipped), width, height)
  } catch (err) {
    console.error('[AI] Failed to convert WebGLTexture to ImageData:', err)
    return null
  }
}

/**
 * Convert THREE.Texture to ImageData
 */
export function threeTextureToImageData(texture: THREE.Texture): ImageData | null {
  try {
    const renderer = getThreeShaderRenderer()

    // Get texture dimensions (texture.image is typed `{}` in @types/three 0.184).
    // Prefer the source's real size — a video element reports 0 for width/height but
    // exposes videoWidth/videoHeight. Falling back to a square 512 squished non-square
    // feeds (e.g. a 640×480 webcam), distorting both the detection input and the
    // annotated overlay; honoring the true aspect keeps boxes aligned.
    const image = texture.image as
      | { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
      | undefined
    const width = image?.width || image?.videoWidth || 512
    const height = image?.height || image?.videoHeight || 512

    // Create a temporary canvas to render the texture
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = width
    tempCanvas.height = height

    // Use ThreeShaderRenderer to render the texture to canvas
    renderer.renderToCanvas(texture, tempCanvas)

    // Extract ImageData from the canvas
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return null

    return ctx.getImageData(0, 0, width, height)
  } catch (err) {
    console.error('[AI] Failed to convert THREE.Texture to ImageData:', err)
    return null
  }
}

/**
 * Convert HTMLVideoElement to ImageData
 */
export function videoElementToImageData(video: HTMLVideoElement): ImageData | null {
  try {
    const width = video.videoWidth || video.width || 640
    const height = video.videoHeight || video.height || 480

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0, width, height)
    return ctx.getImageData(0, 0, width, height)
  } catch (err) {
    console.error('[AI] Failed to convert HTMLVideoElement to ImageData:', err)
    return null
  }
}

/**
 * Convert HTMLCanvasElement to ImageData
 */
export function canvasElementToImageData(canvas: HTMLCanvasElement): ImageData | null {
  try {
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    return ctx.getImageData(0, 0, canvas.width, canvas.height)
  } catch (err) {
    console.error('[AI] Failed to convert HTMLCanvasElement to ImageData:', err)
    return null
  }
}

/**
 * Convert any supported image input to ImageData for AI processing
 * Supports: ImageData, HTMLCanvasElement, HTMLVideoElement, THREE.Texture, WebGLTexture
 */
export function convertToImageData(input: unknown): ImageData | null {
  if (!input) return null

  // Already ImageData - return as-is
  if (isImageData(input)) {
    return input
  }

  // HTMLCanvasElement - extract ImageData
  if (isHTMLCanvasElement(input)) {
    return canvasElementToImageData(input)
  }

  // HTMLVideoElement - draw to canvas, extract ImageData
  if (isHTMLVideoElement(input)) {
    return videoElementToImageData(input)
  }

  // THREE.Texture - render to canvas, extract ImageData (preferred format)
  if (isThreeTexture(input)) {
    return threeTextureToImageData(input)
  }

  // WebGLTexture (legacy) - read pixels via framebuffer
  if (isWebGLTexture(input)) {
    return webglTextureToImageData(input as WebGLTexture)
  }

  // Unknown type
  console.warn('[AI] Unknown image input type:', typeof input, input)
  return null
}

// ============================================================================
// Speech Recognition Node
// ============================================================================

// Track per-node audio buffer service and state
export interface STTNodeState {
  audioBufferService: AudioBufferServiceImpl
  connectedAudioNode: Tone.ToneAudioNode | null
  connecting: boolean
  lastChunkTime: number
  vadWasSpeaking: boolean
  fullText: string // Accumulated text for continuous mode
}

export const sttState = new Map<string, STTNodeState>()

export function getSTTState(nodeId: string): STTNodeState {
  let state = sttState.get(nodeId)
  if (!state) {
    state = {
      audioBufferService: new AudioBufferServiceImpl(),
      connectedAudioNode: null,
      connecting: false,
      lastChunkTime: 0,
      vadWasSpeaking: false,
      fullText: '',
    }
    sttState.set(nodeId, state)
  }
  return state
}

// Check if audio input is a Tone.js node
export function isToneAudioNode(audio: unknown): audio is Tone.ToneAudioNode {
  return audio !== null && typeof audio === 'object' && 'connect' in audio && typeof (audio as Tone.ToneAudioNode).connect === 'function'
}

// Cleanup function for STT state
export function disposeSTTNode(nodeId: string): void {
  const state = sttState.get(nodeId)
  if (state) {
    state.audioBufferService.disconnect()
    sttState.delete(nodeId)
  }
}

// ============================================================================
// Live Object Detection Node (annotated texture output)
// ============================================================================

export type Detection = { label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }

/** Default YOLOv9/GELAN COCO weights (Xenova mirror; ~102 MB, CORS-enabled). */
export const DEFAULT_YOLO_URL = 'https://huggingface.co/Xenova/yolov9-onnx/resolve/main/gelan-c.onnx'

export interface LiveOverlayOptions {
  interval: number
  showBoxes: boolean
  showLabels: boolean
  boxColor: string
  lineWidth: number
  boxStyle: 'box' | 'corners' | 'filled'
  colorMode: 'class' | 'uniform'
}

/**
 * Shared live-detection loop: normalize source → ImageData, throttle the async
 * detect by frame interval (or trigger), cache results, and redraw the frame +
 * last-known boxes into a held texture every frame. `detect` swaps the backend
 * (transformers pipeline vs raw YOLO ONNX); everything else is identical.
 */

// Ultralytics' 20-color palette — distinct, high-contrast per-class colors.
export const DETECTION_PALETTE = [
  '#042AFF', '#0BDBEB', '#F3F3F3', '#00DFB7', '#111F68', '#FF6FDD', '#FF444F', '#CCED00',
  '#00F344', '#BD00FF', '#00B4FF', '#DD00BA', '#00FFFF', '#26C000', '#01FFB3', '#7D24FF',
  '#7B0068', '#FF1B6C', '#FC6D2F', '#A2FF0B',
]
export const cocoClassIndex = new Map(COCO_LABELS.map((label, i) => [label, i]))

export function hashLabel(label: string): number {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash)
  return Math.abs(hash)
}

// Stable, distinct color per class: index by COCO class when the label is known
// (so 'person' is always the same color across frames and detectors), else by a
// label hash, into the curated palette.
export function colorForLabel(label: string): string {
  const idx = cocoClassIndex.get(label) ?? hashLabel(label)
  return DETECTION_PALETTE[idx % DETECTION_PALETTE.length]
}

// A compact status bar burned into the annotated frame (so it shows on the node
// preview and the main output alike): object count, top label, and last inference
// latency — the "annotate on the preview" overlay.
export function drawDetectionHud(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  info: { count: number; topLabel: string; detectMs: number; loading: boolean; accent: string }
): void {
  const fontPx = Math.max(12, Math.round(((width + height) / 2) * 0.022))
  const pad = Math.round(fontPx * 0.55)
  const parts: string[] = []
  parts.push(`${info.count} object${info.count === 1 ? '' : 's'}`)
  if (info.topLabel) parts.push(info.topLabel)
  if (info.detectMs > 0) parts.push(`${Math.round(info.detectMs)} ms`)
  const text = (info.loading ? 'loading…   ·   ' : '') + parts.join('   ·   ')

  ctx.save()
  ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, -apple-system, sans-serif`
  ctx.textBaseline = 'middle'

  const margin = Math.round(fontPx * 0.5)
  const dot = Math.round(fontPx * 0.42)
  const tw = ctx.measureText(text).width
  const barH = fontPx + pad * 2
  const barW = pad + dot + pad * 0.6 + tw + pad

  // Pill background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  roundRectPath(ctx, margin, margin, barW, barH, Math.min(barH / 2, 10))
  ctx.fill()

  // Status dot (accent / amber while loading)
  ctx.fillStyle = info.loading ? '#ffd93d' : info.accent
  ctx.beginPath()
  ctx.arc(margin + pad + dot / 2, margin + barH / 2, dot / 2, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#f5f5f5'
  ctx.fillText(text, margin + pad + dot + pad * 0.6, margin + barH / 2 + 0.5)
  ctx.restore()
}

/** Local rounded-rect path helper (mirrors the one in mediapipe-drawing). */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, rr)
}

export function runLiveDetection(
  ctx: ExecutionContext,
  detect: (imageData: ImageData) => Promise<Detection[]>,
  opts: LiveOverlayOptions
): Map<string, unknown> {
  const outputs = new Map<string, unknown>()
  const source = ctx.inputs.get('source')
  const trigger = ctx.inputs.get('trigger')
  const { interval, showBoxes, showLabels, boxColor, lineWidth, boxStyle, colorMode } = opts

  const cachedDetections = getCached<Detection[]>(`${ctx.nodeId}:detections`, [])
  const loading = pendingOperations.has(ctx.nodeId) || getCached(`${ctx.nodeId}:loading`, false)
  // A previously-swallowed inference failure, surfaced on the public `error` port (badge
  // via the engine latch); cleared by the next successful detect. The transient
  // unsupported-source status stays on the internal `_error` channel.
  const detectError = getCached<string | null>(`${ctx.nodeId}:detectError`, null) ?? ''

  // Normalize any texture/video/canvas source to ImageData (reuses the shared helper).
  const imageData = convertToImageData(source)

  // Reuse the held state so the texture persists between frames.
  let state = liveDetectState.get(ctx.nodeId)
  if (!state) {
    state = { canvas: document.createElement('canvas'), texture: null }
    liveDetectState.set(ctx.nodeId, state)
  }

  if (!imageData) {
    // No usable input this frame — keep emitting the last held texture/detections.
    outputs.set('detections', cachedDetections)
    outputs.set('count', cachedDetections.length)
    outputs.set('topLabel', getCached(`${ctx.nodeId}:topLabel`, ''))
    outputs.set('texture', state.texture)
    outputs.set('loading', loading)
    outputs.set('error', detectError)
    if (source) {
      outputs.set('_error', 'Unsupported source. Connect a texture or video feed.')
    }
    return outputs
  }

  const width = imageData.width
  const height = imageData.height

  // Throttle detection by frame interval (or run immediately on trigger).
  // -1 sentinel = never run (a stored 0 is a real frame, not "never").
  const hasTrigger = hasTriggerValue(trigger)
  const currentFrame = ctx.frameCount
  const lastFrame = getCached<number>(`${ctx.nodeId}:lastFrame`, -1)
  const due = hasTrigger || lastFrame < 0 || currentFrame - lastFrame >= interval

  if (due && !pendingOperations.has(ctx.nodeId)) {
    setCached(`${ctx.nodeId}:lastFrame`, currentFrame)
    setCached(`${ctx.nodeId}:loading`, true)
    const operation = (async () => {
      const startedAt = performance.now()
      try {
        const detections = await detect(imageData)
        if (isNodeDisposed(ctx.nodeId)) return
        setCached(`${ctx.nodeId}:detections`, detections)
        const top = detections.reduce<Detection | null>((best, d) => (!best || d.score > best.score ? d : best), null)
        setCached(`${ctx.nodeId}:topLabel`, top?.label ?? '')
        // Last inference latency (ms) for the HUD. First call includes the model
        // download, so it reads high until the model is cached.
        setCached(`${ctx.nodeId}:detectMs`, performance.now() - startedAt)
        setCached(`${ctx.nodeId}:loading`, false)
        setCached(`${ctx.nodeId}:detectError`, null)
      } catch (error) {
        console.error('[AI] Live detection error:', error)
        setCached(`${ctx.nodeId}:loading`, false)
        setCached(`${ctx.nodeId}:detectError`, error instanceof Error ? error.message : String(error))
      } finally {
        pendingOperations.delete(ctx.nodeId)
      }
    })()
    pendingOperations.set(ctx.nodeId, operation)
  }

  // Draw the current frame + last-known detections into the held canvas every
  // frame so the passthrough stays live and the overlay smooth between runs.
  state.canvas.width = width
  state.canvas.height = height
  const c2d = state.canvas.getContext('2d')
  if (c2d) {
    c2d.putImageData(imageData, 0, 0)

    if (showBoxes) {
      for (const det of cachedDetections) {
        const { xmin, ymin, xmax, ymax } = det.box
        drawBoundingBox(
          c2d,
          {
            originX: xmin / width,
            originY: ymin / height,
            width: (xmax - xmin) / width,
            height: (ymax - ymin) / height,
          },
          width,
          height,
          showLabels ? det.label : undefined,
          showLabels ? det.score : undefined,
          {
            color: colorMode === 'uniform' ? boxColor : colorForLabel(det.label),
            lineWidth: lineWidth > 0 ? lineWidth : undefined,
            style: boxStyle,
          }
        )
      }
    }

    // Status HUD (gated on Show Labels so a clean passthrough stays clean).
    if (showLabels) {
      drawDetectionHud(c2d, width, height, {
        count: cachedDetections.length,
        topLabel: getCached(`${ctx.nodeId}:topLabel`, ''),
        detectMs: getCached(`${ctx.nodeId}:detectMs`, 0),
        loading: pendingOperations.has(ctx.nodeId) || getCached(`${ctx.nodeId}:loading`, false),
        accent: boxColor,
      })
    }

    const renderer = getThreeShaderRenderer()
    if (state.texture) {
      renderer.updateTexture(state.texture, state.canvas)
    } else {
      state.texture = renderer.createTexture(state.canvas)
    }
  }

  outputs.set('detections', cachedDetections)
  outputs.set('count', cachedDetections.length)
  outputs.set('topLabel', getCached(`${ctx.nodeId}:topLabel`, ''))
  outputs.set('texture', state.texture)
  // Recompute after the possible kickoff above so it reflects the live state.
  outputs.set('loading', pendingOperations.has(ctx.nodeId) || getCached(`${ctx.nodeId}:loading`, false))
  outputs.set('error', detectError)
  return outputs
}

export function overlayOptions(ctx: ExecutionContext, defaultInterval: number): LiveOverlayOptions {
  return {
    interval: (ctx.controls.get('interval') as number) ?? defaultInterval,
    showBoxes: (ctx.controls.get('showBoxes') as boolean) ?? true,
    showLabels: (ctx.controls.get('showLabels') as boolean) ?? true,
    boxColor: (ctx.controls.get('boxColor') as string) || '#00ff00',
    lineWidth: (ctx.controls.get('lineWidth') as number) ?? 0,
    boxStyle: ((ctx.controls.get('boxStyle') as string) || 'box') as 'box' | 'corners' | 'filled',
    colorMode: ((ctx.controls.get('colorMode') as string) || 'class') as 'class' | 'uniform',
  }
}

// ============================================================================
// Depth Estimation (MiDaS / Depth-Anything) — grayscale/colorized depth texture
// ============================================================================

export interface DepthState {
  canvas: HTMLCanvasElement
  texture: THREE.Texture | null
}
export const depthEstimateState = new Map<string, DepthState>()

export function disposeDepthNode(nodeId: string): void {
  const state = depthEstimateState.get(nodeId)
  if (state) {
    if (state.texture) state.texture.dispose()
    state.canvas.width = 0
    state.canvas.height = 0
    depthEstimateState.delete(nodeId)
  }
}

/** Cheap jet-style colormap (blue→cyan→green→yellow→red) for depth viz. */
export function depthColor(t: number): [number, number, number] {
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  return [
    Math.round(255 * clamp(1.5 - Math.abs(4 * t - 3))),
    Math.round(255 * clamp(1.5 - Math.abs(4 * t - 2))),
    Math.round(255 * clamp(1.5 - Math.abs(4 * t - 1))),
  ]
}

export type DepthResult = { width: number; height: number; channels: number; data: number[] }

// ============================================================================
// MediaPipe Pose Estimation Node
// ============================================================================

// Pose landmark indices
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
}

// ============================================================================
// MediaPipe Audio Classification Executor
// ============================================================================

// Track per-node audio buffer service for audio classification
export interface AudioClassifierNodeState {
  audioBufferService: AudioBufferServiceImpl
  connectedAudioNode: Tone.ToneAudioNode | null
  connecting: boolean
  lastClassifyTime: number
}

export const audioClassifierState = new Map<string, AudioClassifierNodeState>()

export function getAudioClassifierState(nodeId: string): AudioClassifierNodeState {
  let state = audioClassifierState.get(nodeId)
  if (!state) {
    state = {
      audioBufferService: new AudioBufferServiceImpl(),
      connectedAudioNode: null,
      connecting: false,
      lastClassifyTime: 0,
    }
    audioClassifierState.set(nodeId, state)
  }
  return state
}

// Speech-related categories from YAMNet
export const SPEECH_CATEGORIES = [
  'speech', 'narration', 'conversation', 'monologue', 'babbling',
  'speech synthesizer', 'shout', 'bellow', 'whoop', 'yell', 'screaming',
  'children shouting', 'male speech', 'female speech', 'child speech',
  'whispering', 'laughter', 'baby laughter', 'giggle', 'snicker', 'belly laugh',
  'chuckle, chortle', 'crying, sobbing', 'baby cry', 'whimper', 'sigh',
  'singing', 'choir', 'yodeling', 'chant', 'mantra',
]

// Music-related categories from YAMNet
export const MUSIC_CATEGORIES = [
  'music', 'musical instrument', 'plucked string instrument', 'guitar',
  'electric guitar', 'bass guitar', 'acoustic guitar', 'steel guitar',
  'tapping (guitar technique)', 'strum', 'banjo', 'sitar', 'mandolin',
  'zither', 'ukulele', 'keyboard (musical)', 'piano', 'electric piano',
  'organ', 'electronic organ', 'hammond organ', 'synthesizer', 'sampler',
  'harpsichord', 'percussion', 'drum kit', 'drum machine', 'drum',
  'snare drum', 'rimshot', 'drum roll', 'bass drum', 'timpani',
  'tabla', 'cymbal', 'hi-hat', 'wood block', 'tambourine', 'rattle',
  'maraca', 'gong', 'tubular bells', 'mallet percussion', 'marimba',
  'xylophone', 'glockenspiel', 'vibraphone', 'steelpan', 'orchestra',
  'brass instrument', 'french horn', 'trumpet', 'trombone', 'bowed string instrument',
  'string section', 'violin, fiddle', 'pizzicato', 'cello', 'double bass',
  'wind instrument', 'flute', 'saxophone', 'clarinet', 'harp', 'bell',
  'church bell', 'jingle bell', 'bicycle bell', 'tuning fork', 'chime',
  'wind chime', 'change ringing (campanology)', 'harmonica', 'accordion',
  'bagpipes', 'didgeridoo', 'shofar', 'theremin', 'singing bowl', 'scratching',
  'pop music', 'hip hop music', 'beatboxing', 'rock music', 'heavy metal',
  'punk rock', 'grunge', 'progressive rock', 'rock and roll', 'psychedelic rock',
  'rhythm and blues', 'soul music', 'reggae', 'country', 'swing music',
  'bluegrass', 'funk', 'folk music', 'middle eastern music', 'jazz',
  'disco', 'classical music', 'opera', 'electronic music', 'house music',
  'techno', 'dubstep', 'drum and bass', 'electronica', 'electronic dance music',
  'ambient music', 'trance music', 'music of latin america', 'salsa music',
  'flamenco', 'blues', 'music for children', 'new-age music', 'vocal music',
  'a]capella', 'music of africa', 'afrobeat', 'christian music', 'gospel music',
  'music of asia', 'carnatic music', 'music of bollywood', 'ska', 'traditional music',
  'independent music', 'song', 'background music', 'theme music', 'jingle',
  'soundtrack music', 'lullaby', 'video game music', 'christmas music', 'dance music',
  'wedding music', 'happy music', 'sad music', 'tender music', 'exciting music',
  'angry music', 'scary music',
]

// Cleanup function for audio classifier state
export function disposeAudioClassifierNode(nodeId: string): void {
  const state = audioClassifierState.get(nodeId)
  if (state) {
    state.audioBufferService.disconnect()
    audioClassifierState.delete(nodeId)
  }
}

// ============================================================================
// Text-to-Speech (Web Speech API, main thread — no model download)
// ============================================================================

export interface TTSState {
  lastText: string
  lastTriggerHigh: boolean
  speaking: boolean
  utterance: SpeechSynthesisUtterance | null
}
export const ttsState = new Map<string, TTSState>()

/** Stop this node's speech and drop its state (dispose/gc). */
export function disposeTTSNode(nodeId: string): void {
  const state = ttsState.get(nodeId)
  if (state) {
    if (state.speaking) textToSpeechService.cancel()
    if (state.utterance) {
      state.utterance.onend = null
      state.utterance.onerror = null
    }
    ttsState.delete(nodeId)
  }
}

// ============================================================================
// Cleanup helpers
// ============================================================================

export function disposeAINode(nodeId: string): void {
  // Mark as disposed to prevent async callbacks from updating stale state
  disposedNodes.add(nodeId)

  const keys = Array.from(nodeCache.keys()).filter(k => k.startsWith(nodeId))
  keys.forEach(k => nodeCache.delete(k))
  pendingOperations.delete(nodeId)

  // Disconnect STT audio service before deleting
  const stt = sttState.get(nodeId)
  if (stt?.audioBufferService) {
    stt.audioBufferService.disconnect()
  }
  sttState.delete(nodeId)

  // Disconnect audio classifier service before deleting
  const audioClassifier = audioClassifierState.get(nodeId)
  if (audioClassifier?.audioBufferService) {
    audioClassifier.audioBufferService.disconnect()
  }
  audioClassifierState.delete(nodeId)

  // Stop any text-to-speech this node started.
  disposeTTSNode(nodeId)

  // Dispose any depth-estimation texture.
  disposeDepthNode(nodeId)
}

export function disposeAllAINodes(): void {
  // Mark all nodes as disposed
  for (const key of nodeCache.keys()) {
    const nodeId = key.split(':')[0]
    disposedNodes.add(nodeId)
  }
  for (const nodeId of pendingOperations.keys()) {
    disposedNodes.add(nodeId)
  }
  for (const nodeId of sttState.keys()) {
    disposedNodes.add(nodeId)
  }
  for (const nodeId of audioClassifierState.keys()) {
    disposedNodes.add(nodeId)
  }

  // Disconnect all STT audio services before clearing
  for (const state of sttState.values()) {
    if (state?.audioBufferService) {
      state.audioBufferService.disconnect()
    }
  }

  // Disconnect all audio classifier services before clearing
  for (const state of audioClassifierState.values()) {
    if (state?.audioBufferService) {
      state.audioBufferService.disconnect()
    }
  }

  // Dispose live-detection textures before clearing
  for (const nodeId of liveDetectState.keys()) {
    disposeLiveDetectNode(nodeId)
  }

  // Stop all in-progress text-to-speech
  for (const nodeId of ttsState.keys()) {
    disposeTTSNode(nodeId)
  }

  // Dispose all depth-estimation textures
  for (const nodeId of depthEstimateState.keys()) {
    disposeDepthNode(nodeId)
  }

  nodeCache.clear()
  pendingOperations.clear()
  sttState.clear()
  audioClassifierState.clear()
}

/**
 * Clear the disposed-node guard so AI nodes work again after a stop→restart.
 *
 * disposeAllAINodes() (run on stop) marks every node disposed so that in-flight
 * detect/transcribe promises don't write into the just-cleared cache. On restart
 * the same nodes are live again — but gcAIState (the only place that clears the
 * set) runs ONLY when nodes are removed from the graph, not on a plain restart.
 * Without this reset, detection/STT/depth nodes stay flagged disposed and their
 * async results are silently dropped until a full page refresh. Called from
 * ExecutionEngine.start().
 */
export function resetAINodeDisposal(): void {
  disposedNodes.clear()
}

export function gcAIState(validNodeIds: Set<string>): void {
  // Clean nodeCache - keys formatted as "nodeId:suffix"
  for (const key of nodeCache.keys()) {
    const nodeId = key.split(':')[0]
    if (!validNodeIds.has(nodeId)) {
      disposedNodes.add(nodeId)
      nodeCache.delete(key)
    }
  }

  // Clean pendingOperations
  for (const nodeId of pendingOperations.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposedNodes.add(nodeId)
      pendingOperations.delete(nodeId)
    }
  }

  // Clean live-detection held canvas/texture (dispose the THREE.Texture)
  for (const nodeId of liveDetectState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposeLiveDetectNode(nodeId)
    }
  }

  // Stop text-to-speech for removed nodes
  for (const nodeId of ttsState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposeTTSNode(nodeId)
    }
  }

  // Dispose depth-estimation textures for removed nodes
  for (const nodeId of depthEstimateState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposeDepthNode(nodeId)
    }
  }

  // Clean sttState (disconnect audio first)
  for (const nodeId of sttState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposedNodes.add(nodeId)
      const state = sttState.get(nodeId)
      if (state?.audioBufferService) {
        state.audioBufferService.disconnect()
      }
      sttState.delete(nodeId)
    }
  }

  // Clean audioClassifierState (disconnect audio first)
  for (const nodeId of audioClassifierState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposedNodes.add(nodeId)
      const state = audioClassifierState.get(nodeId)
      if (state?.audioBufferService) {
        state.audioBufferService.disconnect()
      }
      audioClassifierState.delete(nodeId)
    }
  }

  // Clean up old entries from disposedNodes set to prevent unbounded growth
  // Keep only recently disposed nodes (those not in validNodeIds)
  for (const nodeId of disposedNodes) {
    if (validNodeIds.has(nodeId)) {
      disposedNodes.delete(nodeId)
    }
  }
}

// Each AI node's executor body lives in its own registry/ai/<id>/node.ts; this module holds only
// the shared state/helpers/lifecycle those executors import. There is no `aiExecutors` map to register.

// Self-register into the engine's generic lifecycle loop (replaces the hand-wired
// gcAIState / disposeAllAINodes / resetAINodeDisposal calls in ExecutionEngine).
// `defineLifecycle`, NOT `defineNodeState`: the `disposedNodes` marker Set is
// deliberately asymmetric — disposeAll/gc ADD to it (so late worker/model results are
// dropped), and only onStart (engine start) CLEARS it (stop→restart guard). A store's
// uniform disposeAll-clears-the-map cannot express that. Logic is unchanged.
defineLifecycle({
  label: 'ai',
  gc: gcAIState,
  disposeAll: disposeAllAINodes,
  onStart: resetAINodeDisposal,
})
