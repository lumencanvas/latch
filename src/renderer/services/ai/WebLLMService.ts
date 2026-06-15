/**
 * Streaming in-browser LLM via @mlc-ai/web-llm (WebGPU). The heavy WebLLM runtime
 * (~14 MB + WASM) is **dynamic-imported inside the engine factory** and each engine
 * runs in its own dedicated worker (`webllm.worker.ts`) — so nothing here lands in
 * the main bundle and tests never load the real package (they inject a factory).
 *
 * Models are **user-managed loaded engines**, consistent with the transformers.js
 * model manager: you can `preload()` several at once and `unload()` them; loaded
 * engines persist across flow start/stop (only `disposeAll()` or `unload()` frees
 * them). The LLM node uses whichever model it requests, loading it on demand if it
 * isn't already loaded. Generation is one-at-a-time (fire-and-latch: the executor
 * polls {@link getState} per frame while a background stream appends tokens), so it
 * never blocks the render loop; a monotonic `genToken` supersedes stale streams.
 *
 * Note: each loaded chat model uses real GPU VRAM (~0.4–5 GB), so loading several
 * large models at once can exhaust it — that's the user's call, like disk cache.
 *
 * WebGPU is mandatory; without it generation resolves to an `unsupported` state
 * with a clear message rather than throwing.
 */
import { isWebGPUAvailable } from './webgpu'

// Structural types — deliberately NOT imported from @mlc-ai/web-llm so this module
// has no static dependency on it.
export interface LLMChunk {
  choices: Array<{ delta: { content?: string } }>
  usage?: unknown
}
export interface LLMEngine {
  chat: {
    completions: {
      create(opts: {
        messages: Array<{ role: string; content: string }>
        stream: true
        stream_options?: { include_usage?: boolean }
        temperature?: number
        max_tokens?: number
      }): Promise<AsyncIterable<LLMChunk>>
    }
  }
  interruptGenerate(): void
  unload(): Promise<void>
}

export interface EngineHandle {
  engine: LLMEngine
  /** Release the engine + its worker. */
  dispose: () => Promise<void>
}

export interface ProgressReport {
  progress: number
  text: string
}

export type EngineFactory = (
  modelId: string,
  onProgress: (report: ProgressReport) => void,
) => Promise<EngineHandle>

export type GenStatus = 'idle' | 'unsupported' | 'loading' | 'generating' | 'done' | 'error'

export interface GenState {
  status: GenStatus
  /** Accumulated generated text so far. */
  text: string
  /** Model-load progress, 0..1. */
  progress: number
  error?: string
  model?: string
}

/** Load state for one model id (for the model-manager UI). */
export interface ModelLoadState {
  status: 'loading' | 'loaded' | 'error'
  progress: number
  error?: string
}

export interface GenerationRequest {
  model: string
  prompt: string
  system?: string
  maxTokens?: number
  temperature?: number
}

const IDLE: GenState = { status: 'idle', text: '', progress: 0 }

/** Real engine factory: dynamic-import WebLLM + spin up its worker. Browser-only. */
const defaultEngineFactory: EngineFactory = async (modelId, onProgress) => {
  const webllm = await import('@mlc-ai/web-llm')
  const worker = new Worker(new URL('./webllm.worker.ts', import.meta.url), { type: 'module' })
  const engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
    initProgressCallback: (r: { progress: number; text: string }) =>
      onProgress({ progress: r.progress, text: r.text }),
  })
  return {
    engine: engine as unknown as LLMEngine,
    dispose: async () => {
      try {
        await engine.unload()
      } finally {
        worker.terminate()
      }
    },
  }
}

export class WebLLMService {
  private readonly gpuCheck: () => Promise<boolean>
  private readonly engineFactory: EngineFactory
  private supported: boolean | null = null

  /** Loaded chat engines, keyed by model id — several may be loaded at once. */
  private readonly engines = new Map<string, EngineHandle>()
  /** In-flight loads, keyed by model id, so concurrent loads of the same model coalesce. */
  private readonly engineLoads = new Map<string, Promise<EngineHandle>>()
  /** Load state per model id, surfaced to the manager UI. */
  private readonly loadStates = new Map<string, ModelLoadState>()
  /** Per-node generation state. */
  private readonly states = new Map<string, GenState>()
  /** Listeners notified when loaded-model state changes (manager reactivity). */
  private readonly listeners = new Set<() => void>()

