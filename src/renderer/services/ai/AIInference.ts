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

import { collectTransferables, type SerializedImage } from './imageTransfer'
import { requestPersistentStorage } from './modelStorage'
import { WorkerFacade } from '@/services/worker/WorkerFacade'
import { deriveAiModels } from './models/transformers/derive'
import { setModelSelectResolver } from '@/engine/defineNode'

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

// Model option with size + license info
export interface ModelOption {
  id: string
  name: string
  size: string
  /** SPDX-ish license id (e.g. 'apache-2.0', 'mit', 'llama3.2', 'gemma'). */
  license: string
}

// Model definition with metadata
export interface ModelDefinition {
  id: string
  name: string
  task: string
  description: string
  defaultModel: string
  defaultSize: string
  /** License of the default model (alternates carry their own). */
  defaultLicense: string
  alternateModels: ModelOption[]
  supportsWebGPU: boolean
  category: 'text' | 'vision' | 'audio' | 'multimodal'
}

// The in-browser transformers.js (ONNX Runtime Web) model catalog — now DERIVED from the
// co-located `models/transformers/*.model.ts` specs + `models/transformers/taskCatalog.ts`
// (see `models/transformers/derive.ts`; EXTENSIBILITY §8). Repo ids + sizes were
// network-verified against live Hugging Face pages on 2026-06-14; actual in-browser
// load+run remains a manual check. Defaults stay conservative (small, proven); modern
// higher-quality models are offered as alternates. Adding a model = drop one `*.model.ts`
// + reference its id in taskCatalog. Deep-equal gated against the frozen baseline (POLICIES §1).
export const AI_MODELS: ModelDefinition[] = deriveAiModels()

export interface ModelSelectOption {
  value: string
  label: string
}

/**
 * Build the `model` select options for an AI task from `AI_MODELS`: an "auto"
 * entry (value `''`) followed by each alternate model. Value `''` resolves to the
 * task default at inference time — every service method keys on
 * `modelId || getDefaultModel(task)` — so a node whose select is left on the
 * default behaves exactly as it did before a select existed (and old saved flows,
 * which have no `model` control, resolve the same way). Pure over the catalog, so
 * it's cheap to call at node-definition time and trivially testable. The source
 * swaps to the model registry once models are co-located; the hand-authored
 * catalog stays authoritative until the sign-off-gated derive.
 */
export function getModelSelectOptions(task: string): ModelSelectOption[] {
  const def = AI_MODELS.find((m) => m.task === task)
  if (!def) return []
  const defaultName = def.defaultModel.split('/').pop() ?? def.defaultModel
  return [
    { value: '', label: `Default — ${defaultName} (${def.defaultSize})` },
    ...def.alternateModels.map((m) => ({ value: m.id, label: `${m.name} (${m.size})` })),
  ]
}

// Inject the AI catalog into `defineNode`'s global model-select resolver. This is THE
// seam that makes the declarative `defineNode({ models: [{ task }] })` path work for any
// node: the engine stays catalog-agnostic (arrow points AI→engine, never the reverse) and
// gets the populated select from here. Default `''` resolves to the task default at
// inference time (`modelId || getDefaultModel`), so adopting the select is additive and a
// saved flow with no `model` value behaves exactly as before. Runs at module load: the AI nodes
// import their executor (→ this module) before their own `defineNode()`, so their selects populate
// at glob time; and `nodeRegistry` re-derives every `models:` spec after this module loads, so any
// other node populates too. Replaces the retired `registry/ai/modelSelect.ts` `withModelSelect` shim.
setModelSelectResolver((task) => ({ options: getModelSelectOptions(task), default: '' }))

// Progress callback type
type ProgressCallback = (progress: number) => void

// Default timeout for worker requests (5 minutes for model loading)
const DEFAULT_REQUEST_TIMEOUT = 5 * 60 * 1000

class AIInferenceService extends WorkerFacade {
  private _initialized = false
  private _modelInfo = new Map<string, ModelInfo>()
  private _listeners = new Set<() => void>()
  private _webgpuAvailable = false
  private _useWebGPU = false
  private _useBrowserCache = true
  private _defaultDType: DType = 'q4'
  private _loadedModels = new Set<string>()
  private _autoLoadModels: string[] = []
  private _selectedModels: Record<string, string> = {}
  private _settingsLoaded = false

  constructor() {
    super({ defaultTimeout: DEFAULT_REQUEST_TIMEOUT })
    // Spawn eagerly so the worker is warm before the first inference.
    this.ensureWorker()
    this.checkWebGPU()
  }

  protected get label(): string {
    return 'AIInference'
  }

  // Module worker (Transformers.js / onnxruntime-web need ES `import`).
  protected createWorker(): Worker {
    return new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
  }

  // Route worker messages to the shared facade's pending-request bookkeeping.
  protected handleMessage(data: unknown): void {
    const msg = data as {
      type: string
      id: number
      progress?: number
      success?: boolean
      data?: unknown
      loaded?: boolean
      error?: string
    }

    switch (msg.type) {
      case 'progress': {
        this.reportProgress(msg.id, msg.progress ?? 0)
        // Also update model info for the UI (not tied to a single request id).
        const loadingModels = Array.from(this._modelInfo.entries()).filter(
          ([, info]) => info.state === 'loading'
        )
        for (const [key] of loadingModels) {
          this.updateModelInfo(key, { progress: msg.progress })
        }
        break
      }
      case 'loaded':
        if (msg.success) this.settle(msg.id, true)
        else this.fail(msg.id, new Error(msg.error || 'Failed to load model'))
        break
      case 'result':
        if (msg.success) this.settle(msg.id, msg.data)
        else this.fail(msg.id, new Error(msg.error || 'Inference failed'))
        break
      case 'checkResult':
        this.settle(msg.id, msg.loaded)
        break
    }
  }

