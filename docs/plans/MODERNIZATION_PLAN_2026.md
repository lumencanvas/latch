# LATCH Modernization Plan — 2026

> Companion to [`docs/MODERNIZATION_ASSESSMENT_2026-06.md`](../MODERNIZATION_ASSESSMENT_2026-06.md).
> This is the **single source of truth for tracking** the modernization work.
> Durable rules live in `/CLAUDE.md`; running context lives in the agent memory
> system. `HANDOFF.md` is now for detailed per-change logs only.

## How to use this doc

- **Test-driven:** each task lists its test(s). Write/extend the test, watch it
  fail, implement, watch it pass. Baseline (measured 2026-06-14 via
  `npm run test:unit`): **1096 passing / 11 todo (1107 total)** — no phase may
  merge with fewer green than baseline + its new tests. (Note: HANDOFF.md's
  "812 passing" figure was stale; the live suite is the source of truth.)
- **Single branch (`modernization`) for all phases** (decided 2026-06-14 with the
  user). The per-phase branch names below are kept as task labels / commit
  scopes, not separate branches. Every commit must keep `npm run typecheck` +
  `npm run test:unit` green; the branch merges to `main` as one reviewable PR
  (or in phase-sized chunks if the user prefers).
- **Tracking:** tick the `[ ]` boxes as work lands. Update the Status Board.
- **No AI attribution in commits** (see `/CLAUDE.md`).
- **Acceptance criteria** are binary — a phase is "done" only when all are met.

## Status Board

| Phase | Title | Branch prefix | Status | Risk |
|------:|-------|---------------|--------|------|
| 0 | Foundation, headers & test guardrails | `modernization` | ◐ Done (headers want 1× browser check) | Low |
| 1 | Render loop & lifecycle | `modernization` | ◐ Core complete (reduced-motion node-wiring follow-up) | Low |
| 2 | Execution engine evolution | `modernization` | ◐ Oracle + dirty mode + async-defer done (all opt-in, tested); only flip-defaults (needs in-app validation) + optional trigger-edges remain | **High** |
| 3 | Staged dependency upgrades | `modernization` | ☑ All done (3a Vue Flow, 3b three r184, 3c clasp v4, 3d transformers v4) | Med |
| 4 | ML modernization (WebLLM + RAG + caching) | `modernization` | ☑ Code-complete (RAG + catalog + transfer + persistent-storage + WebLLM streaming node); WebGPU streaming needs 1× browser validation | Med |
| 5 | Mobile / touch tier | `mod/p5-*` | ◐ p5-capability (+ BaseNode requirement-badge wiring) + p5-audio-unlock done; touch-connect / layout / osc-bridge next | Med |
| 6 | Three.js TSL / WebGPU (flagship) | `mod/p6-tsl` | ☐ Not started | **High** |

Legend: ☐ not started · ◐ in progress · ☑ merged.

Dependency order: **0 → 1 → 2** are sequential. **3** (upgrades) can run in
parallel with 1 once 0 lands. **4** depends on **3d** (transformers.js v4). **5**
depends on **1**. **6** depends on **3b** (three r184). Do **2** before **6**.

---

## Phase 0 — Foundation, headers & test guardrails  `mod/p0-*`

**Goal:** unlock threaded WASM, kill the cheap perf bug, and establish the TDD/CI
cadence everything else relies on.

