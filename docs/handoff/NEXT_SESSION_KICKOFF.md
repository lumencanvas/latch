# Next-session kickoff — Phase 3 bullet 2 DONE; bullet 3 (control a11y) done, remainder open

Copy everything in the block below as your first message to a fresh Claude Code
session to continue LATCH with full context.
(Last updated 2026-07-03 — HEAD `3d0848a`; tree clean & green; 17 commits this session, all committed.)

---

ultrathink You're continuing **Phase 3** of LATCH — a free/open web+desktop node-based creative-coding tool (Vue 3 + TS + Vite, Electron Forge) at `/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format` (HEAD `3fdfc7c`). **Phases 0–2 done; Phase 3 bullets 1 + 2 DONE; bullet 3 started (control keyboard + ARIA done).** Tree is CLEAN and green. Get oriented before touching code.

Baseline (verify with a quick run): typecheck clean · lint 0 err (49 pre-existing any-warns ok) · `test:unit` **1935 pass + 11 todo** (122 files) · `build` ok.

## STEP 1 — Read, in order
1. `CLAUDE.md` — rules. **NO AI attribution in git, ever** (history/PRs read as Moheeb Zara's). **Commit only when asked.** Stay on the branch. Each step ends green. **Never assume — read the real code / verify against the actual git original** (this saved wavetable: reading the executor proved the new `waveform` control is runtime-safe). Honor `strategy/05` DON'T-OVERCLAIM.
2. `docs/HANDOFF.md` TOP entries **(later 43 → 38)** — this session's arc, newest first: (43) bullet-3 control a11y; (42) `xy-pad`+`wavetable` migrations + **ultracode regression audit that caught 3 real bugs**; (41) `parametric-eq` migration + feasibility sweep; (40) first migration `envelope-visual`; (39) Tier-B `eq`/`wave`/`xy`+XYPad; (38) first Tier-B `env`.
3. `docs/plans/DECLARATIVE_UI_NODEVIEW_DESIGN_2026-07-01.md` — the approved bullet-2 design (Q1–Q4 settled). **Q2 is still OPEN**: `component?` = a real `Component` import on the definition, or a string key via a registry? — needed before `component?` consumption.
4. `docs/plans/ROADMAP_2026-06-28.md` — progress snapshot (top) + the **Phase 3** section.
5. Recall memories: **audit-against-true-original** (verify each migration vs its OWN pre-migration git original), **latch-component-test-gotchas** (@vue/test-utils: import stores before `.vue`, stub `Handle`; template `|` union casts trip `vue/no-deprecated-filter` → move to `<script>`; a NEW gotcha this session: two redundant mechanisms make a mutant un-killable — simplify to one), **latch-smoke-test-harness**, **latch-undefined-css-tokens**.

## WHERE WE ARE — Phase 3
- **Bullet 1 DONE** (don't re-open): one `<ControlRenderer>` (canvas+panel) + one `when`/`evaluateWhen`.
- **Bullet 2 DONE** — declarative `ui` + `NodeView`:
  - **Tier A**: `UISchema`/`WidgetType` + `ui?`/reserved `component?` on `NodeDefinition`; `evaluateWhen` `{ne}/{gt}/{lt}`; `NodeView.vue` (primitives→`<ControlRenderer>`, dispatches knob/asset/connection/readout); `validateUISchema` (custom = Tier-A only, resolvable binds, primitive props/when, reserved keys rejected, `component` stripped).
  - **Tier B** (aggregates, BUILT-IN ONLY): `env`/`eq`/`wave`/`xy` — one structured value ↔ several flat controls via positional `props.fields`, shared `fieldNumber` fallback (value→control-default→0), fan one `update`/field. `XYPad.vue` is a new reusable control.
  - **All 4 aggregate-backed bespoke nodes MIGRATED** to `ui` (off `components.ts` → BaseNode+NodeView): `envelope-visual`(env), `parametric-eq`(eq), `xy-pad`(xy, multi-row: pad+readouts+range), `wavetable`(wave — needed a data-only `waveform` control for the bare-`node.data`-key blocker; runtime-safe, samples used only when preset==='custom'). Each has a behavioral-parity test (`tests/unit/registry/*-migration.test.ts`), mutation-verified + browser-confirmed.
  - **An ultracode audit caught + fixed 3 regressions** the per-migration tests missed (commit `e7b1f9b`): (1) node-drag hijacked editor drags → `@mousedown.stop` on `.nv-widget`; (2) persisted nodes broke on reload — a SECOND routing list `PERSISTENCE_SPECIAL_NODE_TYPES` in `usePersistence.toFlowState` still named them → removed (test pins the two-list invariant); (3) `ui` audio nodes compacted to an icon → `isCompactNode` now exempts `hasUi`.
- **Bullet 3 STARTED — control keyboard + ARIA DONE** (commit `ae23ce9`): RotaryKnob (`role=slider` + keydown Arrow/Shift/Page/Home/End + focus ring), XYPad (`role=application` 2D keyboard + `aria-valuetext` + live region), ControlRenderer (`:aria-label` on all 6 native inputs). WCAG-spec'd via workflow, mutation-verified, knob confirmed in-browser.
- **Bullet 3 — drag-to-scrub DONE** (commit `21e662b`): the shared number input scrubs on horizontal drag. Safe-by-design (risk-spec'd via workflow): mousedown never preventDefaults, a >4px threshold proves scrub intent so click-to-edit is preserved; absolute mousedown-value+dx mapping, clamp only against DECLARED finite min/max (reuses `clampControlNumber`'s guard — an unbounded control must not clamp), Shift=fine, leak-safe teardown. Browser-confirmed (click focuses; drag scrubs 0→15).

## WHAT'S NEXT — bullet-3 remainder + deferred bullet-2 items (each flagged)
1. **New control TYPES** (`range`/`curve`/`gradient`) — need a real node consumer; deferred per the design doc until one exists.
2. **Canvas-editor keyboard** (Envelope/EQ/Waveform aggregate editors) — still pointer-only; a harder a11y follow-up (per-handle focus + arrow control). Deferred.
3. **`component?` consumption** — BLOCKED on design **Q2** (decide the shape first). Then make resolution read `definition.component` + `components.ts` derive from it; guard: registry set unchanged.
   (Orphan-SFC cleanup is DONE — the 4 migrated nodes' dead `.vue` were deleted; bullet 2 is fully finished.)
- The other ~24 bespoke SFCs (mediapipe ×7, emulator, function, keyboard, gamepad-visual, synth, step-sequencer, dispatch, monitor/oscilloscope/graph/equalizer, main-output, trigger, textbox, knob) legitimately keep `component?` — live surfaces / raw input / bespoke geometry, NOT migration candidates.

## HOW TO WORK
- Each step ends green: `typecheck` + `lint` + `test:unit` (`build` for prod-source; **smoke for any runtime/UI change**). Smoke = Playwright + system Chrome; run the `.mjs` from the repo root so bare `playwright` resolves (`channel:'chrome'`, headless, filter benign device/XNNPACK/TensorFlow/AudioContext noise) → 0 real console errors. **Migrations need the browser check**: freshly-added nodes don't paint their canvas *body* in headless (a pre-existing quirk, affects untouched nodes too) — verify via the **properties panel** (`.node-view` + editor canvas) and, for persistence, **add→autosave→`page.reload()`→ rehydrates as `vue-flow__node-custom` + NodeView**.
- **TDD + mutation-verify EVERY increment**: test → red → implement → green; then hand-break via `perl`/`cp .bak` (NEVER `git checkout` — wipes uncommitted work) and confirm the test reds. A passing test ≠ a guarding test (proven repeatedly; the audit found regressions the "green" per-migration tests didn't cover — canvas + persistence).
- **ultracode pattern** (when the maintainer says "ultracode" — use the Workflow tool): parallel read-only spec/audit agents → act on findings → adversarially verify. It has repeatedly earned its keep (the migration regression audit; the WCAG a11y specs). Caveat: the schema-heavy agent has hit the StructuredOutput retry cap ~3× — run that one probe inline if it fails.
- Commit only when asked; logical, individually-revertible, dependency-ordered; **no AI attribution** (author Moheeb Zara). Update `docs/HANDOFF.md` + the ROADMAP snapshot + this kickoff doc at close.

## INHERITED INVARIANTS (don't regress / don't overclaim)
- **NodeView is opt-in** (`definition.ui` only). ~180 nodes keep BaseNode auto-layout; ~24 bespoke SFCs route via `components.ts`. **`component?` is declared but NOT consumed** — don't call it wired.
- **TWO routing lists must agree**: a migrated node must be absent from BOTH `CUSTOM_NODE_TYPE_IDS` (`registry/components.ts`, freshly-added path) AND `PERSISTENCE_SPECIAL_NODE_TYPES` (`usePersistence.ts`, IndexedDB rehydration). `tests/unit/registry/migration-routing.test.ts` pins this.
- **Aggregates (env/eq/wave/xy) are BUILT-IN ONLY** — keep them out of `CUSTOM_UI_WIDGETS`; `validateUISchema` rejects them for custom nodes. Aggregate fields must be DECLARED controls (BaseNode.controlValues only exposes declared controls — the wavetable trap).
- **`<ControlRenderer>` byte-faithful per `context`**; presentational (host owns value/undo). **`evaluateWhen` is the ONE visibility evaluator.** **`@mousedown.stop` on `.nv-widget`** keeps canvas node-drag from hijacking editor drags — don't remove.
- **A `ui` node is never compact** (`isCompactNode` exempts `hasUi`) — it must render its NodeView body.
- **Security DONE at Node-RED parity** (no-secret handle + redaction + secret-free `.latch`) — don't re-harden. Capability gate/trust tiers DORMANT for built-ins. Every register-once subsystem has a count/set-equality gate.
