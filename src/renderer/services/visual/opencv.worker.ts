/**
 * OpenCV.js Web Worker (CLASSIC worker)
 *
 * Runs opencv.js (WASM) and every `cv.*` op OFF the main thread. Loading +
 * initializing the ~10 MB opencv.js build on the main thread froze the UI (the
 * bug this migration fixes); here it happens on the worker thread instead.
 *
 * This is a CLASSIC worker (spawned WITHOUT `{ type: 'module' }`) so that
 * `importScripts()` is available — the docs.opencv.org build is a single
 * self-contained classic script that binds the runtime to `self.cv`. Because it
 * is a classic worker the file must NOT use ES `import`/`export` (that would make
 * it a module worker and drop `importScripts`); all state is module-free.
 *
 * Protocol (main thread → worker):
 *   { type: 'load',  id }
 *   { type: 'process', id, nodeId, op, params, width, height, data }  // data transferred
 *   { type: 'dispose', nodeId }
 *   { type: 'disposeAll' }
 * Worker → main thread:
 *   { type: 'ready',  id, ok, error? }
 *   { type: 'result', id, ok, width?, height?, data?, extra?, error? }  // data transferred
 *
 * MEMORY DISCIPLINE: every transient cv.Mat is `.delete()`d in a `finally` (same
 * rule as the old main-thread code, now worker-side). Per-node persistent Mats —
 * optical-flow `prevGray`, the MOG2 subtractor — live in `prevGrayByNode` /
 * `subtractorByNode` keyed by nodeId and are freed on `dispose`/`disposeAll`.
 */

// opencv.js runtime is untyped (no @types). It is loaded at runtime via
// importScripts and exposed as `self.cv`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CV = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Mat = any

// SELF-HOSTED opencv.js (same-origin, served from public/vendor/opencv/4.9.0/).
// Loading it from the docs.opencv.org CDN was unreliable — `importScripts` could
// sit forever before the runtime was ready (the CDN was flagged "too slow"), so
// the worker never reported ready and CV nodes never painted. Serving it from our
// own origin via Netlify is fast and removes the cross-origin/COEP variables.
// Pinned to the 4.9.0 build (the floating `4.x` alias jumped to a ~11 MB 4.13.0).
const OPENCV_URL = '/vendor/opencv/4.9.0/opencv.js'

// Worker globals under the DOM lib (no webworker lib configured). `self` is typed
// as Window there, which lacks `importScripts` and types `postMessage` with a
// targetOrigin; cast to the minimal worker surface we actually use.
const ctx = self as unknown as {
  importScripts: (...urls: string[]) => void
  postMessage: (message: unknown, transfer?: Transferable[]) => void
  onmessage: ((event: MessageEvent) => void) | null
  cv?: CV
}

// Top-level boot marker: if this never appears in the console, the classic worker
// itself isn't executing (a worker-load/COEP problem), as opposed to a load/op
// failure inside it.
console.info('[OpenCV worker] booted (classic)')

// ---------------------------------------------------------------------------
// Lazy opencv.js load (mirrors OpenCVService.load()'s runtime-ready handshake)
// ---------------------------------------------------------------------------

// Lifecycle diagnostics (worker logs surface in the main DevTools console). Left
// on while the in-browser paint path is being validated.
const DEBUG = true

let cv: CV | null = null
let loadPromise: Promise<CV> | null = null
let loggedFirstProcess = false
let loggedFirstResult = false

function ensureLoaded(): Promise<CV> {
  if (cv) return Promise.resolve(cv)
  if (loadPromise) return loadPromise
  // Race the real load against a hard timeout so a stuck init surfaces as a
  // node error instead of an eternal "loading".
  loadPromise = Promise.race([
    loadOpenCV(),
    new Promise<CV>((_, reject) =>
      setTimeout(() => reject(new Error('opencv.js did not initialize within 60s')), 60_000)
    ),
  ]).then((mod) => {
    cv = mod
    return mod
  })
  return loadPromise
}

/** Wait for a usable runtime: a Mat-bearing module on `c` or on `self.cv`. */
function hasMat(c: CV): CV | null {
  if (c && typeof c.Mat === 'function') return c
  const g = ctx.cv
  if (g && typeof g.Mat === 'function') return g
  return null
}

