# Next-session kickoff — Phase 2 (continuing: connection security / model derive)

Copy everything in the block below as your first message to a fresh Claude Code
session to continue LATCH Phase-2 work with full context.
(Last updated 2026-06-30 — Phase 2 core landed, uncommitted; three decision memos pending.)

---

ultrathink You're continuing **Phase 2** of LATCH — a free/open web+desktop node-based creative-coding tool (Vue 3 + TS + Vite, Electron Forge) at `/Users/obsidian/Projects/lumencanvas/latch`. **Phases 0 & 1 are DONE; Phase 2 is well underway but its whole changeset is UNCOMMITTED on branch `phase0-file-format`.** Get fully up to speed before touching code.

## STEP 1 — Read, in order
1. `CLAUDE.md` — rules. **NO AI attribution in git, ever** (history/PRs read as Moheeb Zara's). **Commit only when asked.** Stay on the branch. Each step ends green. Never assume — read the code/verify in-app. Honor `strategy/05` DON'T-OVERCLAIM.
2. `docs/HANDOFF.md` TOP entries `(later 14 → 10)` — `(later 14)` `defineModel`+`modelRegistry` scaffold; `(later 13)` ws+http→`ctx.connection()`; `(later 12)` mqtt slice + `ConnectionHandle`; `(later 11)` `defineProtocol` scaffold + glob-authoritative registration; `(later 10)` Phase-1 completion audit.
3. `docs/plans/ROADMAP_2026-06-28.md` — progress snapshot (top).
4. **The three decision memos (READ — work is gated on these):**
   - `docs/plans/CONNECTION_HANDLE_IMPL_2026-06-29.md` — the no-secret `ConnectionHandle` design (largely realized for mqtt/ws/http; the record of decisions made).
   - `docs/plans/MODEL_REGISTRY_IMPL_2026-06-30.md` — the `defineModel` **derive** fork (5 decisions: task-wrapper metadata location, default/order reproduction, MediaPipe scope, whether auto error-outputs land here or separately, first-PR scope). **Awaits maintainer sign-off.**
   - `docs/plans/SECURITY_MODEL_2026-06-28.md` — connection security steps **2–6** (capability enforcement, trust-tier tagging, Community approval + CSP egress) are NOT built; step 1 (no-secret handle) IS. Maintainer-sensitive — surface design before building.
   - Plus `EXTENSIBILITY_ARCHITECTURE_2026-06-28.md` §7 (`defineProtocol`), §8 (`defineModel`), §11; `POLICIES_2026-06-28.md` §1 (gates).
5. Recall memories: `latch-smoke-test-harness` (reusable `smoke.mjs`: boot→Play→Stop, 0 real errors; system Chrome), `latch-component-test-gotchas`, `latch-nanoid-underscore-split` (RESOLVED), `latch-webgl-contexts`, `latch-subflows-broken`.

Then baseline: `typecheck` (clean) · `lint` (0 err; 49 pre-existing any-warns ok) · `test:unit` (**1698** pass + 11 todo) · `build` (ok). Tree is **dirty** (the Phase-2 changeset) — `git status` to see it.

## WHERE WE ARE
- **Phase 0 & 1 DONE.** Engine's generic lifecycle loop is authoritative for cleanup (only `subflow` hand-wired, deferred to Phase 7).
- **Phase 2 — landed but UNCOMMITTED on `phase0-file-format`** (all green throughout):
  - **6a** `defineProtocol` + `protocolRegistry` (globs `services/connections/protocols/<name>/protocol.ts`), **glob-authoritative** registration (`registerBuiltInTypes` loops the glob), count gate at **set-equality**.
  - **6b** mqtt/ws/http migrated to a **no-secret `ConnectionHandle`** via `ctx.connection<T>({protocol})` (`engine/connection.ts` — shared auto-connect throttle + WeakMap handle cache; `ExecutionEngine.createExecutionContext` wires it). Broker holds the credential; handle exposes only safe ops. **CLASP exempt.** Behavior note: auto-connect is now fire-and-forget (was awaited) — benign except an HTTP request fired in the 1–2 connecting frames gets "Not connected" until re-triggered.
  - **7 scaffold** `defineModel` + `modelRegistry` (globs `services/ai/models/**/*.model.ts`, **inert** — 0 files; the 3 catalogs `AI_MODELS`/`WEBLLM_MODELS`/MediaPipe stay authoritative) + count/prompt-format gates + `NodeSpec.models?` field.
- **The three register-once subsystems all follow the same pattern:** one declarative unit (`defineNode`/`defineProtocol`/`defineModel`), `import.meta.glob`, dup-id/missing-default throw at load, a count gate from commit 1. **Keep that pattern.**

## DECISIONS PENDING (ask the maintainer FIRST)
1. **Commit the Phase-2 changeset?** It's large and spans two subsystems. Suggested logical split (each green, revertible): (a) protocol scaffold, (b) glob-authoritative registration, (c) mqtt `ctx.connection`, (d) ws+http, (e) `defineModel` scaffold + `NodeSpec.models?`, plus the three memos. No AI attribution.
2. **Branch:** still on `phase0-file-format` (Phases 0/1/2). §11 says branch per phase off `main` — merge+rebranch, or continue? (Deferred each session so far.)
3. **What next** — pick one:
   - **(A) Auto AI loading/progress/done/error outputs + `runModelInference`** — the audit's dead-`_error` fix for every AI node. HIGH value, but entangles node-schema changes (→ node-data versioning/migration §10) + the `defineNode` post-process pipeline (AI nodes aren't co-located yet) OR per-node hand-wiring. Needs a design pass; not a clean drop-in.
   - **(B) Model derive** (`MODEL_REGISTRY_IMPL` §decisions) — make `AI_MODELS`/`WEBLLM_MODELS` derived from `*.model.ts`; deep-equal gate. Needs the 5 memo decisions.
   - **(C) Connection security 2–6** (`SECURITY_MODEL`) — capability enforcement + trust tiers + Community approval/CSP. Maintainer-sensitive (UX/policy); surface design first.
   - **(D) BLE/Serial/MIDI drift** (§7) — now ~one folder each since the registry is glob-authoritative: BLE = author a `bleConnectionType` + register the existing adapter; Serial/MIDI = write Web Serial / Web MIDI adapters (real hardware APIs, hard to smoke).
   - **(E) Adapter physical co-location** into `protocols/<name>/` (Phase-E mechanical; touches the export barrel).

## HOW TO WORK (unchanged)
Each step ends green (typecheck + lint + test:unit; build for production-source changes). Logical, individually-revertible commits; **commit only when asked.** Smoke-verify runtime changes with `smoke.mjs` (boot→`button[title="Play"]`→wait→`button[title="Stop"]`; system Chrome `channel:'chrome'`; launch args `--use-fake-ui-for-media-stream` + `--use-fake-device-for-media-stream` + camera/mic permissions; filter benign MediaPipe INFO; clean = 0 real console errors; copy the script INTO the repo to run so ESM resolves `node_modules`, then `rm` it). Update `docs/HANDOFF.md` at the close. Mutation-verify every new gate.

**Hard-won lesson:** NEVER `git checkout <file>` to undo a mutation-verify edit — it reverts *tracked* files to HEAD (wiping uncommitted work) and can't restore *untracked* ones. For untracked temp files use `rm`; for tracked files, edit the mutation back out by hand.

The single most important inherited fact: **the engine's generic lifecycle loop is authoritative for cleanup**, and every register-once subsystem (node/protocol/model) is **glob-collected with a count gate**. `ctx.connection()` returns a **no-secret `ConnectionHandle`** — that return type is a frozen public contract; don't regress it to a raw adapter.
