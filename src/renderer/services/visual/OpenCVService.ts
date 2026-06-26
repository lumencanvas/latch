/**
 * OpenCV.js Service — Web Worker facade
 *
 * opencv.js (~10 MB WASM) is loaded AND run in a CLASSIC Web Worker
 * (`opencv.worker.ts`), off the main thread. Loading/initializing it on the main
 * thread froze the UI for any OpenCV node — the bug this facade fixes. The main
 * thread keeps only the texture I/O (it needs WebGL/DOM); every `cv.*` call runs
 * in the worker.
 *
 * The request/response plumbing (promise-per-request, pending map, timeouts,
 * transferables, crash handling) lives in the shared `WorkerFacade` base; this
 * subclass only owns the opencv message protocol + `isReady/isLoading/load` so
 * the executors can show a "loading" passthrough while opencv.js downloads.
 */

import { WorkerFacade } from '@/services/worker/WorkerFacade'

/** Scalar/array outputs a worker op surfaces (motion, count, contours, …). */
export type OpenCVExtra = Record<string, unknown>

/** Result of a worker op: the processed RGBA frame (if any) + scalar outputs. */
export interface OpenCVResult {
  /** Processed frame as ImageData, or undefined when the op produced no new pixels. */
  imageData?: ImageData
  extra: OpenCVExtra
}

interface WorkerResult {
  type: 'result'
  id: number
  ok: boolean
  width?: number
  height?: number
  data?: Uint8ClampedArray
  extra?: OpenCVExtra
  error?: string
}

interface WorkerReady {
  type: 'ready'
  id: number
  ok: boolean
  error?: string
}

// A single cv op should be near-instant once opencv.js is loaded; if one never
// reports back (a hung/looping worker), time it out so the node self-recovers on
// the next due frame instead of staying stuck "pending" forever. `load` has no
// timeout — the first one downloads ~10 MB and can legitimately take a while.
const OPENCV_OP_TIMEOUT = 30_000

class OpenCVService extends WorkerFacade {
  private ready = false
  private loadingFlag = false
  private loadPromise: Promise<void> | null = null
  private loadError: string | null = null

  protected get label(): string {
    return 'OpenCV'
  }

  // CLASSIC worker (no `{ type: 'module' }`) so the worker can `importScripts()`
  // the opencv.js build.
  protected createWorker(): Worker {
    console.info('[OpenCV] spawning worker')
    return new Worker(new URL('./opencv.worker.ts', import.meta.url))
  }

  protected handleMessage(data: unknown): void {
    const msg = data as WorkerResult | WorkerReady
    if (msg.type === 'ready') {
      this.loadingFlag = false
      if (msg.ok) {
        this.ready = true
        console.info('[OpenCV] worker reported ready')
        this.settle(msg.id, undefined)
      } else {
        // Keep loadPromise (rejected) so the executor doesn't re-post 'load' every
        // frame and re-download ~10 MB; the rejection records loadError below.
        this.fail(msg.id, new Error(msg.error || 'Failed to load OpenCV.js in worker'))
      }
      return
    }

    // type === 'result'
    if (!msg.ok) {
      this.fail(msg.id, new Error(msg.error || 'OpenCV op failed'))
      return
    }
    const imageData =
      msg.data && msg.width && msg.height
        ? // Transferred buffers are always ArrayBuffer-backed — sound cast for ImageData.
          new ImageData(msg.data as Uint8ClampedArray<ArrayBuffer>, msg.width, msg.height)
        : undefined
    this.settle(msg.id, { imageData, extra: msg.extra ?? {} } satisfies OpenCVResult)
  }

  protected onWorkerError(error: unknown): void {
    super.onWorkerError(error) // log + reject all in-flight
    this.ready = false
    this.loadingFlag = false
    this.loadPromise = null // a crashed worker can be re-spawned on the next load()
    this.loadError = 'OpenCV worker crashed'
  }

  /** True once opencv.js is initialized in the worker and ops can run. */
  isReady(): boolean {
    return this.ready
  }

  /** True while opencv.js is downloading/initializing in the worker. */
  isLoading(): boolean {
    return this.loadingFlag
  }

  /** The load-failure message if opencv.js failed to initialize, else null. */
  getLoadError(): string | null {
    return this.loadError
  }

  /**
   * Trigger the worker to download + initialize opencv.js. Idempotent:
   * concurrent/duplicate calls share one promise. Resolves once the runtime is
   * ready; rejects if the load fails.
   */
  load(): Promise<void> {
    if (this.ready) return Promise.resolve()
    if (this.loadPromise) return this.loadPromise
    this.loadingFlag = true
    this.loadError = null
    // Keep the (resolved or rejected) loadPromise so we never re-post 'load' and
    // re-download ~10 MB every frame. A rejection records loadError so the executor
    // can surface it on the node instead of spinning on "loading" forever.
    this.loadPromise = this.request<void>({ type: 'load' }).catch((err) => {
      this.loadingFlag = false
      this.loadError = err instanceof Error ? err.message : String(err)
      throw err
    })
    return this.loadPromise
  }

  /**
   * Run an op in the worker. `imageData` pixels are copied into a fresh
   * transferable buffer (so the caller's/upstream's ImageData is never detached),
   * then transferred zero-copy. Resolves with the processed frame + scalar outputs.
   */
  process(nodeId: string, op: string, params: Record<string, unknown>, imageData: ImageData): Promise<OpenCVResult> {
    // Copy the pixels: sourceToImageData may hand back an upstream-owned buffer,
    // which must not be detached by the transfer.
    const data = new Uint8ClampedArray(imageData.data)
    return this.request<OpenCVResult>(
      { type: 'process', nodeId, op, params, width: imageData.width, height: imageData.height, data },
      { transfer: [data.buffer], timeout: OPENCV_OP_TIMEOUT }
    )
  }

  /** Free a single node's persistent worker-side Mats (optical-flow / MOG2). */
  dispose(nodeId: string): void {
    this.notify({ type: 'dispose', nodeId })
  }

  /** Free all persistent worker-side Mats (engine teardown). */
  disposeAll(): void {
    this.notify({ type: 'disposeAll' })
  }
}

export const openCVService = new OpenCVService()
