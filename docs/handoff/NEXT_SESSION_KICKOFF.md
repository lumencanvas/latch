# Next-session kickoff — Phase-4 a11y COMPLETE; canvas experience + code-health pass done; snippets tab + drag-wire suggestions DONE, onboarding next

Copy everything in the block below as your first message to a fresh Claude Code session to continue LATCH
with full context.
(Last updated 2026-07-08 — branch `phase0-file-format`, everything **committed + pushed** through `c0abe89`.
Tree CLEAN & green; snippets-tab + drag-wire + keyboard-suggest smokes = 0 real console errors. Verify with `git log --oneline -20`.)

---

ultrathink You're continuing **LATCH** — a free/open, web+desktop, node-based creative-coding tool ("Live Art
Tool for Creative Humans"; Vue 3 + TS + Vite, Electron Forge; ~238 nodes) at
`/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format`. **Phases 0–3 are done. Phase 4 is
well underway:** the accessibility stream is **100% closed** (all 33 app-audit findings), a **code-health
refactor** de-bloated the canvas, and several **experience features** shipped on the cleaned-up base.
**Get oriented before touching code, then pick the next thread with me.**

Baseline (verify with a quick run): typecheck clean · lint 0 err (49 pre-existing `any`-warns ok) ·
`test:unit` **2044 pass + 11 todo** (142 files) · `build` ok · boot→Play→Stop smoke 0 real console errors.

