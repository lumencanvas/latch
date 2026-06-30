# Next-session kickoff — Phase 2 (register-once subsystems)

Copy everything in the block below as your first message to a fresh Claude Code
session to start the LATCH Phase-2 work with full context.
(Last updated 2026-06-29 — Phases 0 & 1 complete.)

---

ultrathink You're picking up **Phase 2** of LATCH — a free/open web+desktop node-based creative-coding tool (Vue 3 + TS + Vite, Electron Forge) at `/Users/obsidian/Projects/lumencanvas/latch`. **Phases 0 and 1 are DONE.** Branch: `phase0-file-format` (tree clean, all green). Get fully up to speed before touching code.

## STEP 1 — Read, in order
1. `CLAUDE.md` — rules. **NO AI attribution in git, ever** (history/PRs read as Moheeb Zara's). Commit only when asked. Stay on the branch. Each step ends green. Never assume — read the code/verify in-app. Honor `strategy/05` DON'T-OVERCLAIM.
2. `docs/HANDOFF.md` TOP entries — `(later 10)` is the Phase-1 completion audit; `(later 9)` the heavy-tier migration + `_`-split fix; `(later 6/7/8)` the audit, export gate, and de-monolith split.
3. `docs/plans/ROADMAP_2026-06-28.md` — the "Progress snapshot — 2026-06-29" block at top (Phase 1 = complete, only `subflow` deferred to Phase 7).
4. **Phase-2 design (the real work):** `EXTENSIBILITY_ARCHITECTURE_2026-06-28.md` **§7** (`defineProtocol`), **§8** (`defineModel`), **§11 steps 6–7** (the exact migration order + gates), and `SECURITY_MODEL_2026-06-28.md` (the capability-scoped connection access / trust tier) + `POLICIES_2026-06-28.md` §1 (CI gates — a new **protocol-count guard** + **prompt-format contract** activate in Phase 2).
5. Recall memories: `latch-smoke-test-harness` (in-app Playwright + system-Chrome smoke recipe — reusable `smoke.mjs`, boot→Play→Stop, noise filters), `latch-nanoid-underscore-split` (RESOLVED — the `_`-split GC fix), `latch-component-test-gotchas`, `latch-webgl-contexts`, `latch-subflows-broken`.

Then baseline: `typecheck` (clean) · `lint` (0 err; 49 pre-existing any-warnings ok) · `test:unit` (**1682** pass + 11 todo) · `build` (ok).

## WHERE WE ARE
- **Phase 0 DONE** (file format, extensibility primitives, quick-win fixes; gates in CI).
- **Phase 1 DONE** (only `subflow` deferred to its Phase-7 rebuild): de-monolith split (`executors/index.ts` 1482→241, a thin barrel+registry); the **must-not-break export gate** (`tests/contracts/public-exports.ts` + `tests/unit/contracts/public-exports.test.ts`); state-group migration **22/23** onto the engine's generic lifecycle loop (`defineNodeState` for independent state; `defineLifecycle`-wrap for ordering-sensitive/marker/multi-map teardown — emulation/opencv/ai/audio/visual/3d/connectivity/clasp); the latent `_`-split GC bug RESOLVED. The engine hand-wires **no category except `subflow`**; `useExecutionEngine.ts:26` registers `collectedLifecycles()` so the generic loop is authoritative.
- **Phases 2–9 not started.**

## BRANCH DECISION (ask the maintainer first)
All Phase 0/1 work lives on `phase0-file-format`; §11 says "branch off `main`" per phase. Before Phase 2, confirm with the maintainer: **merge `phase0-file-format` → `main` and branch `phase2-…` fresh, or continue on the existing branch?** Don't merge/branch unprompted.

## NEXT ACTIONS — Phase 2 (EXTENSIBILITY §11 steps 6–7), prioritized
Phase 2 is **larger and more design-/security-sensitive** than Phase 1 — pace it; confirm the entry step with the maintainer before building.

- **(6a) `defineProtocol` + `protocolRegistry` scaffold** (additive, zero behavior change — mirrors how Phase 0 added `defineNodeState`/`nodeRegistry`). `ConnectionManager` is *already* a data-driven registry (`ConnectionManager.ts:58,212`); `defineProtocol()` makes the existing `ConnectionTypeDefinition` the single authored unit, glob-collected from `services/connections/protocols/**/protocol.ts`. **Read the existing `ConnectionTypeDefinition` + `MqttAdapter.ts:228-379` shape FIRST so the type matches.** **Gate:** protocol-count guard (fails loudly on an empty glob), like the registry count-equality gate.
- **(6b) Convert mqtt/ws/http to folders + `ctx.connection()`** — implement the context helper once at `ExecutionEngine.ts:378` (resolves id from control/input, auto-connects, shared throttle), replacing the ~50-line `getMqttAdapter`/`ensureConnected` block copied across `mqtt.ts`/`ws`/`http`. **Gate:** subscribe/unsubscribe leak test. **CLASP is exempt** (keeps its `ClaspConnection` layer); `ctx.connection()` is purely additive.
- **(6c) Fix the BLE/Serial/MIDI drift** — BLE has an adapter but is never registered; Serial/MIDI have config types with no adapter (`types.ts:110-122`). One folder each once the registry exists.
- **(6-security) Capability-scoped, user-approved connection access + trust tier** (`SECURITY_MODEL`) — the n8n-breach mitigation (broker holds secrets; nodes get a scoped handle, never the credential). **This is maintainer-sensitive (secrets/trust) — ground it in `SECURITY_MODEL` and surface the design for maintainer sign-off BEFORE implementing credential handling.**
- **(7) `defineModel` + `modelRegistry` + `ModelAdapter` + `runModelInference`** — one tiny metadata file per model (`services/ai/models/<id>.model.ts`, never statically importing the heavy runtime); `AI_MODELS`/`WEBLLM_MODELS`/MediaPipe URLs become *derived*; auto `loading/progress/done/error` outputs (fixes the audit's dead-`_error` gap for every AI node at once) + the per-node error badge. **Gate:** derived `AI_MODELS` deep-equals today's; prompt-format contract test (every text-gen spec has `load.promptFormat`).

## HOW TO WORK (unchanged)
Each step ends green (typecheck + lint + test:unit; build for production-source changes). Logical, individually-revertible commits; commit per step/category; **commit only when asked**. Verify behavior in-app with the smoke harness for runtime-touching changes (Playwright + system Chrome on `npm run dev` :5173; reusable `smoke.mjs`: boot→click `button[title="Play"]`→wait→`button[title="Stop"]`, launch args `--use-fake-ui-for-media-stream` + `--use-fake-device-for-media-stream` and camera/mic permissions, filter the benign MediaPipe INFO; clean = 0 real console errors; screenshot for WebGL nodes). Update `docs/HANDOFF.md` at the close. Audit your own work before declaring done; mutation-verify any new gate.

The single most important inherited fact: **the engine's generic lifecycle loop is authoritative for cleanup** (only `subflow` is hand-wired) — Phase 2 protocols/models register the same way (glob + a count gate), so keep that pattern.
