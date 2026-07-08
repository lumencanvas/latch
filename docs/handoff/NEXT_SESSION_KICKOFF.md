# Next-session kickoff — Phase 4 accessibility stream FULLY COMPLETE (all 33 findings closed); non-a11y Phase-4 next

Copy everything in the block below as your first message to a fresh Claude Code session to continue LATCH
with full context.
(Last updated 2026-07-07 — branch `phase0-file-format`. The **Increment-5 low-a11y-tails** work is
**committed + pushed** (`a784d3b` search-ring · `fc1a68f` grid→detail focus · `2b52234` template listbox ·
`b9534b9` tab↔canvas association + `a18a3e4` docs; author Moheeb Zara, no AI attribution). The **Increment-6
Theme-D port/edge type cue** may still be **uncommitted in the tree** — verify with `git status`; if so,
commit it (author Moheeb Zara, no AI attribution) after a `git log --oneline -8`.)

---

ultrathink You're continuing **LATCH** — a free/open, web+desktop, node-based creative-coding tool ("Live Art
Tool for Creative Humans"; Vue 3 + TS + Vite, Electron Forge; 238 nodes) at
`/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format`. **Phase 3 (Control system +
declarative UI) is DONE. Phase 4 accessibility is FULLY COMPLETE** — the app-wide **33-finding audit is 100%
addressed**: the headline canvas-keyboard finding (WCAG 2.1.1) is CLOSED (select/move/wire all keyboard-
operable), Increment 5 closed the four low tails, and **Increment 6 closed the last item — the Theme-D
port/edge type cue** (shared per-type `lineStyle` on port dot + edge, plus a per-type glyph on hover).
**All 33 audit findings are closed** (Theme-D per the maintainer's line-style+hover-glyph choice; honest
residual — same-hue *solid* types are separated by the glyph on interaction, not the resting dot). **Get
oriented before touching code, and pick the next thread with me** — the remaining Phase-4 work is non-a11y
(canvas toolbar/marquee, snippets, onboarding).

Baseline (verify with a quick run): typecheck clean · lint 0 err (49 pre-existing `any`-warns ok) ·
`test:unit` **2004 pass + 11 todo** (135 files) · `build` ok.

