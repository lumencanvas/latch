/**
 * WorkerFacade — shared main-thread ↔ Web Worker RPC base.
 *
 * Multiple services (AIInference, OpenCVService) run heavy work in a Web Worker
 * behind the same request/response shape: a promise-per-request keyed by a
 * numeric id, a pending-requests map, optional per-request timeout + progress
 * callback, zero-copy transferables, and reject-all on worker crash. That
 * boilerplate lived (and drifted) in each service; this base owns it once.
 *
 * A subclass provides only what's genuinely different:
 *  - `createWorker()` — how to spawn ITS worker (classic vs module, which URL),
 *  - `handleMessage(data)` — how to route ITS message protocol to `settle` /
 *    `fail` / `reportProgress` (the base can't know a service's message types).
 *
 * The subclass drives requests with `request(message, opts)` and fire-and-forget
 * messages with `notify(message)`; the base injects the `id`, tracks the pending
 * promise, and cleans up on settle/timeout/crash/terminate.
 */

export interface WorkerRequestOptions {
  /** Buffers to transfer zero-copy (e.g. `[imageData.data.buffer]`). */
  transfer?: Transferable[]
  /** Reject after this many ms (0 = no timeout). Defaults to the facade's default. */
  timeout?: number
  /** Receives `progress` (0–100) values forwarded via `reportProgress(id, …)`. */
  onProgress?: (progress: number) => void
}

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  onProgress?: (progress: number) => void
  timeoutId?: ReturnType<typeof setTimeout>
}

export abstract class WorkerFacade {
  private _worker: Worker | null = null
  private _pending = new Map<number, PendingRequest>()
  private _idCounter = 0
  /** Per-request timeout default (ms); 0 disables timeouts unless a call overrides. */
  private readonly _defaultTimeout: number

  constructor(opts: { defaultTimeout?: number } = {}) {
    this._defaultTimeout = opts.defaultTimeout ?? 0
  }

  /** Spawn this service's worker (subclass picks classic vs module + URL). */
  protected abstract createWorker(): Worker

  /** Route a worker message to `settle`/`fail`/`reportProgress` by its `id`. */
  protected abstract handleMessage(data: unknown): void

  /** Label used in log/error messages. Override for a friendlier name. */
  protected get label(): string {
    return this.constructor.name
  }

  /** The live worker (or null if not yet spawned / failed / terminated). */
  protected get worker(): Worker | null {
    return this._worker
  }

  /** Lazily spawn the worker (idempotent). Returns null if spawning fails. */
  protected ensureWorker(): Worker | null {
    if (this._worker) return this._worker
    try {
      const w = this.createWorker()
      w.onmessage = (event: MessageEvent) => this.handleMessage(event.data)
      w.onerror = (error) => this.onWorkerError(error)
      this._worker = w
    } catch (error) {
      console.error(`[${this.label}] Failed to initialize worker:`, error)
      this._worker = null
    }
    return this._worker
  }

  /**
   * Post a request and await its settlement (by id). The base assigns the id,
   * registers the pending promise (with an optional timeout), and transfers any
   * `opts.transfer` buffers. The subclass's `handleMessage` must eventually call
   * `settle(id, …)` or `fail(id, …)`.
   */
  protected request<T>(message: Record<string, unknown>, opts: WorkerRequestOptions = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const worker = this.ensureWorker()
      if (!worker) {
        reject(new Error(`${this.label} worker unavailable`))
        return
      }
      const id = this._nextId()
      const timeout = opts.timeout ?? this._defaultTimeout
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          if (this._pending.delete(id)) {
            reject(new Error(`${this.label} request timed out after ${timeout}ms`))
          }
        }, timeout)
      }
      this._pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        onProgress: opts.onProgress,
        timeoutId,
      })
      worker.postMessage({ ...message, id }, opts.transfer ?? [])
    })
  }

  /** Fire-and-forget message (no response awaited), e.g. a dispose/config notice. */
  protected notify(message: Record<string, unknown>): void {
    this._worker?.postMessage(message)
  }

  /** Resolve the pending request `id` (clears its timeout). No-op if unknown. */
  protected settle(id: number, value: unknown): void {
    this._take(id)?.resolve(value)
  }

  /** Reject the pending request `id` (clears its timeout). No-op if unknown. */
  protected fail(id: number, error: Error): void {
    this._take(id)?.reject(error)
  }

  /** Forward a progress update to the pending request `id`'s callback. */
  protected reportProgress(id: number, progress: number): void {
    this._pending.get(id)?.onProgress?.(progress)
  }

  /** Reject every in-flight request (worker crash / dispose). */
  protected rejectAll(reason: string): void {
    for (const [, pending] of this._pending) {
      if (pending.timeoutId) clearTimeout(pending.timeoutId)
      pending.reject(new Error(reason))
    }
    this._pending.clear()
  }

  /** Terminate the worker and reject any in-flight requests. */
  protected terminate(reason = 'worker terminated'): void {
    this.rejectAll(reason)
    if (this._worker) {
      this._worker.terminate()
      this._worker = null
    }
  }

  /** Default worker-crash handler: log + reject all. Override to also reset state. */
  protected onWorkerError(error: unknown): void {
    console.error(`[${this.label}] Worker error:`, error)
    this.rejectAll(`${this.label} worker crashed`)
  }

  private _nextId(): number {
    return ++this._idCounter
  }

  private _take(id: number): PendingRequest | undefined {
    const pending = this._pending.get(id)
    if (pending) {
      if (pending.timeoutId) clearTimeout(pending.timeoutId)
      this._pending.delete(id)
    }
    return pending
  }
}
