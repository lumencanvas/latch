# Next-session kickoff — Phase 3 bullet 2 (declarative `ui` + NodeView) underway

Copy everything in the block below as your first message to a fresh Claude Code
session to continue LATCH with full context.
(Last updated 2026-07-02 — HEAD `97b1ebb`; tree clean & green; 12 commits this session, all committed.)

---

ultrathink You're continuing **Phase 3** of LATCH — a free/open web+desktop node-based creative-coding tool (Vue 3 + TS + Vite, Electron Forge) at `/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format` (HEAD `97b1ebb`). **Phases 0–2 done; Phase 3 bullet 1 done; Phase 3 bullet 2 (declarative `ui` + one `NodeView` interpreter) is underway — Tier A complete, Tier B started.** Tree is CLEAN and green. Get oriented before touching code.

Baseline (verify with a quick run): typecheck clean · lint 0 err (49 pre-existing any-warns ok) · `test:unit` **1869 pass + 11 todo** (115 files) · `build` ok.

## STEP 1 — Read, in order
1. `CLAUDE.md` — rules. **NO AI attribution in git, ever** (history/PRs read as Moheeb Zara's). **Commit only when asked.** Stay on the branch. Each step ends green. **Never assume — read the real code / verify against the actual git original.** Honor `strategy/05` DON'T-OVERCLAIM (this session had to correct two overclaims — see below).
2. `docs/HANDOFF.md` TOP entries **(later 38 → 33)** — this session's arc, newest first: (38) first Tier-B aggregate `env`; (37) bullet-2 Tier A (schema+operators, NodeView interpreter, validateUISchema); (36) Phase-3 commit ledger + **scope correction** (bullet 1 ≠ whole phase); (35) `when` migration 3b (registry → `when`, panel/canvas honoring harmonized); (34) unified `when` 3a + ProtocolFormFields kept separate; (33) PropertiesPanel → `<ControlRenderer>` panel context + adversarial test audit.
3. `docs/plans/DECLARATIVE_UI_NODEVIEW_DESIGN_2026-07-01.md` — **the approved design for bullet 2.** Q1–Q4 are settled to the recommended defaults (B1 aggregate binding, real `component?`, behavioral parity, knob-first). Note the in-doc corrections: live render order is `ui? → auto-layout` (NOT `component? → …`); `component?` is a **reserved, not-yet-read field**; the `when` operator wire-format is the per-key `{ne}/{gt}/{lt}/{in}` form.
4. `docs/plans/ROADMAP_2026-06-28.md` — progress snapshot (top) + the **Phase 3** section (3 bullets; only bullet 1 + bullet-2-Tier-A + one Tier-B widget are done).
5. Recall memories: **audit-against-true-original** (verify each migration vs its OWN pre-migration git original), **latch-component-test-gotchas** (@vue/test-utils: import stores before `.vue`, stub `Handle`, **template `|` union casts trip the `vue/no-deprecated-filter` eslint rule** — move casts to `<script>` helpers; `isVisible()` doesn't observe inline `display:none` on a detached mount → assert the style attr), **latch-smoke-test-harness**, **latch-undefined-css-tokens**.

## WHERE WE ARE — Phase 3 bullet 2
- **Bullet 1 DONE** (don't re-open): one `<ControlRenderer>` for canvas+panel; one `when` visibility schema + `evaluateWhen` honored everywhere (registry migrated off `visibleWhen`/`showWhen`); `ProtocolFormFields` kept as its own config-form path (too disjoint to fold in).
- **Bullet 2 Tier A DONE** (commits `7eacb4c`/`fff8aae`/`fd7ee6e`, ultracode-audited — all mutants killed, no bypass):
  - `stores/nodes.ts` — `UISchema`/`UIRow`/`UIWidget` (closed `WidgetType`) + `ui?` + **reserved** `component?`; `WhenCondition` gained `{ne}`/`{gt}`/`{lt}` operators (`evaluateWhen` in `useControlHelpers.ts`).
  - `components/controls/NodeView.vue` — the ONE interpreter: renders `ui.rows` per surface, same `evaluateWhen`, **primitives delegate to `<ControlRenderer>`**, dispatches knob/asset/connection/readout, readout from `runtimeStore` metrics. Wired **opt-in** into BaseNode + PropertiesPanel (`definition.ui` present → NodeView, else the existing auto-layout).
  - `services/customNodes/validator.ts` — `validateUISchema`: untrusted custom nodes get **Tier-A widgets only**, every `bind` must resolve, `props`/`when` primitive-only + per-type prop whitelist, **reserved keys** (`__proto__`/`constructor`/`prototype`) rejected in `when`, **`component` never copied** (no code crosses the boundary).
- **Bullet 2 Tier B STARTED** (commit `01cd7ac`): the `env` aggregate widget — one `EnvelopeData` (ADSR) ↔ 4 flat controls via positional `props.fields`, reusing the shipping `EnvelopeEditor`; assemble falls back value→control-default→0, disperse fans one `update`/field (debounced `recordParamEdit` coalesces → one undo step). **Aggregates are BUILT-IN ONLY** (validator rejects env/eq/wave/xy for custom nodes). Fidelity-verified vs the real `registry/audio/_envelope-visual` (4 flat controls in `ENV_ORDER` → no data migration).

## WHAT'S NEXT — in order (all fully headless-verifiable except the migration)
1. **More Tier-B aggregate adapters** (same pattern, no shipping-node risk, prove with a synthetic test node): `eq` — 9 fields → 3 bands `[[freq,gain,q]×3]`, needs chunking `props.fields` by 3, reuse `EQEditor` (`EQData{bands}`); `wave` — reuse `WaveformEditor` (`WaveformData{samples[]}`). Keep the `env` shape: `AGGREGATE`-style helpers in NodeView, built-in-only, default-fallback, fan-out emit. TDD + mutation-verify each.
2. **`xy` widget** — needs a small **XYPad** widget component (the shipping one is archived at `components/_archived/XYPadNode.vue`); then an `xy` aggregate (2 fields x/y).
3. **First REAL bespoke-node migration to `ui`** — pick a simple one (e.g. `knob`), declare `ui` + remove its `components.ts` entry. ⚠️ This **changes the node's shell** (bespoke SFC → BaseNode+NodeView), a product/visual decision, NOT a headless refactor — **pair it with a browser parity check** (`/verify` or a Playwright screenshot before/after). The 28 bespoke SFCs split into ~10–14 migratable (widget-wiring) vs the rest (mediapipe/emulator/function/keyboard/gamepad — keep bespoke). Confirm with the maintainer which nodes should change look.
4. **`component?` consumption** — make the resolution actually read `definition.component` and have `registry/components.ts` derive from it (single source of truth); guard: registry set unchanged.
5. **Bullet 3** (separate track): new control types (`xy`/`range`/`curve`/`gradient`), drag-to-scrub, control-level keyboard + ARIA.

## HOW TO WORK
- Each step ends green: `typecheck` + `lint` + `test:unit` (`build` for prod-source; **smoke for any runtime/UI change**). Smoke = boot→inspect→Play→Stop Playwright harness (see `latch-smoke-test-harness`; run the `.mjs` from repo root so bare `playwright` resolves, `channel:'chrome'`, headless, filter benign device/XNNPACK/TensorFlow noise) → 0 real console errors.
- **TDD + mutation-verify EVERY increment**: write the test → red → implement → green; then hand-break the behavior (perl/sed to a `.bak`, restore — NEVER `git checkout`, it wipes uncommitted work) and confirm the test reds. This session's audits repeatedly found that a passing test ≠ a guarding test.
- **ultracode audit pattern** (only when the maintainer says "ultracode"): a Workflow of read-only audits (plan-conformance · adversarial/security · test-efficacy) → **serial** mutation battery (edits + restores files, so it must run alone) → synthesis. It caught real gaps this session (a reserved-key `when` bypass; a default-divergence; dead-code coverage). Note: the schema-heavy "adversarial" agent has twice hit the StructuredOutput retry cap — run that specific probe yourself if it fails.
- Commit only when asked; logical, individually-revertible, dependency-ordered commits; **no AI attribution** (author Moheeb Zara). Update `docs/HANDOFF.md` + the ROADMAP snapshot + this kickoff doc at close.

## INHERITED INVARIANTS (don't regress / don't overclaim)
- **NodeView is opt-in**: a node renders NodeView ONLY when `definition.ui` is set; the ~180 other nodes keep BaseNode auto-layout, and the 28 bespoke SFCs still route via `components.ts` by `nodeType`. No shipping node has `ui` yet. **`component?` is declared but NOT consumed** — don't describe it as wired.
- **`<ControlRenderer>` is byte-faithful** per `context` (canvas/panel); NodeView reuses it for primitives. It's presentational (emit-only); the host owns value source + undo.
- **`evaluateWhen` is the ONE visibility evaluator** (bare value = strict eq; `{in}`/`{ne}`/`{gt}`/`{lt}`; `gt`/`lt` false for non-numbers). All consumers route through it via `when ?? <legacy adapter>`.
- **`validateUISchema` is the trust boundary**: custom nodes = Tier-A only, resolvable binds, primitive props/when, reserved keys rejected, `component` stripped. **Aggregates (env/eq/wave/xy) are built-in only** — keep them out of `CUSTOM_UI_WIDGETS`.
- **Security DONE at Node-RED parity** (no-secret handle + public-API redaction + `.latch` carries no secrets) — don't re-harden. **Model catalogs DERIVED + gated.** **Capability gate + trust tiers DORMANT** for built-ins (cap context closed-over, never on `ctx`). Every register-once subsystem is glob-collected with a count/set-equality gate — keep it.