async function loadOpenCV(): Promise<CV> {
  if (DEBUG) console.info('[OpenCV worker] importScripts', OPENCV_URL)
  ctx.importScripts(OPENCV_URL) // synchronous, on the worker thread

  let c: CV = ctx.cv
  if (DEBUG) {
    console.info('[OpenCV worker] post-importScripts: cv typeof=', typeof c, 'thenable=', !!(c && typeof c.then === 'function'))
  }

  // opencv.js 4.9.0 is the Promise-returning MODULARIZE build: factory() yields a
  // thenable that resolves to the runtime. Await it directly.
  if (c && typeof c.then === 'function') {
    c = await c
    if (DEBUG) console.info('[OpenCV worker] cv promise resolved; Mat?', typeof c?.Mat)
  }

  // If the resolved value doesn't expose cv.Mat yet, wait for it via
  // onRuntimeInitialized and/or a short poll (covers Module-style builds and any
  // late binding registration).
  let ready = hasMat(c)
  if (!ready) {
    if (DEBUG) console.warn('[OpenCV worker] no cv.Mat after resolve — awaiting onRuntimeInitialized/poll')
    ready = await new Promise<CV>((resolve) => {
      const tryResolve = () => {
        const m = hasMat(c)
        if (m) {
          resolve(m)
          return true
        }
        return false
      }
      if (tryResolve()) return
      const base = c && !c.then ? c : ctx.cv
      if (base && !base.then) {
        try {
          base.onRuntimeInitialized = () => tryResolve()
        } catch {
          /* ignore */
        }
      }
      const iv = setInterval(() => {
        if (tryResolve()) clearInterval(iv)
      }, 100)
    })
  }

  if (!ready || typeof ready.Mat !== 'function') {
    throw new Error('opencv.js loaded but cv.Mat is unavailable')
  }
  if (DEBUG) console.info('[OpenCV worker] runtime ready (cv.Mat available)')
  return ready
}

// ---------------------------------------------------------------------------
// Per-node persistent state (Mats can't cross the worker boundary)
// ---------------------------------------------------------------------------

const prevGrayByNode = new Map<string, Mat>()
const subtractorByNode = new Map<string, { sub: Mat; sig: string }>()

function safeDelete(m: Mat | null | undefined): void {
  if (m && !m.isDeleted?.()) m.delete()
}

function disposeNode(nodeId: string): void {
  const prev = prevGrayByNode.get(nodeId)
  if (prev) {
    safeDelete(prev)
    prevGrayByNode.delete(nodeId)
  }
  const entry = subtractorByNode.get(nodeId)
  if (entry) {
    safeDelete(entry.sub)
    subtractorByNode.delete(nodeId)
  }
}

