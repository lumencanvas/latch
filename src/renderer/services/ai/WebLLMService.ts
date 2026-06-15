/**
 * Streaming in-browser LLM via @mlc-ai/web-llm (WebGPU). The heavy WebLLM runtime
 * (~14 MB + WASM) is **dynamic-imported inside the engine factory** and the engine
 * itself runs in a dedicated worker (`webllm.worker.ts`) — so nothing here lands
 * in the main bundle and tests never load the real package (they inject a factory).
 *
 * The service owns one active engine (a browser can realistically hold one
 * multi-GB model) and per-node generation state. The LLM node executor reads that
 * state each frame (sync) while a background stream appends tokens — a
 * fire-and-latch pattern, so generation never blocks the render loop.
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
  private handle: EngineHandle | null = null
  private loadedModel: string | null = null
  private supported: boolean | null = null
  private readonly states = new Map<string, GenState>()
  /** The node whose generation currently owns the engine. */
  private activeNodeId: string | null = null
  /**
   * Monotonic generation token. Each startGeneration bumps it; a generation
   * checks it after every await and bails if a newer one (or interrupt/dispose)
   * has superseded it. Guards the single shared engine against concurrent
   * triggers and stale tokens landing — same pattern as the render-loop fix.
   */
  private genToken = 0

  constructor(opts?: { gpuCheck?: () => Promise<boolean>; engineFactory?: EngineFactory }) {
    this.gpuCheck = opts?.gpuCheck ?? isWebGPUAvailable
    this.engineFactory = opts?.engineFactory ?? defaultEngineFactory
  }

  /** Memoized WebGPU support check. */
  async isSupported(): Promise<boolean> {
    if (this.supported === null) this.supported = await this.gpuCheck()
    return this.supported
  }

  /** Current generation state for a node (never undefined). */
  getState(nodeId: string): GenState {
    return this.states.get(nodeId) ?? IDLE
  }

  private set(nodeId: string, patch: Partial<GenState>): void {
    this.states.set(nodeId, { ...this.getState(nodeId), ...patch })
  }

  /**
   * Start (or restart) generation for a node. Resolves when the stream finishes.
   * The executor calls this fire-and-forget and polls {@link getState} per frame.
   */
  async startGeneration(nodeId: string, req: GenerationRequest): Promise<void> {
    const token = ++this.genToken

    // Supersede any other in-flight generation on the shared engine: settle its
    // state now and stop the engine; its loop bails on the token mismatch below.
    if (this.activeNodeId && this.activeNodeId !== nodeId) {
      const s = this.getState(this.activeNodeId).status
      if (s === 'generating' || s === 'loading') this.set(this.activeNodeId, { status: 'done' })
    }
    try {
      this.handle?.engine.interruptGenerate()
    } catch {
      /* ignore */
    }
    this.activeNodeId = nodeId
    this.set(nodeId, { status: 'loading', text: '', progress: 0, error: undefined, model: req.model })

    if (!(await this.isSupported())) {
      if (token === this.genToken) {
        this.set(nodeId, { status: 'unsupported', error: 'WebGPU is not available in this browser' })
      }
      return
    }

    try {
      const engine = await this.ensureEngine(req.model, (p) => {
        if (token === this.genToken) this.set(nodeId, { progress: p.progress })
      })
      if (token !== this.genToken) return // superseded during model load

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
      if (token === this.genToken && this.activeNodeId === nodeId) this.activeNodeId = null
    }
  }

  /** A model (re)load currently in flight; resolves (never rejects) when settled. */
  private engineLoad: Promise<void> | null = null

  /** Load the engine for `model`, reloading if a different model is active. */
  private async ensureEngine(
    model: string,
    onProgress: (r: ProgressReport) => void,
  ): Promise<LLMEngine> {
    // Serialize loads: wait out any in-flight (re)load so the factory never runs
    // twice in parallel — that would create (and leak) a second multi-GB engine
    // whose handle gets overwritten without dispose(). genToken guards the stream
    // but not engine creation, so two triggers during a load could both reach here.
    while (this.engineLoad) await this.engineLoad
    if (this.handle && this.loadedModel === model) return this.handle.engine

    const load = this.loadEngine(model, onProgress)
    // Mirror as a non-rejecting promise so waiters above just re-check state and
    // retry on failure instead of seeing an unhandled rejection.
    this.engineLoad = load.then(
      () => {},
      () => {},
    )
    try {
      await load
    } finally {
      this.engineLoad = null
    }
    return this.handle!.engine
  }

  /** Dispose any current engine, then construct + load `model`. */
  private async loadEngine(model: string, onProgress: (r: ProgressReport) => void): Promise<void> {
    if (this.handle) {
      await this.handle.dispose()
      this.handle = null
      this.loadedModel = null
    }
    this.handle = await this.engineFactory(model, onProgress)
    this.loadedModel = model
  }

  /** Interrupt an in-flight generation for a node. */
  interrupt(nodeId: string): void {
    if (this.activeNodeId === nodeId) {
      this.genToken++ // make the in-flight loop bail at its next checkpoint
      this.activeNodeId = null
      try {
        this.handle?.engine.interruptGenerate()
      } catch {
        /* ignore */
      }
    }
    const status = this.getState(nodeId).status
    if (status === 'generating' || status === 'loading') this.set(nodeId, { status: 'done' })
  }

  /** Drop a node's state (node removed). */
  disposeNode(nodeId: string): void {
    if (this.activeNodeId === nodeId) this.interrupt(nodeId)
    this.states.delete(nodeId)
  }

  /** GC state for nodes no longer in the graph. */
  gc(validNodeIds: Set<string>): void {
    for (const id of this.states.keys()) {
      if (!validNodeIds.has(id)) this.states.delete(id)
    }
  }

  /** Release the engine + all state (execution stopped). */
  async disposeAll(): Promise<void> {
    this.genToken++ // bail any in-flight generation loops
    const handle = this.handle
    this.handle = null
    this.loadedModel = null
    this.activeNodeId = null
    this.states.clear()
    this.supported = null
    if (handle) await handle.dispose()
  }
}

/** Singleton used by the LLM node executor. */
export const webLLMService = new WebLLMService()
