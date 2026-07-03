# Next-session kickoff — Phase 3 (Control system + declarative UI) DONE; Phase-4 a11y down-payment made

Copy everything in the block below as your first message to a fresh Claude Code session to continue LATCH
with full context.
(Last updated 2026-07-03 — branch `phase0-file-format`, last code commit `ae9a5ad` + a docs commit on top;
tree CLEAN & green; everything this session is committed. Verify with `git log --oneline -14`.)

---

ultrathink You're continuing **LATCH** — a free/open, web+desktop, node-based creative-coding tool ("Live Art
Tool for Creative Humans"; Vue 3 + TS + Vite, Electron Forge; 238 nodes) at
`/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format`. **Phase 3 (Control system +
declarative UI) is DONE**; an opportunistic **Phase-4 accessibility down-payment** just landed. Tree is CLEAN
and everything is committed & green. **Get oriented before touching code, and pick the next thread with me.**

Baseline (verify with a quick run): typecheck clean · lint 0 err (49 pre-existing `any`-warns ok) ·
`test:unit` **1967 pass + 11 todo** (127 files) · `build` ok.

## STEP 1 — Read, in order
1. `CLAUDE.md` — rules. **NO AI attribution in git, EVER** (commits/PRs/tags read as Moheeb Zara's).
   **Commit only when asked.** Stay on the branch (branch off `main` only if asked and currently on it).
   Each step ends green. **Never assume — read the real code / verify against the actual git original.**
   Honor `strategy/05` **DON'T-OVERCLAIM**.
2. `docs/HANDOFF.md` TOP entries **(later 51 → 44)**, newest first: (51) audit of the a11y commits + cleanup;
   (50) ultracode a11y audit + 7 WCAG fixes on the control surface; (49) generated-index cleanup + review;
   (48) WaveformEditor keyboard a11y; (47) **increment 5 — `component` is the single source of routing
   truth** (+ adversarial audit); (46) Envelope+EQ editor keyboard a11y; (45) orphan-SFC cleanup; (44)
   drag-to-scrub.
3. `docs/plans/ROADMAP_2026-06-28.md` — the canonical phase order + the progress snapshot at the top (kept
   current). **This owns sequencing; where older `docs/plans/` files conflict, this wins.**
4. `docs/plans/DECLARATIVE_UI_NODEVIEW_DESIGN_2026-07-01.md` — the declarative-`ui` design (Q1–Q4 all
   resolved; §10.5 `component?` consumption DONE).
5. Recall memories: **latch-a11y-bug-classes** (NEW — mouse-only `<div>` triggers, `display:none`
   faux-switch inputs, scoped `:focus{outline:none}` killing the global focus-visible ring; the canvas-editor
   `role=application` pattern; happy-dom can't verify CSS/focus → browser-smoke those), **latch-strategy**
   (positioning = open/durable/**accessible**, NOT performance; don't-overclaim list),
   **latch-component-test-gotchas** (@vue/test-utils: import stores before `.vue`; a reference-alias/redundant
   mechanism makes a mutant un-killable → assert identity, not value), **latch-smoke-test-harness** (Playwright
   + system Chrome vs `npm run dev`), **audit-against-true-original**, **latch-undefined-css-tokens**,
   **node-library-backlog**.

## WHERE WE ARE
- **Phase 0 (Foundations): DONE.** `.latch` v2 format + migration; `defineNode`/`NodeSpec`; typed `ctx`;
  registry glob; quick-win fixes. CI count-equality + round-trip gates.
- **Phase 1 (De-monolith + kill the leak class): ~95%.** State-group migration 22/23 (only `subflow`,
  deferred to Phase 7); per-type leak gate + exact-pure-set gate live; `_`-split GC bug resolved.
- **Phase 2 (Register-once subsystems, security-hardened): IN PROGRESS.** Connection handle + mqtt/ws/http
  converted; **security spine DONE at Node-RED parity** (trust tiers, capability gate). Remaining: BLE
  device-picker UX (`TODO(ble-ux)`, currently auto-picks first match) + a few adapter conversions.
- **Phase 3 (Control system + declarative UI): DONE.**
  - Bullet 1: one `<ControlRenderer>` (canvas+panel) + one `when`/`evaluateWhen`.
  - Bullet 2: declarative `ui` + `NodeView` (Tier A primitives + Tier B aggregates `env`/`eq`/`wave`/`xy`,
    BUILT-IN ONLY); all 4 aggregate-backed bespoke nodes migrated; `validateUISchema`.
  - **`component?` consumption (increment 5): DONE.** `registry/components.ts` DERIVES `nodeTypes` +
    `CUSTOM_NODE_TYPE_IDS` (frozen) from `allNodes.filter(d => d.component)` — the single source of truth; the
    22 bespoke definitions each declare `component: markRaw(XxxNode)`; `allNodes` extracted to
    `registry/allNodes.ts` (breaks the `components↔index` cycle); dead component re-exports removed.
    `PERSISTENCE_SPECIAL_NODE_TYPES` is now a **reference alias** to `CUSTOM_NODE_TYPE_IDS` (was a drifted
    hand-list). Guards: `tests/unit/registry/custom-node-components.test.ts`, `migration-routing.test.ts`.
  - Bullet 3: control keyboard+ARIA, drag-to-scrub, and **all 4 canvas editors keyboard-operable**
    (Envelope/EQ/Waveform/XYPad). Only deferred item: new control TYPES (`range`/`curve`/`gradient`) — they
    need a real consumer node, so deferred per the design doc.
- **Phase-4 accessibility down-payment (later-50/51):** an ultracode audit of the control/NodeView/editor
  surface fixed 7 confirmed WCAG gaps (asset-picker + toggle keyboard lockouts, suppressed focus-visible
  rings, EQ selection feedback, readout announce, waveform preset names). Broader app-wide a11y is Phase 4
  proper.

## WHAT'S NEXT — pick a thread with me (each flagged)
1. **Phase 4 — Canvas, onboarding & accessibility (natural continuation).** The control-surface a11y is done;
   Phase 4 proper is app-wide: node-explorer/toolbar/dialogs keyboard+ARIA, canvas keyboard nav (add/move/
   connect nodes without a mouse), focus management across panels, onboarding. Could start with an ultracode
   a11y audit of the WHOLE app (I scoped the last one to the control surface only).
2. **Phase 3 tail — new control types (`range`/`curve`/`gradient`).** DEFERRED: they need a real consumer
   node. Only worth doing if we design/adopt a node that uses one.
3. **Phase 2 tail — BLE device-picker UX** (`TODO(ble-ux)`) + remaining adapter conversions.
4. **Phase 5+ — modulation gap / per-node co-location / subflow rebuild / live-VJ** (bigger, later phases; see
   ROADMAP + `docs/AUDIT_2026-06-28.md`).
Ask me which to take (or propose one). Don't dive into a whole new phase without confirming the thread.

## HOW TO WORK
- **Each step ends green:** `typecheck` + `lint` + `test:unit` (`build` for prod-source; **smoke for any
  runtime/UI change**). Smoke = Playwright + system Chrome; run the `.mjs` **from the repo root** so bare
  `playwright` resolves (`channel:'chrome'`, headless, filter benign device/XNNPACK/TensorFlow/AudioContext/
  DeviceEnumeration noise) → 0 real console errors. **Test env is happy-dom** (`tests/setup.ts`): `getContext
  ('2d')` is a no-op mock (editor `draw()` runs, won't throw) but scoped CSS + `:focus-visible` are NOT
  applied → verify `display`/focus-ring/CSS fixes in a REAL browser. Editors/migrations: verify via the
  PROPERTIES PANEL (a control node's `.node-view`) — freshly-added node bodies don't PAINT their canvas in
  headless (DOM elements still exist). Adding a node via the node-explorer UI is fiddly to automate blind.
- **TDD + mutation-verify EVERY increment:** test → red → implement → green; then hand-break via `perl`/`cp
  .bak` (NEVER `git checkout` — wipes uncommitted work) and confirm the test reds. A passing test ≠ a guarding
  test (audits keep proving it — regressions hide in canvas/persistence/CSS paths the "green" tests miss).
- **ultracode pattern** (when I say "ultracode" — use the Workflow tool): parallel read-only audit/review
  agents → adversarially VERIFY each finding (reject nits/already-done/out-of-scope) → act on the confirmed
  set. Worked well this session (dead-code sweep + a11y audit both had good signal-to-noise). Caveat: a
  schema-heavy agent can hit the StructuredOutput retry cap — run that probe inline if it fails.
- **Commit only when asked**; logical, individually-revertible, dependency-ordered, file-level-clean commits;
  **no AI attribution** (author Moheeb Zara). Update `docs/HANDOFF.md` + the ROADMAP snapshot + this kickoff at
  close.

## INHERITED INVARIANTS (don't regress / don't overclaim)
- **`component` is the SINGLE SOURCE** of custom-component routing. `components.ts` derives `nodeTypes` +
  `CUSTOM_NODE_TYPE_IDS` (frozen) from `allNodes.filter(d => d.component)`; `PERSISTENCE_SPECIAL_NODE_TYPES`
  is a reference **alias** (assert identity, not value). To give a node a bespoke SFC: set `component:
  markRaw(MyNode)` on its definition. `components.ts` imports `allNodes` from `./allNodes` (NOT `./index`) to
  stay acyclic. The nodes-STORE `components` map / `getComponent` stay UNWIRED (live path is `nodeTypes`).
- **NodeView is opt-in** (`definition.ui`). ~180 nodes keep BaseNode auto-layout; ~22 bespoke SFCs carry
  `definition.component`. A `ui` node is never compact (`isCompactNode` exempts `hasUi`). `@mousedown.stop` on
  `.nv-widget` stops canvas node-drag hijacking editor drags — don't remove.
- **Aggregates (`env`/`eq`/`wave`/`xy`) are BUILT-IN ONLY** (custom nodes = Tier-A widgets only;
  `validateUISchema` rejects aggregates + `component` for custom). Aggregate fields must be DECLARED controls.
- **All 4 canvas editors** are keyboard-operable via `role="application"` + a selected target navigated by
  arrows + `aria-valuetext` + a duplicated `aria-live` span + a focus-visible ring + the selected target
  highlighted on canvas while focused. Match this for ANY new canvas editor (see `latch-a11y-bug-classes`).
- **Security is DONE at Node-RED parity** — don't re-open the sandbox; don't gate `core`/`local`, only
  `community`.
- **DON'T-OVERCLAIM** (`strategy/05`): a CSS/focus fix that only happy-dom "passed" is NOT verified — say so;
  keyboard *operability* ≠ "freehand-draw by keyboard"; report skipped browser checks honestly.
