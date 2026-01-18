/**
 * AI Inference Service
 *
 * Manages AI model lifecycle and inference for the LATCH application.
 * Features:
 * - WebGPU acceleration support
 * - Model caching with IndexedDB
 * - Progress tracking during downloads
 * - Memory management and cleanup
 */

import { pipeline, env } from '@huggingface/transformers'

// Configure Transformers.js for browser usage
env.allowLocalModels = false
env.useBrowserCache = true

// Model load states
export type ModelLoadState = 'idle' | 'loading' | 'ready' | 'error'

// Device options
export type DeviceType = 'cpu' | 'webgpu'

// Quantization options (affects model size and speed)
export type DType = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'

export interface ModelInfo {
  state: ModelLoadState
  progress: number
  error?: string
  loadedAt?: number
  device?: DeviceType
  dtype?: DType
}

export interface AIState {
  initialized: boolean
  loadedModels: Map<string, ModelInfo>
  webgpuAvailable: boolean
  useWebGPU: boolean
  defaultDType: DType
}

// Model option with size info
export interface ModelOption {
  id: string
  name: string
  size: string
}

// Model definition with metadata
export interface ModelDefinition {
  id: string
  name: string
  task: string
  description: string
  defaultModel: string
  defaultSize: string
  alternateModels: ModelOption[]
  supportsWebGPU: boolean
  category: 'text' | 'vision' | 'audio' | 'multimodal'
}

// Available AI models with accurate sizes from Hugging Face
export const AI_MODELS: ModelDefinition[] = [
  {
    id: 'text-generation',
    name: 'Text Generation',
    task: 'text-generation',
    description: 'Generate and complete text',
    defaultModel: 'Xenova/TinyLlama-1.1B-Chat-v1.0',
    defaultSize: '~640 MB',
    supportsWebGPU: true,
    category: 'text',
    alternateModels: [
      { id: 'onnx-community/Llama-3.2-1B-Instruct-ONNX', name: 'Llama 3.2 1B', size: '~2.5 GB' },
      { id: 'onnx-community/gemma-3-1b-it-ONNX', name: 'Gemma 3 1B', size: '~1.1 GB' },
      { id: 'onnx-community/gemma-3-270m-it-ONNX', name: 'Gemma 3 270M', size: '~540 MB' },
      { id: 'Xenova/Phi-3-mini-4k-instruct', name: 'Phi-3 Mini 4K', size: '~2.3 GB' },
    ],
  },
  {
    id: 'text2text-generation',
    name: 'Text Transformation',
    task: 'text2text-generation',
    description: 'Summarize, translate, or rewrite text',
    defaultModel: 'Xenova/flan-t5-small',
    defaultSize: '~300 MB',
    supportsWebGPU: false,
    category: 'text',
    alternateModels: [
      { id: 'Xenova/flan-t5-base', name: 'Flan-T5 Base', size: '~900 MB' },
      { id: 'Xenova/t5-small', name: 'T5 Small', size: '~240 MB' },
    ],
  },
  {
    id: 'image-classification',
    name: 'Image Classification',
    task: 'image-classification',
    description: 'Classify images into categories',
    defaultModel: 'Xenova/vit-base-patch16-224',
    defaultSize: '~350 MB',
    supportsWebGPU: true,
    category: 'vision',
    alternateModels: [
      { id: 'Xenova/resnet-50', name: 'ResNet-50', size: '~100 MB' },
      { id: 'Xenova/mobilenet_v3_large', name: 'MobileNet V3', size: '~22 MB' },
    ],
  },
  {
    id: 'object-detection',
    name: 'Object Detection',
    task: 'object-detection',
    description: 'Detect and locate objects in images',
    defaultModel: 'Xenova/detr-resnet-50',
    defaultSize: '~160 MB',
    supportsWebGPU: true,
    category: 'vision',
    alternateModels: [
      { id: 'Xenova/yolos-tiny', name: 'YOLOS Tiny', size: '~27 MB' },
    ],
  },
  {
    id: 'automatic-speech-recognition',
    name: 'Speech Recognition',
    task: 'automatic-speech-recognition',
    description: 'Transcribe audio to text',
    defaultModel: 'Xenova/whisper-tiny.en',
    defaultSize: '~150 MB',
    supportsWebGPU: true,
    category: 'audio',
    alternateModels: [
      { id: 'Xenova/whisper-base.en', name: 'Whisper Base', size: '~290 MB' },
      { id: 'Xenova/whisper-small.en', name: 'Whisper Small', size: '~470 MB' },
    ],
  },
  {
    id: 'sentiment-analysis',
    name: 'Sentiment Analysis',
    task: 'sentiment-analysis',
    description: 'Analyze text sentiment and emotion',
    defaultModel: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
    defaultSize: '~270 MB',
    supportsWebGPU: false,
    category: 'text',
    alternateModels: [
      { id: 'Xenova/bert-base-multilingual-uncased-sentiment', name: 'Multilingual BERT', size: '~700 MB' },
    ],
  },
  {
    id: 'feature-extraction',
    name: 'Text Embeddings',
    task: 'feature-extraction',
    description: 'Convert text to vector embeddings',
    defaultModel: 'Xenova/all-MiniLM-L6-v2',
    defaultSize: '~90 MB',
    supportsWebGPU: false,
    category: 'text',
    alternateModels: [
      { id: 'Xenova/all-mpnet-base-v2', name: 'MPNet Base', size: '~420 MB' },
      { id: 'Xenova/bge-small-en-v1.5', name: 'BGE Small', size: '~130 MB' },
    ],
  },
  {
    id: 'image-to-text',
    name: 'Image Captioning',
    task: 'image-to-text',
    description: 'Generate captions for images',
    defaultModel: 'Xenova/blip-image-captioning-base',
    defaultSize: '~990 MB',
    supportsWebGPU: true,
    category: 'multimodal',
    alternateModels: [
      { id: 'Xenova/blip-image-captioning-large', name: 'BLIP Large', size: '~1.8 GB' },
      { id: 'Xenova/trocr-base-handwritten', name: 'TrOCR Handwritten', size: '~1.2 GB' },
    ],
  },
]

