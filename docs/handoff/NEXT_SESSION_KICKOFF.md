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

## ⚠️ Git state (verify first — this surprises people)
HEAD is `c791b38` ("Add next-session kickoff prompt"), which only contains
through the **Retrieve** node. EVERYTHING since — the rest of Phase 4, all of
Phase 5 so far, and the clasp + three bumps — is **UNCOMMITTED in the working
tree** (~20 modified, ~21 untracked files). So `git log` will look far behind
what the docs + code actually contain. The work is real and green; it just isn't
committed (per the "commit only when asked" rule). Run `git status` to see it.

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
- `git status` (see the uncommitted work) and `git log --oneline -8`.
- `npm run test:unit` → baseline **1245 passing / 11 todo**.
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
- Latent pre-existing bug: the `smooth` node's `_prev` state never persists
  (currently passes input through unchanged) — documented in AUDIT, not yet fixed.
- ~52 npm advisories from the heavy AI dep tree (sharp / nightly ORT) — do NOT
  `npm audit fix --force` (would break pinned ORT/transformers).
- Vector Memory / WebLLM state is runtime-only (cleared on stop, not persisted to
  the saved flow) — consistent with other stateful nodes; persistence is a follow-up.

## What REMAINS
- Phase 5 (mobile/touch tier): `p5-touch-connect` (Vue Flow connect-on-click,
  enlarged handles, connectionMode Loose, touch-action — component test),
  `p5-layout` (bottom-sheet panels / radial menu — UI), `p5-osc-bridge-first`
  (OSC-over-WebSocket default on mobile — config), plus two follow-ups: wire
  `getCapabilityStatus` into BaseNode.vue (NEEDS a per-platform requirement model,
  NOT a single capability key — serial/midi/ble work via web API OR Electron
  native, so a naive key shows false "unavailable" on Electron; see the
  capability-duality finding in AUDIT), and a UI "Enable Audio" button bound to
  `audioManager.unlock()` / `state.needsUserGesture`.
- Phase 6 (flagship, high risk, behind a flag): Three.js TSL / WebGPURenderer with
  WebGL2 fallback — now UNBLOCKED by the r184 bump; WebGPU confirmed available here.

## What to do next
Read the plan, confirm the baseline, then propose the next step and ask me to
confirm. Prefer headless-verifiable work; for anything UI/touch/realtime, say so
and use the Playwright+Chrome path to validate what you can. Good candidates:
`p5-osc-bridge-first` (config-level, headless), the BaseNode capability-badge
wiring (design the requirement model first), or scaffolding the Phase 6 WebGPU
renderer behind a flag. The touch/layout items are best paired with my device
testing.
```
