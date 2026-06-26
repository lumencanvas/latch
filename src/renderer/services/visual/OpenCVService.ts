/**
 * OpenCV.js Service
 *
 * Lazily loads OpenCV.js (WASM) from a CDN on first use, mirroring the
 * load/isReady/isLoading shape of MediaPipeService. The docs.opencv.org build
 * is a single self-contained script with the WASM embedded as base64, so no
 * separate cross-origin .wasm fetch is needed (works under credentialless
 * COOP/COEP).
 *
 * The global `cv` runtime is untyped here (no @types for opencv.js); callers
 * receive it as `OpenCVModule` (alias for the runtime object) and use it
 * directly. Every cv.Mat allocated lives in the WASM heap and MUST be
 * `.delete()`d by the caller.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OpenCVModule = any

// docs.opencv.org ships a single self-contained opencv.js with the WASM embedded
// (no sibling .wasm fetch), loaded no-cors via this <script> under credentialless COEP.
//
// PINNED on purpose (was the floating `4.x`): the `4.x` alias 301-redirects to
// whatever the newest build is, which silently jumped to 4.13.0 (~11 MB) and froze
// the page — any OpenCV node hung the main thread immediately while that build
// loaded/initialized. Pin to a known-good prior build so the OpenCV runtime can't
// change underneath us. 4.9.0 is the newest version docs.opencv.org still retains
// below 4.13.0 (4.10–4.12 now 404). If this URL ever 404s, bump to the next
// retained version (and consider moving OpenCV off the main thread into a worker).
const OPENCV_CDN_URL = 'https://docs.opencv.org/4.9.0/opencv.js'

class OpenCVService {
  private ready = false
  private loadingFlag = false
  private loadPromise: Promise<void> | null = null

  /** True once the WASM runtime is initialized and `cv.Mat` is callable. */
  isReady(): boolean {
    return this.ready
  }

  /** True while the script/WASM is downloading and initializing. */
  isLoading(): boolean {
    return this.loadingFlag
  }

  /** Returns the global cv runtime, or null if not ready yet. */
  getCV(): OpenCVModule | null {
    if (!this.ready) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).cv ?? null
  }

  /**
   * Inject the OpenCV.js script (once) and resolve when the WASM runtime is
   * initialized. Idempotent: concurrent/duplicate calls share one promise.
   */
  load(): Promise<void> {
    if (this.ready) return Promise.resolve()
    if (this.loadPromise) return this.loadPromise

    this.loadingFlag = true
    this.loadPromise = new Promise<void>((resolve, reject) => {
      const finalize = () => {
        this.ready = true
        this.loadingFlag = false
        resolve()
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const waitForRuntime = (cvObj: any) => {
        if (!cvObj) {
          this.loadingFlag = false
          reject(new Error('OpenCV.js loaded but `cv` global is undefined'))
          return
        }
        // Some builds expose `cv` as a thenable (Emscripten MODULARIZE). The
        // docs.opencv.org build's `.then()` does NOT return a chainable promise,
        // so wrap with Promise.resolve to adopt it safely (chaining `.catch`
        // directly on the raw thenable throws an uncaught error).
        if (typeof cvObj.then === 'function') {
          Promise.resolve(cvObj)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then((mod: any) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).cv = mod ?? (window as any).cv
              finalize()
            })
            .catch((err: unknown) => {
              this.loadingFlag = false
              reject(err instanceof Error ? err : new Error(String(err)))
            })
          return
        }
        // Runtime already initialized.
        if (typeof cvObj.Mat === 'function') {
          finalize()
          return
        }
        // Otherwise wait for the runtime-initialized callback.
        cvObj.onRuntimeInitialized = () => finalize()
      }

      // Reuse an already-present global (e.g. another node loaded it first).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = (window as any).cv
      if (existing) {
        waitForRuntime(existing)
        return
      }

      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[data-opencv-loader]'
      )
      if (existingScript) {
        existingScript.addEventListener('load', () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          waitForRuntime((window as any).cv)
        })
        return
      }

      const script = document.createElement('script')
      script.src = OPENCV_CDN_URL
      script.async = true
      script.setAttribute('data-opencv-loader', 'true')
      script.onload = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        waitForRuntime((window as any).cv)
      }
      script.onerror = () => {
        this.loadingFlag = false
        this.loadPromise = null
        reject(new Error('Failed to load OpenCV.js from CDN'))
      }
      document.head.appendChild(script)
    })

    return this.loadPromise
  }
}

export const openCVService = new OpenCVService()