// Use any for pipeline instances since the types are complex
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PipelineInstance = any

// Progress callback type
type ProgressCallback = (progress: number) => void

class AIInferenceService {
  private _initialized = false
  private _pipelines = new Map<string, PipelineInstance>()
  private _modelInfo = new Map<string, ModelInfo>()
  private _listeners = new Set<() => void>()
  private _webgpuAvailable = false
  private _useWebGPU = false
  private _defaultDType: DType = 'q4'

  constructor() {
    this.checkWebGPU()
  }

  // Check WebGPU availability
  private async checkWebGPU(): Promise<void> {
    if (typeof navigator === 'undefined') {
      this._webgpuAvailable = false
      this._initialized = true
      return
    }

    if (!('gpu' in navigator)) {
      this._webgpuAvailable = false
      this._initialized = true
      return
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gpu = (navigator as any).gpu
      const adapter = await gpu.requestAdapter()
      this._webgpuAvailable = adapter !== null
    } catch {
      this._webgpuAvailable = false
    }

    this._initialized = true
    this.notifyListeners()
  }

  // Get current state
  getState(): AIState {
    return {
      initialized: this._initialized,
      loadedModels: new Map(this._modelInfo),
      webgpuAvailable: this._webgpuAvailable,
      useWebGPU: this._useWebGPU,
      defaultDType: this._defaultDType,
    }
  }

  // Get available models
  getAvailableModels(): ModelDefinition[] {
    return AI_MODELS
  }

  // Get model definition by task
  getModelDefinition(task: string): ModelDefinition | undefined {
    return AI_MODELS.find((m) => m.task === task)
  }

  // Get default model for task
  getDefaultModel(task: string): string {
    const model = AI_MODELS.find((m) => m.task === task)
    return model?.defaultModel ?? ''
  }

  // Get model info
  getModelInfo(task: string, modelId?: string): ModelInfo | undefined {
    const key = `${task}:${modelId || this.getDefaultModel(task)}`
    return this._modelInfo.get(key)
  }

  // Check if model is loaded
  isModelLoaded(task: string, modelId?: string): boolean {
    const key = `${task}:${modelId || this.getDefaultModel(task)}`
    const loaded = this._pipelines.has(key)
    if (!loaded && this._pipelines.size > 0) {
      console.log('[AIInference] Model check failed:', key, 'Loaded models:', Array.from(this._pipelines.keys()))
    }
    return loaded
  }