function disposeAllNodes(): void {
  for (const nodeId of [...prevGrayByNode.keys(), ...subtractorByNode.keys()]) {
    disposeNode(nodeId)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a #rrggbb hex string into an OpenCV RGBA Scalar (default green). */
function hexToScalar(hex: string): Mat {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  const r = m ? parseInt(m[1], 16) : 0
  const g = m ? parseInt(m[2], 16) : 255
  const b = m ? parseInt(m[3], 16) : 0
  return new cv.Scalar(r, g, b, 255)
}

/**
 * Copy a result Mat out of the WASM heap as RGBA bytes ready for `new ImageData`.
 * Handles 1-channel (gray/binary masks) and 3-channel results by converting to
 * RGBA; 4-channel Mats (matFromImageData / in-place draws) are read directly.
 * Allocates a throwaway conversion Mat which it deletes itself.
 */
function matToRGBA(mat: Mat): { data: Uint8ClampedArray; width: number; height: number } {
  let rgba: Mat = mat
  let temp: Mat | null = null
  const channels = mat.channels()
  if (channels === 1) {
    temp = new cv.Mat()
    cv.cvtColor(mat, temp, cv.COLOR_GRAY2RGBA)
    rgba = temp
  } else if (channels === 3) {
    temp = new cv.Mat()
    cv.cvtColor(mat, temp, cv.COLOR_RGB2RGBA)
    rgba = temp
  }
  // mat.data is a Uint8Array view into the WASM heap; copy it into a standalone
  // ArrayBuffer-backed array we can transfer back to the main thread.
  const out = new Uint8ClampedArray(rgba.data)
  const width = rgba.cols
  const height = rgba.rows
  safeDelete(temp)
  return { data: out, width, height }
}

// ---------------------------------------------------------------------------
// Op dispatch
// ---------------------------------------------------------------------------

interface ProcessResult {
  /** Output Mat to ship back as RGBA. May be `src` (in-place draws) or a tracked Mat. */
  output: Mat
  /** Scalar/array outputs surfaced to the executor (motion, count, contours, …). */
  extra?: Record<string, unknown>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Params = Record<string, any>

/**
 * Run one op. `src` is the RGBA source Mat (owned by the caller, deleted there).
 * `track(m)` registers a transient Mat for deletion after the result is copied
 * out. Persistent Mats (prevGray, subtractor) are intentionally NOT tracked.
 */
function runOp(op: string, params: Params, src: Mat, nodeId: string, track: (m: Mat) => Mat): ProcessResult {
  switch (op) {
    case 'grayscale': {
      const dst = track(new cv.Mat())
      cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY)
      return { output: dst }
    }

    case 'canny': {
      const gray = track(new cv.Mat())
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      const dst = track(new cv.Mat())
      cv.Canny(gray, dst, params.lowThreshold, params.highThreshold)
      return { output: dst }
    }

    case 'threshold': {
      const gray = track(new cv.Mat())
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      const dst = track(new cv.Mat())
      const baseType = params.invert ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY
      if (params.mode === 'adaptive') {
        cv.adaptiveThreshold(gray, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, baseType, params.blockSize, params.c)
      } else if (params.mode === 'otsu') {
        cv.threshold(gray, dst, 0, 255, baseType | cv.THRESH_OTSU)
      } else {
        cv.threshold(gray, dst, params.threshold, 255, baseType)
      }
      return { output: dst }
    }

    case 'blur': {
      const dst = track(new cv.Mat())
      if (params.mode === 'median') {
        cv.medianBlur(src, dst, params.kernel)
      } else {
        const k = params.kernel
        cv.GaussianBlur(src, dst, new cv.Size(k, k), 0, 0, cv.BORDER_DEFAULT)
      }
      return { output: dst }
    }

    case 'morphology': {
      const dst = track(new cv.Mat())
      const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(params.kernel, params.kernel)))
      const anchor = new cv.Point(-1, -1)
      if (params.operation === 'erode') {
        cv.erode(src, dst, kernel, anchor, params.iterations, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue())
      } else if (params.operation === 'dilate') {
        cv.dilate(src, dst, kernel, anchor, params.iterations, cv.BORDER_CONSTANT, cv.morphologyDefaultBorderValue())
      } else {
        const mode =
          params.operation === 'open'
            ? cv.MORPH_OPEN
            : params.operation === 'close'
              ? cv.MORPH_CLOSE
              : cv.MORPH_GRADIENT
        cv.morphologyEx(src, dst, mode, kernel, anchor, params.iterations)
      }
      return { output: dst }
    }

    case 'contours': {
      const gray = track(new cv.Mat())
      const binary = track(new cv.Mat())
      const contours = track(new cv.MatVector())
      const hierarchy = track(new cv.Mat())
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      cv.threshold(gray, binary, params.threshold, 255, cv.THRESH_BINARY)
      cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
      const drawColor = hexToScalar(params.color)
      const found: Array<{ area: number; x: number; y: number; width: number; height: number }> = []
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i)
        const area = cv.contourArea(contour)
        if (area >= params.minArea) {
          cv.drawContours(src, contours, i, drawColor, params.lineWidth, cv.LINE_8, hierarchy, 0)
          const rect = cv.boundingRect(contour)
          found.push({ area, x: rect.x, y: rect.y, width: rect.width, height: rect.height })
        }
        contour.delete()
      }
      return { output: src, extra: { contours: found, count: found.length } }
    }

    case 'corners': {
      const gray = track(new cv.Mat())
      const corners = track(new cv.Mat())
      const mask = track(new cv.Mat())
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
      cv.goodFeaturesToTrack(gray, corners, params.maxCorners, params.quality, params.minDistance, mask, 3, false, 0.04)
      const drawColor = hexToScalar(params.color)
      const count = corners.rows
      const pts = corners.data32F as Float32Array
      for (let i = 0; i < count; i++) {
        const x = Math.round(pts[i * 2])
        const y = Math.round(pts[i * 2 + 1])
        cv.circle(src, new cv.Point(x, y), params.radius, drawColor, 2, cv.LINE_AA, 0)
      }
      return { output: src, extra: { count } }
    }

    case 'optical-flow':
      return runOpticalFlow(params, src, nodeId, track)

    case 'background-subtraction':
      return runBackgroundSubtraction(params, src, nodeId, track)

    default:
      throw new Error(`Unknown OpenCV op: ${op}`)
  }
}

