# LATCH — Session Handoff Log

Running log of work sessions, newest first. Each entry: what changed, current state,
and what's open. Detailed analysis lives in the dated docs under `docs/` (esp.
`NODE_LIBRARY_REVIEW_2026-06-18.md` and `AUDIT_2026-06-16.md`).

---

## 2026-06-28 — v1.2.14: CONFIRMED working + stripped OpenCV debug logging

User confirmed in their browser: **OpenCV CV nodes paint** (the v1.2.12 worker init + MessageChannel
port fix landed) **and** the **emulator survives going off-screen** (v1.2.13). Both the long
"CV nodes never paint" saga and the emulator off-screen crash are RESOLVED.

Cleanup shipped here:
- `opencv.worker.ts`: `DEBUG` flipped to **false** (lifecycle logs are gated behind it — one flip to
  re-enable the load→ready→process→result trace if CV ever regresses). Removed the unconditional
  top-level boot log.
- `OpenCVService.ts`: removed the two diagnostic `console.info`s (`spawning worker`, `worker reported
  ready`). Real errors (`console.error`, node `_error` output) are unchanged.
- Production CV console is now quiet. Gates green (typecheck / lint / test:unit 1494 / build:web).

No open OpenCV/emulator items remain. (Deferred, unrelated tech debt still in the architecture-audit
notes below: shared `WorkerFacade` is only mock-tested for AIInference; built-in nodes aren't authored
as isolated packages like `CustomNodeLoader`; `executors/index.ts` mixes aggregation + inline executors.)

---

## 2026-06-28 — v1.2.13: emulator survives Vue Flow virtualization (off-screen crash)

User report: the Emulator node crashes (`RuntimeError: Aborted(undefined)` from the libretro core,
then `Cannot read properties of null (reading 'classList')`) when the node is scrolled/zoomed
partially off-screen. Root cause: `EditorView.vue` sets `:only-render-visible-elements="true"`, so
Vue Flow **unmounts** off-screen nodes. `EmulatorNode.vue`'s `onUnmounted` tore the emulator down on
EVERY unmount — `unregisterEmulator()` + `removeChild(host)` — ripping the EmulatorJS WebGL canvas
out of the DOM → context loss → core abort → EmulatorJS error path hits a now-null element. The
existing `onActivated`/`onDeactivated` park/dock only covered KeepAlive tab-switches, not
virtualization. (Not related to the OpenCV/WorkerFacade work — separate subsystem.)

Fix — decouple the emulator's lifetime from the node component's mount:
- **`EmulatorNode.vue` `onUnmounted`**: if the node is still in `flowsStore.activeFlow.nodes`
  (virtualized, just off-screen) → `parkHostOffscreen()` and KEEP it alive; only on real removal
  (node deleted / flow closed) → `unregisterEmulator()` (frees loader/texture/host). `onMounted`
  now RE-ADOPTS a still-running emulator via `getEmulatorLoader(id)` + `loader.getHost()` (re-dock,
  reuse loader, refresh callbacks — preserves the captured texture/audio) instead of booting anew.
- **`emulation.ts`**: new `getEmulatorLoader(nodeId)`; `cleanupEntry` gained a `removeHost` flag so
  `unregisterEmulator`/`gcEmulationState` (node gone) remove the parked host, but `disposeAll`
  (flow stop, component still mounted) does not.
- **`emulatorjs.ts`**: `EmulatorJSLoader.getHost()`.
- Bonus: the emulator now keeps running AND keeps outputting its captured texture while the node is
  virtualized off-screen — matching the expectation that it's an "off-screen canvas". Triggers
  (start/stop/reset inlets) no-op while virtualized (callbacks bound to the unmounted instance) and
  refresh on re-mount — acceptable since the node is off-screen.