  /** The node + model that currently own generation (one stream at a time). */
  private activeNodeId: string | null = null
  private activeModel: string | null = null
  /**
   * Monotonic generation token. Each startGeneration bumps it; a generation checks
   * it after every await and bails if a newer one (or interrupt/dispose) superseded
   * it — guards the single active stream against concurrent triggers + stale tokens.
   */
  private genToken = 0

  constructor(opts?: { gpuCheck?: () => Promise<boolean>; engineFactory?: EngineFactory }) {
    this.gpuCheck = opts?.gpuCheck ?? isWebGPUAvailable
    this.engineFactory = opts?.engineFactory ?? defaultEngineFactory
  }

  // ---- reactivity for the manager UI ----------------------------------------
  /** Subscribe to loaded-model state changes; returns an unsubscribe fn. */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private notify(): void {
    for (const fn of this.listeners) {
      try {
        fn()
      } catch {
        /* ignore listener errors */
      }
    }
  }

  /** Memoized WebGPU support check. */
  async isSupported(): Promise<boolean> {
    if (this.supported === null) this.supported = await this.gpuCheck()
    return this.supported
  }

  // ---- loaded-model management ----------------------------------------------
  isLoaded(model: string): boolean {
    return this.engines.has(model)
  }
  loadedModels(): string[] {
    return [...this.engines.keys()]
  }
  getLoadState(model: string): ModelLoadState | undefined {
    return this.loadStates.get(model)
  }

  /**
   * Load (and cache) an engine for `model`. Idempotent and serialized per model, so
   * concurrent loads of the same id coalesce into one factory call (no double-create
   * leak). Returns false when WebGPU is unavailable or the load fails.
   */
  async preload(model: string, onProgress?: (r: ProgressReport) => void): Promise<boolean> {
    if (!(await this.isSupported())) return false
    try {
      await this.loadEngineFor(model, onProgress)
      return true
    } catch {
      return false
    }
  }

  private loadEngineFor(model: string, onProgress?: (r: ProgressReport) => void): Promise<EngineHandle> {
    const existing = this.engines.get(model)
    if (existing) return Promise.resolve(existing)
    const inFlight = this.engineLoads.get(model)
    if (inFlight) return inFlight

    const load = (async () => {
      this.loadStates.set(model, { status: 'loading', progress: 0 })
      this.notify()
      try {
        const handle = await this.engineFactory(model, (p) => {
          this.loadStates.set(model, { status: 'loading', progress: p.progress })
          this.notify()
          onProgress?.(p)
        })
        this.engines.set(model, handle)
        this.loadStates.set(model, { status: 'loaded', progress: 1 })
        this.notify()
        return handle
      } catch (e) {
        this.loadStates.set(model, {
          status: 'error',
          progress: 0,
          error: e instanceof Error ? e.message : String(e),
        })
        this.notify()
        throw e
      } finally {
        this.engineLoads.delete(model)
      }
    })()
    this.engineLoads.set(model, load)
    return load
  }

  /** Unload a specific model's engine, freeing its VRAM. */
  async unload(model: string): Promise<void> {
    const inFlight = this.engineLoads.get(model)
    if (inFlight) {
      try {
        await inFlight
      } catch {
        /* ignore — load already failed */
      }
    }
    const handle = this.engines.get(model)
    this.engines.delete(model)
    this.loadStates.delete(model)
    if (this.activeModel === model) this.interruptActiveGeneration()
    this.notify()
    if (handle) await handle.dispose()
  }

  // ---- generation -----------------------------------------------------------
  /** Current generation state for a node (never undefined). */
  getState(nodeId: string): GenState {
    return this.states.get(nodeId) ?? IDLE
  }

  private set(nodeId: string, patch: Partial<GenState>): void {
    this.states.set(nodeId, { ...this.getState(nodeId), ...patch })
  }

