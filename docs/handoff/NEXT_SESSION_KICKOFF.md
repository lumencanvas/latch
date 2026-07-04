# Next-session kickoff — Phase 4 accessibility IN PROGRESS (~30/33 audit findings closed + regression-audited)

Copy everything in the block below as your first message to a fresh Claude Code session to continue LATCH
with full context.
(Last updated 2026-07-03 — branch `phase0-file-format`, last commit `f6f3d0a`; tree CLEAN & green;
everything this session is committed & regression-audited. Verify with `git log --oneline -13`.)

---

ultrathink You're continuing **LATCH** — a free/open, web+desktop, node-based creative-coding tool ("Live Art
Tool for Creative Humans"; Vue 3 + TS + Vite, Electron Forge; 238 nodes) at
`/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format`. **Phase 3 (Control system +
declarative UI) is DONE. Phase 4 (accessibility) is IN PROGRESS — ~30 of 33 app-wide audit findings closed
this session** across 3 increments. Tree is CLEAN and everything is committed & green. **Get oriented before
touching code, and pick the next thread with me.**

Baseline (verify with a quick run): typecheck clean · lint 0 err (49 pre-existing `any`-warns ok) ·
`test:unit` **1989 pass + 11 todo** (134 files) · `build` ok.

## STEP 1 — Read, in order
1. `CLAUDE.md` — rules. **NO AI attribution in git, EVER** (commits/PRs/tags read as Moheeb Zara's).
   **Commit only when asked.** Stay on the branch. Each step ends green. **Never assume — read the real code /
   verify against the actual git original.** Honor `strategy/05` **DON'T-OVERCLAIM**.
2. `docs/A11Y_APP_AUDIT_2026-07-03.md` — **the live Phase-4 a11y tracker**: 33 confirmed findings grouped by
   theme, with Increments 1–3 marked DONE and the remaining backlog (Themes D + F + low) called out.
3. `docs/HANDOFF.md` TOP entries **(later 53 → 46)**, newest first: (53) **adversarial regression audit of the
   Phase-4 a11y commits + 5 hardening fixes** (no real regressions; tablist roving fallback, context-menu→modal
   focus via nextTick, role=menu→group downgrade, ConnectionList row-click delegation, expand-btn labels);
   (52) **Phase-4 a11y: app-wide audit + modal focus layer + Theme-B div→button sweep + Theme-C/E names/live-
   region**; (51) audit of the control-surface a11y commits; (50) ultracode control-surface a11y audit + 7
   fixes; (49) generated-index cleanup; (48) WaveformEditor keyboard a11y; (47) `component` single-source
   routing; (46) Envelope+EQ keyboard.
4. `docs/plans/ROADMAP_2026-06-28.md` — canonical phase order + the progress snapshot at the top (Phase 4 now
   IN PROGRESS). **This owns sequencing; where older `docs/plans/` files conflict, this wins.**
5. Recall memories: **latch-a11y-bug-classes** (mouse-only `<div>` triggers, `display:none` faux inputs,
   scoped `:focus{outline:none}` killing the ring, `role=application` canvas idiom; **app-chrome SFCs
   (AppSidebar/FlowTabs/NodeExplorer/EditorView) don't cleanly unit-mount → verify via browser smoke, not
   unit tests**; **Vue Flow `<Handle>` forwards fallthrough attrs like `aria-label` to the handle DOM**),
   **latch-strategy** (positioning = open/durable/**accessible**, NOT performance; don't-overclaim),
   **latch-component-test-gotchas** (import stores before `.vue`; assert identity not value),
   **latch-smoke-test-harness** (Playwright + system Chrome vs `npm run dev`), **audit-against-true-original**,
   **latch-undefined-css-tokens**, **node-library-backlog**.

## WHERE WE ARE
- **Phase 0 (Foundations): DONE.** **Phase 1 (de-monolith/leak class): ~95%** (only `subflow`, deferred to
  Phase 7). **Phase 2 (register-once subsystems): IN PROGRESS** — security spine DONE at Node-RED parity;
  remaining BLE device-picker UX (`TODO(ble-ux)`) + a few adapters. **Phase 3 (Control + declarative UI):
  DONE** (one `<ControlRenderer>`; declarative `ui`+`NodeView` Tier-A + Tier-B aggregates; `component?` is the
  single routing source; all 4 canvas editors keyboard-operable). Only deferred Phase-3 item: new control
  TYPES (`range`/`curve`/`gradient`) — need a real consumer node.
- **Phase 4 (Canvas, onboarding & accessibility): IN PROGRESS — accessibility stream.** An ultracode 5-surface
  app-wide audit (`docs/A11Y_APP_AUDIT_2026-07-03.md`) → **33 confirmed findings** (16 high/15 med/2 low).
  Closed this session (~30) in 3 increments:
  - **Increment 1 — modal focus management (10).** NEW `composables/useDialogA11y.ts` (focus move-in · Tab
    focus-trap · focus restore to opener · Escape-to-close) applied to all 8 dialogs + `role="dialog"`/
    `aria-modal`/`aria-labelledby`, named close buttons, `role="status"` toasts, and the AIModelManager toggle
    off `display:none`. TDD + mutation-verified; browser-smoke 12/12.
  - **Increment 2 — Theme B: mouse-only `<div>`→`<button>` (~14).** Asset cards, connection/debug rows (wrap
    a select-`<button>`, keep action controls as siblings, or a plain button); node palette + category filter
    (buttons + listbox); flow tabs (roving `tablist` + arrow/F2/Delete/Shift+F10 + focus-managed context menu
    via `useDialogA11y`); HTTP template edit (sibling button + listbox). Unit+mutation for the mountable ones;
    browser-verified for the app-chrome (AppSidebar 11/11, FlowTabs 13/13).
  - **Increment 3 — Theme C names/labels + E live region (6).** Accessible names on the connection `<select>`,
    both search inputs, and port handles; `aria-label`+`aria-expanded` on the collapse toggle (BaseNode + 5
    bespoke shells); `aria-pressed` on category filters; `role="alert"` on the connection-error toast.
  - **The control-surface a11y (later-50/51)** was a separate, earlier pass — don't re-audit `controls/*` or
    `PropertiesPanel.vue`.

## WHAT'S NEXT — pick a thread with me (each flagged)
1. **Phase 4 a11y tail — Theme D: non-color cues (1.4.1).** Port/edge *type* + connection status + tag chips
   convey meaning by color alone (`BaseNode.vue`, `AnimatedEdge.vue`, `ConnectionStatusBadge.vue`,
   `NodeExplorer.vue` tag chips). The port/edge-type cue is a **visual-language decision** (adds a
   shape/letter/icon to every port across 208 nodes) — get the maintainer's call on the style FIRST.
2. **Phase 4 a11y headline — Theme F: canvas keyboard wiring (#1).** Keyboard select/move/**wire** nodes on
   the canvas (`role="application"` idiom; VueFlow). Node *adding* already works (tap-to-add via
   `addNodeAtCenter`/`nodeAddNonce`); movement + wiring are locked out. A dedicated multi-increment effort —
   scope the interaction model + confirm before building.
3. **Phase 4 non-a11y items:** canvas toolbar + marquee selection, snippets tab + `flowToPreview` thumbnails,
   templates on the empty canvas, onboarding. (POLISH Streams 2–3; see ROADMAP Phase 4.)
4. **Low a11y tails:** #33 (NodeExplorer grid→detail focus management), #14 (full template-listbox arrow-key
   roving), and the FlowTabs `role="tab"` → `tabpanel`/`aria-controls` association (deferred in later-53 — the
   editor canvas is the shared panel; needs a small cross-component decision, or reconsider role=tab vs a
   labelled button group).
5. **Other threads:** Phase 2 BLE device-picker UX; Phase 5+ (modulation gap / co-location / subflow / VJ).
Ask me which to take. Don't dive into a whole new phase without confirming.

## HOW TO WORK
- **Each step ends green:** `typecheck` + `lint` + `test:unit` (`build` for prod-source; **smoke for any
  runtime/UI change**). Smoke = Playwright + system Chrome: write the `.mjs` in scratchpad, import via
  `import pw from '<repo>/node_modules/playwright/index.js'; const { chromium } = pw` (bare `playwright` won't
  ESM-resolve from scratchpad), `channel:'chrome'`, headless, `--use-fake-*-for-media-stream` +
  `permissions:['camera','microphone']`, filter benign device/XNNPACK/TensorFlow/AudioContext noise → 0 real
  console errors. Open modals via header `button[title="Node Explorer"|"Connection Manager"|"AI Model
  Manager"]`; expand a sidebar `button.category-header` to render `.node-item`s.
- **Test env is happy-dom** (`tests/setup.ts`): programmatic `focus()`/`activeElement`/`Tab`-trap logic IS
  testable (used by `useDialogA11y.test.ts`), but scoped CSS + `:focus-visible` + layout are NOT → verify
  focus RINGS / `display` / visual restructures in a REAL browser.
- **App-chrome SFCs don't cleanly unit-mount** (AppSidebar/FlowTabs/NodeExplorer/EditorView have heavy
  registry/VueFlow/IndexedDB deps) → verify those via **browser-DOM assertions** on the live app, and SAY it's
  browser-verified (not unit+mutation). Props/store-driven leaf components (AssetCard, ConnectionList,
  DebugPanel, TemplateSelect, ConnectionSelect, CategoryNav) DO unit-mount — TDD + mutation those.
- **TDD + mutation-verify EVERY unit-testable increment:** test → red → implement → green; then hand-break via
  `perl`/`cp .bak` (NEVER `git checkout` — wipes uncommitted work) and confirm red.
- **ultracode pattern** (when I say "ultracode" — use the Workflow tool): parallel read-only audit agents →
  adversarially VERIFY each finding (reject nits/already-done/out-of-scope) → act on the confirmed set. The
  app-wide a11y audit this session had excellent signal (33/35 confirmed). Keep finding schemas modest to
  avoid the StructuredOutput retry cap.
- **Commit only when asked**; logical, individually-revertible, file-level-clean commits; **no AI attribution**
  (author Moheeb Zara). Update `docs/A11Y_APP_AUDIT_2026-07-03.md` + `docs/HANDOFF.md` + the ROADMAP snapshot +
  this kickoff at close.

## INHERITED INVARIANTS (don't regress / don't overclaim)
- **`useDialogA11y` (`composables/useDialogA11y.ts`) is the shared dialog/menu focus layer.** Bind its
  `onKeydown` to the OVERLAY `@keydown`, pass a template ref to the CONTAINER, and add `role="dialog"`+
  `aria-modal`+`aria-labelledby` (or `role="group"` for the tab context menu — NOT `role="menu"`, which we
  don't fully implement) yourself. It moves focus in on open, traps Tab, restores focus to the opener on close,
  and closes on Escape. Used by all 8 modals + the FlowTabs context menu. For a modal that already handles a
  key (e.g. CodeEditor's Ctrl+S), COMPOSE: handle your key, else call `onKeydown(e)`.
  - **Opening one dialog FROM another (menu → modal): decouple with `nextTick`.** It captures its restore
    target at open time = `document.activeElement`; if you open it synchronously while a menu is closing, it
    captures the about-to-unmount menu item and focus falls to `<body>` on close. Close the first, then open
    the second in `nextTick` (see FlowTabs `renameFlow`/`closeFlowFromMenu`). Watch-DECLARATION-ORDER does NOT
    reliably control this — verified empirically in later-53; use the nextTick decouple.
- **Mouse-only-`<div>` fix pattern:** if the interactive element has NO nested interactive content, make it a
  `<button>` (keyboard-operable by contract). If it wraps an action control (delete/edit/actions), DON'T nest
  — wrap the select area in a `<button>` and keep the action(s) as SIBLINGS in a container `<div>`. Reset the
  button chrome in CSS (`background/border/padding/font/color/text-align` + `:focus-visible` ring) and reveal
  hover-only affordances on `:focus-within` too.
- **`component` is the SINGLE SOURCE** of custom-component routing (`components.ts` derives `nodeTypes` +
  `CUSTOM_NODE_TYPE_IDS` from `allNodes.filter(d => d.component)`; `PERSISTENCE_SPECIAL_NODE_TYPES` is a
  reference alias). **NodeView is opt-in** (`definition.ui`). **Aggregates are BUILT-IN ONLY.** **All 4 canvas
  editors** use the `role="application"` + selected-target-arrows idiom — match it for any new canvas editor.
- **Security is DONE at Node-RED parity** — don't re-open the sandbox.
- **DON'T-OVERCLAIM** (`strategy/05`): a CSS/focus fix that only happy-dom "passed" is NOT verified — say so;
  a browser-DOM-asserted fix is "browser-verified", not "unit+mutation-verified"; keyboard *operability* ≠
  "freehand-draw by keyboard"; report skipped browser checks honestly.