- [x] `mod/p0-headers` (implemented — ⚠ acceptance pending in-browser verification) — Added COOP `same-origin` + COEP **`credentialless`** to `netlify.toml` and to Vite `server` + `preview` in `vite.config.ts`. Chose `credentialless` over `require-corp` so cross-origin HF model weights + MediaPipe WASM (fetched no-cors) still load; Safari (no credentialless) degrades gracefully to non-isolated/single-threaded. Added `src/renderer/vite-env.d.ts` (`vite/client` types — project was missing them) and a dev-only `crossOriginIsolated` console log in `main.ts`.
  - **Test:** `tests/unit/config/cross-origin-isolation.test.ts` guards the headers in both files against silent removal. (Runtime `crossOriginIsolated` can't be unit-tested — verified via the dev console log.)
  - **Host-agnostic (resolved):** prod is Netlify now, migrating to DigitalOcean App Platform later. Vendored `public/coi-serviceworker.min.js` (v0.1.7, MIT) wired into `index.html` injects COOP/COEP on any static host and no-ops when the server already sets them (Netlify). Works across the Netlify→DO swap with no code change; Electron renderer unaffected (different entry). Default is credentialless, matching the server header.
  - **Acceptance:** ◐ implemented host-agnostically; final sign-off still wants a one-time in-browser check that `self.crossOriginIsolated === true` and AI/MediaPipe nodes load (use the dev console log in `main.ts`).
- [x] `mod/p0-engine-map` — Replaced O(n²) `nodesSnapshot.find(...)` with a `nodeById` `Map<id,node>` rebuilt once per `updateGraph`; `executeFrame` resolves nodes in O(1).
  - **Test:** `tests/unit/engine/ExecutionEngine.test.ts` (7 characterization tests: topo order, output propagation, value retrieval, controls, diamond merge, graph re-sort) written green against the pre-refactor code, still green after — proving behavior unchanged.
  - **Acceptance:** ✅ identical outputs, lookups O(1). Full suite 1103 passing / 11 todo, typecheck clean.
  - **Note / follow-up:** discovered that `updateGraph`'s GC path (`gcVisualState`) eagerly constructs a `ThreeShaderRenderer`/`WebGLRenderer` even when only collecting garbage — forces a GL context where none is needed (and breaks in headless tests). Fold a lazy-GC fix into Phase 2 or a `mod/p0-*` follow-up.
- [x] `mod/p0-ci` — Already satisfied: `.github/workflows/ci.yml` already runs `typecheck` + `lint` + `test:unit` + `build:web` on PRs to `main` (verified, not assumed). No new workflow needed. Baseline green documented above (1096 → now 1105 with new tests).
  - **Follow-up (not blocking):** `ci.yml`'s `deploy-web` job pushes to GitHub Pages, which conflicts with the COOP/COEP headers goal — fold into the `mod/p0-headers` deploy-target decision.
  - **Acceptance:** ✅ CI gates every `mod/*` PR.

---

## Phase 1 — Render loop & lifecycle  `mod/p1-render-loop`

**Goal:** the `ExecutionEngine` rAF loop becomes a good citizen — mandatory for
mobile, free wins on laptops.

- [x] Pause on `document.hidden` via `visibilitychange`; resume cleanly. `ExecutionEngine` cancels rAF when hidden (keeps "running" status), and on return resets frame timing before rescheduling so time-based nodes don't jump. User-initiated `pause()` detaches the listener so a focus change can't silently resume.
- [x] Optional FPS cap — `setTargetFps()`/`getTargetFps()` (default 0 = uncapped); `scheduleLoop()` gates execution via the pure `shouldRenderFrame()` helper, still scheduling rAF each tick.
- [x] Delta clamp — added `MAX_FRAME_DELTA` (0.25s) + pure `clampDelta()` in `executeFrame`, so a hidden tab / sleep / breakpoint can't produce a multi-second frame.
- [x] DPR — **already conservative**: renderers hardcode `setPixelRatio(1)` (verified). Raising it would cost mobile perf, so left as-is; added `clampDevicePixelRatio()` util for future per-device tuning.
- [~] `prefers-reduced-motion` — `prefersReducedMotion()` util added (accessibility + battery). Exposed for nodes/loop to honor; wiring individual animated nodes to it is a follow-up.
- **Tests:** `tests/unit/engine/ExecutionEngine.test.ts` (+9: timing helpers, hidden→pause, visible→resume, no-resume-after-user-pause, fps clamp, fps-cap skips early frames via mocked rAF) and `tests/unit/utils/platform.test.ts` (+4). All green.
- **Acceptance:** ✅ backgrounding stops ticking without losing running state; foreground resumes with no time jump; FPS cap verified. Full suite 1121 passing / 11 todo, typecheck + lint clean.
- **Audit (2026-06-14):** adversarial re-review found a concurrency race — the loop re-armed after `await executeFrame()` with no recheck, so a hide-during-frame + resume could spawn a *second* loop (2× execution). Fixed with a monotonic `loopToken` (stale loops don't re-arm; `invalidateLoop()` on stop/pause/hidden) + regression test. Also confirmed Electron is unaffected by the web-only coi-serviceworker (renderer uses `src/renderer/index.html`), and `npm run build:web` ships the shim correctly.

---

## Phase 2 — Execution engine evolution  `mod/p2-engine-*`  ⚠️ High risk — heaviest test investment

**Goal:** stop re-running the whole graph every frame; stop async nodes stalling
the frame. This is the core architectural bet (cables.gl's value-vs-trigger model).

- [x] `mod/p2-golden-tests` (FIRST) — Built a reusable harness (`tests/unit/engine/golden/flowHarness.ts`) that runs a flow through a real `ExecutionEngine` (all built-in executors) for N frames with a **mocked deterministic clock**, capturing serializable per-node outputs. Committed golden snapshots for 5 canonical flows (pure-static, time-driven, LFO, diamond, stateful-smooth) in `golden-flows.test.ts`. Verified deterministic + stable across re-runs (LFO oscillates frame-to-frame; pure-static constant). This is the oracle the dirty-flag rewrite must reproduce, and the harness's `configure` hook + `runFlow` snapshots are reused for full-vs-dirty equivalence next.
- [x] `mod/p2-dirty-flags` — Change-driven execution implemented as an **opt-in mode** (`setExecutionMode('dirty')`; default stays `'full'` → zero risk). A node runs only if it's not a verified-pure type (always run) or — for pure types — it never ran / its controls changed / an upstream output changed this frame. Skipped pure nodes keep prior outputs (identical to what full mode would recompute). Pure-set is the 24 directly-read types in `PURE_NODE_TYPES`; everything else is always-run (safe default). Incoming adjacency precomputed in `updateGraph` for O(indegree) propagation; control snapshots GC'd on node removal.
  - **Test:** `golden/dirty-equivalence.test.ts` — dirty mode is **byte-identical to full** on all 5 canonical flows (incl. time/LFO/mixed continuous sources); idle test: pure-static + diamond execute everything once then **0/frame**; time-driven correctly stays 3/frame (no false idle). Plus `ExecutionEngine.test.ts` dirty unit tests: control-edit re-run, input propagation, non-pure always-runs, mode round-trip. Full suite green, golden snapshots unchanged.
  - **Remaining before flipping the default:** broader node-type coverage of the pure-set and real-app validation. Default intentionally left `'full'`.
- [x] `mod/p2-async-nonblocking` — Implemented as an **opt-in `deferredNodeTypes` set** (default empty ⇒ no behavior change). Reading the executors first showed a blanket change is **unsafe**: 36 executors are async and most are per-frame nodes (MediaPipe, webcam, audio-input, clasp video) that intentionally `await` each frame — fire-and-latching them would degrade AI/vision. So only opted-in long-I/O types fire-and-latch (kick off, serve cached, apply on resolve), with an in-flight guard *before* calling the executor (no request storm), out-of-band results dropped after stop(), and dirty-mode propagation via `pendingAsyncChange`. See docs/AUDIT_2026-06-14.md.
  - **Test:** `ExecutionEngine.test.ts` deferred suite — non-deferred async unchanged; deferred async doesn't block the frame and doesn't re-fire while pending; result lands out-of-band and is dropped after stop(); propagates to a downstream pure node in dirty mode. Full suite 1143 passing, golden snapshots unchanged.
  - **Enablement deferred (needs in-app validation):** turning on `http`/`http-request` + heavy generative AI. MediaPipe/webcam/audio-input must NEVER be deferred.
- [ ] `mod/p2-trigger-edges` (optional, can defer) — Distinct trigger/exec edge type separate from value edges, driving render order explicitly.
  - **Test:** trigger fan-out order is deterministic and documented.
- **Acceptance:** all golden flows match; static graphs idle at ~0 executions/frame; async nodes never drop frame rate; baseline tests still green.

---

## Phase 3 — Staged dependency upgrades (one branch each)  `mod/p3-*`  Med risk

Each sub-phase is **its own branch**, merged independently, typecheck + tests gated.

- [x] `mod/p3a-vueflow` — **Already installed**: `node_modules`/lockfile were on `core 1.48.2 / background 1.3.2 / controls 1.1.3 / minimap 1.5.4` (carets resolved to latest); only `package.json` still declared the old floors. Aligned `package.json` to the real versions and enabled `:only-render-visible-elements="true"` on the editor `<VueFlow>` (large-graph DOM virtualization). The "auto handle IDs removed" 1.4x break does NOT affect LATCH — handles use explicit `:id` and edges carry explicit handles (verified). `@vue-flow/node-resizer` deferred (a feature needing per-node UI integration, not a bump).
  - **Test:** `tests/unit/config/vue-flow.test.ts` guards the version floors + the perf flag; `npm run build:web` passes on 1.48.2; full suite green (1146).
  - **Needs 1× visual check:** `onlyRenderVisibleElements` can have offscreen-edge rendering quirks (xyflow #4329/#4516); execution is unaffected (uses store data, not DOM). Confirm panning a large graph looks right.
- [x] `mod/p3b-three` — `three` r162 → **r184** + `@types/three` 0.162 → 0.184.1 (lockstep), WebGLRenderer path only. **Small blast radius** (verified): the scary breaks (color management, lights, postprocessing OutputPass) all landed at r152–r155, already in our r162 baseline; our code has no deprecated encoding constants / legacy lights / `lightmap_fragment` chunk, sets `stencil` explicitly, and doesn't force WebGL1. The only fixes were **6 type-only casts** for stricter `@types/three` 0.184 signatures (`texture.image` → `{}`; `renderer.properties.get()` → `unknown`) in ai.ts/visual.ts/TextureBridge.ts/ThreeRenderer.ts/MainOutputNode.vue — zero runtime change. `@webgpu/types` stays (provided by pixi.js, not @types/three).
  - **Test:** `tests/unit/config/three.test.ts` guards the r184 floor + types lockstep. **Browser-validated** (Playwright + system Chrome): r184 `WebGLRenderer` + GLSL `ShaderMaterial` rendered a fixture and `readRenderTargetPixels` returned the exact shader color `[255,0,0,255]` on a WebGL2 context; app mounts with zero console errors. Suite 1237 green; typecheck + lint + build:web clean.
  - **Remaining:** per-shader-node visual regression (rendering each app shader node end-to-end) is a heavier harness; the r184 runtime + our type-compat + clean app load are proven.
- [x] `mod/p3c-clasp` — `@clasp-to/core` **3.3.2 → 4.3.2**. **Drop-in bump** — verified against npm + the first-party source (lumencanvas/clasp): the surface LATCH uses (`Clasp`, `ClaspBuilder`, `Value`, imported in `executors/clasp.ts` + `ClaspAdapter.ts`) is **identical** in v4; only additive changes (a `browser` export field; an optional 3rd arg on `set()`); deps unchanged (`@msgpack/msgpack` only); no peer deps. **Stayed on `core`, not `@clasp-to/sdk`** (sdk is a higher-level wrapper *built on* core — adopting it would be a rewrite, out of scope). Zero code changes; typecheck + lint + `build:web` green (the new `browser` export resolves fine under Vite).
  - **Test:** `tests/unit/config/clasp.test.ts` guards the v4 floor. Suite 1235 green.
  - **Needs runtime check:** realtime send/receive + video chunking against a live CLASP server (can't be unit-tested without a peer).
- [x] `mod/p3d-transformers` — Bumped `3.8.1 → 4.2.0`. Verified against installed type defs: `env.allowLocalModels`/`useBrowserCache` and `pipeline`/`env` exports unchanged → **typecheck passes with zero code changes**; `build:web` succeeds (browser export resolved, `sharp`/nightly-ORT not bundled); suite green (1147). `@huggingface/tokenizers`/`jinja` come as auto deps (not a manual split). Config test guards the v4 floor.
  - **Runtime-validation gap:** worker uses `(pipeline as any)`, so v4 runtime changes to `device`/`dtype`/chat `messages`/`progress_callback` aren't caught headless — confirm a model loads + runs in a browser. 52 npm advisories from the heavy tree (sharp/dev-ORT) — review later, don't `audit fix --force`.
  - **Unlocks Phase 4:** q1/q2 dtypes, WebGPU runtime, refreshed model catalog.
- **Acceptance (per branch):** typecheck + tests green; no regression in the touched subsystem.

---

## Phase 4 — ML modernization  `mod/p4-*`  Med risk · depends on 3d

**Goal:** current, streaming, capable in-browser ML with clever context handling.

- [x] `mod/p4-webllm` — Added `@mlc-ai/web-llm` **0.2.84** (version + API network-verified) as a streaming **LLM (Streaming)** node. The ~14 MB WebGPU runtime is **dynamic-imported inside the engine factory** and the engine runs in a dedicated `webllm.worker.ts` — build confirms it lands in its own lazy ~6 MB chunk, NOT the main bundle. `services/ai/WebLLMService.ts` owns one active engine + per-node streaming state (fire-and-latch: the executor kicks generation off without awaiting and reads accumulated tokens each frame, so the render loop never blocks); injectable engine factory + gpuCheck make it fully unit-testable without loading real web-llm. `services/ai/webgpu.ts` gates on `navigator.gpu.requestAdapter()`. Node (`registry/ai/llm.ts`): prompt/system/trigger in → text/generating/done/supported out; model select (6 verified MLC ids, Llama-3.2-1B default), maxTokens/temperature. Cleanup wired: `gcWebLLMState` (node removal) + `disposeAllWebLLMState` (stop → engine.unload + worker.terminate).
  - **Test:** `webllm-service.test.ts` (6, mock engine) — streaming accumulation to done, WebGPU-unsupported state, error capture, message/param forwarding, engine reuse-vs-reload, gc/dispose; `webgpu.test.ts` (4) — adapter gate; `llm.test.ts` (3) — idle output + unsupported-after-trigger (jsdom has no WebGPU, so this exercises the real gate) + no-prompt no-op. Suite 1224 green; typecheck + lint + build:web clean.
  - **Needs in-browser validation (WebGPU-only — cannot verify headless):** actual model download + token streaming on a WebGPU browser; multi-node concurrency (one shared engine) and `interruptGenerate` behavior.
- [x] `mod/p4-catalog` — Refreshed `AI_MODELS` (`AIInference.ts`). Repo ids + sizes **network-verified against live Hugging Face pages on 2026-06-14** (ONNX/transformers.js support confirmed; do NOT trust memory for ids/casing). Added to text-generation: Qwen2.5-0.5B/1.5B-Instruct, Qwen3-0.6B/1.7B, SmolLM2-360M/1.7B, Llama-3.2-1B/3B-Instruct-ONNX, gemma-3-1b/270m, Phi-4-mini-instruct (replaces stale Phi-3), and the verified `onnx-community/Qwen3-0.6B-heretic-abliterated-uncensored-ONNX`. Embeddings gained nomic-embed-text-v1.5 (768-dim) + gte-small. Speech alternates moved to canonical `onnx-community/whisper-*`. Removed the **unresolvable `Xenova/mobilenet_v3_large`** → verified `onnx-community/mobilenetv4_conv_small…`. Schema extended with a required **`license`** (`ModelOption`) + **`defaultLicense`** (`ModelDefinition`); every entry now carries an SPDX-ish license id. **Defaults intentionally left unchanged** (conservative: small/proven repos) — modern models are opt-in alternates; the only schema consumer (`AIModelManagerModal.vue`) reads `id/name/size/webgpu`, so adding `license` is non-breaking.
  - **Test:** `tests/unit/services/ai-catalog.test.ts` (10) — structural completeness, unique task ids, well-formed `org/name` repo ids, default resolvable within its task, no intra-task dup ids, license present on every model, modernization additions present (Llama-3.2/Qwen/Phi-4-mini/SmolLM2/gemma-3 + a modern embedder), and `mobilenet_v3` absent. Suite 1191 green; typecheck + lint + build:web clean.
  - **Needs in-browser check (joins the v4 runtime item):** actual load+run of the new ids (esp. Llama/Gemma may hit a gated license click-through; Phi-4-mini/Qwen/SmolLM2 are ungated). **Optional follow-up:** promote a small modern ungated model (e.g. Qwen2.5-0.5B-Instruct) to the text-gen default, and surface `license` in the model-manager UI — both deferred as behavior/UI changes.
- [x] `mod/p4-cache` — Added `services/ai/modelStorage.ts`: capability detection (`isOPFSAvailable`/`isCacheApiAvailable`), `preferredCacheBackend()` (OPFS → Cache API → none), memoized `requestPersistentStorage()` (wired into `AIInferenceService` init — fire-and-forget), and `getStorageEstimate()` (surfaced as a "X GB free for models" line in `AIModelManagerModal.vue`, refreshed on open + after Clear Cache).
  - **Network-verified scoping (2026-06, see docs/AUDIT):** transformers.js v4 caches weights via the **Cache API** (`env.useBrowserCache`, key `transformers-cache`) and supports a custom cache via `env.useCustomCache`/`env.customCache` (string-keyed `match`/`put`). BUT OPFS and the Cache API share **one per-origin quota with all-or-nothing LRU eviction**, so OPFS gives **no persistence benefit** — its only win is resumable/chunked downloads (transformers.js #1220, unimplemented upstream). The real eviction protection is `persist()`. **Therefore a naive OPFS `customCache` is strictly worse than the default (more code, same eviction, no resume) and is intentionally DEFERRED**; the detection + selection logic is in place so an OPFS backend (paired with chunked downloads) can be added as a later phase.
  - **Test:** `tests/unit/services/model-storage.test.ts` (12) — OPFS/Cache-API detection, `preferredCacheBackend` selection + Cache-API fallback when OPFS absent, `requestPersistentStorage` memoized/once + already-persisted short-circuit + no-throw on reject/unavailable, `getStorageEstimate` headroom math + zero-quota + null safety. Suite 1210 green; typecheck + lint + build:web clean.
  - **Needs in-browser check:** `persist()` grant (Chromium auto-decides on engagement; Firefox prompts) and the estimate line rendering. Both fold into the existing AI in-browser validation pass.
- [x] `mod/p4-transfer` — Replaced `Array.from(imageData.data)` in `imageToSerializable` with a `Uint8ClampedArray` payload whose backing `ArrayBuffer` is **transferred** (zero-copy). `sendToWorker` now derives the transfer list via the new pure `services/ai/imageTransfer.ts` `collectTransferables()` (scans args for `ArrayBufferView`s) and passes it to `postMessage`. Worker reconstructs via a `toPixels()` helper that uses the transferred typed array directly (no re-copy). Caller-owned `ImageData` is copied (not transferred) so it isn't detached; fresh `getImageData` buffers (canvas/img paths, the common vision case) transfer directly. Audio is sent as `number[]`, so it's never accidentally transferred. New-TS-lib `Uint8ClampedArray<ArrayBufferLike>` vs `<ArrayBuffer>` resolved with a sound cast (transferred buffers can't be SharedArrayBuffer).
  - **Test:** `tests/unit/services/image-transfer.test.ts` (4) — `collectTransferables` returns the pixel buffer (zero-copy) for image messages, nothing for strings/numbers/plain-array/empty args, and collects multiple buffers. (Full pixel round-trip through OffscreenCanvas is browser-only — folds into the transformers.js v4 vision check.) Suite 1198 green; typecheck + lint + build:web clean.
- [◐] `mod/p4-rag` — **Retrieval core done**: `services/ai/VectorStore.ts` — a dependency-free in-memory cosine vector store (`add`/`query` top-k/`remove`/`clear`/`toJSON`/`fromJSON`, dimension enforcement, graceful 0-score on bad vectors). Chose this over Orama/PGlite: zero new dep, fully unit-testable, sufficient for the thousands-of-vectors range; persistence rides existing Dexie via toJSON/fromJSON. 12 tests (cosine correctness, top-k ordering, dim mismatch, round-trip, edge cases). Suite 1159 green.
  - **Retrieve node done** (`registry/ai/retrieve.ts` + `retrieveExecutor`): pure, offline node — Corpus (`[{vector,text}]`) + Query embedding → top-K `matches` + newline-joined `context` (ready for prompt injection) + `bestText`. Robust to malformed inputs (0-score, no throw). 6 executor tests. **Embed already exists** as the `feature-extraction` "Text Embed" node, so Embed→Retrieve is a usable pair now.
  - **Vector Memory node done** (`registry/ai/vector-memory.ts` + `vectorMemoryExecutor`): a **stateful**, incrementally-built corpus. Inputs `vector`/`text` + rising-edge `add`/`clear` triggers; outputs `corpus` (`[{id,vector,text}]`, drops straight into Retrieve) + `count`. Backed by a per-node `VectorStore` in a module Map keyed by `nodeId`, with a `maxSize` ring-buffer cap (0 = unlimited) to bound memory in long sets. Rising-edge detection means a held trigger adds only once; malformed embeddings (empty / dim mismatch) are ignored, never thrown. Corpus output keeps a stable reference between frames (rebuilt only on mutation). Cleanup wired per convention: `disposeVectorMemoryNode`/`gcRAGState` (node removal, in `updateGraph` GC) + `disposeAllRAGState` (on `stop()`). 16 executor tests incl. a Vector Memory→Retrieve integration test and same-frame add/clear ordering. Suite 1181 green; typecheck + lint + build:web clean.
  - **Audited (2026-06-14, post-impl):** verified by reading actual code — (a) the stable corpus-reference is correct *and* beneficial under dirty mode (`outputsDiffer` is `Object.is`-based; every content change rebuilds the snapshot → new ref → flagged; unchanged frames keep the ref → downstream Retrieve correctly skipped, no stale-skip path); (b) real embeddings arrive as plain `number[]` (worker `Array.from(output.data)`), so the `Array.isArray` guard accepts live model output — this also validates the previously fixture-only Embed→Retrieve pair; (c) all port wirings type-check against the compatibility matrix (`data→data`, `string→string`, `trigger→trigger`).
  - **Remaining:** (1) **node-level corpus persistence** — the corpus is runtime-only (cleared on `stop()`, lost on flow reload), consistent with every other stateful node; surviving reload needs a new flow-doc/Dexie persistence hook (the `VectorStore` service already exposes `toJSON`/`fromJSON`). (2) optional **LLMLingua-2** compress node.
  - **Test (done):** deterministic top-k on fixtures, dimensionality enforcement, JSON round-trip; Vector Memory add/accumulate/clear/evict/guards/per-node-isolation/dispose + corpus→Retrieve interop. (Compression is node-level, pending.)
- **Acceptance:** a streaming LLM node runs a current model end-to-end on WebGPU; RAG retrieval feeds an LLM node; large weights persist across reload.

---

## Phase 5 — Mobile / touch tier  `mod/p5-*`  Med risk · depends on 1

**Goal:** usable on tablet/phone as a capability-reduced tier.

- [ ] `mod/p5-touch-connect` — Vue Flow `connect-on-click` (tap→tap), enlarged handle hit-targets (invisible wrapper), `connectionMode: Loose`, `touch-action: none`, branch interactions on `pointerType`.
  - **Test:** component test simulating touch tap-source→tap-target creates an edge.
- [x] `mod/p5-capability` (matrix + helper; node-UI wiring is the follow-up) — Extended `utils/platform.ts`: added `webgpu` + `camera` to `PlatformCapabilities`; added `isIOS`/`isAndroid`/`isMobile` (iPadOS-as-desktop handled) + `getPlatformTier()` (`electron`/`ios-web`/`android-web`/`desktop-web`); added `getCapabilityStatus(cap)` → `{ available, reason?, suggestion? }` so a node can render a clear "unavailable here — use the desktop app / CLASP Bridge / a Chromium browser" state instead of failing silently.
  - **Test:** `tests/unit/utils/platform-capabilities.test.ts` (9) — tier detection + capability matrix for iOS Safari / Android Chrome / desktop-web / Electron (navigator/window stubbed per tier), and `getCapabilityStatus` available vs. unavailable-with-suggestion. Suite 1234 green; typecheck + lint + build:web clean.
- [x] `mod/p5-capability-badge` (the wiring follow-up — done) — Designed the **per-platform requirement model** the AUDIT flagged as the prerequisite (capability-duality: serial/MIDI/BLE work via the native Electron path **OR** the Web API, so a single capability key would show a false "unavailable" badge in Electron). Added `NodeRequirement` (`'serial'|'midi'|'bluetooth'|'webgpu'|'camera'`) + `resolveNodeRequirement()` to `utils/platform.ts` — each requirement is satisfied if ANY of its `satisfiedBy` capabilities is present, so it resolves available on whichever path works. Added an optional `requires?: NodeRequirement[]` to `NodeDefinition` and tagged the 9 gated nodes (serial, midi-in/out, ble/-device/-scanner/-characteristic, llm→webgpu, webcam→camera). `BaseNode.vue` renders an amber warning row (`AlertTriangle` + reason + suggestion) when `resolveNodeRequirement` reports any unmet requirement and the node isn't collapsed.
  - **Test:** `platform-capabilities.test.ts` (+7) — duality matrix: serial available on Electron (native) AND desktop Chrome (web) but not iOS; midi via either path; bluetooth Android-yes/iOS-no; webgpu Chromium suggestion; camera available on iOS (no badge). `tests/unit/registry/node-requirements.test.ts` (10) — pins each gated node's `requires` tag and asserts OSC (bridge-based) stays untagged. Suite 1262 green; typecheck + lint + build:web clean.
  - **Browser-validated** (Playwright + Chrome, via the Pinia store on `__vue_app__`): with `navigator.serial` deleted, a placed Serial node renders the badge ("Serial access needs the desktop app or a browser with Web Serial. Use the desktop app or a CLASP Bridge.", amber `--color-warning` border, AlertTriangle); in the unmodified environment (serial + WebGPU present) the Serial and LLM nodes render with **no** badge — confirming no false positives. Zero console errors.
- [ ] `mod/p5-layout` — Properties/Control panels → modal bottom sheets w/ drag handles on small breakpoints; long-press radial menu on canvas; 44pt/48dp targets.
  - **Test:** breakpoint switch renders bottom sheet; dismiss affordance present.
- [x] `mod/p5-audio-unlock` — Pure `services/audio/audioUnlock.ts` (`needsUserGesture`, `isAudioRunning`, `tryResumeAudio`, `ExtendedAudioState` incl. iOS `interrupted`) wired into `AudioManager`: added an `'interrupted'` state, a `needsUserGesture` flag (in `AudioManagerState`/`getState`), an `unlock()` gesture entry point (initializes on first call, returns running), and a `statechange` watcher that silently recovers on desktop / flags needs-gesture on iOS (detached in `dispose()`). Tone.js start stays gesture-gated (unchanged).
  - **Test:** `tests/unit/services/audio-unlock.test.ts` (8) — gesture-required for suspended/interrupted; `tryResumeAudio` recovers suspended + iOS-interrupted, returns false (no throw) when resume rejects (needs gesture) or stays non-running, and skips a closed context. Suite 1245 green; typecheck + lint + build:web clean.
  - **Follow-up:** a UI "Enable Audio" affordance bound to `audioManager.unlock()` / `state.needsUserGesture` (thin; the service logic + recovery are done).
- [ ] `mod/p5-osc-bridge-first` — Make OSC-over-WebSocket (CLASP Bridge) the recommended/default transport on mobile.
- **Acceptance:** a non-trivial flow is buildable and runnable on an iPad and an Android phone; unsupported hardware nodes degrade gracefully; audio starts on gesture.

---

## Phase 6 — Three.js TSL / WebGPU  `mod/p6-tsl`  ⚠️ High risk · depends on 3b, 2 · behind a flag

**Goal:** WebGPU rendering + a node-native shader graph; eliminate GLSL-string
injection. Staged behind a feature flag with WebGL2 fallback.

- [ ] `mod/p6-renderer` — Introduce `three/webgpu` `WebGPURenderer` (async `init()`) behind a flag; keep `WebGLRenderer` as default + fallback.
  - **Test:** renderer factory selects WebGPU when available, falls back otherwise; fixture scene renders on both.
- [ ] `mod/p6-tsl-node` — Prototype one TSL-backed shader node compiling a TSL graph to WGSL+GLSL; validate against an existing GLSL shader node's output.
  - **Test:** TSL compile snapshot; visual parity (within tolerance) vs the GLSL equivalent.
- [ ] `mod/p6-postfx` — Rebuild postprocessing (blur/blend) on TSL-native `pass()`/`bloom()`/`gaussianBlur()` where WebGPU is active.
  - **Test:** effect output parity vs current EffectComposer path.
- **Acceptance:** WebGPU path renders the sample flows with WebGL2 fallback intact; at least one shader effect runs through TSL end-to-end.

---

## Out-of-scope / watch list (not scheduled)

- Vue Flow v2 (alpha unshipped — re-evaluate when released).
- Splitting the monolithic executors (`ai.ts`/`connectivity.ts`/`visual.ts`) — fold into the phase that touches each.
- PWA install/offline packaging — natural follow-on to Phase 5 + Phase 4 caching.

## Definition of Done (whole effort)

All phase acceptance criteria met; test count ≥ baseline + new tests, all green;
`typecheck` clean; assessment doc claims either resolved or re-flagged; CLAUDE.md
+ memory updated with any new durable facts.