  // Send a request to the worker and await its response. Transfers image pixel
  // buffers zero-copy (non-image messages produce an empty transfer list); the
  // pending-promise + timeout bookkeeping lives in WorkerFacade.
  private sendToWorker<T>(
    message: Record<string, unknown>,
    onProgress?: ProgressCallback,
    timeout: number = DEFAULT_REQUEST_TIMEOUT
  ): Promise<T> {
    return this.request<T>(message, {
      transfer: collectTransferables(message.args as readonly unknown[] | undefined),
      onProgress,
      timeout,
    })
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
    // Notify worker of the change (no-op if the worker isn't spawned).
    this.notify({ type: 'setCache', enabled: use })
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
          this.notify({ type: 'setCache', enabled: this._useBrowserCache })
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
    if (this.worker) {
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

    // We're about to cache (potentially GB of) weights and the user has clearly
    // engaged with the ML feature — request durable storage now so the cache
    // survives eviction. Memoized + retries on denial (see modelStorage.ts).
    void requestPersistentStorage()

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
    if (this.worker) {
      try {
        await this.sendToWorker({ type: 'dispose' }, undefined, 5000) // Short timeout for dispose
      } catch {
        // Ignore timeout on dispose
      }
    }
    // Terminate the worker and reject any still-in-flight requests.
    this.terminate('Service disposed')
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

  /**
   * Detect objects with a raw YOLO (v8/v9/GELAN) `.onnx` model via onnxruntime-web
   * in the worker. `modelUrl` is the full weights URL (lazy-loaded + cached worker
   * side). Returns the same shape as detectObjects. The first call downloads the
   * model (tens–hundreds of MB), hence the long timeout.
   */
  async detectYolo(
    image: ImageData | HTMLCanvasElement | HTMLImageElement | string,
    modelUrl: string,
    threshold = 0.25,
    iou = 0.45
  ): Promise<Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>> {
    const imageData = this.imageToSerializable(image)

    return this.sendToWorker<Array<{ label: string; score: number; box: { xmin: number; ymin: number; xmax: number; ymax: number } }>>(
      {
        type: 'infer',
        task: 'yolo',
        model: modelUrl,
        method: 'detectYolo',
        args: [imageData, { threshold, iou }],
      },
      undefined,
      300000 // first call downloads the model — allow up to 5 min
    )
  }

  /**
   * Monocular depth estimation. Returns the depth map as a normalized 0–255
   * grayscale buffer (`channels` is usually 1). The first call downloads the
   * model (tens of MB), hence the long timeout.
   */
  async estimateDepth(
    image: ImageData | HTMLCanvasElement | HTMLImageElement | string,
    modelId?: string
  ): Promise<{ width: number; height: number; channels: number; data: number[] }> {
    const model = modelId || 'Xenova/depth-anything-small-hf'
    const key = `depth-estimation:${model}`

    if (!this._loadedModels.has(key)) {
      await this.loadModel('depth-estimation', model)
    }

    const imageData = this.imageToSerializable(image)

    return this.sendToWorker<{ width: number; height: number; channels: number; data: number[] }>(
      {
        type: 'infer',
        task: 'depth-estimation',
        model,
        method: 'estimateDepth',
        args: [imageData],
      },
      undefined,
      300000 // first call downloads the model — allow up to 5 min
    )
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

  /**
   * Vision-language-action (VLM-as-policy): run a SmolVLM-style model on an image
   * + a natural-language instruction and return the model's text response (an
   * answer or an action). Loads the model on first use.
   */
  async visionAction(
    image: ImageData | HTMLCanvasElement | HTMLImageElement,
    instruction: string,
    options?: { modelId?: string; maxNewTokens?: number }
  ): Promise<string> {
    const model = options?.modelId || this.getDefaultModel('image-text-to-text')
    const key = `image-text-to-text:${model}`

    if (!this._loadedModels.has(key)) {
      await this.loadModel('image-text-to-text', model)
    }

    const imageData = this.imageToSerializable(image)
    if (typeof imageData === 'string') {
      throw new Error('visionAction requires pixel image data, not a URL string')
    }

    return this.sendToWorker<string>({
      type: 'infer',
      task: 'image-text-to-text',
      model,
      method: 'visionAction',
      args: [imageData, instruction, options?.maxNewTokens ?? 64],
    })
  }

  // Helper to convert an image to the worker payload. Pixels are kept as a
  // Uint8ClampedArray so sendToWorker can transfer the backing buffer (zero-copy)
  // rather than structured-cloning a large number[] (the former Array.from path).
  private imageToSerializable(
    image: ImageData | HTMLCanvasElement | HTMLImageElement | string
  ): SerializedImage | string {
    if (typeof image === 'string') {
      return image
    }

    if (image instanceof ImageData) {
      // The caller owns this ImageData and may reuse it, so copy rather than
      // transfer (and detach) its buffer.
      return {
        width: image.width,
        height: image.height,
        data: new Uint8ClampedArray(image.data),
      }
    }

    let imageData: ImageData
    if (image instanceof HTMLCanvasElement) {
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

    // Fresh getImageData buffer we own — safe to transfer directly (no copy).
    return {
      width: imageData.width,
      height: imageData.height,
      data: imageData.data,
    }
  }
}

// Singleton instance
export const aiInference = new AIInferenceService()