/** Dense Farneback optical flow with a per-node persistent prevGray Mat. */
function runOpticalFlow(params: Params, src: Mat, nodeId: string, track: (m: Mat) => Mat): ProcessResult {
  // `gray` is deliberately NOT tracked — on success it's retained as the node's
  // prevGray (so the dispatcher's finally must not free it). That leaves it
  // unowned if a cv call throws before it's stored, so free it ourselves in that
  // case via `retained`; otherwise a failing frame would leak one Mat.
  const gray = new cv.Mat()
  let retained = false
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    const prev = prevGrayByNode.get(nodeId)
    const sizeChanged = !!prev && !prev.isDeleted?.() && (prev.rows !== gray.rows || prev.cols !== gray.cols)

    if (!prev || prev.isDeleted?.() || sizeChanged) {
      // First frame (or the source resolution changed): Farneback needs both
      // frames the same size, so (re)seed prevGray and pass the source through.
      if (prev && !prev.isDeleted?.()) safeDelete(prev)
      prevGrayByNode.set(nodeId, gray) // retained — NOT tracked
      retained = true
      return { output: src, extra: { motion: 0 } }
    }

    const flow = track(new cv.Mat())
    cv.calcOpticalFlowFarneback(prev, gray, flow, 0.5, params.levels, params.winSize, 3, 5, 1.2, 0)

    const channels = track(new cv.MatVector())
    cv.split(flow, channels)
    const fx = track(channels.get(0))
    const fy = track(channels.get(1))
    const mag = track(new cv.Mat())
    const ang = track(new cv.Mat())
    cv.cartToPolar(fx, fy, mag, ang)

    // Mean magnitude = overall motion amount (pre-normalization, physical).
    const motion = cv.mean(mag)[0]

    // HSV viz: hue = direction, value = magnitude, sat = full.
    cv.normalize(mag, mag, 0, 255, cv.NORM_MINMAX)
    const h = track(new cv.Mat())
    const v = track(new cv.Mat())
    ang.convertTo(h, cv.CV_8U, 180 / (2 * Math.PI))
    mag.convertTo(v, cv.CV_8U)
    const s = track(new cv.Mat(gray.rows, gray.cols, cv.CV_8UC1, new cv.Scalar(255)))

    const hsvChannels = track(new cv.MatVector())
    hsvChannels.push_back(h)
    hsvChannels.push_back(s)
    hsvChannels.push_back(v)
    const hsv = track(new cv.Mat())
    const rgb = track(new cv.Mat())
    const rgba = track(new cv.Mat())
    cv.merge(hsvChannels, hsv)
    cv.cvtColor(hsv, rgb, cv.COLOR_HSV2RGB)
    cv.cvtColor(rgb, rgba, cv.COLOR_RGB2RGBA)

    // Swap prevGray to the current frame for the next comparison.
    prevGrayByNode.set(nodeId, gray) // retained — NOT tracked
    retained = true
    safeDelete(prev)

    return { output: rgba, extra: { motion } }
  } catch (err) {
    if (!retained) safeDelete(gray)
    throw err
  }
}

