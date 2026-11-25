/**
 * AI Inference Web Worker
 *
 * Runs Transformers.js inference off the main thread to prevent UI blocking.
 * All model loading and inference happens in this worker.
 */

import { walkLadder, type Rung } from '@hackbuild/models'
import {
  pipeline,
  env,
  AutoProcessor,
  AutoModelForVision2Seq,
  AutoModelForImageTextToText,
  SamModel,
  RawImage,
} from '@huggingface/transformers'
import * as ort from 'onnxruntime-web'
import { isChatModel } from './textGenFormat'
import { parseYoloOutput, parseYolov10Output, isYolov10Output, nms, COCO_LABELS } from './yolo'

// Configure Transformers.js for browser usage
env.allowLocalModels = false
// Browser cache setting - can be toggled at runtime
env.useBrowserCache = true

// onnxruntime-web (the raw ORT backing the YOLO sessions — a SEPARATE package from
// the ORT that transformers.js bundles, so it is NOT configured by the lines above)
// ships its WASM backend as sibling files (ort-wasm-simd-threaded.{wasm,mjs}). Vite
// doesn't emit those next to the worker chunk, so ORT's default relative wasmPaths
// resolve to index.html and WebAssembly.instantiate aborts with "expected magic word
// 00 61 73 6d, found 3c 21 44 4f" (the leading "<!DO" of the HTML 404 page). Point ORT
// at the matching build on jsdelivr (CORS-enabled → loads under the app's
// credentialless COEP). onnxruntime-web is a TRANSITIVE dep (via @huggingface/
// transformers), so it is NOT pinned in package.json — after any transformers bump,
// re-sync this version string with the output of `npm ls onnxruntime-web`.
ort.env.wasm.wasmPaths =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/'

// Pipeline cache
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pipelines = new Map<string, any>()

// Image pixels arrive as a transferred Uint8ClampedArray (zero-copy) or, as a
// fallback, a plain number[]. Use the typed array directly when possible. The
// cast is sound: transferred image buffers are always ArrayBuffer-backed (a
// SharedArrayBuffer can't be transferred), and the number[] path allocates one.
function toPixels(data: Uint8ClampedArray | number[]): Uint8ClampedArray<ArrayBuffer> {
  return (
    data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data)
  ) as Uint8ClampedArray<ArrayBuffer>
}

// Message types
interface LoadModelMessage {
  type: 'load'
  id: string
  task: string
  model: string
  options?: {
    device?: 'cpu' | 'webgpu'
    dtype?: string
    useBrowserCache?: boolean
    /** Devices and precisions to try in order (hackbuild rungs), already filtered for this device. */
    ladder?: Rung[]
  }
}

interface InferenceMessage {
  type: 'infer'
  id: string
  task: string
  model: string
  method: string
  args: unknown[]
}

interface UnloadModelMessage {
  type: 'unload'
  id: string
  task: string
  model: string
}

interface CheckModelMessage {
  type: 'check'
  id: string
  task: string
  model: string
}

interface DisposeMessage {
  type: 'dispose'
  id: string
}

interface SetCacheMessage {
  type: 'setCache'
  enabled: boolean
}

interface ClearCacheMessage {
  type: 'clearCache'
  id: string
}

type WorkerMessage = LoadModelMessage | InferenceMessage | UnloadModelMessage | CheckModelMessage | DisposeMessage | SetCacheMessage | ClearCacheMessage

// Response types
interface ProgressResponse {
  type: 'progress'
  id: string
  progress: number
  status?: string
  file?: string
}

interface LoadedResponse {
  type: 'loaded'
  id: string
  success: boolean
  error?: string
  /** The device and precision the model loaded on. */
  used?: { device: string; dtype: unknown } | null
  /** Rungs that failed before it (why a model fell back to the CPU, say). */
  failures?: Array<{ device: string; dtype: unknown; kind: string; error: string }>
}

interface ResultResponse {
  type: 'result'
  id: string
  success: boolean
  data?: unknown
  error?: string
}

interface CheckResponse {
  type: 'checkResult'
  id: string
  loaded: boolean
}

