# LATCH — Session Handoff Log

Running log of work sessions, newest first. Each entry: what changed, current state,
and what's open. Detailed analysis lives in the dated docs under `docs/` (esp.
`NODE_LIBRARY_REVIEW_2026-06-18.md` and `AUDIT_2026-06-16.md`).

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

### Fixed — `runLiveDetection` throttle startup eagerness (`43e1ef7`)
The shared loop read `lastFrame` with a `0` default and gated on `!lastFrame`, so a stored
frame 0 read as "never ran" and re-fired detection every frame at startup (guarded from
pile-up by `pendingOperations`, but wasteful). Now uses a `-1` sentinel. Found by the new
**runLiveDetection tests** (throttle + cache + topLabel) covering both Tier A and Tier B.

### State
Vision total: **12 nodes** (snapshot, object-detection-live, object-detection-yolo, 9× cv-*).
**22 vision unit tests** (9 opencv + 10 yolo + 3 live-detection). Working tree clean.

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