/** MOG2 background subtraction with a per-node persistent subtractor. */
function runBackgroundSubtraction(params: Params, src: Mat, nodeId: string, track: (m: Mat) => Mat): ProcessResult {
  const sig = `${params.history}:${params.varThreshold}:${params.detectShadows}`
  let entry = subtractorByNode.get(nodeId)
  if (!entry || entry.sub.isDeleted?.() || entry.sig !== sig) {
    if (entry) safeDelete(entry.sub)
    // MOG2 lives in opencv.js's `video` module; the constructor itself throws on
    // builds that lack it. Degrade to a passthrough + error instead of dying.
    try {
      const sub = new cv.BackgroundSubtractorMOG2(params.history, params.varThreshold, params.detectShadows)
      entry = { sub, sig }
      subtractorByNode.set(nodeId, entry)
    } catch (err) {
      subtractorByNode.delete(nodeId)
      console.error('[OpenCV Worker] BackgroundSubtractorMOG2 unavailable:', err)
      return {
        output: src,
        extra: { foreground: 0, _error: 'Background subtraction (MOG2) is unavailable in this OpenCV build.' },
      }
    }
  }

  const rgb = track(new cv.Mat())
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB) // MOG2 wants a 3-channel image
  const fg = track(new cv.Mat())
  entry.sub.apply(rgb, fg)
  const total = fg.rows * fg.cols
  const ratio = total > 0 ? cv.countNonZero(fg) / total : 0
  return { output: fg, extra: { foreground: ratio } }
}

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

interface ProcessMessage {
  type: 'process'
  id: number
  nodeId: string
  op: string
  params: Params
  width: number
  height: number
  data: Uint8ClampedArray
}

async function handleProcess(msg: ProcessMessage): Promise<void> {
  try {
    await ensureLoaded()
  } catch (err) {
    ctx.postMessage({ type: 'result', id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
    return
  }

  // The transferred buffer is always ArrayBuffer-backed (SharedArrayBuffer can't
  // be transferred), so the cast to satisfy ImageData's typed-array param is sound.
  const imageData = new ImageData(msg.data as Uint8ClampedArray<ArrayBuffer>, msg.width, msg.height)
  if (DEBUG && !loggedFirstProcess) {
    loggedFirstProcess = true
    const d = msg.data
    const mid = (((msg.width * msg.height) >> 1) << 2) % (d.length || 1)
    // A first/mid pixel of [0,0,0,255] (or all-zero) means the SOURCE arrived black
    // (e.g. a video-backed texture sampling black) — i.e. the op is fine, the input
    // isn't. Non-zero here means real pixels reached the worker.
    console.info(
      '[OpenCV worker] first process:', msg.op, `${msg.width}x${msg.height}`,
      'firstPx=', [d[0], d[1], d[2], d[3]], 'midPx=', [d[mid], d[mid + 1], d[mid + 2], d[mid + 3]]
    )
  }
  const src = cv.matFromImageData(imageData)
  const scratch: Mat[] = []
  const track = (m: Mat): Mat => {
    scratch.push(m)
    return m
  }
  try {
    const { output, extra } = runOp(msg.op, msg.params, src, msg.nodeId, track)
    const rgba = matToRGBA(output)
    if (DEBUG && !loggedFirstResult) {
      loggedFirstResult = true
      console.info('[OpenCV worker] first result posted:', `${rgba.width}x${rgba.height}`)
    }
    ctx.postMessage(
      { type: 'result', id: msg.id, ok: true, width: rgba.width, height: rgba.height, data: rgba.data, extra },
      [rgba.data.buffer]
    )
  } catch (err) {
    console.error('[OpenCV Worker] op failed:', err)
    ctx.postMessage({ type: 'result', id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  } finally {
    for (const m of scratch) safeDelete(m)
    safeDelete(src)
  }
}

ctx.onmessage = (event: MessageEvent) => {
  const msg = event.data as
    | { type: 'load'; id: number }
    | ProcessMessage
    | { type: 'dispose'; nodeId: string }
    | { type: 'disposeAll' }

  if (DEBUG) console.info('[OpenCV worker] message:', msg.type)
  switch (msg.type) {
    case 'load':
      ensureLoaded().then(
        () => ctx.postMessage({ type: 'ready', id: msg.id, ok: true }),
        (err: unknown) =>
          ctx.postMessage({ type: 'ready', id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
      )
      break
    case 'process':
      void handleProcess(msg)
      break
    case 'dispose':
      disposeNode(msg.nodeId)
      break
    case 'disposeAll':
      disposeAllNodes()
      break
    default:
      console.warn('[OpenCV Worker] Unknown message:', msg)
  }
}