- Gates green (typecheck / lint / test:unit 1494 / build:web). **Confirmed working in the user's
  browser** (couldn't headless-repro Vue Flow node virtualization with a live ROM).

---

## 2026-06-27 — v1.2.12: OpenCV worker ACTUALLY works (init + port comms)

Root-caused via a local Playwright repro (the key move — opencv is same-origin now, so it loads
headlessly). Two distinct worker bugs, both fixed; validated end-to-end against the BUILT worker
chunk (load → ready → process → Canny → result, incl. the MOG2/video module):

1. **Init never completed.** opencv.js 4.9.0 is the Promise-returning MODULARIZE build; awaiting that
   Promise (self.cv) HANGS in a dedicated worker because its resolution is deferred through a
   postMessage-based `setImmediate` that never fires (self.postMessage in a worker goes to the
   parent, not back). Fix: the CANONICAL pattern — set `Module.onRuntimeInitialized` BEFORE
   importScripts and read `cv.Mat` off the Module synchronously in that callback. Never touch the
   promise. (`opencv.worker.ts` rewritten to a top-level Module hook + lazy one-time `startLoad` +
   synchronous `handleProcess`.)
2. **Messages were intercepted.** opencv/emscripten installs a capturing `self` 'message' listener
   (its setImmediate emulation), which entangled the facade's `self.postMessage`/`onmessage` traffic
   (responses didn't arrive; the 2nd message wasn't received). Fix: route ALL facade↔worker comms
   over a dedicated **MessageChannel port** — opencv's `self` listeners never see it. Added opt-in
   `usePort` to `WorkerFacade` (port handshake + `_send`/terminate close); `OpenCVService` enables
   it; the worker adopts `event.ports[0]` and replies via `respond()`.

Other: kept the self-hosted `/vendor/opencv/4.9.0/opencv.js` (same-origin importScripts works and
is fast). Gates green (typecheck / lint / test:unit 1494 / build:web). Repro scripts were in scratch
(not committed).

### Post-deploy audit (2026-06-28) — clean
Audited the shipped diff (3 files) for regressions:
- **All 9 cv ops intact** (grayscale/canny/threshold/blur/morphology/contours/corners/optical-flow/
  background-subtraction) and the per-node Mat discipline survived the worker rewrite: `prevGrayByNode`
  /`subtractorByNode` + `disposeNode`/`disposeAllNodes`/`safeDelete`; `handleProcess` frees `scratch`
  + `src` in `finally`; optical-flow `prevGray` retention preserved. `handleProcess` is now fully
  synchronous (no `await`).
- **`WorkerFacade` change is safe for `AIInference`.** `usePort` defaults `false`, so AIInference keeps
  the original `w.onmessage` path; `_send` falls back to `worker.postMessage`; `terminate` skips the
  port. Port mode is strictly opt-in (only `OpenCVService` sets `usePort=true`). NOTE for future work:
  AIInference is exercised only via mocks in unit tests, so this base change isn't runtime-covered —
  it's behavior-preserving by construction, but a smoke test of an AI node after any `WorkerFacade`
  edit is wise.
- In port mode the worker's `self.onmessage` is left unset after the handshake, so opencv's stray
  `self` setImmediate messages are simply dropped (correct — they must not reach the facade).

### RESOLVED (v1.2.14)
- User confirmed CV nodes paint in their browser. `DEBUG` flipped to `false` (logs gated, one flip to
  re-enable) and the facade's diagnostic `console.info`s removed in v1.2.14.

---

## 2026-06-26 — v1.2.10: self-host opencv.js (CV worker was never loading)

Decisive runtime evidence from latch.design (v1.2.9): the console showed `[OpenCV] spawning
worker` and then NOTHING from the worker — no `[OpenCV worker] importScripts`, no ready, and the CV
nodes sat on "NO TEXTURE" with no error (the 60 s timeout lives inside `ensureLoaded`, which never
ran). Meanwhile the module AI worker logged `[AI Worker] Ready` and detection painted. So the
worker spawned but its `importScripts('https://docs.opencv.org/4.9.0/opencv.js')` never produced a
ready runtime — consistent with the long-standing note that the docs.opencv.org CDN is "too slow"
to finish loading (a synchronous 10 MB cross-origin `importScripts` that stalls).

Fix:
- **Vendored opencv.js same-origin**: `public/vendor/opencv/4.9.0/opencv.js` (the exact 4.9.0 build,
  verified to initialize). Worker now `importScripts('/vendor/opencv/4.9.0/opencv.js')` — fast,
  Netlify-served, no cross-origin/COEP variable. (Kept the worker CLASSIC so `importScripts` works
  and emscripten still detects the worker environment; a module worker would have needed fetch+eval
  and broken opencv's `ENVIRONMENT_IS_WORKER` detection.)
- **Boot + message diagnostics**: a top-level `[OpenCV worker] booted (classic)` log (if absent →
  the classic worker itself isn't executing, a deeper worker-load issue → switch to a module worker)
  and a per-message log. `DEBUG` still on.
- Also: OpenCV **op failures now surface on the node** (`_error`), and `sourceToImageData` skips a
  video-backed texture until `readyState >= 2` (no black warmup frame); a not-ready supported source
  no longer flashes a misleading "Unsupported source" error.
- Gates green (typecheck / lint / test:unit 1494 / build:web; vendor file copied to dist).
- **TODO once confirmed painting**: flip `DEBUG` off; consider trimming the vendored build.

---

## 2026-06-26 — v1.2.9: OpenCV worker init hardening + diagnostics

Follow-up to v1.2.8 (OpenCV → Web Worker). Reported: CV nodes no longer freeze the page but
never paint. Investigation: opencv.js 4.9.0 is the **Promise-returning MODULARIZE build**
(verified by loading it in Node — `factory()` yields a thenable that resolves to a runtime with
`cv.Mat`); the app is **COEP credentialless** (vite + netlify.toml + coi-serviceworker), under
which the worker's cross-origin `importScripts` is allowed. So neither the build type nor COEP is
an obvious blocker — the failure is browser-/worker-only and wasn't observable from here.

Shipped to make the failure self-diagnosing rather than silent:
- **Hardened worker init** (`opencv.worker.ts`): pre-sets `Module.onRuntimeInitialized` AND handles
  the Promise return AND an already-ready check (idempotent `finalize`), plus a **60 s timeout** so
  a stuck init rejects with a clear message instead of leaving the node on "loading" forever.
- **Load failures surface ON the node** (`OpenCVService.getLoadError()` → executor sets `_error`
  "OpenCV failed to load: …"), and the facade no longer re-posts `load` (no 10 MB re-download
  storm) on failure.
- **Lifecycle logging** (`DEBUG = true` in `opencv.worker.ts`): spawn → importScripts → cv typeof/
  thenable → runtime ready → first process (with input pixel sample to detect a black source) →
  first result. **TODO: flip `DEBUG` off once the in-browser paint path is confirmed.**
- Open question the trace answers: does the runtime become ready in the worker (init hang?), does a
  process run, and is the source frame non-black? Where the `[OpenCV ...]` logs stop = root cause.
- Gates green (typecheck / lint / test:unit 1494 / build:web); worker still classic + importScripts.

---

## 2026-06-26 — v1.2.7: detection stop/restart fix + OpenCV freeze fix

Two user-reported bugs. Shipped as v1.2.7.

### Detection nodes dead after stop→restart — FIXED ✓ (high confidence)
`disposeAllAINodes()` (on stop) flags every AI node disposed so in-flight detect/transcribe
promises don't write into the just-cleared cache. But the only thing that CLEARS that flag —
`gcAIState` — runs only when nodes are REMOVED from the graph, not on a plain restart. So after
stop→start on the same graph, detection/STT/depth nodes stayed flagged disposed and their async
results were silently dropped until a page refresh. Fix: `resetAINodeDisposal()` (clears the set),
called from `ExecutionEngine.start()`. Confirmed by the code path.

### OpenCV nodes freeze the page — STILL OPEN; root cause confirmed, real fix = Web Worker
User report: any OpenCV node makes the page **freeze/unresponsive immediately** (not OOM, not a
specific node). v1.2.7 pinned the loader off the floating `docs.opencv.org/4.x` alias (it had
silently jumped to a ~11 MB **4.13.0** build) to **4.9.0**, and added a ≤1280px CV resolution cap.
**The user confirmed v1.2.7 did NOT fix the freeze** → it is **not version-specific**: the freeze
is inherent to loading/initializing a **~10 MB opencv.js on the MAIN thread** (parsing 10 MB of JS
+ instantiating the WASM blocks the UI thread; any cv node triggers it). Confirmed: opencv.js never
finishes initializing in a headless sandbox either. Ruled out by audit: per-frame Mat leak (freed
in `finally`), capped error array, GPU-texture leaks. WebGPU is N/A (opencv.js is CPU/WASM).

**REAL FIX (open task): move OpenCV into a Web Worker.** Load opencv.js + run all cv ops in a
worker (off main thread), mirroring the existing AI worker (`ai.worker.ts` + `AIInference.ts` +
the `runLiveDetection` deferred fire-and-cache executor pattern). Texture I/O stays on main.
Full plan: **`docs/plans/OPENCV_WORKER_MIGRATION_2026-06-26.md`**. Kept in place going in: the
4.9.0 pin + the `CV_MAX_DIM=1280` cap in `sourceToImageData` (both still useful).

#### IMPLEMENTED (worker migration) — needs a real-browser confirm ✓ pending
- **`services/visual/opencv.worker.ts`** (new): CLASSIC worker (spawned without `{type:'module'}`
  so `importScripts('https://docs.opencv.org/4.9.0/opencv.js')` works). Lazy-loads opencv.js on the
  worker thread (no main-thread freeze), runs all 9 ops, copies each result Mat out as RGBA bytes
  (`matToRGBA`, no OffscreenCanvas/imshow needed), and transfers the buffer back. Every transient
  Mat freed in `finally`; per-node persistent Mats — optical-flow `prevGray`, MOG2 subtractor —
  live worker-side keyed by nodeId, freed on `dispose`/`disposeAll`.
- **`services/visual/OpenCVService.ts`** (reworked): worker facade — promise-per-request keyed by
  id, `isReady()/isLoading()/load()` (resolves on the worker's `ready` msg), `process(nodeId, op,
  params, imageData)` (copies pixels into a fresh transferable so upstream ImageData isn't
  detached, transfers both ways), `dispose(nodeId)`/`disposeAll()`. Old `getCV()` removed.
- **`engine/executors/opencv.ts`** (rewritten): shared `runCvNode()` deferred runner — throttle by
  `interval`, one in-flight op per node, serve last texture + cached scalar outputs every frame,
  update when the async result lands (guarded by `isOpenCVNodeDisposed`). `sourceToImageData` + the
  `CV_MAX_DIM=1280` cap + texture create/update stay on main. `disposeOpenCVNode`/`gcOpenCVState`/
  `disposeAllOpenCVNodes` now also free the worker's per-node Mats; `resetOpenCVNodeDisposal()` is
  wired into `ExecutionEngine.start()` (stop→restart safety, same as the AI fix above).
- Gates green: typecheck / lint / `test:unit` (1494 pass; `opencv.test.ts` rewritten to the worker
  facade) / build (emits a separate classic `opencv.worker-*.js` chunk). **Still TODO: confirm in a
  real browser** (`npm run dev`, webcam → cv-canny → main-output) that the page no longer freezes
  and the cv output renders/updates — opencv.js doesn't load in headless sandboxes. Also re-check
  cv-optical-flow + cv-background-subtraction (stateful) and stop→restart.

#### FOLLOW-UP — architecture audit + shared worker facade (same session)
A 3-agent deep audit (node authoring / worker threading / monolith+docs) found the backbone sound
(flat executor map, real async model, ~100% dispose/gc discipline) with two real gaps: (1) built-in
nodes are split across `registry/<cat>` + `executors/<cat>` and NOT authored as isolated units like
`CustomNodeLoader`'s `definition.json`+`executor.js` packages; (2) the worker facades were ~70%
duplicated boilerplate (the OpenCV migration above had cloned `AIInference`).
- **`services/worker/WorkerFacade.ts`** (new): shared main↔worker RPC base — promise-per-request by
  numeric id, pending map, optional per-request timeout, progress forwarding, transferables, and
  reject-all on crash/terminate. Subclass provides only `createWorker()` + `handleMessage()`.
- **`OpenCVService` + `AIInference`** now `extend WorkerFacade`. AIInference kept its public API and
  all ~15 `sendToWorker(...)` call sites (now a thin wrapper over `request()`); removed its private
  pending-map/id/timeout/onerror plumbing. OpenCVService gained a 30 s per-op timeout (a hung op now
  self-recovers next frame instead of sticking "pending"; `load` stays untimed — it downloads 10 MB).
- **ESLint guard** (`.eslintrc.cjs` override): `opencv.worker.ts` may not use ES `import`/`export`
  (would flip Vite to a module worker and silently break `importScripts`). Verified active on that
  file only.
- NOT done (deferred, low-value/high-churn): converging built-ins onto the custom-node package
  layout; splitting `executors/index.ts`'s inline executors; a `docs/executor-authoring.md` guide;
  refreshing the stale `docs/architecture/ARCHITECTURE.md`. Worker `terminate()` deliberately NOT
  added to `disposeAll()` — that runs on every engine stop, and tearing down the worker there would
  force a 10 MB opencv re-init each restart (the AI worker is a warm page-lifetime singleton too).
- Gates green after refactor: typecheck / lint / `test:unit` (1494) / build (worker types unchanged:
  opencv classic + `importScripts`, ai module).

---

## 2026-06-25 — v1.2.6: detection annotation UI + resizable, hi-dpi Main Output

User asked to make the detection overlay annotations "so much better", raise the view
resolution, make Main Output arbitrarily resizable, and give each detected class a distinct
color. Web-researched Ultralytics + Roboflow `supervision` annotator source for the specifics.
Branch `detection-ui-polish`, 2 commits, gates green, shipped as v1.2.6.

- **Annotation rendering** (`registry/ai/utils/mediapipe-drawing.ts` `drawBoundingBox`): line
  width `max(round((W+H)/2*0.003),2)` and font `max(round(0.0175*(W+H)),12)` scale to image
  resolution; rounded corners; optional `corners` (L-brackets) and `filled` styles; the label
  tag flips to inside-top when it would clip the top edge and clamps to the left/right edges;
  label text color chosen by YIQ luminance (`lum>0.6 ? black : white`) so it's readable on any
  box color.
- **Per-class colors** (`ai.ts`): boxes use the Ultralytics 20-color palette, indexed by COCO
  class (stable per class, hash fallback) — `person` always the same color, every class distinct.
  New **Box Style** (outline/corners/filled) and **Box Colors** (per-class / uniform) controls on
  both detection nodes; **Line Width 0 = auto**. HUD is a rounded pill with a status dot.
- **Main Output** (`MainOutputNode.vue`): drag-to-resize corner handle (zoom-aware, persisted via
  `flowsStore.updateNodeData`, min 160×90 / max 1280×720), reset-to-input-aspect button, replacing
  the old binary expand toggle. Preview canvas + inline `TexturePreview` thumbnails now size the
  backing buffer to display×devicePixelRatio (capped 2) → crisp instead of a tiny upscaled buffer.

**Verified (Playwright + real WebGL):** rendered a multi-class annotation scene to PNG and
eyeballed it — distinct per-class colors, readable labels on every color, the top-edge label
flipping inside, corners/filled styles. Drove the Main Output resize handle: node grew 320×180 →
640×400 (zoom-aware delta correct). App boots 0 console errors; gates green (typecheck, lint,
test:unit 1493, build). **Lesson applied:** verify a texture *effect/overlay* by reading back
rendered pixels / screenshotting, not just "returns a texture" (see [[latch-video-texture-black]]).

---

## 2026-06-25 — v1.2.5: fix shader effects rendering BLACK for webcam/video sources

**User-reported:** the new image-fx nodes "don't paint" — they (and the older blur /
color-correction / displacement / transform-2d effects) rendered **black** when fed a
**webcam/video** source. Branch `imagefx-video-fix`, 2 commits, gates green, shipped as v1.2.5.

**Root cause:** these GPU effects sample their input as a texture (`iChannel0` / `u_texture`).
The Webcam node's `texture` output is a **video-backed THREE.Texture** (`createTexture(video)`),
and Three can't upload a video-backed texture through the offscreen `ThreeShaderRenderer` — it
samples BLACK. This is the **same** video-texture issue as v1.2.1, which only fixed the
`renderToCanvas` *read* path, not the *sampler* path. (My initial browser "verification" missed
it: I compiled+rendered the shaders WITHOUT binding iChannel0, so a blank result still looked
"OK". Driving the real executor with a captureStream-backed `<video>` reproduced the black.)

**Fix:** `resolveEffectSource(nodeId, renderer, input)` detects a video source (raw `<video>` or
a video-backed THREE.Texture), draws its live frame to a per-node 2D canvas, and samples a
**canvas-backed** texture instead — the same video→canvas trick the detection/OpenCV nodes use.
Canvas / render-target / image sources are unchanged. The per-node conversion canvas+texture is
freed in disposeVisualNode / gcVisualState / disposeAllVisualNodes. Applied to the 8 image-fx
nodes AND blur / color-correction / displacement / transform-2d.

**Verified (Playwright + real WebGL):** a captureStream `<video>` → each of glitch / blur /
color-correction / displacement / transform-2d now paints the source (was 0,0,0); canvas /
render-target / chained sources still paint (no regression). Gates green (typecheck, test:unit
1493, lint, build).

**Lesson for next time:** to verify a texture *effect* actually paints, bind a real source and
read back the OUTPUT pixels — "compiles + returns a non-null texture" is NOT proof it paints.

---

## 2026-06-25 — v1.2.4: 18 new nodes from the NODE_LIBRARY_REVIEW backlog

Built out the highest-value web-testable nodes from `docs/NODE_LIBRARY_REVIEW_2026-06-18.md`
(the curated 53-node backlog; the old MASTER/MODERNIZATION "deferred" lists are essentially
done). Node count **220 → 238**. Branch `nodes-visual-fx`, 6 single-purpose commits, all gates
green (typecheck, lint, test:unit **1493**, build), merged to `main` and shipped as **v1.2.4**.

- **Visual VJ FX (8):** `image-fx-{glitch,rgb-shift,pixelate,kaleidoscope,scanlines,posterize,
  dither,chroma-key}` — discrete one-effect shader nodes wrapping `ShaderPresets` via a shared
  `runImageFx` (visual.ts). Compiled material is cached under the nodeId, so the existing
  visual gc/dispose frees it (no new cleanup). 4 reuse existing presets; scanlines/posterize/
  dither/chroma-key are new GLSL presets (also added to the Shader-node dropdown).
- **AI (2):** `text-to-speech` (Web Speech API, main-thread, offline) and `depth-estimation`
  (Depth-Anything via a new `estimateDepth` worker task + AIInference facade; depth-texture
  output, grayscale or colorized).
- **Audio (3):** `audio-compressor` (with reduction meter), `audio-distortion`, `audio-bitcrusher`
  — Tone.js effects on the gain/filter template (generic audioNodes map = auto-cleanup).
- **Signal/timing (5):** `slew-limiter`, `derivative`, `integral`, `tween-to-target` (new
  `signal.ts`, gc wired into ExecutionEngine like spring) + `tap-tempo`. **+7 unit tests.**

### Custom-UI audit (requested) — CLEAN
All 26 existing custom node-UI components are imported into `registry/components.ts` AND mapped
to a key that matches a real node id (verified all 26); `CUSTOM_NODE_TYPE_IDS` derives from the
same map, so the flows store can't drift. All 18 new nodes correctly use `BaseNode` (texture/
number/audio outputs — no bespoke UI). `components/nodes/_archived/` holds 8 stale duplicate
UIs that are not imported anywhere (dead code; safe to delete).

### Verification (Playwright + headless WebGL against the dev server)
- ✓ All 8 image-fx shaders **compile + render** in real WebGL (the 4 new GLSL included).
- ✓ All 18 nodes register in the running app (238 total); **0 boot console errors**.
- ✓ Signal/timing covered by unit tests.
- ⚠️ `depth-estimation` is wired correctly (reached the worker, no error) but the model didn't
  finish downloading within the headless 5-min budget (fresh context = cold cache) — same
  download-on-first-use behavior as the other transformers.js models. **Verify live.**

### Deferred (harder tail of the selected families — NOT built)
`audio-granular` (buffer/grain player), `audio-recorder` (MediaRecorder + Blob/URL lifecycle),
`mouse-pointer` + `device-motion` (need a DOM/sensor input service with listener cleanup),
`timeline-keyframe` (keyframe data model + custom timeline UI). Plus the rest of the
NODE_LIBRARY_REVIEW Tier B/C/D (DMX/Art-Net/NDI/Spout/Syphon installation outputs, etc.).

---

## 2026-06-25 — v1.2.1 + v1.2.2 + v1.2.3 SHIPPED to prod (YOLOv10 + HUD + leak fix)

**Supersedes the "UNCOMMITTED" note in the 2026-06-24 entry — that work is now committed,
version-bumped to 1.2.1, and DEPLOYED.**

### `yolo-session-cleanup` — DEPLOYED as v1.2.3 ✓
Post-deploy audit of the detection-upgrades code found a WASM-heap leak: the worker's
`yoloSessions` map (one onnxruntime-web `InferenceSession` per model URL, ~29–102 MB each) was
never `.release()`d — `handleDispose`/`handleUnload`/`handleClearCache` only cleared the
transformers `pipelines` map (pre-existing since v1.2.1's `887d843`). Now released on dispose,
clearCache, and unload (keyed by model URL). Also corrected the `wasmPaths` comment:
onnxruntime-web is a **transitive** dep via `@huggingface/transformers` (not pinned in
package.json) — re-sync the pinned version with `npm ls onnxruntime-web` after a transformers
bump. Audit otherwise clean: YOLOv10 decode, HUD, and the wasmPaths pin all verified correct.

### v1.2.1 — DEPLOYED to production ✓
Committed the 2026-06-24 vision fixes in 4 clean commits, removed the temp `__latch` debug
hook, bumped `package.json` to **1.2.1**, merged to `main` (`8c77a71`), pushed. CI green
(lint/test 1482/build + Deploy Web); gh-pages at 8c77a71; **latch.design and
latch-flow.netlify.app both 200**. No git tag pushed (a `v*` tag triggers the Electron
desktop Release workflow — not wanted). Live now: the renderToCanvas video fix (vision nodes
no longer black), MOG2 hardening, detection aspect-ratio fix, YOLO ONNX wasmPaths fix, and
D-FINE-S / RT-DETRv2 model options on the live detection node.

### `detection-upgrades` — DEPLOYED as v1.2.2 ✓
Maintainer verified the YOLO node + HUD on localhost:5173; merged `detection-upgrades` → `main`
(`--no-ff`), bumped `package.json` to **1.2.2**, pushed (CI/Netlify auto-deploy). No git tag
(a `v*` tag triggers the Electron desktop Release — not wanted). All gates green at deploy
(typecheck, lint 0-err, test:unit 1486, build).
- **YOLOv10 (NMS-free) for the YOLO node** (`1ac7dd4`): YOLOv10's one-to-one head outputs
  `[1,300,6]` = `[x1,y1,x2,y2,score,classId]` (xyxy in letterboxed 640-space, score 0–1,
  class explicit) → decode is threshold + un-letterbox, no NMS. `handleYoloInfer` branches on
  output shape (`isYolov10Output` → `parseYolov10Output`, else the v8/v9 argmax+NMS path).
  **Format confirmed empirically** — ran `onnx-community/yolov10s` on bus.jpg → exact ground
  truth `{bus:1, person:4}`. **Default model changed to YOLOv10-S (~29 MB)** from GELAN-C
  (~102 MB); YOLOv10-M + YOLOv9 kept. +4 unit tests (14 yolo tests).
- **Detection HUD + per-class colors** (`879bce8`): a status bar (count · top label · last
  inference latency ms) burned into the annotated frame (shows on the node preview AND the
  main output); per-class box colors seeded by the Box Color control; HUD gated on Show
  Labels. This is the "annotate on the preview screen" ask.

### #3 GitHub Pages — RESOLVED: do NOT enable
Enabling it would publish a **broken site**: the build uses absolute root paths (`/assets/…`,
`/coi-serviceworker.min.js`) with no CNAME, so on a `github.io/latch/` project page everything
404s (white screen; the COI service worker the app needs for `crossOriginIsolated` wouldn't
load either). Netlify serves at root, which is why it works. Leave Pages off — Netlify
(latch.design) is canonical. (Would need a `base:'/latch/'` build or its own custom domain.)

### Verification status
- **Verified:** renderToCanvas video fix (user-confirmed + repro); YOLOv10 format (empirical,
  ground-truth); all decode logic (unit tests); gates.
- **NOT yet confirmed in a real browser by the maintainer:** the YOLO node end-to-end
  (wasmPaths + YOLOv10 + worker), the HUD/per-class colors visually, and the D-FINE-S /
  RT-DETRv2 transformers.js models. The YOLOv10 harness used the same ort version + CDN
  wasmPaths + model + letterbox the app uses, so confidence is high.

### Next / backlog
- Test `detection-upgrades` on localhost (YOLO node + HUD), then deploy it (branch → main →
  CI/Netlify), same flow as v1.2.1.
- **WebGPU EP: deliberately deferred** — research found it ~2× SLOWER than WASM for detection
  in onnxruntime-web (GPU↔CPU readback overhead, ORT #18584). Revisit only with a real
  in-app benchmark.
- `ai.worker.ts` `ort.env.wasm.wasmPaths` pins the nightly `onnxruntime-web@1.26.0-dev…`
  version string — keep in sync with package.json on any dep bump.

---

## 2026-06-24 — Vision display fix (the headline bug), detection upgrades, v1.2.0 signed release

Long session. Shipped the **signed/notarized macOS v1.2.0 release** (open item #1, was blocked on
Apple), then chased and **fixed the real reason the vision nodes rendered black**, plus several
detection-node improvements. **All v1.2.1 code changes are UNCOMMITTED on branch
`v1.2.1-mog2-hardening`.** Gates green: typecheck, lint (0 err), `test:unit` (1482), build.

### #1 macOS signed release — DONE ✓
Maintainer settled the Apple agreement; re-ran the failed v1.2.0 Release workflow
(`gh run rerun 28075087766`). Both macOS jobs cleared notarize this time (proof: `✔ Finalizing
package` took 3.5–5 min each = the Apple round-trip; the step that 403'd before). Result: **9 clean
CI-named signed assets**, the **5 stale manually-uploaded unsigned assets deleted**, and the
**release body rewritten** (dropped the "unsigned/right-click→Open" caveat, added macOS Intel, fixed
asset names). Published, Latest, not draft.

### THE BUG: vision nodes render black — ROOT CAUSE FOUND & FIXED ✓ (user-confirmed)
Symptom: webcam→output painted, but webcam→**any canvas node** (snapshot / OpenCV / detection)→output
was **black**, with a `glTexStorage2D(0×0)` + `glCopySubTextureCHROMIUM: destination level must be
defined` + `glGenerateMipmap` console flood. This path was NEVER pixel-verified before v1.2.0 (only
executor wiring was — the "in-app paint proof" used a shader source, not a webcam).
- **Root cause (reproduced with the REAL renderer code via Playwright + fake webcam):**
  `ThreeShaderRenderer.renderToCanvas()` returns **fully black for a video-backed THREE.Texture** —
  Three can't upload an `HTMLVideoElement` source through this offscreen renderer (canvas sources
  work, video doesn't; `videoTexCenter` read `[0,0,0]` vs a `drawImage(video)` control `[74,255,20]`).
  snapshot/detection/OpenCV all read the webcam *as a texture* via `renderToCanvas` /
  `threeTextureToImageData` → black frame → black output. webcam→output only worked because the Main
  Output / TexturePreview components `drawImage(video)` directly.
- **Fix** (`ThreeShaderRenderer.ts`): `renderToCanvas` now draws video sources straight to the 2D
  target. Reproduced black → green. **User confirmed it works.**
- **Debugging note for next time:** I first shipped a *different* (real but secondary) resize-corruption
  fix and it did NOT help — `glCopySubTextureCHROMIUM: Offset overflows` (resize) ≠ the user's
  `destination level must be defined` (0×0) case. The video-texture-black is the confirmed root cause.
  Isolated repros are in the session scratchpad (`videotex.mjs`, `repro.mjs`).

### Other fixes (all on the branch, gates green)
- **MOG2 hardening (orig. item #2):** moved `new cv.BackgroundSubtractorMOG2(...)` inside the
  try/catch so a build lacking the `video` module degrades to a blank mask + `_error` instead of
  throwing the executor. **+1 unit test** (11 opencv tests). MOG2 still not runtime-confirmed (opencv
  CDN throttle persists — re-attempted, WASM didn't init in headless within 90s; environmental).
- **`updateTexture` resize hardening** (`ThreeShaderRenderer.ts`): tracks uploaded dims on
  `texture.userData`, disposes+reallocs on a size change (the emulator's documented `Offset overflows`
  flood). Verified by repro. **Separate from the headline bug** — candidate for its own commit.
- **Aspect-ratio fix** (`ai.ts` `threeTextureToImageData`): was squishing every source to a square
  512×512 (distorting a 640×480 webcam, misaligning boxes). Now honors `videoWidth`/`videoHeight`.
  ⚠️ typechecks, low-risk, NOT runtime-verified.
- **YOLO node WASM 404 fix** (`ai.worker.ts`): the raw `import 'onnxruntime-web'` is a SEPARATE ORT
  instance from the one transformers.js bundles (old comment claimed otherwise), so its `wasmPaths`
  were unset → it fetched `.wasm` and got the HTML index page (`<!DO…` = the "magic word
  3c 21 44 4f" abort). Set `ort.env.wasm.wasmPaths` to the version-matched jsdelivr build (CDN
  verified serving 200; loads under credentialless COEP). ⚠️ **applied, NOT yet user-confirmed.**
  ⚠️ Version string pinned to nightly `onnxruntime-web@1.26.0-dev...` — KEEP IN SYNC with package.json.
- **Larger detection models** (`object-detection-live.ts`): added **D-FINE-S**
  (`onnx-community/dfine_s_coco-ONNX`, ~41 MB) and **RT-DETRv2 R18** (`onnx-community/rtdetr_v2_r18vd-ONNX`,
  ~81 MB) — both NMS-free transformer detectors that run through the existing generic transformers.js
  `detectObjects` pipeline (no new post-processing). ⚠️ NOT verified in-app.

### Model research (delegated, verified) — for the "bigger realtime models" ask
- **WebGPU is NOT a free win for detection** — a DETR ran ~14s WebGPU vs ~8s WASM (ORT #18584;
  post-processing forces GPU↔CPU readbacks). Did NOT switch backends.
- **Top YOLO-node upgrade: `onnx-community/yolov10s`** — 29 MB (fp16 14.6, int8 7.6), **NMS-free**
  `[1,300,6]` output that's *simpler* to decode than the current NMS path. Needs a small new decode
  branch in `yolo.ts`/worker. Not yet implemented — proposed next step A.
- int8 = WASM size lever; fp16 = WebGPU speed lever (different levers).

### Open / next (await user)
- **A)** Implement YOLOv10s (NMS-free `[1,300,6]`) for the YOLO node.
- **B)** Dedicated detection HUD preview (count/FPS/top-label, per-class colors) — the "annotate on
  the preview screen" ask. NOTE: the detection node already burns boxes into its output texture and
  the node preview shows it, so this is polish, not a gap.
- **Commit** the v1.2.1 branch once the user confirms the YOLO/model/aspect changes in-browser.
- **#3 GitHub Pages:** deploy works (CI pushes gh-pages on every main push, confirmed); 404s only
  because **Pages is not enabled in repo settings** (`gh api .../pages` → 404). Netlify (latch.design)
  is canonical. Enabling is a one-time settings toggle — maintainer's call.
- **#5:** merged `modernization` branch deleted (local + origin).

### ⚠️ PRE-COMMIT TODO
- **Remove the TEMP `window.__latch` debug hook in `main.ts`** (DEV-only block, added to drive the
  headless repro). Must be stripped before committing.

---

## 2026-06-23 (verify + extend) — in-app paint proof, MOG2 node, throttle fix

Closed the last verification gap, extended the OpenCV set, and hardened the shared
detection loop. **12 vision nodes** now; gates green (typecheck, eslint 0-error,
`test:unit` 1480, build). Branch `modernization`. Commits `6cb4a3c`, `43e1ef7`.

### In-app full-graph paint — PROVEN (the last end-to-end gap)
Drove `shader(plasma) → snapshot(continuous) → main-output` in the running dev server via
a temporary dev-only `window.__latch` hook (reverted after — not committed): real engine,
146 frames, **snapshot output = 512×512 texture with real plasma pixels** (centerRGB
`[89,252,42]`, ~all samples non-zero) and **main-output received it** (`_input_texture`
set). Confirms the createTexture(canvas)→THREE.Texture→mainOutput→PixiJS path empirically
for every texture-output node (all share it). (cv-grayscale-in-app hit the opencv CDN
throttle — environmental; opencv load + cvtColor were already standalone-proven.)

### Extended — `cv-background-subtraction` (MOG2)
Persistent `BackgroundSubtractorMOG2` per node → foreground-mask texture + foreground pixel
ratio. The subtractor lives in the WASM heap and is `.delete()`d in
`disposeOpenCVNode`/`gcOpenCVState` — **unit-tested** (mirrors the optical-flow `prevGray`
discipline). OpenCV node count: 8 → **9**.
- **Audit fix:** the subtractor was created once, so the `history`/`varThreshold`/
  `detectShadows` controls were dead after frame 1. Now rebuilds (freeing the old) when the
  params change — **unit-tested**.
- **Caveat:** MOG2 itself isn't runtime-verified (the opencv.js CDN throttled every smoke
  attempt today). It uses the documented opencv.js API (`new cv.BackgroundSubtractorMOG2`),
  lives in the same `video` module as the proven optical-flow path, and degrades gracefully
  (try/catch → blank mask) if absent.

### Fixed — `runLiveDetection` throttle startup eagerness (`43e1ef7`)
The shared loop read `lastFrame` with a `0` default and gated on `!lastFrame`, so a stored
frame 0 read as "never ran" and re-fired detection every frame at startup (guarded from
pile-up by `pendingOperations`, but wasteful). Now uses a `-1` sentinel. Found by the new
**runLiveDetection tests** (throttle + cache + topLabel) covering both Tier A and Tier B.

### State
Vision total: **12 nodes** (snapshot, object-detection-live, object-detection-yolo, 9× cv-*).
**23 vision unit tests** (10 opencv + 10 yolo + 3 live-detection). Bumped to **v1.2.0**;
merged to `main` (PR #2) and released the Electron build.

---

## 2026-06-23 (Tier B) — YOLOv8/v9 ONNX detection node (onnxruntime-web)

Built the Tier B node the entry below deferred. Raw YOLO detection via
**onnxruntime-web in the worker**, browser-proven end-to-end. Gates green
(typecheck, eslint 0-error, `test:unit` 1476, build); **+10 unit tests**.
Branch `modernization`, **not pushed**. Commit `446b19a`.

### Shipped — `object-detection-yolo` (ai)
- **`services/ai/yolo.ts`** — pure, layout-robust post-processing: `parseYoloOutput`
  (decodes `[1,84,8400]` *or* transposed `[1,8400,84]`; cxcywh→xyxy; undoes letterbox
  scale/pad → original coords; per-class conf filter), `nms` (per-class greedy, agnostic=
  false), `iou`, `COCO_LABELS`. **10 unit tests** (`tests/unit/services/yolo.test.ts`).
- **`ai.worker.ts`** — `import * as ort from 'onnxruntime-web'` (the same singleton
  transformers already configures at import, so wasm just works); lazy `InferenceSession`
  per model URL (cached, failed loads not cached); `OffscreenCanvas` letterbox → CHW
  float32 `[1,3,640,640]`; runs, then `parseYoloOutput`+`nms` with `numClasses=80`.
  Branches in `handleInfer` on `method==='detectYolo'` before the pipeline lookup.
- **`AIInference.detectYolo(image, modelUrl, threshold, iou)`** — same return shape as
  `detectObjects`; 5-min worker timeout (first call downloads the model).
- **Node + executor** — `object-detection-yolo` reuses the live-overlay loop, which I
  **refactored into a shared `runLiveDetection(ctx, detect, opts)`** so Tier A
  (`object-detection-live`) and Tier B share one code path (the only diff is the `detect`
  fn + controls). Default model **gelan-c** (`Xenova/yolov9-onnx`, ~102 MB, CORS-ok);
  `modelUrl` is an editable select so users can point at a lighter `yolov8n.onnx`.

### Verified
- **Definitive real-image proof** (Chrome via Playwright, stable ort 1.20.1 from jsdelivr):
  ran the actual `gelan-c.onnx` on the classic `bus.jpg` (810×1080) with yolo.ts's exact
  parse+NMS inlined → **`{ bus: 1, person: 4 }`**, the exact ground truth, scores 0.81–0.95,
  boxes landing on the subjects in image-pixel coords. This empirically settles the three
  things the format-only smoke left open: **scores are sigmoid'd (0–1, not logits)**,
  **output dtype is Float32Array**, and **letterbox + `(coord−pad)/scale` decode is correct**.
  Output confirmed `[1,84,8400]` (input `images`, output `output0`); used the identical ort
  API the worker uses (`InferenceSession.create`/`Tensor`/`run`/`inputNames`/`outputNames`/`dims`).
- **Build bundles ort into the worker** (webworker chunk) — no Vite/worker errors.
- Why YOLOv9/GELAN not YOLOv8: the clean COCO `yolov8n` ONNX repos are gone (401);
  `Xenova/yolov9-onnx` is public + CORS + the model behind Xenova's in-browser demo, and
  YOLOv9's detection head output is byte-format-identical to YOLOv8 — same pre/post.

### Open / not done
- The shared **`runLiveDetection`** loop (refactored out of the Tier A executor; now used by
  both detection nodes) has no direct unit test — it's a faithful extraction (typecheck +
  build + 1476 tests green, and the YOLO detect path is real-image-proven through it), but a
  throttle/cache test would lock the shared infra. Low risk; good next target.
- gelan-c is ~102 MB — heavy first load; surfaced in the node's Loading output + info.

---

## 2026-06-23 — Vision node families shipped (snapshot, live detection, OpenCV.js)

Implemented the three families planned in the entry below, per
`docs/plans/VISION_NODES_PLAN_2026-06-22.md`. **10 new nodes + one new service.** Gates green
throughout (typecheck, eslint 0-error, `test:unit`, production `build`); 8 new unit tests.
Branch `modernization`, **not pushed**.

### Shipped
- **`snapshot`** (visual, `b495ada`) — latch/hold a still from any texture feed on rising-edge
  `trigger` or `continuous`; `mirror`; outputs held texture + imageData + dims + `captured`
  pulse. gc via the existing `gcVisualState`/`disposeAllVisualNodes`.
- **`object-detection-live`** (ai, `e98ac6f`) — continuous YOLOS/DETR detection on a live feed
  with an **annotated-texture** output (boxes/labels drawn over the frame via
  `mediapipe-drawing.drawBoundingBox`). Reuses `convertToImageData` + `aiInference.detectObjects`;
  frame-skip throttle + `pendingOperations` guard + `getCached`. Dedicated `liveDetectState` map so
  the THREE.Texture is disposed in `gcAIState`/`disposeAllAINodes` (the generic nodeCache GC would
  drop the key without disposing the texture).
- **OpenCV.js** (`0e5d35e`, `ed223da`, `5651c8c`) — new `services/visual/OpenCVService.ts` (lazy CDN
  load, `load()/isReady()/isLoading()/getCV()`), new `engine/executors/opencv.ts`, new
  `registry/opencv/`. **8 nodes:** `cv-grayscale`, `cv-canny`, `cv-threshold` (fixed/Otsu/adaptive),
  `cv-blur` (gaussian/median), `cv-morphology`, `cv-contours` (+contour data), `cv-corners`
  (Shi-Tomasi), `cv-optical-flow` (Farneback, HSV viz, +mean-motion). New category wired into
  `builtinExecutors`, `allNodes`, and `ExecutionEngine` gc + teardown. Filed under category `visual`
  (left the `NodeCategory` union untouched). **Every `cv.Mat` `.delete()`d** in the op `finally` and
  in `disposeOpenCVNode`/`gcOpenCVState` — including the persistent optical-flow `prevGray`.

### Bugs found & fixed (build + 5 adversarial audit passes)
- **median-blur kernel throw** (`5651c8c`): `cv.medianBlur` asserts `ksize > 1`; a kernel of 1 from
  the slider threw → silent blank. Floored median at 3 (Gaussian is valid at 1). **Unit-tested.**
- **live-detection stale `loading`** (`023de06`): computed before the async kickoff → reported
  `false` on the triggering frame. Recompute at output time.
- **opencv.js thenable stray error** (`594fe61`): the docs.opencv.org `cv` global is an Emscripten
  thenable whose `.then()` isn't chainable, so `cvObj.then(...).catch(...)` threw an uncaught error
  on the happy path. Wrap with `Promise.resolve`. **Found by the real-browser test below.**
- **optical-flow resize wedge** (`71f5b9c`): Farneback needs both frames the same size; a mid-stream
  resolution change threw every frame and (since `prevGray` only updates on success) stayed blank
  forever. Now reseeds `prevGray` on size mismatch. **Unit-tested.**

### Verified
- **Real-browser proof** (Chrome via Playwright, page served with the app's `COOP:same-origin` +
  `COEP:credentialless`): `crossOriginIsolated` true, the cross-origin no-cors `opencv.js` `<script>`
  loads under it, WASM instantiates, and `cvtColor(RGBA→GRAY)` of pure red → **76** (=0.299×255).
  Confirms the novel CDN→WASM→Mat pipeline end-to-end. (One-off; not committed — hits a live CDN.)
- **Rendering path code-confirmed:** every new node outputs `createTexture(canvas)` → a THREE.Texture
  wrapping a real-pixel 2D canvas; `mainOutputExecutor` passes it through as `_input_texture` to the
  PixiJS display — **byte-identical to the shipping `webcam-snapshot`**. Outputs stay on the
  ThreeShaderRenderer context (display in Main Output/shaders; blank in 3D nodes — the documented
  3-context gotcha).
- **8 unit tests** (`tests/unit/executors/opencv.test.ts`, real invocation, cv + renderer mocked):
  median floor, transient-Mat frees, optical-flow `prevGray` retain→free-on-dispose, resize reseed,
  frame throttle.

### CDN decision (documented inline in OpenCVService)
`https://docs.opencv.org/4.x/opencv.js` — the **moving `4.x` alias is intentional**: docs.opencv.org
keeps only the newest 4.x build (4.10/4.11/4.12 all 404), so pinning a version is a time-bomb. Mirrors
the app's `@mediapipe/tasks-vision@latest` convention. Single-file build with the WASM embedded base64
(no sibling `opencv_js.wasm` — it 404s), so only the no-cors `<script>` is cross-origin → loads fine
under credentialless COEP. Don't "fix" it to a pinned version.

### Open / not done (by choice)
- **Live full-graph paint** (color/shader → cv/snapshot → main-output actually painting): not run.
  Path is code-confirmed identical to the shipping `webcam-snapshot` and the OpenCV half is
  browser-proven, so residual risk is low; a full e2e rig (dev store-hook + headless WebGL + PixiJS
  readback) wasn't judged worth it. Easy to add later — `flows` store exposes `addNode`/`addEdge`.
- **Tier B (YOLOv8-ONNX)** — deferred per the plan's gate ("only if YOLOS/DETR insufficient"; no
  evidence it is). Needs onnxruntime-web direct + letterbox + NMS + a hosted `.onnx`.
- **`object-detection-live`** not exercised against a live model (transformers.js download); logic
  mirrors the shipping `object-detection` node.

### State
Node count **+10 → 218** (prior entry: 208). Working tree clean, **nothing pushed**. Gates green:
typecheck, eslint (0 errors), `test:unit` (1466 pass), production `build`. Commits `b495ada`,
`e98ac6f`, `0e5d35e`, `023de06`, `ed223da`, `5651c8c`, `00b25aa`, `594fe61`, `71f5b9c`.

---

## 2026-06-22 (late) — Emulator + effects fully working; persistence data-loss fixed; vision nodes planned

User-confirmed: **"it all finally works."** Everything below shipped to `main` and is live
(GitHub Pages + Netlify). Gates green each deploy (typecheck, lint, 1458 unit tests, build).

### Emulator + texture pipeline — RESOLVED (closes the saga in the entry below)
- **Effect nodes were throwing on missing built-in uniforms (`fae1e2d`).** `render()`/`renderToScreen`
  in `ThreeShaderRenderer` set `uniforms.iTime.value`/`iResolution`/`iChannel0…` unconditionally, but
  `compileEffectShader` only creates the uniforms an effect declares (`u_texture`, …). `undefined.value`
  threw a TypeError every frame (swallowed by the engine) → **every effect node** (color-correction,
  blur, blend, displacement) rendered blank for **every** input. This — not the cross-context theory —
  was the real cause of "emulator texture won't work in other nodes." Fixed by guarding each built-in
  uniform. (Two prior misfires on this: a `needsUpdate` fix that sat *after* the throw, and the
  cross-context analysis. Reading it to the actual TypeError cracked it.)
- **Effect resolution preserved (`5b802d4`).** `render()` now defaults its output size to the input
  texture's resolution (from `u_texture.image`, which also carries size for render-target inputs) so a
  non-square source (emulator 958×684) isn't squished into 512². Generative shaders keep 512².
- **Emulator capture (`4096012`) + texture realloc on resize (`9629507`).** Blit the WebGL canvas
  through an intermediate 2D canvas (a WebGL canvas is an unreliable cross-context texture source);
  recreate the THREE texture when the frame size changes (killed the `glCopySubTexture` flood).
- **Control-tab freeze (`fd89420`).** KeepAlive deactivates the editor on the Control tab → detaches the
  emulator canvas → EmulatorJS stops painting. EmulatorNode now renders into a managed host that parks
  off-screen-but-attached to `<body>` on deactivate (keeps painting) and docks back on activate, pinning
  the host+canvas size so it can't resize. User-confirmed working.

### Persistence — silent data-loss fixed (`b2c73f1`, `bfa80cc`)
Imported flows now persist to IndexedDB; the Save button writes to the DB (was: clear dirty + download
only, which also suppressed autosave); a `beforeunload` guard warns on web (no-op in Electron so it
can't block quit); node-drag marks dirty; `markFlowSaved(flowId)` clears the saved flow not the active
one; `saveAllFlows` preserves each non-active flow's stored connections. See AUDIT_2026-06-19.md pass 2.

### Next up — new vision node families (planned this session)
User wants: (1) a **generic snapshot node** (capture a still from any video/texture feed on trigger),
(2) **AI-on-live-video** (object detection — YOLOS/DETR via Transformers.js, optional YOLOv8-ONNX),
(3) **OpenCV.js** image-processing nodes. Full plan + a ready-to-paste kickoff prompt in
**`docs/plans/VISION_NODES_PLAN_2026-06-22.md`**. Key facts grounding it: there's already a
webcam-specific `webcam-snapshot` (no generic equivalent), a Transformers.js `object-detection` node
(YOLOS already a registered model) and a MediaPipe `mediapipe-object` node (both output data only, no
annotated texture), `onnxruntime-web` is present transitively via transformers, OpenCV is net-new
(CDN lazy-load like MediaPipe; Mats MUST be `.delete()`d via the gc/dispose path).

---

## 2026-06-22 — Wire-preservation, public-readiness, emulator texture saga; all shipped to main

Branch `modernization`, fast-forwarded to `main` and **deployed** (GitHub Pages + Netlify) several
times this session. All green each deploy: typecheck, lint, **1456 unit tests**, build.

### Shipped (on `main`)
- **Copy/paste/duplicate/snippet now preserve wires.** New tested flows-store actions
  `serializeSelection` (capture a selection + only its internal edges) + `insertSubgraph` (clone
  with fresh ids, remap internal edges). Fixes the headline "wires lost on paste/snippet" bug.
- **Public-readiness:** added `LICENSE` (MIT) + `CONTRIBUTING.md`, refreshed stale docs (node count
  133+/196 → 208, `dev:electron` command, test counts), untracked `.DS_Store`, moved the stray
  design-system mockup into `docs/`.
- **Test hardening:** strengthened `insertSubgraph`/subflow/heal/duplicate assertions, added the
  connect-throttle test + Electron-bridge global checks in `code.test.ts`; added `@vitest/coverage-v8`
  (the `test:coverage` script had no provider). flows.ts coverage 38%→81%. Mutation-tested the new
  guards (both caught).
- **Debug console** now renders each log as its own card (type badge + timestamp + body), not a flat
  stream.
- **Emulator → texture** (multi-step saga, see below).

### Emulator saga (resolved for the editor; two items still open)
1. **Capture fix (shipped):** the executor blits the emulator's WebGL canvas into an intermediate 2D
   canvas, then textures from that — a WebGL canvas is an unreliable cross-context texture source.
   Fixed the editor freeze.
2. **Control-tab reparenting attempt (shipped then REVERTED):** parking the emulator host off-screen
   on view switch resized the canvas and caused a `glCopySubTextureCHROMIUM: Offset overflows texture
   dimensions` flood that corrupted the texture for *all* consumers. Reverted.
3. **Texture-size fix (shipped, current):** recreate the THREE texture whenever the frame size changes
   (`emulation.ts`) instead of uploading a larger canvas into stale storage. Killed the flood.

**Still OPEN (post-audit 2026-06-22):**
- **Cross-context texture (HIGH, NEW):** there are THREE live WebGL contexts — `ThreeShaderRenderer`
  (shaders + previews + emulator), `ThreeRenderer` (all 3D nodes), `UnifiedRenderer` (unused). A
  `THREE.Texture` uploaded in one context can't be sampled in another, so the emulator's texture (and
  any canvas/video THREE.Texture) is blank when fed to **3D nodes**. This is the real cause of "not
  working as texture in other nodes." Fix: in `3d.ts:convertToThreeTexture`, rebuild a
  Canvas/VideoTexture in the 3D context from `inputTexture.image` instead of returning the foreign
  texture (same pattern its raw-element branches already use). Same-context consumers (shaders, Main
  Output) work fine once the size flood is gone.
- **Control tab blank:** KeepAlive keeps `EditorView` mounted but *deactivates* it (detaches DOM), so
  the emulator canvas stops painting on the Control tab. The reparenting fix was wrong; the sound
  approach (app-root host, or only-on-the-canvas keep-rendered) needs local testing before deploy.

### TOP PRIORITY — persistence / silent data loss (2026-06-22 pass 2, see AUDIT re-audit pass 2)
The most severe open items: users can silently lose saved work on the public build.
- **Imported flows are never written to IndexedDB** → gone on reload (`importFlows` mutates store only;
  autosave watches only the active flow's dirty).
- **The "Save" button doesn't persist to the DB** (`AppHeader.saveProject` clears dirty + downloads a
  file, never calls `saveFlow`; clearing dirty also suppresses autosave).
- **No `beforeunload` guard** + 2s debounced autosave → recent edits lost on reload/crash.
- **Node drag never marks dirty** → layout reverts on reload.
- Plus: full `NodeDefinition` baked into every persisted node (bloat), no schema migration, no quota/
  eviction handling (can evict ALL saved flows), autosave can clear dirty on the wrong flow.
These rank ABOVE the texture bugs below — they lose real user work today.

### Other NEW audit findings (2026-06-22) — see AUDIT_2026-06-19.md re-audit section
- **`multiple: true` input ports drop all but the last edge** (HIGH, `ExecutionEngine.ts` `getNodeInputs`):
  Scene-3D / Group-3D expect an array but get one value, so only one wired object/light renders.
- MED/LOW: per-frame metrics serialization + reactivity bump; `renderToCanvas` per-frame canvas/array
  allocations on the scaled-readback path; FPS counter can latch to Infinity on a 0-delta frame.
- Correction: audit #10 (asset blob URL revoke) is already mitigated in `AssetStorage.deleteAsset`;
  only the orphan-node-ref half stands.

---

## 2026-06-19 — Audit fixes landed + re-audit (verification pass)

Branch: `modernization`. Committed & pushed (no PR). All green: typecheck clean, eslint clean,
**1420 unit tests pass (11 todo)**, build succeeds.

### Landed this cycle (4 commits)
- Tier 1 security: Electron IPC hardened (`setWindowOpenHandler` + `shell:openExternal` http(s)-only,
  asset/custom-node file handlers `..`-contained), Function/Expression code global-shadowing preamble
  + honest relabel (+ `code.test.ts`).
- Tier 2 robustness: per-frame connect-storm throttle (mqtt/ws/http), `ConnectionManager.disconnect`
  unwedge, `AIInference` worker-crash rejects pending, `deleteFlow` frees undo/redo history (+ tests).
- Deliberately **not** done (would degrade core LAN/arbitrary-connection use): SSRF host-allowlist /
  strict CSP.

### Re-audit (5 parallel passes) — see `AUDIT_2026-06-19.md` "Re-audit / verification pass"
- Verified the 6 fixes: #7/#8/#9 solid. **3 corrections** to "done" claims: `shell:openPath`/
  `showItemInFolder` left unguarded (but unbridged → latent, not live); `customNodes/compiler.ts`
  user-code path has no preamble (undocumented trust asymmetry); `lastConnectAttempt` keys never gc'd.
- **New HIGH:** `exposeControl` never persists to localStorage (`ui.ts:457`); Oscilloscope/Equalizer
  leak their Tone analyser node (only `disconnect`, never `dispose`); BLE legacy node double device-picker.
- **New MED:** `controlPanelLayout` orphaned on node delete; clasp captureStream/`<video>` + sendClient
  double-connect leaks; per-frame `DataTexture` alloc on raw-WebGLTexture→Shader path (#11 priority);
  shadow-map + GLTF-map disposal gaps (shared-texture risk on material maps); RT-pool no eviction.
- **Reassessed:** #14 MediaPipe stream = non-issue (webcam node stops its own stream); #15 STT
  AudioBufferService already torn down via `disconnect()`.
- Fix order for the follow-up pass is documented at the end of `AUDIT_2026-06-19.md`. **No code fixes
  this pass — audit/doc/commit/push only.**

---

## 2026-06-19 — Node-library review + discoverability/UX + first nodes

Branch: `modernization`. All work committed (single-purpose commits, no AI attribution).
Driven by `docs/NODE_LIBRARY_REVIEW_2026-06-18.md` — its implementation-status block tracks
each item; this is the narrative summary.

### Landed
- **Correctness — duplicate node ids fixed.** `counter` (data+code) and `sample-hold`
  (logic+code) collided in the id-keyed registry Map, and the winning *definition* and
  winning *executor* were crossed — leaving both nodes effectively broken. Kept one coherent
  def+executor pair each (`counter`→code, `sample-hold`→logic/utility), deleted the dead
  twins, added a DEV duplicate-id warning in `useNodesStore.register()`, and a
  `registry-integrity` test.
- **Leak — subflow contexts.** `clearAllSubflowContexts()` was called nowhere; added
  `gcSubflowState()` + wired both into `ExecutionEngine` (per-node GC + `stop()`).
- **Discoverability.** Search already matched name+description+tags but most VJ-facing nodes
  had no tags. Added creative-coding vocabulary across the library — tagged-node coverage
  **70 → 148 of 205** (echo/noise/glitch/feedback/tempo/donut/whisper… now resolve; the
  Shader presets are searchable). Added **tag filter-chips** to the Node Explorer and a
  **port-type colour legend**; rendered **per-category icons** (single-source
  `utils/categoryIcons.ts`) in the palette + explorer; hid empty categories; clarified the
  Control Panel empty state.
- **Brand — purple = AI only.** Repointed stray category purples (debug→slate,
  messaging→cyan, subflows→lime) and non-AI accent purples (EQ/parametric-eq→cyan, synth
  section→blue, xy-pad→pink). The `string` *data-type* port colour is intentionally left
  violet (separate colour axis) — open decision if it should change too.
- **New nodes (Tier-A from §2), all stateless + unit-tested:**
  - **Noise** (`math/noise`) — 3D simplex + fBm; value(-1..1)/normalized(0..1); X/Y/Z +
    frequency/octaves/seed.
  - **Color Ramp** (`visual/color-ramp`) — value→colour; 7 colormaps + custom 2-stop;
    `[r,g,b,a]` output matching the Color node.
  - **Euclidean Rhythm** (`timing/euclidean`) — Bjorklund pattern (E(3,8) tresillo,
    E(5,8) cinquillo); stateless, driven by a `step` index; gate/value/pattern outputs.
  - **Easing** (`math/easing`) — shapes a 0–1 value through 20 easing curves (quad/cubic/
    sine/expo/back/elastic/bounce); stateless; composes with any 0–1 signal.
  - **Spring** (`math/spring`) — damped-oscillator physics toward a target (tension/
    friction/mass); value/velocity/atRest. First new *stateful* node this cycle —
    gc/dispose wired into ExecutionEngine + a gc regression test. A pre-flight audit
    confirmed every executor's cleanup is wired into the engine (no leaks).
- **Node body previews for the 5 new nodes** (`components/preview/{ColorRamp,Easing,
  Euclidean,Noise,Spring}Preview.vue`): a real user picked a palette/curve/rhythm blind —
  these draw a live gradient bar / easing curve / rhythm dots / noise wave / spring response
  in the node body, reusing the *exact* executor logic (PALETTES/EASINGS/bjorklund/fbmNoise)
  so the preview always matches output. Wired via a `NODE_PREVIEWS` map in BaseNode that
  forces the node non-compact (like `hasTextureOutput`) — **no `components.ts` custom-node
  entry needed** (these stay plain BaseNode nodes), which sidesteps the easy-to-miss
  registration step. NB for future rich-UI nodes: a dedicated custom component DOES require
  adding it to `registry/components.ts` `nodeTypes` (the single source `CUSTOM_NODE_TYPE_IDS`
  the flows store reads) or it silently falls back to BaseNode.
- **Testing pass.** Added tests for the subflow GC, the `register()` guard, `categoryIcons`
  exhaustiveness, the explorer tag-filter store, Color Ramp preset↔palette sync, plus full
  coverage for Noise / Color Ramp / Euclidean.

### Fixed (per-frame storms, carried from AUDIT_2026-06-16 — priority #2)
- **imageLoader asset-fail storm** (`visual.ts`): a missing assetId re-fired `getAssetUrl`
  every frame because the not-found/catch paths never latched `state.loadedUrl`. Fixed
  (a Trigger still forces a retry).
- **webcam-snapshot `getUserMedia` re-prompt loop** (`visual.ts`): after a denial it
  retried every frame. Added a `failed` latch, cleared when the device/resolution changes.
- **http-request flood** (`http.ts`): a held-true `trigger` fired a fetch every frame
  (level-trigger, in-flight flag never read). Now fires on the rising edge only + gates on
  the in-flight `:loading` flag. **Unit-tested** (existing http suite extended to 20 tests).
- **`BleAdapter` notification-listener leak** (HIGH): the handler added as
  `characteristicvaluechanged` differed from the closure stored in `notificationHandlers`,
  so it could never be removed and stacked (retaining `this`) on every reconnect. Now stores
  and removes the same handler (via a `detachNotificationListeners` helper used by
  unsubscribe/doDisconnect/dispose) and drops the prior listener on re-subscribe.
  **Unit-tested** (`BleAdapter.test.ts`, 5 cases).
- A connectivity audit precisely scoped the remaining async-robustness items (all still
  open, no GPU needed): the **mqtt/ws/http/BLE connect backoff** (no per-attempt throttle —
  ~60 connects/s while failing), **`ConnectionManager.disconnect` error-masking** → wedged
  toggle, and the shared-`autoReconnect` **clasp** mutation. Good next targets.
- A deep audit of the visual/texture subsystem confirmed all executor gc is wired and that
  a **feedback-buffer node is feasible** following the `getOrCreateRenderTarget` pattern,
  but it needs live GPU verification (not unit-testable) and the subsystem still has open
  MED texture-ownership leaks (`createTextureFromWebGL`, `disposeObject` maps,
  `TextureBridge.gc`) — see AUDIT_2026-06-16.
- **Emulator unusable after flow stop** (`engine/executors/emulation.ts`): the node
  component registers once on mount (kept alive across views), but `disposeAllEmulationNodes()`
  did `emulators.clear()` on every flow-stop — orphaning the registration so the node was dead
  with no re-registration path. Fixed: tear down the running emulator + free its texture/audio
  on stop, but **keep the registrations** (cleaned per-node by unmount/gc instead).

### Open — emulator (needs live debugging; not statically resolvable / not headless-testable)
- **Emulator → Main Output only updates one frame (on view switch); editor preview frozen at
  first frame.** Traced the whole path — it looks correct: the executor runs every frame (not
  in `PURE_NODE_TYPES`), calls `updateTexture` (sets `needsUpdate`, `texture.image` = the live
  EmulatorJS canvas), and both Main Output surfaces (editor `MainOutputNode` `drawImage`; the
  Control-tab widget `renderToCanvas`) run their own rAF loops. So the freeze is a runtime/
  WebGL behavior, not the plumbing. Prime suspects to check live: (a) the EmulatorJS canvas not
  compositing/advancing while the editor is `display:none` on the Control tab (WebGL-hidden
  throttle); (b) whether the emulator's OWN node canvas in the editor is visibly live while
  Play is running — if yes, the issue is texture capture timing; if no, EmulatorJS is paused.
  `patchForCapture` already forces `preserveDrawingBuffer:true`.

### State
Node count **208** (was 205 pre-dedupe; 203 after the dedupe, +5 for Noise/Color
Ramp/Euclidean/Easing/Spring). Verified green:
`typecheck`, `eslint`, full `test:unit`, and the production `build`. Working tree clean
(only `.DS_Store`). Nothing pushed.

### Open / next
- **`docs/AUDIT_2026-06-19.md`** — fresh whole-codebase audit (6 parallel passes). Headline:
  the Tier-1 **security** cluster (user-code "sandbox" isn't one; flow-import → one-click RCE
  on Play; `setWindowOpenHandler`/IPC path-traversal; no CSP/SSRF guard) — all carried/open.
  Then the **per-frame connect storm** (mqtt/ws/http/BLE), `ConnectionManager.disconnect`
  masking, `AIInference` worker `onerror` not rejecting pending, history/asset memory leaks,
  and the GPU texture-ownership leaks. See that doc for the prioritized fix order.
- **Tier-A WebGL nodes** (the signature visual gaps — need render-pipeline integration, not
  drop-in): **feedback buffer** (highest VJ value — trails/echo/zoom), text→texture, discrete
  image-FX, particles.
- **Control Panel allow-list ↔ `exposedControls`** (review Part 4.2): the hardcoded
  `controlNodeTypes`/`monitorNodeTypes` arrays mean custom control nodes never surface.
- **Decision:** recolour the `string` data-type port colour off violet, or keep it.
- **Carried (from `AUDIT_2026-06-16.md`):** the `with(ctx)` non-sandbox + flow-import trust
  prompt + `setWindowOpenHandler` allow-list (security); per-frame storms; lazy executor
  registration; split the `executors/index.ts` + `ai.ts` god-files.
</content>
