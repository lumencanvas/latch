/**
 * AI Inference Service
 *
 * Manages AI model lifecycle and inference for the LATCH application.
 * Uses a Web Worker for inference to prevent UI blocking.
 * Features:
 * - WebGPU acceleration support
 * - Model caching with IndexedDB
 * - Progress tracking during downloads
 * - Memory management and cleanup
 */

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
  useBrowserCache: boolean
  autoLoadModels: string[] // List of "task:modelId" keys to auto-load
  selectedModels: Record<string, string> // Task ID -> selected model ID
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

// Progress callback type
type ProgressCallback = (progress: number) => void

// Pending request tracking
interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  onProgress?: ProgressCallback
  timeoutId?: ReturnType<typeof setTimeout>
}

// Default timeout for worker requests (5 minutes for model loading)
const DEFAULT_REQUEST_TIMEOUT = 5 * 60 * 1000

class AIInferenceService {
  private _initialized = false
  private _worker: Worker | null = null
  private _modelInfo = new Map<string, ModelInfo>()
  private _listeners = new Set<() => void>()
  private _webgpuAvailable = false
  private _useWebGPU = false
  private _useBrowserCache = true
  private _defaultDType: DType = 'q4'
  private _pendingRequests = new Map<string, PendingRequest>()
  private _requestIdCounter = 0
  private _loadedModels = new Set<string>()
  private _autoLoadModels: string[] = []
  private _selectedModels: Record<string, string> = {}
  private _settingsLoaded = false

  constructor() {
    this.initWorker()
    this.checkWebGPU()
  }

  // Initialize Web Worker
  private initWorker(): void {
    try {
      // Create worker using Vite's import syntax for web workers
      this._worker = new Worker(new URL('./ai.worker.ts', import.meta.url), {
        type: 'module',
      })

      this._worker.onmessage = this.handleWorkerMessage.bind(this)
      this._worker.onerror = (error) => {
        console.error('[AIInference] Worker error:', error)
      }

      console.log('[AIInference] Web Worker initialized')
    } catch (error) {
      console.error('[AIInference] Failed to initialize Web Worker:', error)
      // Fall back to main thread if worker fails
      this._worker = null
    }
  }

  // Handle messages from worker
  private handleWorkerMessage(event: MessageEvent): void {
    const msg = event.data

    switch (msg.type) {
      case 'progress': {
        const pending = this._pendingRequests.get(msg.id)
        if (pending?.onProgress) {
          pending.onProgress(msg.progress)
        }
        // Also update model info for UI
        const loadingModels = Array.from(this._modelInfo.entries())
          .filter(([, info]) => info.state === 'loading')
        for (const [key] of loadingModels) {
          this.updateModelInfo(key, { progress: msg.progress })
        }
        break
      }

      case 'loaded': {
        const pending = this.clearPendingRequest(msg.id)
        if (pending) {
          if (msg.success) {
            pending.resolve(true)
          } else {
            pending.reject(new Error(msg.error || 'Failed to load model'))
          }
        }
        break
      }

      case 'result': {
        const pending = this.clearPendingRequest(msg.id)
        if (pending) {
          if (msg.success) {
            pending.resolve(msg.data)
          } else {
            pending.reject(new Error(msg.error || 'Inference failed'))
          }
        }
        break
      }

      case 'checkResult': {
        const pending = this.clearPendingRequest(msg.id)
        if (pending) {
          pending.resolve(msg.loaded)
        }
        break
      }
    }
  }

  // Generate unique request ID
  private nextRequestId(): string {
    return `req_${++this._requestIdCounter}`
  }

  // Send message to worker and await response
  private sendToWorker<T>(
    message: Record<string, unknown>,
    onProgress?: ProgressCallback,
    timeout: number = DEFAULT_REQUEST_TIMEOUT
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this._worker) {
        reject(new Error('Web Worker not available'))
        return
      }

      const id = this.nextRequestId()

      // Set up timeout to prevent leaked requests
      const timeoutId = setTimeout(() => {
        const pending = this._pendingRequests.get(id)
        if (pending) {
          this._pendingRequests.delete(id)
          reject(new Error(`Worker request timed out after ${timeout}ms`))
        }
      }, timeout)

