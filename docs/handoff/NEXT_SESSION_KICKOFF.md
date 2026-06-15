# Next-Session Kickoff Prompt

Copy everything in the code block below as your first message to a fresh Claude
Code session to resume the LATCH modernization with full context.
(Last updated 2026-06-15.)

---

```
You're resuming an in-progress modernization of LATCH — a Vue 3 + TypeScript +
Electron node-based creative-coding app ("Live Art Tool for Creative Humans";
133+ nodes, web + desktop) — on the `modernization` git branch. Do NOT start
coding yet: get context, confirm the baseline, then propose the next step.

## Rules (mandatory, non-negotiable)
- NEVER put AI/Claude attribution in git. No "Co-Authored-By: Claude", no
  "Generated with Claude Code", no robot emoji, no Anthropic mention — in commit
  messages, PR bodies, tags, or anywhere in history. The author stays me
  (Moheeb Zara). This is codified in CLAUDE.md and has held; keep it.
- NEVER assume. Back every claim by reading the actual implementation or doing
  current research (WebSearch/WebFetch). If you can't verify it, say so. Reading
  the real code + live docs has repeatedly overturned stale assumptions here
  (test baselines, already-installed deps, hidden node state, dep export maps,
  three.js internals).
- Commit ONLY when I ask. ALL phases live on the single `modernization` branch;
  nothing is pushed or merged. Don't push/merge/commit without asking.
- Work test-driven: write/extend the test, watch it fail, implement, watch it
  pass. Never drop below the test baseline. Keep typecheck + lint + build:web
  green. Update docs/plans/MODERNIZATION_PLAN_2026.md + HANDOFF.md as you go.

## Git state (updated 2026-06-15 — the old "everything uncommitted" note is obsolete)
Everything is now **committed** on the `modernization` branch in clean, task-aligned
commits (nothing pushed/merged — eventual single PR to `main` when the maintainer
says). The working tree is clean except `.DS_Store` (an already-tracked OS artifact,
intentionally left unstaged). So `git log --oneline -20` reflects reality. The
2026-06-15 session committed: the Phase 4 ML batch + Phase 5 + clasp/three bumps
(7 commits), the capability-requirement badge, the Phase 6 WebGPU renderer scaffold
+ TSL prototype, and fixes for three real bugs found by adversarial audits (WebLLM
concurrent-engine leak, `smooth` node no-op, and timing/debug/input/clasp per-node
state leaks). Plus UX: model-license surfacing + badge a11y.

## Get context (read these in order, then run the checks)
1. CLAUDE.md — project rules + the architecture map.
2. docs/plans/MODERNIZATION_PLAN_2026.md — THE SOURCE OF TRUTH: phase checkboxes,
   status board, and a detailed per-task writeup for everything done/remaining.
3. docs/AUDIT_2026-06-14.md — deep audit log across sessions: bugs found+fixed,
   browser-validation results, and design findings (e.g. capability-duality,
   three.js `__webglTexture` internal, clasp export resolution).
4. HANDOFF.md — top entry is the modernization change log (Phases 0-5).
5. docs/MODERNIZATION_ASSESSMENT_2026-06.md — original sourced findings/rationale.
6. docs/nodes/ai.md — reference for the AI nodes (incl. the new Vector Memory,
   Retrieve, and LLM streaming nodes).
Then run:
- `git status` (clean except `.DS_Store`) and `git log --oneline -20`.
- `npm run test:unit` → baseline **1283 passing / 11 todo** (as of 2026-06-15).
- `npm run typecheck` (0 errors). `npm run lint` (0 errors). `npm run build:web` (clean).

## How the repo works (architecture)
- Stack: Vue 3 + TS + Vite; web build + Electron (electron-vite). Pinia state.
- `src/renderer/registry/<category>/` — node DEFINITIONS (ports, controls, info).
- `src/renderer/engine/executors/<category>.ts` — node RUNTIME behavior. The big
  `executors/index.ts` holds input/math/logic/RAG/LLM executors + their cleanup.
- `src/renderer/engine/ExecutionEngine.ts` — graph execution: topo sort + per-frame
  rAF loop; OPT-IN `dirty` (change-driven) and `deferred` (fire-and-latch async)
  modes (both default OFF); per-category gc*/disposeAll* cleanup wired here.
- `src/renderer/components/nodes/BaseNode.vue` — generic node UI shell (~1165 lines).
- `src/renderer/services/` — audio / visual / ai / connections / clasp services.
- `src/renderer/stores/` — flows, runtime, ui, assets, connections, nodes.
- Stateful executors keep per-node state in module-level Maps and MUST register a
  gc (node-removal) + disposeAll (stop) path — the engine calls them. (Recurring
  leak bug class; follow the existing pattern.)
- Key libs (all current as of this branch): Vue Flow 1.48, three r184, Tone.js,
  Meyda, transformers.js 4.2, ONNX Runtime, MediaPipe, @mlc-ai/web-llm 0.2.84,
  @clasp-to/core 4.3.2 (first-party realtime protocol), Dexie, pixi.js 8.
- Commands: `npm run dev` (Vite, port 5173, falls back to 5174), `dev:electron`,
  `test:unit`, `typecheck`, `lint`, `build:web`.

## You CAN drive a real browser for validation (use it)
Playwright is installed and system Chrome is present, so a node script using
`require('@playwright/test').chromium.launch({ channel: 'chrome', headless: true })`
(run from the project dir so it resolves node_modules) can load `npm run dev` and
evaluate in-page. In THIS environment: WebGPU is available (Chrome→Metal),
crossOriginIsolated is true, and network egress to huggingface.co / jsdelivr
works. Already validated automatically this way: crossOriginIsolated + COOP/COEP,
transformers.js v4 model load (real 384-dim embedding), and three r184 WebGL
render (+ the `__webglTexture` internal the texture bridge relies on). What still
can't be done headlessly: multi-GB model downloads end-to-end (WebLLM token
stream), transformers WebGPU *device* path, clasp realtime (needs two peers),
and real-device touch feel.

## What's DONE (verify against the plan/code; don't trust blindly)
- Phase 0: engine O(1) node lookup; COOP/COEP (`credentialless`) + vendored
  coi-serviceworker; vite-env types. (crossOriginIsolated browser-validated.)
- Phase 1: render loop pauses when hidden, FPS cap, delta clamp; `loopToken` race
  fix; `prefersReducedMotion`/`clampDevicePixelRatio` utils.
- Phase 2: golden-output oracle harness; OPT-IN `dirty` mode (pure-node skip,
  byte-identical to full); OPT-IN `deferred` async (long-I/O fire-and-latch).
  Both DEFAULT OFF — production unchanged until explicitly enabled.
- Phase 3 (ALL dependency upgrades done): 3a Vue Flow 1.48 + only-render-visible;
  3b three r162→r184 + @types/three (6 type-only casts; render-validated); 3c
  @clasp-to/core 3.3.2→4.3.2 (drop-in, verified); 3d transformers 3.8.1→4.2.0
  (model load browser-validated).
- Phase 4 (ML, code-complete): VectorStore + Retrieve + Vector Memory (RAG triad,
  Embed→Memory→Retrieve); model-catalog refresh (network-verified HF ids +
  license field); transferable image data (zero-copy to AI worker); persistent
  storage (`services/ai/modelStorage.ts` + persist()/estimate() + model-manager
  "GB free" line); WebLLM streaming LLM node (`@mlc-ai/web-llm`, dedicated
  dynamic-imported worker, WebGPU-gated, concurrency-hardened with a genToken).
  Worker chat-format bug found+fixed (`services/ai/textGenFormat.ts` + contract
  test). New files mostly under `services/ai/` + `registry/ai/`.
- Phase 5 (started): p5-capability (`utils/platform.ts` capability matrix +
  `getPlatformTier` + `getCapabilityStatus`); p5-audio-unlock
  (`services/audio/audioUnlock.ts` + AudioManager iOS interruption recovery,
  `needsUserGesture` state, `unlock()`).

## Known issues / notes
- OPT-IN dirty/deferred engine modes want in-app validation before any default flip.
- ✅ FIXED 2026-06-15: `smooth` node no-op (now per-node `smoothState`); WebLLM
  concurrent-engine leak (serialized `ensureEngine`); timing/debug/input/clasp
  per-node state leaks (added the missing `gc*` functions) + the `gateLastValue`
  leak; the BaseNode capability-badge wiring (per-platform `resolveNodeRequirement`).
- Remaining minor: WebLLM `disposeAll()` during an in-flight model load can orphan
  the just-loaded engine (rare; the generation bails on token).
- ~52 npm advisories from the heavy AI dep tree (sharp / nightly ORT) — do NOT
  `npm audit fix --force` (would break pinned ORT/transformers).
- Vector Memory / WebLLM state is runtime-only (cleared on stop, not persisted to
  the saved flow) — consistent with other stateful nodes; persistence is a follow-up.

## What REMAINS (full inventory in HANDOFF.md "Remaining work snapshot" + the plan)
- Phase 1: wire `prefersReducedMotion()` into animated nodes (+ a CSS
  `@media (prefers-reduced-motion)` block — currently none).
- Phase 2: flip dirty/deferred opt-in → default (needs in-app validation); optional
  trigger-edges.
- Phase 4: Vector Memory corpus persistence across reload; optional LLMLingua-2
  compress node; promote a modern ungated text-gen default.
- Phase 5 (mobile/touch tier): **`Enable Audio` UI button** bound to
  `audioManager.unlock()` / `needsUserGesture` (backend fully built — top UX win,
  best validated on a real iOS device); `p5-touch-connect` (tap-to-connect, big
  handles, Loose mode — note the node *palette* is drag-only, unusable on touch);
  `p5-layout` (bottom sheets / radial menu; 44pt/48dp touch targets — current UI is
  far below); `p5-osc-bridge-first` (config). Broader a11y: dialog semantics/focus
  trap on modals, ARIA on the custom dropdown/tabs (see the 2026-06-15 UX audit in
  docs/AUDIT_2026-06-14.md).
- Phase 6 (flagship, high risk, behind a flag): renderer scaffold + TSL authoring
  are **proven** (browser-validated on WebGPU, flag-gated/standalone). The blocker
  for production wiring is the texture bridge — `ThreeRenderer.render()` returns a
  raw `WebGLTexture` (`__webglTexture`) the compositor consumes, but WebGPU makes a
  `GPUTexture`. Start with the WebGPU→readback→`DataTexture` path. Then GLSL-parity
  + `p6-postfx`.

## What to do next
Read the plan + HANDOFF, confirm the baseline (1283 green), then pick up a remaining
item. Prefer headless-verifiable work and use the Playwright+Chrome path (incl. the
Pinia-store-via-`__vue_app__` trick) to validate UI. The biggest levers: the
Phase 6 texture-bridge integration (the production unlock — higher risk, worth
confirming scope first) and the `Enable Audio` button (top mobile UX win, best
paired with device testing). The touch/layout items are best paired with device
testing.
```
