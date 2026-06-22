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

const OPENCV_CDN_URL = 'https://docs.opencv.org/4.x/opencv.js'

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
        // Some builds expose `cv` as a Promise (MODULARIZE).
        if (typeof cvObj.then === 'function') {
          cvObj
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then((mod: any) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as any).cv = mod
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