      this._pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress,
        timeoutId,
      })

      this._worker.postMessage({ ...message, id })
    })
  }

  // Clear timeout and remove pending request
  private clearPendingRequest(id: string): PendingRequest | undefined {
    const pending = this._pendingRequests.get(id)
    if (pending) {
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId)
      }
      this._pendingRequests.delete(id)
    }
    return pending
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
      useBrowserCache: this._useBrowserCache,
      autoLoadModels: [...this._autoLoadModels],
      selectedModels: { ...this._selectedModels },
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
    return this._loadedModels.has(key)
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

  // Get browser cache setting
  isBrowserCacheEnabled(): boolean {
    return this._useBrowserCache
  }

  // Set browser cache preference
  setUseBrowserCache(use: boolean): void {
    this._useBrowserCache = use
    // Notify worker of the change
    if (this._worker) {
      this._worker.postMessage({ type: 'setCache', enabled: use })
    }
    this.notifyListeners()
  }

  // Get auto-load models
  getAutoLoadModels(): string[] {
    return [...this._autoLoadModels]
  }

  // Set auto-load models
  setAutoLoadModels(models: string[]): void {
    this._autoLoadModels = [...models]
    this.notifyListeners()
  }

  // Add a model to auto-load list
  addAutoLoadModel(task: string, modelId?: string): void {
    const model = modelId || this.getDefaultModel(task)
    const key = `${task}:${model}`
    if (!this._autoLoadModels.includes(key)) {
      this._autoLoadModels.push(key)
      this.notifyListeners()
    }
  }

  // Remove a model from auto-load list
  removeAutoLoadModel(task: string, modelId?: string): void {
    const model = modelId || this.getDefaultModel(task)
    const key = `${task}:${model}`
    this._autoLoadModels = this._autoLoadModels.filter(k => k !== key)
    this.notifyListeners()
  }

  // Check if a model is set to auto-load
  isAutoLoadEnabled(task: string, modelId?: string): boolean {
    const model = modelId || this.getDefaultModel(task)
    const key = `${task}:${model}`
    return this._autoLoadModels.includes(key)
  }

  // Get selected model for a task
  getSelectedModel(task: string): string {
    return this._selectedModels[task] || this.getDefaultModel(task)
  }

  // Set selected model for a task
  setSelectedModel(task: string, modelId: string): void {
    this._selectedModels[task] = modelId
    this.notifyListeners()
  }

  // Load settings from storage (call this on app init)
  async loadSettingsFromStorage(): Promise<void> {
    if (this._settingsLoaded) return

    try {
      // Dynamic import to avoid circular dependency
      const { settingsStorage } = await import('../database')
      const settings = await settingsStorage.get()

      if (settings) {
        if (settings.aiAutoLoadModels) {
          this._autoLoadModels = settings.aiAutoLoadModels
        }
        if (settings.aiSelectedModels) {
          this._selectedModels = settings.aiSelectedModels
        }
        if (settings.aiUseWebGPU !== undefined) {
          this._useWebGPU = settings.aiUseWebGPU && this._webgpuAvailable
        }
        if (settings.aiUseBrowserCache !== undefined) {
          this._useBrowserCache = settings.aiUseBrowserCache
          if (this._worker) {
            this._worker.postMessage({ type: 'setCache', enabled: this._useBrowserCache })
          }
        }
      }

      this._settingsLoaded = true
      this.notifyListeners()
    } catch (error) {
      console.error('[AIInference] Failed to load settings:', error)
    }
  }

  // Save settings to storage
  async saveSettingsToStorage(): Promise<void> {
    try {
      // Dynamic import to avoid circular dependency
      const { settingsStorage } = await import('../database')
      const existing = await settingsStorage.get()
      const defaults = settingsStorage.getDefaults()

      await settingsStorage.save({
        ...defaults,
        ...existing,
        aiAutoLoadModels: this._autoLoadModels,
        aiSelectedModels: this._selectedModels,
        aiUseWebGPU: this._useWebGPU,
        aiUseBrowserCache: this._useBrowserCache,
      })

    } catch (error) {
      console.error('[AIInference] Failed to save settings:', error)
    }
  }

  // Auto-load models from the auto-load list
  async autoLoadModels(onProgress?: (task: string, progress: number) => void): Promise<void> {
    if (this._autoLoadModels.length === 0) {
      return
    }


    for (const key of this._autoLoadModels) {
      const [task, modelId] = key.split(':')
      if (!task || !modelId) continue

      // Skip if already loaded
      if (this._loadedModels.has(key)) {
        continue
      }

      try {
        await this.loadModel(task, modelId, (progress) => {
          onProgress?.(task, progress)
        })
      } catch (error) {
        console.error(`[AIInference] Failed to auto-load ${key}:`, error)
        // Continue with other models even if one fails
      }
    }

  }

  // Clear cached models from IndexedDB
  async clearModelCache(): Promise<void> {
    // Clear from worker (this disposes all pipelines)
    if (this._worker) {
      await this.sendToWorker({ type: 'clearCache' }, undefined, 30000)
    }

    // Clear local state since models are now unloaded
    this._loadedModels.clear()
    this._modelInfo.clear()

    // Also try to clear IndexedDB directly for transformers.js
    try {
      const databases = await indexedDB.databases()
      for (const db of databases) {
        if (db.name && (db.name.includes('transformers') || db.name.includes('onnx'))) {
          indexedDB.deleteDatabase(db.name)
        }
      }
    } catch (error) {
      console.warn('[AIInference] Could not enumerate IndexedDB databases:', error)
    }

    this.notifyListeners()
  }

  // Load a model
  async loadModel(
    task: string,
    modelId?: string,
    onProgress?: ProgressCallback,
    options?: { device?: DeviceType; dtype?: DType }
  ): Promise<boolean> {
    const model = modelId || this.getDefaultModel(task)
    if (!model) {
      throw new Error(`No model specified for task: ${task}`)
    }

    const key = `${task}:${model}`

    // Return if already loaded
    if (this._loadedModels.has(key)) {
      const existing = this._modelInfo.get(key)
      if (existing?.state === 'ready') {
        return true
      }
    }

    // Mark as loading
    this.updateModelInfo(key, { state: 'loading', progress: 0 })

    try {

      const device = options?.device || (this._useWebGPU ? 'webgpu' : undefined)
      const dtype = options?.dtype || this._defaultDType

      await this.sendToWorker<boolean>(
        {
          type: 'load',
          task,
          model,
          options: { device, dtype, useBrowserCache: this._useBrowserCache },
        },
        (progress) => {
          this.updateModelInfo(key, { progress })
          onProgress?.(progress)
        }
      )

      this._loadedModels.add(key)
      this.updateModelInfo(key, {
        state: 'ready',
        progress: 100,
        loadedAt: Date.now(),
        device: device || 'cpu',
        dtype,
      })

      return true
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

    if (this._loadedModels.has(key)) {
      await this.sendToWorker({ type: 'unload', task, model })
      this._loadedModels.delete(key)
      this._modelInfo.delete(key)
      this.notifyListeners()
    }
  }

  // Dispose all models
  async dispose(): Promise<void> {
    // Clear all pending requests with their timeouts
    for (const [, pending] of this._pendingRequests) {
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId)
      }
      pending.reject(new Error('Service disposed'))
    }
    this._pendingRequests.clear()

    if (this._worker) {
      try {
        await this.sendToWorker({ type: 'dispose' }, undefined, 5000) // Short timeout for dispose
      } catch {
        // Ignore timeout on dispose
      }
      this._worker.terminate()
      this._worker = null
    }
    this._loadedModels.clear()
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
    const model = modelId || this.getDefaultModel('text-generation')
    const key = `text-generation:${model}`

    if (!this._loadedModels.has(key)) {
      await this.loadModel('text-generation', model)
    }

    return this.sendToWorker<string>({
      type: 'infer',
      task: 'text-generation',
      model,
      method: 'generateText',
      args: [prompt, options],
    })
  }

  async text2text(
    input: string,
    options?: { maxLength?: number },
    modelId?: string
  ): Promise<string> {
    const model = modelId || this.getDefaultModel('text2text-generation')
    const key = `text2text-generation:${model}`

    if (!this._loadedModels.has(key)) {
      await this.loadModel('text2text-generation', model)
    }

    return this.sendToWorker<string>({
      type: 'infer',
      task: 'text2text-generation',
      model,
      method: 'text2text',
      args: [input, options],
    })
  }

  async classifyImage(
    image: ImageData | HTMLCanvasElement | HTMLImageElement | string,
    topK = 5,
    modelId?: string
  ): Promise<Array<{ label: string; score: number }>> {
    const model = modelId || this.getDefaultModel('image-classification')
    const key = `image-classification:${model}`

    if (!this._loadedModels.has(key)) {
      await this.loadModel('image-classification', model)
    }

    // Convert image to serializable format for worker
    const imageData = this.imageToSerializable(image)

    return this.sendToWorker<Array<{ label: string; score: number }>>({
      type: 'infer',
      task: 'image-classification',
      model,
      method: 'classifyImage',
      args: [imageData, topK],
    })
  }

  async detectObjects(
    image: ImageData | HTMLCanvasElement | HTMLImageElement | string,
    threshold = 0.5,
    modelId?: string
  ): Promise<Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>> {
    const model = modelId || this.getDefaultModel('object-detection')
    const key = `object-detection:${model}`

    if (!this._loadedModels.has(key)) {
      await this.loadModel('object-detection', model)
    }

    const imageData = this.imageToSerializable(image)

    return this.sendToWorker<Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>>({
      type: 'infer',
      task: 'object-detection',
      model,
      method: 'detectObjects',
      args: [imageData, threshold],
    })
  }

  async transcribe(
    audio: Float32Array | Blob | string,
    modelId?: string
  ): Promise<string> {
    const model = modelId || this.getDefaultModel('automatic-speech-recognition')
    const key = `automatic-speech-recognition:${model}`

    if (!this._loadedModels.has(key)) {
      await this.loadModel('automatic-speech-recognition', model)
    }

    // Convert Float32Array to regular array for serialization
    const audioData = audio instanceof Float32Array ? Array.from(audio) : audio

    return this.sendToWorker<string>({
      type: 'infer',
      task: 'automatic-speech-recognition',
      model,
      method: 'transcribe',
      args: [audioData],
    })
  }

  async analyzeSentiment(
    text: string,
    modelId?: string
  ): Promise<Array<{ label: string; score: number }>> {
    const model = modelId || this.getDefaultModel('sentiment-analysis')
    const key = `sentiment-analysis:${model}`

    if (!this._loadedModels.has(key)) {
      await this.loadModel('sentiment-analysis', model)
    }

    return this.sendToWorker<Array<{ label: string; score: number }>>({
      type: 'infer',
      task: 'sentiment-analysis',
      model,
      method: 'analyzeSentiment',
      args: [text],
    })
  }

  async extractFeatures(
    text: string,
    modelId?: string
  ): Promise<number[]> {
    const model = modelId || this.getDefaultModel('feature-extraction')
    const key = `feature-extraction:${model}`

    if (!this._loadedModels.has(key)) {
      await this.loadModel('feature-extraction', model)
    }

    return this.sendToWorker<number[]>({
      type: 'infer',
      task: 'feature-extraction',
      model,
      method: 'extractFeatures',
      args: [text],
    })
  }

  async captionImage(
    image: ImageData | HTMLCanvasElement | HTMLImageElement | string,
    modelId?: string
  ): Promise<string> {
    const model = modelId || this.getDefaultModel('image-to-text')
    const key = `image-to-text:${model}`

    if (!this._loadedModels.has(key)) {
      await this.loadModel('image-to-text', model)
    }

    const imageData = this.imageToSerializable(image)

    return this.sendToWorker<string>({
      type: 'infer',
      task: 'image-to-text',
      model,
      method: 'captionImage',
      args: [imageData],
    })
  }

  // Helper to convert image to serializable format for worker
  private imageToSerializable(
    image: ImageData | HTMLCanvasElement | HTMLImageElement | string
  ): { width: number; height: number; data: number[] } | string {
    if (typeof image === 'string') {
      return image
    }

    let imageData: ImageData

    if (image instanceof ImageData) {
      imageData = image
    } else if (image instanceof HTMLCanvasElement) {
      const ctx = image.getContext('2d')!
      imageData = ctx.getImageData(0, 0, image.width, image.height)
    } else if (image instanceof HTMLImageElement) {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth || image.width
      canvas.height = image.naturalHeight || image.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    } else {
      throw new Error('Unsupported image type')
    }

    return {
      width: imageData.width,
      height: imageData.height,
      data: Array.from(imageData.data),
    }
  }
}

// Singleton instance
export const aiInference = new AIInferenceService()