  // Subscribe to state changes
  subscribe(listener: () => void): () => void {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  // Notify all listeners
  private notifyListeners(): void {
    for (const listener of this._listeners) {
      listener()
    }
  }

  // Update model info
  private updateModelInfo(key: string, info: Partial<ModelInfo>): void {
    const existing = this._modelInfo.get(key) || { state: 'idle', progress: 0 }
    this._modelInfo.set(key, { ...existing, ...info })
    this.notifyListeners()
  }

  // Set WebGPU preference
  setUseWebGPU(use: boolean): void {
    if (use && !this._webgpuAvailable) {
      console.warn('[AIInference] WebGPU is not available on this device')
      return
    }
    this._useWebGPU = use
    this.notifyListeners()
  }

  // Get WebGPU availability
  isWebGPUAvailable(): boolean {
    return this._webgpuAvailable
  }

  // Set default quantization
  setDefaultDType(dtype: DType): void {
    this._defaultDType = dtype
    this.notifyListeners()
  }

  // Load a model
  async loadModel(
    task: string,
    modelId?: string,
    onProgress?: ProgressCallback,
    options?: { device?: DeviceType; dtype?: DType }
  ): Promise<PipelineInstance> {
    const model = modelId || this.getDefaultModel(task)
    if (!model) {
      throw new Error(`No model specified for task: ${task}`)
    }

    const key = `${task}:${model}`

    // Return cached pipeline if exists
    if (this._pipelines.has(key)) {
      const existing = this._modelInfo.get(key)
      if (existing?.state === 'ready') {
        return this._pipelines.get(key)!
      }
    }

    // Mark as loading
    this.updateModelInfo(key, { state: 'loading', progress: 0 })

    try {
      console.log(`[AIInference] Loading model: ${model} for task: ${task}`)

      // Determine device and dtype
      const device = options?.device || (this._useWebGPU ? 'webgpu' : undefined)
      const dtype = options?.dtype || this._defaultDType

      // Track progress across multiple files
      let totalFiles = 0
      let completedFiles = 0
      const fileProgress = new Map<string, number>()

      // Build pipeline options
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipelineOptions: Record<string, any> = {
        progress_callback: (progress: { status?: string; progress?: number; file?: string; loaded?: number; total?: number }) => {
          // Transformers.js progress values are already 0-100
          const file = progress.file ?? 'default'

          if (progress.status === 'initiate') {
            totalFiles++
            fileProgress.set(file, 0)
          } else if (progress.status === 'progress') {
            // Use loaded/total if available for accurate progress
            let fileProgressValue = progress.progress ?? 0
            if (progress.loaded !== undefined && progress.total !== undefined && progress.total > 0) {
              fileProgressValue = (progress.loaded / progress.total) * 100
            }
            fileProgress.set(file, Math.min(100, fileProgressValue))
          } else if (progress.status === 'done') {
            completedFiles++
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

          // Clamp to 0-100
          aggregateProgress = Math.max(0, Math.min(99, aggregateProgress))

          this.updateModelInfo(key, { progress: aggregateProgress })
          onProgress?.(aggregateProgress)
        },
      }

      // Add device if WebGPU
      if (device === 'webgpu' && this._webgpuAvailable) {
        pipelineOptions.device = 'webgpu'
        console.log('[AIInference] Using WebGPU acceleration')
      }

      // Add quantization for supported models
      if (dtype && dtype !== 'fp32') {
        pipelineOptions.dtype = dtype
      }

      // Create pipeline
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pipe = await (pipeline as any)(task, model, pipelineOptions)

      // Cache and update state
      this._pipelines.set(key, pipe)
      this.updateModelInfo(key, {
        state: 'ready',
        progress: 100,
        loadedAt: Date.now(),
        device: device || 'cpu',
        dtype,
      })

      console.log(`[AIInference] Model loaded: ${model}`)
      return pipe
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[AIInference] Failed to load model: ${message}`)
      this.updateModelInfo(key, { state: 'error', error: message })
      throw error
    }
  }

  // Unload a model
  async unloadModel(task: string, modelId?: string): Promise<void> {
    const model = modelId || this.getDefaultModel(task)
    const key = `${task}:${model}`

    const pipe = this._pipelines.get(key)
    if (pipe) {
      // Dispose if method exists
      if (typeof pipe.dispose === 'function') {
        pipe.dispose()
      }

      this._pipelines.delete(key)
      this._modelInfo.delete(key)
      this.notifyListeners()
      console.log(`[AIInference] Unloaded model: ${model}`)
    }
  }

  // Dispose all models
  async dispose(): Promise<void> {
    for (const [, pipe] of this._pipelines) {
      if (pipe && typeof pipe.dispose === 'function') {
        pipe.dispose()
      }
    }
    this._pipelines.clear()
    this._modelInfo.clear()
    this._initialized = false
    this.notifyListeners()
  }

  // ============================================
  // Task-specific inference methods
  // ============================================

  async generateText(
    prompt: string,
    options?: { maxLength?: number; temperature?: number },
    modelId?: string
  ): Promise<string> {
    const pipe = await this.loadModel('text-generation', modelId)
    const result = await pipe(prompt, {
      max_new_tokens: options?.maxLength ?? 100,
      temperature: options?.temperature ?? 0.7,
      do_sample: true,
    })
    const output = Array.isArray(result) ? result[0] : result
    return output?.generated_text ?? ''
  }

  async text2text(
    input: string,
    options?: { maxLength?: number },
    modelId?: string
  ): Promise<string> {
    const pipe = await this.loadModel('text2text-generation', modelId)
    const result = await pipe(input, {
      max_new_tokens: options?.maxLength ?? 100,
    })
    const output = Array.isArray(result) ? result[0] : result
    return output?.generated_text ?? ''
  }

  async classifyImage(
    image: ImageData | HTMLCanvasElement | HTMLImageElement | string,
    topK = 5,
    modelId?: string
  ): Promise<Array<{ label: string; score: number }>> {
    const pipe = await this.loadModel('image-classification', modelId)

    let input: string | HTMLCanvasElement | HTMLImageElement
    if (image instanceof ImageData) {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')!
      ctx.putImageData(image, 0, 0)
      input = canvas
    } else {
      input = image
    }

    const result = await pipe(input, { topk: topK })
    return Array.isArray(result) ? result : [result]
  }

  async detectObjects(
    image: ImageData | HTMLCanvasElement | HTMLImageElement | string,
    threshold = 0.5,
    modelId?: string
  ): Promise<Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>> {
    const pipe = await this.loadModel('object-detection', modelId)

    let input: string | HTMLCanvasElement | HTMLImageElement
    if (image instanceof ImageData) {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')!
      ctx.putImageData(image, 0, 0)
      input = canvas
    } else {
      input = image
    }

    return await pipe(input, { threshold })
  }

  async transcribe(
    audio: Float32Array | Blob | string,
    modelId?: string
  ): Promise<string> {
    const pipe = await this.loadModel('automatic-speech-recognition', modelId)
    const result = await pipe(audio)
    return result?.text ?? ''
  }

  async analyzeSentiment(
    text: string,
    modelId?: string
  ): Promise<Array<{ label: string; score: number }>> {
    const pipe = await this.loadModel('sentiment-analysis', modelId)
    const result = await pipe(text)
    return Array.isArray(result) ? result : [result]
  }

  async extractFeatures(
    text: string,
    modelId?: string
  ): Promise<number[]> {
    const pipe = await this.loadModel('feature-extraction', modelId)
    const result = await pipe(text, { pooling: 'mean', normalize: true })

    if (result?.data) {
      return Array.from(result.data)
    }
    return Array.isArray(result) ? result.flat() : []
  }

  async captionImage(
    image: ImageData | HTMLCanvasElement | HTMLImageElement | string,
    modelId?: string
  ): Promise<string> {
    const pipe = await this.loadModel('image-to-text', modelId)

    let input: string | HTMLCanvasElement | HTMLImageElement
    if (image instanceof ImageData) {
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const ctx = canvas.getContext('2d')!
      ctx.putImageData(image, 0, 0)
      input = canvas
    } else {
      input = image
    }

    const result = await pipe(input)
    const output = Array.isArray(result) ? result[0] : result
    return output?.generated_text ?? ''
  }
}

// Singleton instance
export const aiInference = new AIInferenceService()
