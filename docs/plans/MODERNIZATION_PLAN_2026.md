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
- **One concern per branch.** Branch names are given per phase/sub-task. Each
  branch must pass `npm run typecheck` + `npm run test:unit` before merge to `main`.
- **Tracking:** tick the `[ ]` boxes as work lands. Update the Status Board.
- **No AI attribution in commits** (see `/CLAUDE.md`).
- **Acceptance criteria** are binary — a phase is "done" only when all are met.

## Status Board

| Phase | Title | Branch prefix | Status | Risk |
|------:|-------|---------------|--------|------|
| 0 | Foundation, headers & test guardrails | `mod/p0-*` | ◐ In progress | Low |
| 1 | Render loop & lifecycle | `mod/p1-render-loop` | ☐ Not started | Low |
| 2 | Execution engine evolution | `mod/p2-engine-*` | ☐ Not started | **High** |
| 3 | Staged dependency upgrades | `mod/p3-*` | ☐ Not started | Med |
| 4 | ML modernization (WebLLM + RAG + caching) | `mod/p4-*` | ☐ Not started | Med |
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

- [ ] `mod/p0-headers` — Add COOP/COEP headers to `netlify.toml` (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) and a Vite dev-server header equivalent in `vite.config.ts`.
  - **Test:** add a runtime assertion/log + a unit test that, given headers, `crossOriginIsolated` is expected true; manual check `self.crossOriginIsolated === true` on the web build. Verify MediaPipe/transformers still load (COEP can break cross-origin script/wasm fetches — confirm CDN assets send CORP or are self-hosted).
  - **Acceptance:** web build is cross-origin isolated AND all existing AI/MediaPipe nodes still load.
- [x] `mod/p0-engine-map` — Replaced O(n²) `nodesSnapshot.find(...)` with a `nodeById` `Map<id,node>` rebuilt once per `updateGraph`; `executeFrame` resolves nodes in O(1).
  - **Test:** `tests/unit/engine/ExecutionEngine.test.ts` (7 characterization tests: topo order, output propagation, value retrieval, controls, diamond merge, graph re-sort) written green against the pre-refactor code, still green after — proving behavior unchanged.
  - **Acceptance:** ✅ identical outputs, lookups O(1). Full suite 1103 passing / 11 todo, typecheck clean.
  - **Note / follow-up:** discovered that `updateGraph`'s GC path (`gcVisualState`) eagerly constructs a `ThreeShaderRenderer`/`WebGLRenderer` even when only collecting garbage — forces a GL context where none is needed (and breaks in headless tests). Fold a lazy-GC fix into Phase 2 or a `mod/p0-*` follow-up.
- [ ] `mod/p0-ci` — Add a CI workflow (`.github/workflows/`) running `typecheck` + `test:unit` on PRs; document the baseline green count.
  - **Acceptance:** CI gates every `mod/*` branch.

---

## Phase 1 — Render loop & lifecycle  `mod/p1-render-loop`

**Goal:** the `ExecutionEngine` rAF loop becomes a good citizen — mandatory for
mobile, free wins on laptops.

- [ ] Pause on `document.hidden` via `visibilitychange`; resume cleanly (reset `lastFrameTime` to avoid delta spike).
- [ ] Optional FPS cap (engine setting, default uncapped on desktop): skip render until `now - last >= 1000/targetFps`, still schedule rAF.
- [ ] Cap DPR for any renderer surface (`Math.min(devicePixelRatio, 2)`; 1.5 on phones).
- [ ] Respect `prefers-reduced-motion: reduce` (expose as a runtime flag for nodes to honor).
- **Tests:** mock `requestAnimationFrame` + `document.visibilityState`; assert loop stops when hidden and resumes when visible; assert frame interval honors the cap; assert no delta spike on resume.
- **Acceptance:** backgrounding the tab stops execution; foreground resumes without a time jump; CPU drops measurably when hidden.

---

## Phase 2 — Execution engine evolution  `mod/p2-engine-*`  ⚠️ High risk — heaviest test investment

**Goal:** stop re-running the whole graph every frame; stop async nodes stalling
the frame. This is the core architectural bet (cables.gl's value-vs-trigger model).

- [ ] `mod/p2-golden-tests` (FIRST) — Capture golden outputs: run a battery of representative sample flows through the *current* engine and snapshot per-node outputs over N frames. These become the regression oracle for the rewrite.
- [ ] `mod/p2-dirty-flags` — Change-driven execution: nodes re-run only when an input/control changed or they self-declare as continuous (time/LFO/audio/video/AI). Add a `dirty` propagation pass.
  - **Test:** golden flows produce identical results; assert a static subgraph executes 0 times after settling.
- [ ] `mod/p2-async-nonblocking` — Async executors (HTTP/AI/clasp) become fire-and-latch: kick off, return last cached output, never block the frame.
  - **Test:** a flow with a slow async node maintains frame cadence (mock a 500ms executor; assert ≥30 frames complete in 1s).
- [ ] `mod/p2-trigger-edges` (optional, can defer) — Distinct trigger/exec edge type separate from value edges, driving render order explicitly.
  - **Test:** trigger fan-out order is deterministic and documented.
- **Acceptance:** all golden flows match; static graphs idle at ~0 executions/frame; async nodes never drop frame rate; baseline tests still green.

---

## Phase 3 — Staged dependency upgrades (one branch each)  `mod/p3-*`  Med risk

Each sub-phase is **its own branch**, merged independently, typecheck + tests gated.

- [ ] `mod/p3a-vueflow` — `@vue-flow/core` → 1.48.2 + `background`/`controls`/`minimap` siblings; enable `onlyRenderVisibleElements`; add `@vue-flow/node-resizer`.
  - **Note:** auto-generated handle IDs were removed (default `null`) in a recent minor — audit edge/handle ID usage.
  - **Test:** existing editor/component tests green; manual smoke of connect/pan/zoom/minimap; large-graph render check.
- [ ] `mod/p3b-three` — `three` r162 → r184 on the **existing WebGLRenderer path only** (no TSL yet).
  - **Test:** shader + 3D render regression (hash/snapshot of rendered canvas for fixture scenes); `@types/three` bumped in lockstep.
- [ ] `mod/p3c-clasp` — `@clasp-to/core` 3.3.2 → 4.x. Read the first-party CHANGELOG for the v3→v4 break first; evaluate adopting `@clasp-to/sdk`.
  - **Test:** `ClaspAdapter` + clasp executor unit tests; video send/receive smoke.
- [ ] `mod/p3d-transformers` — `@huggingface/transformers` 3.8.1 → 4.x. Handle `@huggingface/tokenizers` split, `ModelRegistry`, `env` API changes; v4 pins an ORT-web dev build — verify worker bundles.
  - **Test:** AI worker load + each inference method (text/image/asr/embedding) against fixtures; cache clear still works.
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
- [ ] `mod/p4-rag` — RAG node trio: **Embed** / **Vector Store** (Orama or PGlite+pgvector) / **Retrieve**; optional **LLMLingua-2** compress node.
  - **Test:** deterministic top-k retrieval on a fixture corpus; embedding dimensionality; compression ratio sanity.
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