## STEP 1 — Read, in order
1. `CLAUDE.md` — rules. **NO AI attribution in git, EVER** (commits/PRs/tags read as Moheeb Zara's).
   **Commit/push only when explicitly asked.** Stay on `phase0-file-format` (branch off `main` for new work).
   Each step ends green. **Never assume — read the real code / verify against the actual git original.** Honor
   `strategy/05` **DON'T-OVERCLAIM**.
2. `docs/HANDOFF.md` TOP entries **(later 69 → 58)**, newest first. Recent arc: (69) later-68 audit +
   **keyboard-trigger** for the wire-drop picker (`n` during a keyboard wire → same picker); (68) **drag-a-wire-
   into-empty → compatible-node suggestions** (inline combobox popover + `suggestNodesForPort`); (67) **dedicated snippets tab** +
   the rule-of-three `nodeTypeColor` extraction; (66) end-of-session runtime smoke + snippets searchable;
   (65/64) `flowToPreview` thumbnails on starter + snippet cards + a self-audit;
   (63) marquee/box-select (Vue Flow built-in); (61/62) **canvas-keyboard extraction into a composable** +
   editor DRY; (60) starter templates on the empty canvas; (54–59) the a11y stream (Theme F canvas keyboard,
   Theme D type cues, the low tails).
3. `docs/plans/ROADMAP_2026-06-28.md` — canonical phase order + the progress snapshot at the top. **This owns
   sequencing; where older `docs/plans/` files conflict, this wins.**
4. `docs/A11Y_APP_AUDIT_2026-07-03.md` — the a11y tracker, now **all 33 findings closed** (reference only).
5. Recall memories: **latch-a11y-bug-classes**, **latch-smoke-test-harness**, **latch-strategy**
   (open/durable/**accessible**, NOT performance), **latch-component-test-gotchas**, **audit-against-true-original**,
   **latch-undefined-css-tokens**, **node-library-backlog**.

## WHERE WE ARE
- **Phase 0 (Foundations): DONE.** **Phase 1 (de-monolith/leak class): ~95%** (only `subflow`, → Phase 7).
  **Phase 2 (register-once subsystems): IN PROGRESS** — security spine DONE at Node-RED parity; remaining BLE
  device-picker UX (`TODO(ble-ux)`) + Serial/MIDI adapters. **Phase 3 (Control + declarative UI): DONE.**
- **Phase 4 (Canvas, onboarding & accessibility): IN PROGRESS, lots done this session.**
  - **Accessibility: 100% CLOSED** — all 33 findings of the app-wide audit. Canvas is keyboard-operable
    (select/move/wire via `useCanvasKeyboard`), non-colour port/edge type cues (shared `lineStyle` + hover glyph),
    modal focus, names/labels, the low tails.
  - **Code-health refactor (later-61/62):** the ~485-line canvas keyboard state machine was inlined in
    `EditorView.vue` (1539 lines, browser-only-verifiable). Extracted to **`composables/useCanvasKeyboard.ts`**
    (nav/move/wire; Vue-Flow helpers + history batch + toast **injected** as deps → **now unit-tested**, 6 tests)
    on **`composables/useApplicationKeyboard.ts`** (the shared `focused`/onFocus/onBlur primitive, adopted by the
    canvas + Envelope/EQ/Waveform editors; XYPad excepted — no focus flag). **EditorView is now 1044 lines.**
  - **Experience features on the clean base:** starter templates on the empty canvas (later-60); **mouse
    marquee** — Shift+drag box-select + Cmd/Ctrl-click additive, Vue Flow built-in, *additive* so left-drag still
    pans (touch preserved) (later-63); **`flowToPreview` thumbnail primitive** (pure, tested) rendered on the
    starter cards + all explorer snippet cards (later-64/65); snippets now findable by search (later-66);
    **dedicated snippets tab** — the node explorer content area is a `role="tablist"` (Nodes | Snippets, FlowTabs
    roving-tabindex model) with the 6 built-in snippets in their own first-class tabpanel; paired with it the
    3-copy category-colour resolver was extracted to `utils/nodeColor.ts` (`nodeTypeColor`) (later-67);
    **drag-a-wire-into-empty → compatible-node suggestions** — an inline combobox popover
    (`components/canvas/WireSuggestionPopover.vue`) of type-compatible nodes (pure `suggestNodesForPort`,
    injected `areTypesCompatible`), pick → insert at drop + auto-wire in one undo; empty-space-only (later-68).
    **Fully keyboard-operable (later-69):** during a keyboard wire (`w`), `n` opens the same picker beside the
    source node (also the escape from the "no compatible target" dead-end) — via an optional
    `suggestNodeFromWire` dep on `useCanvasKeyboard`.
  - **Remaining non-a11y Phase-4:** **onboarding**, **on-wire debugging** (freeze-frame + per-port value preview).
    `<Controls>`+`<MiniMap>` already cover zoom/fit + the toolbar; snippets tab + marquee + thumbnails +
    drag-wire suggestions all shipped.
- **Phases 5–9: not started.** Phase 5 = the modulation gap (input ports on modulatable params). Phase 6 =
  **full per-node co-location** (`registry/<cat>/<node>/`) — the largest single item and the deepest
  "node-isolation" work. Phase 7 subflow rebuild, 8 VJ/kiosk, 9 multiplayer.

## WHAT'S NEXT — pick a thread with me (each flagged)
1. **On-wire debugging** — per-port value preview / freeze-frame + error-to-exact-node deep-linking;
   persona-critical for a dataflow tool, but larger (needs runtime value exposure from the engine). Scope first.
2. **Onboarding** — the last named non-a11y Phase-4 experience item (snippets tab + marquee + thumbnails +
   drag-wire suggestions all done). Self-contained UI.
3. A **node-isolation pivot** (Phase 6 co-location — the deep per-node isolation work; scope one category
   first), if pivoting off Phase 4.
4. **Phase 5 modulation gap** (input ports on modulatable params) — can overlap Phase 4.
Ask me which to take. Don't dive into a whole new phase without confirming.

## HOW TO WORK
- **Each step ends green:** `typecheck` + `lint` + `test:unit` (`build` for prod-source; **smoke for any
  runtime/UI change**). Smoke = Playwright + system Chrome: write the `.mjs` in scratchpad, `import pw from
  '<repo>/node_modules/playwright/index.js'`, `channel:'chrome'`, headless; **LATCH dev serves 5173 OR 5174 —
  ALWAYS grep the dev log for `Local:` and check `document.title==='LATCH'`** before probing (another Vite app
  may hold the other port). For runtime health add `--use-fake-*-for-media-stream` + camera/mic perms and filter
  benign XNNPACK/TensorFlow/WebGL/AudioContext noise → 0 real errors.
- **Vue Flow verification gotchas (hard-won):** `:only-render-visible-elements` makes **DOM node/edge counts and
  screen coords unreliable** — read graph truth from **Pinia** (`#app.__vue_app__.config.globalProperties.$pinia._s`)
  and node positions from **flow coords**; a **pan** is proven by a node's *screen* rect shifting while its *flow*
  position stays put. **Scope `querySelector`** — `.empty-state` is a class shared by several panels; use
  `.editor-view .empty-state` / a unique child. Vue Flow **1.48.2** selection: `selectionKeyCode` (Shift-drag box),
  `multiSelectionKeyCode` (Cmd/Ctrl-add); **no `selectionOnDrag`**, so left-drag-marquee would need
  `panOnDrag:[1,2]` which breaks touch pan — keep marquee additive.
- **What unit-mounts vs what doesn't:** **composables** (`useCanvasKeyboard`, `useApplicationKeyboard`) and pure
  **utils** (`snippetToInsertableNodes`, `flowToPreview`) and **leaf components** (FlowSnippet, editors, controls)
  → **TDD + mutation-verify** (test→red→implement→green, then hand-break via `perl`/`cp .bak`, NEVER `git checkout`).
  **App-chrome SFCs** (EditorView, NodeExplorer, AppSidebar, FlowTabs) don't cleanly unit-mount → **browser-verify
  and SAY "browser-verified."**
- **Codebase idioms to follow (not reinvent):** the **injected-resolver** pattern for store-agnostic testable
  helpers (`getDefinition`/`getColor` passed in — see `snippetToInsertableNodes`, `flowToPreview`,
  `deriveModelDefinition`). **Rule of three** before extracting a shared helper (avoid premature abstraction — the
  `useApplicationKeyboard` design was tightened once its real consumers showed only `focused` is universal). The
  **canvas keyboard model lives in `useCanvasKeyboard`** now — extend it there, not back in EditorView.
- **Commit only when asked**; logical, individually-revertible, file-level-clean commits; **no AI attribution**
  (author Moheeb Zara). Update `docs/HANDOFF.md` + the ROADMAP snapshot + this kickoff at close.

## INHERITED INVARIANTS (don't regress / don't overclaim)
- **`useDialogA11y`** is the shared dialog/menu focus layer (focus move-in / trap / restore / Escape); menu→modal
  needs a `nextTick` focus decouple. **`useApplicationKeyboard`** = the `role="application"` focus primitive.
- **Canvas keyboard idiom** = `role="application"` host + a store-backed arrow-cursor (distinct from selection);
  per-node tabindex is impossible under virtualization. The EditorView host id is **`#flow-canvas-panel`** (flow
  tabs point `aria-controls` at it; it can't also be `role="tabpanel"`).
- **`component` is the single source** of custom-node routing; **NodeView is opt-in** (`definition.ui`);
  **aggregates are BUILT-IN only.** **Security is DONE at Node-RED parity** — don't re-open the sandbox.
- **Type cue:** `dataTypeMeta` carries `color` + `lineStyle` (edge dash / port ring) + `glyph` (hover) — a port
  and its edge share the `lineStyle`. Honest residual: same-hue *solid* types are separated by the on-hover glyph,
  not the resting dot (maintainer-chosen compromise).
- **DON'T-OVERCLAIM** (`strategy/05`): happy-dom "passed" ≠ verified for CSS/focus; a browser-DOM-asserted fix is
  "browser-verified", not "unit+mutation"; **verify hypotheses empirically** (e.g. the `var()`-as-SVG-`fill`
  scare was disproven by measuring — Chromium resolves it); report skipped checks honestly.