  private interruptActiveGeneration(): void {
    if (this.activeModel) {
      try {
        this.engines.get(this.activeModel)?.engine.interruptGenerate()
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Start (or restart) generation for a node, loading its model on demand if it
   * isn't already loaded. Resolves when the stream finishes; the executor calls it
   * fire-and-forget and polls {@link getState} per frame.
   */
  async startGeneration(nodeId: string, req: GenerationRequest): Promise<void> {
    const token = ++this.genToken

    // Supersede any other in-flight generation: settle its state and stop its stream.
    if (this.activeNodeId && this.activeNodeId !== nodeId) {
      const s = this.getState(this.activeNodeId).status
      if (s === 'generating' || s === 'loading') this.set(this.activeNodeId, { status: 'done' })
    }
    this.interruptActiveGeneration()
    this.activeNodeId = nodeId
    this.set(nodeId, { status: 'loading', text: '', progress: 0, error: undefined, model: req.model })

    if (!(await this.isSupported())) {
      if (token === this.genToken) {
        this.set(nodeId, { status: 'unsupported', error: 'WebGPU is not available in this browser' })
      }
      return
    }

    try {
      const handle = await this.loadEngineFor(req.model, (p) => {
        if (token === this.genToken) this.set(nodeId, { progress: p.progress })
      })
      if (token !== this.genToken) return // superseded during model load
      this.activeModel = req.model
      const engine = handle.engine

      const messages: Array<{ role: string; content: string }> = []
      if (req.system) messages.push({ role: 'system', content: req.system })
      messages.push({ role: 'user', content: req.prompt })

      this.set(nodeId, { status: 'generating', text: '', progress: 1 })
      const chunks = await engine.chat.completions.create({
        messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 512,
      })
      if (token !== this.genToken) return // superseded before streaming began

      let text = ''
      for await (const chunk of chunks) {
        if (token !== this.genToken) break // superseded mid-stream
        text += chunk.choices[0]?.delta?.content ?? ''
        this.set(nodeId, { text })
      }
      if (token === this.genToken) this.set(nodeId, { status: 'done' })
    } catch (err) {
      if (token === this.genToken) {
        this.set(nodeId, { status: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      if (token === this.genToken && this.activeNodeId === nodeId) {
        this.activeNodeId = null
        this.activeModel = null
      }
    }
  }

  /** Interrupt an in-flight generation for a node (its engine stays loaded). */
  interrupt(nodeId: string): void {
    if (this.activeNodeId === nodeId) {
      this.genToken++ // make the in-flight loop bail at its next checkpoint
      this.interruptActiveGeneration()
      this.activeNodeId = null
      this.activeModel = null
    }
    const status = this.getState(nodeId).status
    if (status === 'generating' || status === 'loading') this.set(nodeId, { status: 'done' })
  }

  /** Drop a node's generation state (node removed). Loaded engines are untouched. */
  disposeNode(nodeId: string): void {
    if (this.activeNodeId === nodeId) this.interrupt(nodeId)
    this.states.delete(nodeId)
  }

  /** GC generation state for nodes no longer in the graph. Engines are untouched. */
  gc(validNodeIds: Set<string>): void {
    for (const id of this.states.keys()) {
      if (!validNodeIds.has(id)) this.states.delete(id)
    }
  }

  /**
   * Stop the active generation and clear per-node state, but KEEP loaded engines
   * (execution stopped). Loaded models are user-managed and persist until unloaded.
   */
  stopActive(): void {
    this.genToken++
    this.interruptActiveGeneration()
    this.activeNodeId = null
    this.activeModel = null
    this.states.clear()
  }

  /** Release ALL engines + state (full teardown / unload everything). */
  async disposeAll(): Promise<void> {
    this.genToken++
    this.activeNodeId = null
    this.activeModel = null
    this.states.clear()
    this.supported = null
    const handles = [...this.engines.values()]
    this.engines.clear()
    this.loadStates.clear()
    this.notify()
    await Promise.all(handles.map((h) => h.dispose().catch(() => {})))
  }
}

/** Singleton used by the LLM node executor + the model manager. */
export const webLLMService = new WebLLMService()
