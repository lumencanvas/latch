# OpenCV → Web Worker migration (2026-06-26)

## Problem (confirmed)

OpenCV nodes **freeze the page (unresponsive) immediately**, for *any* cv node. Not OOM —
the **main thread blocks**. Root cause: `OpenCVService.load()` injects a **~10 MB opencv.js**
`<script>` and the runtime runs **on the main thread**; parsing 10 MB of JS + instantiating the
WASM blocks the UI thread. Pinning the version (floating `4.x` → `4.9.0`, v1.2.7) did **not** help
— it's the load/run mechanism, not the build version. Confirmed empirically: opencv.js never
finishes initializing in a headless Playwright sandbox either (`cvReady` stays false).

Ruled out by audit: per-frame `cv.Mat` leak (all freed in `finally`), error-array growth (capped),
`renderToCanvas`/`createTexture`/`updateTexture` GPU leaks (none). WebGPU is **not** applicable —
opencv.js is CPU/WASM; reimplementing ops in WebGPU is a different project.

## Fix: run OpenCV in a Web Worker (mirror the AI worker)

opencv.js is worker-compatible (it binds to `self`). Loading + every cv op runs **in the worker**,
off the main thread. The main thread keeps only the texture I/O (it needs WebGL/DOM).

**Template to copy:** the existing AI worker —
- `src/renderer/services/ai/ai.worker.ts` (worker: message switch, model cache, per-id state)
- `src/renderer/services/ai/AIInference.ts` (main-thread facade: `new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })`, promise-per-request keyed by id, transferables)
- `src/renderer/engine/executors/ai.ts` `runLiveDetection` (the **deferred fire-and-cache executor pattern**: throttle by `interval` + `pendingOperations` guard + `getCached/setCached` + `isNodeDisposed`, serve the last texture every frame, update when the async result lands)

## Work items

### 1. `src/renderer/services/visual/opencv.worker.ts` (new)
- On first `process` message, lazy-load opencv: `self.importScripts('https://docs.opencv.org/4.9.0/opencv.js')` (sync, but on the WORKER thread — no main-thread freeze), then `await onRuntimeInitialized`. Cache the `cv` runtime. (Keep the pinned URL; see OpenCVService comment.)
- Per-node persistent state lives **in the worker**, keyed by `nodeId`: optical-flow `prevGray` Mat, MOG2 `subtractor`, `subtractorSig`. Mats can't cross the worker boundary — they must stay worker-side.
- Message in: `{ type:'process', id, nodeId, op, params, width, height, data }` where `data` is the source `ImageData.data` (transferred Uint8ClampedArray). `op` ∈ the 9 ops below.
- In the worker: `cv.matFromImageData({data,width,height})` → run op → write result to an `OffscreenCanvas` via `cv.imshow` (or read the Mat) → `getImageData` → post back `{ type:'result', id, width, height, data, extra }` with `data` transferred. **Delete every Mat in `finally`** (same discipline, now worker-side).
- `extra` carries the scalar/array outputs per op (see protocol below).
- Messages: `{type:'dispose', nodeId}` (free that node's persistent Mats), `{type:'disposeAll'}` (free all).

### 2. `src/renderer/services/visual/OpenCVService.ts` (rework into a worker facade)
- Spawn the worker; promise-per-request (Map<id, {resolve,reject}>); `process(nodeId, op, params, imageData): Promise<{imageData, extra}>` transferring `imageData.data.buffer`.
- Keep `isReady()`/`isLoading()` semantics for the executors' "loading" output (the worker reports a `ready` message once opencv initializes).
- Add `dispose(nodeId)` / `disposeAll()` that post the worker messages.

### 3. `src/renderer/engine/executors/opencv.ts` (rewrite executors to deferred pattern)
- **Keep on main thread:** `sourceToImageData` (incl. the `CV_MAX_DIM=1280` resolution cap — do it BEFORE posting, so less data crosses the boundary), the per-node held canvas + THREE.Texture, `createTexture`/`updateTexture`, and the texture cleanup in `disposeOpenCVNode`/`gcOpenCVState`/`disposeAllOpenCVNodes`.
- **Move to worker:** all `cv.*` calls.
- Each executor becomes fire-and-cache (mirror `runLiveDetection`): if `due` (frame-skip by `interval`) and not pending, post `process` to the worker; serve the last cached texture + scalar outputs every frame; when the result arrives and the node isn't disposed, `putImageData` to the held canvas → `updateTexture` → cache outputs. A shared `runCvFilter`-style helper can cover the 5 simple filters.
- Wire `openCVService.dispose(nodeId)` into `disposeOpenCVNode` and `disposeAll` into `disposeAllOpenCVNodes`, so worker-side persistent Mats are freed too.

### Op protocol (9 ops, with their `extra` outputs)
| op | params | `extra` returned |
|----|--------|------------------|
| grayscale | – | – |
| canny | lowThreshold, highThreshold | – |
| threshold | mode, threshold, invert, blockSize, c | – |
| blur | mode, kernel | – |
| morphology | operation, kernel, iterations | – |
| contours | threshold, minArea, lineWidth, color | `{ contours:[{area,x,y,width,height}], count }` |
| corners | maxCorners, quality, minDistance, radius, color | `{ count }` |
| optical-flow | winSize, levels | `{ motion }` — needs worker-side `prevGray` per node |
| background-subtraction | history, varThreshold, detectShadows | `{ foreground }` — needs worker-side MOG2 per node; keep the build-lacks-`video`-module try/catch → `_error` degrade |

## Gotchas
- **opencv.js in a worker:** `importScripts` is the simplest load (it's a classic-script build that sets `self.cv`). If the worker is `{type:'module'}`, `importScripts` is unavailable — either make the opencv worker a **classic** worker (`new Worker(url)` without `type:'module'`, then `importScripts`), or fetch+`eval`/`new Function`. Classic worker is simplest for opencv.
- **OffscreenCanvas** for `cv.imshow` in the worker (no DOM there). Available in workers.
- **Transferables:** transfer `imageData.data.buffer` both ways (zero-copy). Reconstruct `ImageData` on each side.
- **Persistent Mats** (optical-flow `prevGray`, MOG2 subtractor) MUST live in the worker keyed by nodeId — they can't be transferred. Dispose them on `{type:'dispose'}`.
- **First-frame latency:** the worker downloads ~10 MB on first use; executors already show a "loading" passthrough — keep that. After load, ops are fast and off-main-thread.
- **`renderToCanvas` readback** (source → ImageData) stays on main but is cheap (drawImage for video; readRenderTargetPixels for render-target sources). If a per-frame stall is observed for render-target sources, that's a separate, smaller issue.

## Verify
- opencv.js does **not** load in headless Playwright sandboxes (CDN too slow) — verify in a **real browser** via `npm run dev`: build `webcam → cv-canny → main-output`, run, and confirm (a) the page does **not** freeze when the cv node runs, and (b) the cv output renders + updates. Also test `cv-optical-flow` and `cv-background-subtraction` (the stateful ones) and stop→restart.
- Gates: typecheck / lint / test:unit / build. Single-purpose commits, no AI attribution. Deploy = merge to main → CI/Netlify.

## Current state going in
- `OpenCVService.ts` pinned to `docs.opencv.org/4.9.0/opencv.js`; `opencv.ts` has the `CV_MAX_DIM=1280` cap in `sourceToImageData`. Keep both (the cap reduces data crossing the worker boundary; the pin keeps the runtime stable). The 9 cv nodes + registry are unchanged otherwise.