type WorkerResponse = ProgressResponse | LoadedResponse | ResultResponse | CheckResponse

// Post message helper
function respond(response: WorkerResponse): void {
  self.postMessage(response)
}

// Vision-language models (SmolVLM, LFM2-VL) serve two tasks: answering about an image
// (image-text-to-text) and captioning (image-to-text, asked to describe). They load once per
// model whichever task asks, and are disposed when the last task using them unloads.
const VLM_MODEL_RE = /smolvlm|lfm2-vl/i
function isVlm(task: string, model: string): boolean {
  return task === 'image-text-to-text' || (task === 'image-to-text' && VLM_MODEL_RE.test(model))
}
const vlmUsers = new Map<string, Set<string>>()
/** The device and precision each loaded model ended up on. */
const usedByKey = new Map<string, { device: string; dtype: unknown }>()

// Get cache key for pipeline
function getCacheKey(task: string, model: string): string {
  return isVlm(task, model) ? `vlm:${model}` : `${task}:${model}`
}

// Handle model loading
async function handleLoad(msg: LoadModelMessage): Promise<void> {
  const key = getCacheKey(msg.task, msg.model)

  // Already loaded?
  if (pipelines.has(key)) {
    vlmUsers.get(key)?.add(msg.task)
    // A shared model (a VLM already loaded for its other task) reports where it actually runs.
    respond({ type: 'loaded', id: msg.id, success: true, used: usedByKey.get(key) ?? null, failures: [] })
    return
  }

  try {

    // Apply cache setting if provided
    if (msg.options?.useBrowserCache !== undefined) {
      env.useBrowserCache = msg.options.useBrowserCache
    }

    // Track progress across multiple files
    const fileProgress = new Map<string, number>()

    // Build pipeline options
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipelineOptions: Record<string, any> = {
      progress_callback: (progress: { status?: string; progress?: number; file?: string; loaded?: number; total?: number }) => {
        const file = progress.file ?? 'default'

        if (progress.status === 'initiate') {
          fileProgress.set(file, 0)
        } else if (progress.status === 'progress') {
          let fileProgressValue = progress.progress ?? 0
          if (progress.loaded !== undefined && progress.total !== undefined && progress.total > 0) {
            fileProgressValue = (progress.loaded / progress.total) * 100
          }
          fileProgress.set(file, Math.min(100, fileProgressValue))
        } else if (progress.status === 'done') {
          fileProgress.set(file, 100)
        }

        // Calculate aggregate progress
        let aggregateProgress = 0
        if (fileProgress.size > 0) {
          let sum = 0
          for (const p of fileProgress.values()) {
            sum += p
          }
          aggregateProgress = sum / fileProgress.size
        }

        aggregateProgress = Math.max(0, Math.min(99, aggregateProgress))

        respond({
          type: 'progress',
          id: msg.id,
          progress: aggregateProgress,
          status: progress.status,
          file: progress.file,
        })
      },
    }

    // One attempt on one device and precision. A ladder walks several; without one (old callers),
    // the single device/dtype from the options is used.
    const attempt = async (device: string | undefined, dtype: unknown) => {
      if (isVlm(msg.task, msg.model)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loadOpts: Record<string, any> = { progress_callback: pipelineOptions.progress_callback }
        if (device) loadOpts.device = device
        loadOpts.dtype = dtype ?? 'fp32'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const processor = await (AutoProcessor as any).from_pretrained(msg.model, {
          progress_callback: pipelineOptions.progress_callback,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // LFM2-VL registers under ImageTextToText; SmolVLM under Vision2Seq (it also maps there).
        const Cls = /lfm2-vl/i.test(msg.model) ? AutoModelForImageTextToText : AutoModelForVision2Seq
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = await (Cls as any).from_pretrained(msg.model, loadOpts)
        return { processor, model, vlm: true, modelId: msg.model }
      }
      if (msg.task === 'mask-generation') {
        // SlimSAM: an image encoder (run once per image, cached) and a small prompt decoder.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const processor = await (AutoProcessor as any).from_pretrained(msg.model, { progress_callback: pipelineOptions.progress_callback })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loadOpts: Record<string, any> = { progress_callback: pipelineOptions.progress_callback }
        if (device) loadOpts.device = device
        if (dtype !== undefined) loadOpts.dtype = dtype
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = await (SamModel as any).from_pretrained(msg.model, loadOpts)
        return { processor, model, sam: true, embedding: null }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opts: Record<string, any> = { progress_callback: pipelineOptions.progress_callback }
      if (device) opts.device = device
      if (dtype !== undefined) opts.dtype = dtype
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (pipeline as any)(msg.task, msg.model, opts)
    }

    const ladder = (msg.options?.ladder ?? []).filter((r) => r.device === 'webgpu' || r.device === 'wasm')
    let pipe: unknown
    let used: { device: string; dtype: unknown } | null = null
    let failures: Array<{ device: string; dtype: unknown; kind: string; error: string }> = []
    if (ladder.length) {
      const walked = await walkLadder(msg.model, ladder, (rung) => attempt(rung.device, rung.dtype))
      pipe = walked.value
      used = { device: walked.rung.device, dtype: walked.rung.dtype }
      failures = walked.failures.map((f) => ({ device: f.rung.device, dtype: f.rung.dtype, kind: f.kind, error: f.error.slice(0, 300) }))
    } else {
      const device = msg.options?.device === 'webgpu' ? 'webgpu' : undefined
      const dtype = msg.options?.dtype && msg.options.dtype !== 'fp32' ? msg.options.dtype : undefined
      pipe = await attempt(device, dtype ?? (isVlm(msg.task, msg.model) ? 'fp32' : undefined))
      used = { device: device ?? 'wasm', dtype }
    }
    pipelines.set(key, pipe)
    if (used) usedByKey.set(key, used)
    if (isVlm(msg.task, msg.model)) vlmUsers.set(key, new Set([msg.task]))
    respond({ type: 'loaded', id: msg.id, success: true, used, failures })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[AI Worker] Failed to load model: ${message}`)
    respond({ type: 'loaded', id: msg.id, success: false, error: message })
  }
}

// ===========================================================================
// YOLO (v8/v9/GELAN) ONNX — raw onnxruntime-web session (not a transformers
// pipeline). Reuses the ort instance transformers already configured at import.
// ===========================================================================

const YOLO_SIZE = 640
// One InferenceSession per model URL, lazily created and shared across calls.
const yoloSessions = new Map<string, Promise<ort.InferenceSession>>()

function getYoloSession(url: string): Promise<ort.InferenceSession> {
  let p = yoloSessions.get(url)
  if (!p) {
    p = ort.InferenceSession.create(url, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }).catch((e) => {
      yoloSessions.delete(url) // don't cache a failed load — allow retry
      throw e
    })
    yoloSessions.set(url, p)
  }
  return p
}

// Release a YOLO InferenceSession's WASM heap. The map stores the in-flight
// create() promise, so await it (swallowing a failed load) before release().
async function releaseYoloSession(p: Promise<ort.InferenceSession>): Promise<void> {
  try {
    await (await p).release()
  } catch {
    // load failed or already released — nothing to free
  }
}

// Release every cached YOLO session (worker dispose / cache clear). These hold
// WASM memory (~29–102 MB per model) that the pipelines map cleanup doesn't touch.
function releaseAllYoloSessions(): void {
  for (const p of yoloSessions.values()) void releaseYoloSession(p)
  yoloSessions.clear()
}

// Letterbox an ImageData to 640×640 (aspect-preserving, gray pad) and pack into
// a CHW float32 [1,3,640,640] tensor (RGB, /255). Returns the scale/pad so the
// detections can be mapped back to original-image coordinates.
function letterboxToTensor(img: ImageData): {
  tensor: Float32Array
  scale: number
  padX: number
  padY: number
} {
  const scale = Math.min(YOLO_SIZE / img.width, YOLO_SIZE / img.height)
  const nw = Math.round(img.width * scale)
  const nh = Math.round(img.height * scale)
  const padX = (YOLO_SIZE - nw) / 2
  const padY = (YOLO_SIZE - nh) / 2

  const src = new OffscreenCanvas(img.width, img.height)
  src.getContext('2d')!.putImageData(img, 0, 0)
  const dst = new OffscreenCanvas(YOLO_SIZE, YOLO_SIZE)
  const c = dst.getContext('2d')!
  c.fillStyle = 'rgb(114,114,114)'
  c.fillRect(0, 0, YOLO_SIZE, YOLO_SIZE)
  c.drawImage(src, padX, padY, nw, nh)

  const d = c.getImageData(0, 0, YOLO_SIZE, YOLO_SIZE).data
  const area = YOLO_SIZE * YOLO_SIZE
  const tensor = new Float32Array(3 * area)
  for (let i = 0; i < area; i++) {
    tensor[i] = d[i * 4] / 255 // R plane
    tensor[area + i] = d[i * 4 + 1] / 255 // G plane
    tensor[2 * area + i] = d[i * 4 + 2] / 255 // B plane
  }
  return { tensor, scale, padX, padY }
}

async function handleYoloInfer(msg: InferenceMessage): Promise<void> {
  try {
    const [serialized, options] = msg.args as [
      { width: number; height: number; data: Uint8ClampedArray | number[] },
      { threshold?: number; iou?: number }?,
    ]
    // msg.model carries the model URL.
    const session = await getYoloSession(msg.model)
    const img = new ImageData(toPixels(serialized.data), serialized.width, serialized.height)
    const { tensor, scale, padX, padY } = letterboxToTensor(img)

    const inputName = session.inputNames[0]
    const feeds: Record<string, ort.Tensor> = {
      [inputName]: new ort.Tensor('float32', tensor, [1, 3, YOLO_SIZE, YOLO_SIZE]),
    }
    const result = await session.run(feeds)
    const output = result[session.outputNames[0]]
    const dims = Array.from(output.dims)
    const data = output.data as Float32Array
    const confThreshold = options?.threshold ?? 0.25

    // YOLOv10 is NMS-free (`[1,300,6]` xyxy+score+class) — threshold + un-letterbox
    // only. v8/v9/GELAN (`[1,84,8400]`) need argmax over classes + per-class NMS.
    const boxes = isYolov10Output(dims)
      ? parseYolov10Output(data, dims, { confThreshold, scale, padX, padY })
      : nms(
          parseYoloOutput(data, dims, {
            confThreshold,
            scale,
            padX,
            padY,
            numClasses: COCO_LABELS.length,
          }),
          options?.iou ?? 0.45
        )
    respond({ type: 'result', id: msg.id, success: true, data: boxes })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[AI Worker] YOLO inference failed:', message)
    respond({ type: 'result', id: msg.id, success: false, error: message })
  }
}

// Handle inference
async function handleInfer(msg: InferenceMessage): Promise<void> {
  // YOLO ONNX runs a raw InferenceSession, not a transformers pipeline.
  if (msg.method === 'detectYolo') {
    await handleYoloInfer(msg)
    return
  }

  const key = getCacheKey(msg.task, msg.model)
  const pipe = pipelines.get(key)

  if (!pipe) {
    console.error('[AI Worker] Pipeline not found for key:', key)
    respond({
      type: 'result',
      id: msg.id,
      success: false,
      error: `Model not loaded: ${msg.model}`,
    })
    return
  }

  try {
    let result: unknown

    // Handle different inference methods
    switch (msg.method) {
      case 'generateText': {
        const [prompt, options] = msg.args as [string, { maxLength?: number; temperature?: number }?]

        // Chat/instruct models use the messages format (so transformers.js
        // applies the tokenizer's chat template); plain completion models get a
        // raw prompt. Detection lives in textGenFormat.ts (catalog-contract tested).
        let output
        if (isChatModel(msg.model)) {
          // Chat format for models like TinyLlama-Chat
          const messages = [
            { role: 'user', content: prompt }
          ]
          output = await pipe(messages, {
            max_new_tokens: options?.maxLength ?? 100,
            temperature: options?.temperature ?? 0.7,
            do_sample: true,
          })
          // Extract the assistant's response from chat output
          const res = Array.isArray(output) ? output[0] : output
          const generatedMessages = res?.generated_text
          if (Array.isArray(generatedMessages)) {
            // Find the last assistant message
            const assistantMsg = generatedMessages.find((m: { role: string; content: string }) => m.role === 'assistant')
            result = assistantMsg?.content ?? generatedMessages[generatedMessages.length - 1]?.content ?? ''
          } else {
            result = generatedMessages ?? ''
          }
        } else {
          // Plain text format for non-chat models
          output = await pipe(prompt, {
            max_new_tokens: options?.maxLength ?? 100,
            temperature: options?.temperature ?? 0.7,
            do_sample: true,
          })
          const res = Array.isArray(output) ? output[0] : output
          result = res?.generated_text ?? ''
        }

        break
      }

      case 'text2text': {
        const [input, options] = msg.args as [string, { maxLength?: number }?]
        const output = await pipe(input, {
          max_new_tokens: options?.maxLength ?? 100,
        })
        const res = Array.isArray(output) ? output[0] : output
        result = res?.generated_text ?? ''
        break
      }

      case 'classifyImage': {
        const [imageData, topK] = msg.args as [{ width: number; height: number; data: Uint8ClampedArray | number[] }, number]
        // Reconstruct ImageData from serialized format
        const reconstructed = new ImageData(
          toPixels(imageData.data),
          imageData.width,
          imageData.height
        )
        // Convert to canvas for pipeline
        const canvas = new OffscreenCanvas(reconstructed.width, reconstructed.height)
        const ctx = canvas.getContext('2d')!
        ctx.putImageData(reconstructed, 0, 0)
        const output = await pipe(canvas, { topk: topK ?? 5 })
        result = Array.isArray(output) ? output : [output]
        break
      }

      case 'detectObjects': {
        const [imageData, threshold] = msg.args as [{ width: number; height: number; data: Uint8ClampedArray | number[] }, number]
        const reconstructed = new ImageData(
          toPixels(imageData.data),
          imageData.width,
          imageData.height
        )
        const canvas = new OffscreenCanvas(reconstructed.width, reconstructed.height)
        const ctx = canvas.getContext('2d')!
        ctx.putImageData(reconstructed, 0, 0)
        result = await pipe(canvas, { threshold: threshold ?? 0.5 })
        break
      }

      case 'estimateDepth': {
        const [imageData] = msg.args as [{ width: number; height: number; data: Uint8ClampedArray | number[] }]
        const reconstructed = new ImageData(
          toPixels(imageData.data),
          imageData.width,
          imageData.height
        )
        const canvas = new OffscreenCanvas(reconstructed.width, reconstructed.height)
        const ctx = canvas.getContext('2d')!
        ctx.putImageData(reconstructed, 0, 0)
        // Depth pipeline returns { predicted_depth: Tensor, depth: RawImage } — the
        // RawImage is a normalized 0–255 depth map. Ship its raw bytes back.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const output = await pipe(canvas) as { depth?: { data: Uint8Array | number[]; width: number; height: number; channels: number } }
        const depth = output?.depth
        if (!depth) {
          result = { width: 0, height: 0, data: [], channels: 1 }
        } else {
          result = {
            width: depth.width,
            height: depth.height,
            channels: depth.channels,
            data: Array.from(depth.data),
          }
        }
        break
      }

      case 'analyzeSentiment': {
        const [text] = msg.args as [string]
        const output = await pipe(text)
        result = Array.isArray(output) ? output : [output]
        break
      }

      case 'extractFeatures': {
        const [text] = msg.args as [string]
        const output = await pipe(text, { pooling: 'mean', normalize: true })
        if (output?.data) {
          result = Array.from(output.data)
        } else {
          result = Array.isArray(output) ? output.flat() : []
        }
        break
      }

      case 'segment': {
        // args: image, points [{x,y,label}] in 0..1 image coords, reuseEmbedding (same image as last time)
        const [imageData, points, reuse] = msg.args as [
          { width: number; height: number; data: Uint8ClampedArray | number[] },
          Array<{ x: number; y: number; label?: number }>,
          boolean,
        ]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sam = pipe as { processor: any; model: any; embedding: any }
        if (!reuse || !sam.embedding) {
          const raw = new RawImage(toPixels(imageData.data), imageData.width, imageData.height, 4).rgb()
          const inputs = await sam.processor(raw)
          sam.embedding = { raw, inputs, emb: await sam.model.get_image_embeddings(inputs) }
        }
        const e = sam.embedding
        const pts = points.length ? points : [{ x: 0.5, y: 0.5, label: 1 }]
        const prompt = await sam.processor(e.raw, {
          input_points: [[pts.map((p) => [p.x * imageData.width, p.y * imageData.height])]],
          input_labels: [[pts.map((p) => p.label ?? 1)]],
        })
        const out = await sam.model({ ...e.emb, input_points: prompt.input_points, input_labels: prompt.input_labels })
        const masks = await sam.processor.post_process_masks(out.pred_masks, e.inputs.original_sizes, e.inputs.reshaped_input_sizes)
        const m = masks[0]
        const [n, h, w] = m.dims.slice(-3) as [number, number, number]
        // The highest-scoring of SAM's candidate masks.
        let best = 0
        for (let k = 1; k < n; k++) if ((out.iou_scores.data[k] ?? 0) > (out.iou_scores.data[best] ?? 0)) best = k
        const data = new Uint8Array(w * h)
        for (let i = 0; i < w * h; i++) data[i] = m.data[best * w * h + i] ? 255 : 0
        result = { width: w, height: h, data, score: Number(out.iou_scores.data[best] ?? 0) }
        break
      }

      case 'captionImage': {
        const [imageData] = msg.args as [{ width: number; height: number; data: Uint8ClampedArray | number[] }]
        const reconstructed = new ImageData(
          toPixels(imageData.data),
          imageData.width,
          imageData.height
        )
        if (pipe?.vlm) {
          result = await vlmGenerate(pipe, imageData, 'Describe this image in one short sentence.', 48)
          break
        }
        const canvas = new OffscreenCanvas(reconstructed.width, reconstructed.height)
        const ctx = canvas.getContext('2d')!
        ctx.putImageData(reconstructed, 0, 0)
        const output = await pipe(canvas)
        const res = Array.isArray(output) ? output[0] : output
        result = res?.generated_text ?? ''
        break
      }

      case 'visionAction': {
        // Vision-language-action (VLM-as-policy): image + instruction -> action text.
        const [imageData, instruction, maxNewTokens] = msg.args as [
          { width: number; height: number; data: Uint8ClampedArray | number[] },
          string,
          number,
        ]
        result = await vlmGenerate(pipe, imageData, instruction || 'What action should be taken?', maxNewTokens)
        break
      }

      case 'transcribe': {
        const [audioInput] = msg.args as [number[] | string]
        // Reconstruct Float32Array from serialized array (postMessage converts typed arrays to regular arrays)
        const audio = Array.isArray(audioInput) ? new Float32Array(audioInput) : audioInput
        const output = await pipe(audio)
        result = output?.text ?? ''
        break
      }

      default:
        throw new Error(`Unknown inference method: ${msg.method}`)
    }

    respond({ type: 'result', id: msg.id, success: true, data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[AI Worker] Inference error: ${message}`)
    respond({ type: 'result', id: msg.id, success: false, error: message })
  }
}

// Release a cached pipeline/model. Vision-language entries are a { processor,
// model, vlm: true } wrapper with no top-level dispose(), so dispose the model
// (and processor) directly — otherwise the GPU/WASM model leaks on unload.
/** Run a vision-language model on an image and an instruction; returns only the generated text. */
async function vlmGenerate(
  pipe: unknown,
  imageData: { width: number; height: number; data: Uint8ClampedArray | number[] },
  instruction: string,
  maxNewTokens: number,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { processor, model, modelId } = pipe as { processor: any; model: any; modelId?: string }
  const image = new RawImage(toPixels(imageData.data), imageData.width, imageData.height, 4).rgb()
  const messages = [{ role: 'user', content: [{ type: 'image' }, { type: 'text', text: String(instruction) }] }]
  const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true })
  // Quirks measured by hackbuild (vision/records.ts): LFM2-VL's processor wants images first
  // (text first throws "undefined is not iterable"); SmolVLM repeats itself without a penalty.
  const lfm = /lfm2-vl/i.test(modelId ?? '')
  const inputs = lfm ? await processor([image], prompt) : await processor(prompt, [image])
  const { sequences } = await model.generate({
    ...inputs,
    max_new_tokens: Math.max(1, Math.min(512, Math.floor(maxNewTokens || 64))),
    do_sample: false,
    ...(/smolvlm/i.test(modelId ?? '') ? { repetition_penalty: 1.3 } : {}),
    return_dict_in_generate: true,
  })
  // Drop the prompt tokens; decode only what the model generated.
  const promptLen = inputs.input_ids.dims.at(-1)
  const trimmed = sequences.slice(null, [promptLen, null])
  const decoded = processor.batch_decode(trimmed, { skip_special_tokens: true })
  return (decoded[0] ?? '').trim()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function disposePipe(pipe: any): void {
  if (!pipe) return
  if (pipe.vlm || pipe.sam) {
    if (typeof pipe.model?.dispose === 'function') pipe.model.dispose()
    if (typeof pipe.processor?.dispose === 'function') pipe.processor.dispose()
  } else if (typeof pipe.dispose === 'function') {
    pipe.dispose()
  }
}

// Handle model unload
function handleUnload(msg: UnloadModelMessage): void {
  const key = getCacheKey(msg.task, msg.model)
  const pipe = pipelines.get(key)
  const users = vlmUsers.get(key)
  users?.delete(msg.task)

  // A VLM still used by its other task stays loaded.
  if (pipe && !(users && users.size > 0)) {
    disposePipe(pipe)
    pipelines.delete(key)
    vlmUsers.delete(key)
    usedByKey.delete(key)
  }

  // YOLO sessions are keyed by model URL (msg.model carries it), not the
  // task:model pair, so release them on the side.
  const yolo = yoloSessions.get(msg.model)
  if (yolo) {
    void releaseYoloSession(yolo)
    yoloSessions.delete(msg.model)
  }

  respond({ type: 'result', id: msg.id, success: true })
}

// Handle model check
function handleCheck(msg: CheckModelMessage): void {
  const key = getCacheKey(msg.task, msg.model)
  const loaded = pipelines.has(key)
  respond({ type: 'checkResult', id: msg.id, loaded })
}

// Handle dispose all
function handleDispose(msg: DisposeMessage): void {
  for (const [, pipe] of pipelines) {
    disposePipe(pipe)
  }
  pipelines.clear()
  releaseAllYoloSessions()
  respond({ type: 'result', id: msg.id, success: true })
}

// Handle cache setting change
function handleSetCache(msg: SetCacheMessage): void {
  env.useBrowserCache = msg.enabled
}

// Handle cache clear
async function handleClearCache(msg: ClearCacheMessage): Promise<void> {
  // Dispose all loaded models first
  for (const [, pipe] of pipelines) {
    disposePipe(pipe)
  }
  pipelines.clear()
  releaseAllYoloSessions()

  // Try to clear the cache using transformers.js cache API if available
  try {
    // Clear caches via Cache API (where transformers.js stores files)
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      if (name.includes('transformers') || name.includes('onnx') || name.includes('huggingface')) {
        await caches.delete(name)
      }
    }
  } catch (error) {
    console.warn('[AI Worker] Could not clear Cache API:', error)
  }

  respond({ type: 'result', id: msg.id, success: true })
}

// Message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data

  switch (msg.type) {
    case 'load':
      await handleLoad(msg)
      break
    case 'infer':
      await handleInfer(msg)
      break
    case 'unload':
      handleUnload(msg)
      break
    case 'check':
      handleCheck(msg)
      break
    case 'dispose':
      handleDispose(msg)
      break
    case 'setCache':
      handleSetCache(msg)
      break
    case 'clearCache':
      await handleClearCache(msg)
      break
    default:
      console.warn('[AI Worker] Unknown message type:', msg)
  }
}

// Signal ready
console.log('[AI Worker] Ready')
