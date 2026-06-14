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
| 3 | Staged dependency upgrades | `modernization` | ◐ 3a Vue Flow + 3d transformers v4 done; 3b three / 3c clasp next | Med |
| 4 | ML modernization (WebLLM + RAG + caching) | `modernization` | ◐ RAG retrieval core (VectorStore) done; nodes + WebLLM + catalog + cache next | Med |
| 5 | Mobile / touch tier | `mod/p5-*` | ☐ Not started | Med |
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
- [ ] `mod/p3b-three` — `three` r162 → r184 on the **existing WebGLRenderer path only** (no TSL yet).
  - **Test:** shader + 3D render regression (hash/snapshot of rendered canvas for fixture scenes); `@types/three` bumped in lockstep.
- [ ] `mod/p3c-clasp` — `@clasp-to/core` 3.3.2 → 4.x. Read the first-party CHANGELOG for the v3→v4 break first; evaluate adopting `@clasp-to/sdk`.
  - **Test:** `ClaspAdapter` + clasp executor unit tests; video send/receive smoke.
- [x] `mod/p3d-transformers` — Bumped `3.8.1 → 4.2.0`. Verified against installed type defs: `env.allowLocalModels`/`useBrowserCache` and `pipeline`/`env` exports unchanged → **typecheck passes with zero code changes**; `build:web` succeeds (browser export resolved, `sharp`/nightly-ORT not bundled); suite green (1147). `@huggingface/tokenizers`/`jinja` come as auto deps (not a manual split). Config test guards the v4 floor.
  - **Runtime-validation gap:** worker uses `(pipeline as any)`, so v4 runtime changes to `device`/`dtype`/chat `messages`/`progress_callback` aren't caught headless — confirm a model loads + runs in a browser. 52 npm advisories from the heavy tree (sharp/dev-ORT) — review later, don't `audit fix --force`.
  - **Unlocks Phase 4:** q1/q2 dtypes, WebGPU runtime, refreshed model catalog.
- **Acceptance (per branch):** typecheck + tests green; no regression in the touched subsystem.

---

## Phase 4 — ML modernization  `mod/p4-*`  Med risk · depends on 3d

**Goal:** current, streaming, capable in-browser ML with clever context handling.

- [ ] `mod/p4-webllm` — Add `@mlc-ai/web-llm` as a **streaming LLM node** alongside transformers.js (separate worker; WebGPU-gated with graceful "not supported" state). Stream tokens as a live node output.
  - **Test:** worker contract test (mocked engine) for streaming chunks; capability gate returns clear error without WebGPU.
- [ ] `mod/p4-catalog` — Refresh `AI_MODELS` (`AIInference.ts:63`): add Llama-3.2-1B/3B, Qwen3, Phi-4-mini, and the ONNX abliterated options; mark per-model WebGPU/size/license; deprecate stale entries.
  - **Test:** catalog schema validation; every `defaultModel` resolvable.
- [ ] `mod/p4-cache` — Abstract model caching to prefer **OPFS** for multi-GB weights; call `navigator.storage.persist()`; surface `navigator.storage.estimate()` headroom in the model manager UI.
  - **Test:** cache backend selection logic; persist() requested once; fallback to Cache API when OPFS absent.
- [ ] `mod/p4-transfer` — Replace `Array.from(imageData.data)` (`AIInference.ts:927`) with transferable `ImageBitmap`/`ArrayBuffer` to the worker.
  - **Test:** round-trip image fidelity; assert no structured-clone of large arrays.
- [◐] `mod/p4-rag` — **Retrieval core done**: `services/ai/VectorStore.ts` — a dependency-free in-memory cosine vector store (`add`/`query` top-k/`remove`/`clear`/`toJSON`/`fromJSON`, dimension enforcement, graceful 0-score on bad vectors). Chose this over Orama/PGlite: zero new dep, fully unit-testable, sufficient for the thousands-of-vectors range; persistence rides existing Dexie via toJSON/fromJSON. 12 tests (cosine correctness, top-k ordering, dim mismatch, round-trip, edge cases). Suite 1159 green.
  - **Remaining:** the **Embed / Vector Store / Retrieve nodes** that wire this to the feature-extraction model (Embed needs runtime model validation); optional **LLMLingua-2** compress node.
  - **Test (done):** deterministic top-k on fixtures, dimensionality enforcement, JSON round-trip. (Embedding dimensionality + compression are node-level, pending.)
- **Acceptance:** a streaming LLM node runs a current model end-to-end on WebGPU; RAG retrieval feeds an LLM node; large weights persist across reload.

---

## Phase 5 — Mobile / touch tier  `mod/p5-*`  Med risk · depends on 1

**Goal:** usable on tablet/phone as a capability-reduced tier.

- [ ] `mod/p5-touch-connect` — Vue Flow `connect-on-click` (tap→tap), enlarged handle hit-targets (invisible wrapper), `connectionMode: Loose`, `touch-action: none`, branch interactions on `pointerType`.
  - **Test:** component test simulating touch tap-source→tap-target creates an edge.
- [ ] `mod/p5-capability` — Extend `utils/platform.ts` into a capability matrix (MIDI/Serial/BLE/WebGPU/getUserMedia per platform); nodes show a clear "unavailable on this platform — use CLASP Bridge / Electron" state instead of failing.
  - **Test:** matrix unit tests for iOS Safari / Android Chrome / desktop / Electron.
- [ ] `mod/p5-layout` — Properties/Control panels → modal bottom sheets w/ drag handles on small breakpoints; long-press radial menu on canvas; 44pt/48dp targets.
  - **Test:** breakpoint switch renders bottom sheet; dismiss affordance present.
- [ ] `mod/p5-audio-unlock` — Explicit "Enable Audio" gesture gate; handle iOS `interrupted` AudioContext and re-unlock.
  - **Test:** Tone.js start deferred until gesture; re-resume on interrupted (mocked).
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
