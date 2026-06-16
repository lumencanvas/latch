/**
 * AI Inference Web Worker
 *
 * Runs Transformers.js inference off the main thread to prevent UI blocking.
 * All model loading and inference happens in this worker.
 */

import {
  pipeline,
  env,
  AutoProcessor,
  AutoModelForVision2Seq,
  RawImage,
} from '@huggingface/transformers'
import { isChatModel } from './textGenFormat'

// Configure Transformers.js for browser usage
env.allowLocalModels = false
// Browser cache setting - can be toggled at runtime
env.useBrowserCache = true

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

// Get cache key for pipeline
function getCacheKey(task: string, model: string): string {
  return `${task}:${model}`
}

// Handle model loading
async function handleLoad(msg: LoadModelMessage): Promise<void> {
  const key = getCacheKey(msg.task, msg.model)

  // Already loaded?
  if (pipelines.has(key)) {
    respond({ type: 'loaded', id: msg.id, success: true })
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

    // Add device if WebGPU requested
    if (msg.options?.device === 'webgpu') {
      pipelineOptions.device = 'webgpu'
    }

    // Add quantization
    if (msg.options?.dtype && msg.options.dtype !== 'fp32') {
      pipelineOptions.dtype = msg.options.dtype
    }

    // Vision-language (SmolVLM-style) models run via the processor + model API,
    // not a high-level pipeline. Cache both under the same key.
    if (msg.task === 'image-text-to-text') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loadOpts: Record<string, any> = { progress_callback: pipelineOptions.progress_callback }
      if (pipelineOptions.device) loadOpts.device = pipelineOptions.device
      loadOpts.dtype = pipelineOptions.dtype ?? 'fp32'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const processor = await (AutoProcessor as any).from_pretrained(msg.model, {
        progress_callback: pipelineOptions.progress_callback,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = await (AutoModelForVision2Seq as any).from_pretrained(msg.model, loadOpts)
      pipelines.set(key, { processor, model, vlm: true })
      respond({ type: 'loaded', id: msg.id, success: true })
      return
    }

    // Create pipeline
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipe = await (pipeline as any)(msg.task, msg.model, pipelineOptions)
    pipelines.set(key, pipe)

    respond({ type: 'loaded', id: msg.id, success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[AI Worker] Failed to load model: ${message}`)
    respond({ type: 'loaded', id: msg.id, success: false, error: message })
  }
}

// Handle inference
async function handleInfer(msg: InferenceMessage): Promise<void> {
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

      case 'captionImage': {
        const [imageData] = msg.args as [{ width: number; height: number; data: Uint8ClampedArray | number[] }]
        const reconstructed = new ImageData(
          toPixels(imageData.data),
          imageData.width,
          imageData.height
        )
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { processor, model } = pipe as { processor: any; model: any }
        const image = new RawImage(
          toPixels(imageData.data),
          imageData.width,
          imageData.height,
          4
        ).rgb()
        const messages = [
          {
            role: 'user',
            content: [
              { type: 'image' },
              { type: 'text', text: String(instruction || 'What action should be taken?') },
            ],
          },
        ]
        const prompt = processor.apply_chat_template(messages, { add_generation_prompt: true })
        const inputs = await processor(prompt, [image])
        const { sequences } = await model.generate({
          ...inputs,
          max_new_tokens: Math.max(1, Math.min(512, Math.floor(maxNewTokens || 64))),
          do_sample: false,
          return_dict_in_generate: true,
        })
        // Drop the prompt tokens; decode only what the model generated.
        const promptLen = inputs.input_ids.dims.at(-1)
        const trimmed = sequences.slice(null, [promptLen, null])
        const decoded = processor.batch_decode(trimmed, { skip_special_tokens: true })
        result = (decoded[0] ?? '').trim()
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function disposePipe(pipe: any): void {
  if (!pipe) return
  if (pipe.vlm) {
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

  if (pipe) {
    disposePipe(pipe)
    pipelines.delete(key)
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