## STEP 1 — Read, in order
1. `CLAUDE.md` — rules. **NO AI attribution in git, EVER** (commits/PRs/tags read as Moheeb Zara's).
   **Commit only when asked.** Stay on the branch. Each step ends green. **Never assume — read the real code /
   verify against the actual git original.** Honor `strategy/05` **DON'T-OVERCLAIM**.
2. `docs/A11Y_APP_AUDIT_2026-07-03.md` — **the Phase-4 a11y tracker**: 33 confirmed findings grouped by theme.
   Modal/Theme-B/Theme-C/Theme-D-mechanical all DONE; **Theme F (canvas keyboard) CLOSED** (increments 1–3);
   **Increment 5 closed the low tails**. Only remaining = the deferred port/edge type-colour cue.
3. `docs/HANDOFF.md` TOP entries **(later 58 → 52)**, newest first: (58) **Increment 5 — the four low a11y
   tails** (search-input `:focus-visible` ring · grid→detail focus · TemplateSelect listbox arrow-roving,
   unit+mutation · flow-tab `aria-controls`); (57) **Theme F inc 3 — keyboard wiring; 2.1.1 CLOSED**; (56)
   **Theme F inc 2 — keyboard move** (fixed a bare-`Shift`-splits-undo-batch bug); (55) **Theme F inc 1 —
   focus + nav + select** (`role="application"` host); (54) **Theme D non-colour cues** (invisible-badge fix +
   tag chips); (53) regression audit + hardening; (52) app-wide audit + modal focus + Theme-B. **Verification
   lesson: Vue Flow's `:only-render-visible-elements` makes DOM edge counts + screen coords unreliable — verify
   canvas state via node inline-transform (flow coords) + the Pinia store.**
4. `docs/plans/ROADMAP_2026-06-28.md` — canonical phase order + the top progress snapshot. **This owns
   sequencing; where older `docs/plans/` files conflict, this wins.**
5. Recall memories: **latch-a11y-bug-classes** (mouse-only `<div>` triggers, `display:none` faux inputs, scoped
   `:focus{outline:none}` killing the ring, `role=application` canvas idiom; **app-chrome SFCs
   (AppSidebar/FlowTabs/NodeExplorer/EditorView) don't cleanly unit-mount → verify via browser smoke**),
   **latch-smoke-test-harness** (Playwright + system Chrome; **LATCH dev serves 5173 or 5174 depending on
   what's free — ALWAYS grep the dev log for `Local:`; another Vite project may hold the other port**, and
   check `document.title==='LATCH'` before probing), **latch-strategy** (positioning = open/durable/**accessible**,
   NOT performance), **latch-component-test-gotchas**, **audit-against-true-original**,
   **latch-undefined-css-tokens**, **node-library-backlog**.

## WHERE WE ARE
- **Phase 0 (Foundations): DONE.** **Phase 1 (de-monolith/leak class): ~95%** (only `subflow`, → Phase 7).
  **Phase 2 (register-once subsystems): IN PROGRESS** — security spine DONE at Node-RED parity; remaining BLE
  device-picker UX (`TODO(ble-ux)`) + a few adapters. **Phase 3 (Control + declarative UI): DONE.** Only
  deferred Phase-3 item: new control TYPES (`range`/`curve`/`gradient`) — need a real consumer node.
- **Phase 4 (Canvas, onboarding & accessibility): accessibility stream FULLY COMPLETE (33/33).** An ultracode
  5-surface audit (`docs/A11Y_APP_AUDIT_2026-07-03.md`) → **33 confirmed findings, all now closed.** Increments:
  (1) modal-focus layer `useDialogA11y` across 8 dialogs; (2) Theme-B mouse-only-`<div>`→`<button>` sweep;
  (3) Theme-C names/labels + Theme-E live region; (4) Theme-D mechanical non-colour cues (status badge — also a
  real invisible-Tailwind-badge fix — + tag chips); **Theme F — canvas keyboard select/move/wire, 2.1.1 CLOSED**
  (`role="application"` host on `.editor-view`; arrow-cursor + Enter-select + grid-step move with
  one-undo-per-burst + from-scratch `w`-wiring reusing `onConnect`); **(5) the four low tails (later-58):**
  `.search-input` `:focus-visible` ring, grid→detail focus, TemplateSelect listbox arrow-roving, flow-tab→canvas
  `aria-controls`; **(6) Theme-D port/edge type cue (later-59, 1.4.1) — the last item:** shared per-type
  `lineStyle` on the port dot (hollow ring for dotted/dashed via `--port-color` + a class, before the wire-glow
  rules) and its edge (`stroke-dasharray` on the persistent `BaseEdge`), plus a per-type `glyph` (in
  `dataTypeMeta`) revealed on the port label on hover; node-explorer legend updated to document glyph +
  line-style. Unit+mutation (BaseNode) + browser-verified (incl. the wire-glow-over-line-style cascade).
  **All 33 audit findings closed** — honest residual: same-hue *solid* types are separated by the
  on-interaction glyph, not the resting dot (the maintainer-chosen compromise).

## WHAT'S NEXT — pick a thread with me (each flagged)
1. **Phase 4 non-a11y (the real remaining Phase-4 body):** canvas toolbar + marquee selection, snippets tab +
   `flowToPreview` thumbnails, templates on the empty canvas, onboarding. (POLISH Streams 2–3.) Scope one
   sub-item first.
2. **Theme F inc 4 (optional polish):** spatial nearest-in-direction nav, an edge-cursor sub-mode for keyboard
   edge-delete, a rubber-band ghost edge while wiring, and/or extracting the copy-pasted `role="application"`
   chrome (canvas + 4 editors) into a shared `useApplicationKeyboard` composable.
3. **Other threads:** Phase 2 BLE device-picker UX; Phase 5+ (modulation gap / co-location / subflow / VJ).
Ask me which to take. Don't dive into a whole new phase without confirming.

## HOW TO WORK
- **Each step ends green:** `typecheck` + `lint` + `test:unit` (`build` for prod-source; **smoke for any
  runtime/UI change**). Smoke = Playwright + system Chrome: write the `.mjs` in scratchpad, `import pw from
  '<repo>/node_modules/playwright/index.js'`, `channel:'chrome'`, headless, `--use-fake-*-for-media-stream` +
  camera/mic perms, filter benign device/XNNPACK/TensorFlow noise → 0 real console errors. **LATCH dev = 5174**
  (grep the dev log for `Local:`; a different project may be on 5173). Open the node explorer via
  `pinia._s.get('ui').openNodeExplorer()` if the header button isn't the trigger.
- **Test env is happy-dom** (`tests/setup.ts`): programmatic `focus()`/`activeElement`/Tab-trap logic IS
  testable, but scoped CSS + `:focus-visible` + layout are NOT → verify focus RINGS / `display` / visual
  restructures in a REAL browser.
- **App-chrome SFCs don't cleanly unit-mount** (AppSidebar/FlowTabs/NodeExplorer/EditorView) → verify via
  **browser-DOM assertions** on the live app, and SAY it's browser-verified. Props/store-driven leaf components
  (AssetCard, ConnectionList, DebugPanel, TemplateSelect, ConnectionSelect, CategoryNav) DO unit-mount — TDD +
  mutation those. **Attribute fallthrough:** a single-root child (e.g. NodeCard's `<button>`) receives passed
  attrs like `:data-node-id` on its root — handy for focus-restore lookups.
- **TDD + mutation-verify EVERY unit-testable increment:** test → red → implement → green; then hand-break via
  `perl`/`cp .bak` (NEVER `git checkout` — wipes uncommitted work) and confirm red.
- **ultracode pattern** (when I say "ultracode" — use the Workflow tool): parallel read-only audit → adversarially
  verify each finding → act on the confirmed set. Keep finding schemas modest.
- **Commit only when asked**; logical, individually-revertible, file-level-clean commits; **no AI attribution**
  (author Moheeb Zara). Update `docs/A11Y_APP_AUDIT_2026-07-03.md` + `docs/HANDOFF.md` + the ROADMAP snapshot +
  this kickoff at close.

## INHERITED INVARIANTS (don't regress / don't overclaim)
- **`useDialogA11y` is the shared dialog/menu focus layer.** Bind `onKeydown` to the OVERLAY, ref the CONTAINER,
  add roles yourself; opening one dialog FROM a menu needs a `nextTick` focus decouple (else the restore target
  is the about-to-unmount menu item and focus falls to `<body>`).
- **Canvas keyboard idiom = `role="application"` host + arrow-cursor** (roved, distinct from selection) + live
  region; a per-node tabindex is impossible under `:only-render-visible-elements` — a store-backed cursor is the
  pattern. All 4 control editors share it. **The EditorView host is `#flow-canvas-panel`** (flow tabs point
  `aria-controls` at it); it can't also be `role="tabpanel"` (one role per element).
- **Focus-management idiom for view swaps:** move focus to the new view's heading (`tabindex="-1"`, ring
  suppressed since the swap is the visible cue) so AT announces context; restore focus to the originating
  control on "back" (see NodeExplorer grid↔detail).
- **`component` is the SINGLE SOURCE** of custom-component routing; **NodeView is opt-in** (`definition.ui`);
  **aggregates are BUILT-IN ONLY.** **Security is DONE at Node-RED parity** — don't re-open the sandbox.
- **DON'T-OVERCLAIM** (`strategy/05`): a CSS/focus fix that only happy-dom "passed" is NOT verified — say so; a
  browser-DOM-asserted fix is "browser-verified", not "unit+mutation-verified"; report skipped checks honestly.
