# Next-session kickoff — Phase 2 (models + connections substreams landed; remainder gated/hardware-bound)

Copy everything in the block below as your first message to a fresh Claude Code
session to continue LATCH Phase-2 work with full context.
(Last updated 2026-06-30 — HEAD `c534c53`; tree clean & green; 6 commits this session, all committed.)

---

ultrathink You're continuing **Phase 2** of LATCH — a free/open web+desktop node-based creative-coding tool (Vue 3 + TS + Vite, Electron Forge) at `/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format` (HEAD `c534c53`). **Phases 0 & 1 done; Phase 2 well underway. Tree is CLEAN and green.** Get oriented before touching code.

Baseline (verify with a quick run): typecheck clean · lint 0 err (49 pre-existing any-warns ok) · `test:unit` **1771 pass + 11 todo** · `build` ok.

## STEP 1 — Read, in order
1. `CLAUDE.md` — rules. **NO AI attribution in git, ever** (history/PRs read as Moheeb Zara's). **Commit only when asked.** Stay on the branch. Each step ends green. **Never assume — read the real code / verify against the actual git original.** Honor `strategy/05` DON'T-OVERCLAIM.
2. `docs/HANDOFF.md` TOP entries **(later 23 → 18)** — this session's arc, newest first: (23) adversarial audit of the model-select + BLE commits + an Electron BLE pairing fix; (22) BLE protocol registration; (21) model-select adopted across all transformers AI nodes via the `withModelSelect` seam; (20) model-select population (`getModelSelectOptions` + an injected resolver); (19) texture-render swallowed-catch surfacing + A1 empty-error shadow fix; (18) corrected the empty/invalid-input clear regressions (the later-17 "fix" was wrong — each executor was re-verified vs its true pre-migration git original).
3. `docs/plans/ROADMAP_2026-06-28.md` — **the canonical sequencing doc**; read the progress snapshot at the top (Phase 0/1 done, Phase 2 in progress).
4. The gated memos (work depends on these): `docs/plans/MODEL_REGISTRY_IMPL_2026-06-30.md` (the model **derive** — 5 forks, AWAITING SIGN-OFF, has a recommendation for each); `docs/plans/SECURITY_MODEL_2026-06-28.md` (connection security steps 2–6, NOT built; step 1 no-secret handle IS). Plus `EXTENSIBILITY_ARCHITECTURE_2026-06-28.md` §7/§8, `POLICIES_2026-06-28.md` §1.
5. Recall memories: `audit-against-true-original` (the meta-lesson that bit twice this session), `latch-smoke-test-harness`, `latch-component-test-gotchas`, `latch-nanoid-underscore-split`.

## WHERE WE ARE — Phase 2 (Register-once subsystems), on `phase0-file-format`
- **Connections sub-stream:** `defineProtocol` + `protocolRegistry` (glob-authoritative; set-equality gate) + no-secret `ConnectionHandle` via `ctx.connection<T>({protocol})`; **mqtt/ws/http** migrated; **BLE registered** (`bleConnectionType` + `protocols/ble/protocol.ts`) + an **Electron `select-bluetooth-device` pairing handler** (`src/main/index.ts`) so desktop BLE actually pairs (needs a 1× desktop-build check — can't be verified headless).
- **Models sub-stream:** **A1** per-node soft-error badge latch (`ExecutionEngine` prefers a non-empty-string public `error` over `_error`); **A2-core** `defineNode({models})` derivation; **`runModelInference`** + 8 AI executors migrated (swallowed inference catches now surface on a public `error` port) + a targeted STT catch fix; the migration's clear-on-empty regressions found & fixed (verified vs git originals); the 3 **texture-render** nodes' catches surfaced; **model-select** populated from `AI_MODELS` (`getModelSelectOptions` + an injected resolver so the engine stays catalog-agnostic) and adopted across **all 7 transformers AI nodes** via one seam `registry/ai/modelSelect.ts` — `withModelSelect(def, task)`. Select default `''` = task default → additive, no migration.

## WHAT'S NEXT — all gated or hardware-bound; ASK the maintainer which (or confirm "do what you think is best"):
- **(A) Model derive** (`MODEL_REGISTRY_IMPL`, 5 forks — AWAITING SIGN-OFF). Turn `AI_MODELS`/`WEBLLM_MODELS` into data derived from co-located `*.model.ts` specs; deep-equal gate. Recommend **WebLLM-first** (flat array = simplest deep-equal, avoids the task-metadata fork). Architecturally consequential — the memo has a recommendation for each fork.
- **(B) Serial/MIDI drift.** Unlike BLE (existing tested adapter → just register), these need **NEW `SerialAdapter`/`MidiAdapter`** (~300–500 LOC each) + migrating the **working** `navigator.*` executors (serial/midi-in/midi-out/ble) to `ctx.connection` + `defineNodeState`. Plumbing is unit-testable; hardware I/O needs a manual desktop check. Higher regression risk (refactors working code).
- **(C) `SECURITY_MODEL` 2–6** — capability-scoped, user-approved connection access + trust tier + CSP egress. Maintainer-sensitive UX/policy — surface design first.
- **(D) BLE renderer device-picker** (`TODO(ble-ux)` in `src/main/index.ts`) — forward `deviceList` to a renderer picker so the user chooses among matches (today: auto-picks the first UUID-filtered device). Electron UI, untestable headless.
- Also: a real **desktop-build check** that the Electron BLE pairing handler (`c534c53`) works.

## HOW TO WORK
- Each step ends green: `typecheck` + `lint` + `test:unit` (build for production-source changes; `tsconfig.json` includes `src/**`, so typecheck DOES cover the Electron main process).
- **Smoke runtime/registry changes** with the boot→Play→Stop harness: write `smoke.mjs` to the repo root (Playwright, `chromium.launch({channel:'chrome', headless:true, args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']})`, `permissions:['camera','microphone']`; goto `localhost:5173`, click `button[title="Play"]`, wait ~4s, `button[title="Stop"]`; filter benign `NotAllowedError`/`[WebcamCapture]`/`XNNPACK`/`TensorFlow Lite`), run `npm run dev` in background, then `NODE_PATH="$(pwd)/node_modules" node smoke.mjs`, then `rm smoke.mjs`. Clean = 0 real console errors.
- **Mutation-verify** every fix: hand-edit the fix to a no-op → its test reds → restore. **NEVER `git checkout` to undo** (wipes uncommitted/untracked work) — restore with `perl`/`mv`/hand-edit.
- **Use adversarial-audit workflows** (ultracode) before committing risky/refactor work: fan out reviewers that verify claims against the *real code + git originals*, then adversarially verify findings. This caught two real bugs this session (the clear-on-empty "fix" was wrong; the Electron BLE `['web','electron']` claim was actually broken). Escape `${...}` as `\${...}` inside workflow prompt template literals.
- **Commit only when asked**; logical, individually-revertible commits; no AI attribution (author stays Moheeb Zara). Update `docs/HANDOFF.md` + the `ROADMAP` snapshot at close.

## INHERITED INVARIANTS (don't regress)
- The engine's **generic lifecycle loop is authoritative for cleanup**; every register-once subsystem (node/protocol/model) is glob-collected with a count/set-equality gate — keep that pattern.
- `ctx.connection()` returns a **frozen no-secret `ConnectionHandle`** (the broker holds the credential) — don't regress to a raw adapter.
- **`deriveModelDefinition` (engine) stays catalog-agnostic** — the AI registry injects options via `withModelSelect` / an injected resolver; the engine never imports the AI service. The `model` select default `''` resolves to the task default because every AIInference method keys on `modelId || getDefaultModel(task)`.
- **`runModelInference` fits only discrete request→single-result inference** — not streaming (STT/WebLLM) or texture-render (live/yolo/depth) nodes.
- **Per-executor empty/invalid-input clear behavior VARIES** — verify each against its true pre-migration original (`git show <migrate-commit>^`), never assume uniformity (`audit-against-true-original`).
- BLE is registered but its **executor still uses `navigator.bluetooth` directly** (not `ctx.connection`) — fine and consistent with OSC/CLASP (also self-contained, picker-registered but not `ctx.connection`-consumed); executor migration is later work, not a bug.
