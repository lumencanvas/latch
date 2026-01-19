/**
 * AI Inference Web Worker
 *
 * Runs Transformers.js inference off the main thread to prevent UI blocking.
 * All model loading and inference happens in this worker.
 */

import { pipeline, env } from '@huggingface/transformers'

// Configure Transformers.js for browser usage
env.allowLocalModels = false
// Browser cache setting - can be toggled at runtime
env.useBrowserCache = true

// Pipeline cache
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pipelines = new Map<string, any>()

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
    console.log(`[AI Worker] Loading model: ${msg.model} for task: ${msg.task}`)

    // Apply cache setting if provided
    if (msg.options?.useBrowserCache !== undefined) {
      env.useBrowserCache = msg.options.useBrowserCache
      console.log(`[AI Worker] Browser cache ${msg.options.useBrowserCache ? 'enabled' : 'disabled'}`)
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
      console.log('[AI Worker] Using WebGPU acceleration')
    }

    // Add quantization
    if (msg.options?.dtype && msg.options.dtype !== 'fp32') {
      pipelineOptions.dtype = msg.options.dtype
    }

    // Create pipeline
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipe = await (pipeline as any)(msg.task, msg.model, pipelineOptions)
    pipelines.set(key, pipe)

    console.log(`[AI Worker] Model loaded: ${msg.model}`)
    respond({ type: 'loaded', id: msg.id, success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[AI Worker] Failed to load model: ${message}`)
    respond({ type: 'loaded', id: msg.id, success: false, error: message })
  }
}

// Handle inference
async function handleInfer(msg: InferenceMessage): Promise<void> {
  console.log('[AI Worker] Inference request:', msg.method, msg.task)
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
        console.log('[AI Worker] Generating text for prompt:', prompt.substring(0, 50), 'options:', options)

        // For chat/instruct models, use messages format
        // For non-chat models, use plain prompt
        const modelLower = msg.model.toLowerCase()
        const isChatModel = modelLower.includes('chat') ||
                           modelLower.includes('instruct') ||
                           modelLower.includes('llama') ||
                           modelLower.includes('-it-') ||  // Gemma instruction-tuned
                           modelLower.includes('-it_') ||
                           modelLower.endsWith('-it') ||
                           modelLower.includes('phi-')

        let output
        if (isChatModel) {
          // Chat format for models like TinyLlama-Chat
          const messages = [
            { role: 'user', content: prompt }
          ]
          console.log('[AI Worker] Using chat format for model:', msg.model)
          output = await pipe(messages, {
            max_new_tokens: options?.maxLength ?? 100,
            temperature: options?.temperature ?? 0.7,
            do_sample: true,
          })
          console.log('[AI Worker] Raw chat output:', output)
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
          console.log('[AI Worker] Raw output:', output)
          const res = Array.isArray(output) ? output[0] : output
          result = res?.generated_text ?? ''
        }

        console.log('[AI Worker] Generated text result:', (result as string).substring(0, 100))
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
        const [imageData, topK] = msg.args as [{ width: number; height: number; data: number[] }, number]
        // Reconstruct ImageData from serialized format
        const reconstructed = new ImageData(
          new Uint8ClampedArray(imageData.data),
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
        const [imageData, threshold] = msg.args as [{ width: number; height: number; data: number[] }, number]
        const reconstructed = new ImageData(
          new Uint8ClampedArray(imageData.data),
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
        const [imageData] = msg.args as [{ width: number; height: number; data: number[] }]
        const reconstructed = new ImageData(
          new Uint8ClampedArray(imageData.data),
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

// Handle model unload
function handleUnload(msg: UnloadModelMessage): void {
  const key = getCacheKey(msg.task, msg.model)
  const pipe = pipelines.get(key)

  if (pipe) {
    if (typeof pipe.dispose === 'function') {
      pipe.dispose()
    }
    pipelines.delete(key)
    console.log(`[AI Worker] Unloaded model: ${msg.model}`)
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
    if (pipe && typeof pipe.dispose === 'function') {
      pipe.dispose()
    }
  }
  pipelines.clear()
  console.log('[AI Worker] Disposed all models')
  respond({ type: 'result', id: msg.id, success: true })
}

// Handle cache setting change
function handleSetCache(msg: SetCacheMessage): void {
  env.useBrowserCache = msg.enabled
  console.log(`[AI Worker] Browser cache ${msg.enabled ? 'enabled' : 'disabled'}`)
}

// Handle cache clear
async function handleClearCache(msg: ClearCacheMessage): Promise<void> {
  // Dispose all loaded models first
  for (const [, pipe] of pipelines) {
    if (pipe && typeof pipe.dispose === 'function') {
      pipe.dispose()
    }
  }
  pipelines.clear()

  // Try to clear the cache using transformers.js cache API if available
  try {
    // Clear caches via Cache API (where transformers.js stores files)
    const cacheNames = await caches.keys()
    for (const name of cacheNames) {
      if (name.includes('transformers') || name.includes('onnx') || name.includes('huggingface')) {
        await caches.delete(name)
        console.log(`[AI Worker] Cleared cache: ${name}`)
      }
    }
  } catch (error) {
    console.warn('[AI Worker] Could not clear Cache API:', error)
  }

  console.log('[AI Worker] Model cache cleared')
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
