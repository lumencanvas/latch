# Next-session kickoff — Phase-4 a11y COMPLETE; canvas experience + code-health pass done; snippets/onboarding next

Copy everything in the block below as your first message to a fresh Claude Code session to continue LATCH
with full context.
(Last updated 2026-07-07 — branch `phase0-file-format`, everything **committed + pushed** through `1006ec8`.
Tree CLEAN & green; final full-app runtime smoke = 0 real console errors. Verify with `git log --oneline -20`.)

---

ultrathink You're continuing **LATCH** — a free/open, web+desktop, node-based creative-coding tool ("Live Art
Tool for Creative Humans"; Vue 3 + TS + Vite, Electron Forge; ~238 nodes) at
`/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format`. **Phases 0–3 are done. Phase 4 is
well underway:** the accessibility stream is **100% closed** (all 33 app-audit findings), a **code-health
refactor** de-bloated the canvas, and several **experience features** shipped on the cleaned-up base.
**Get oriented before touching code, then pick the next thread with me.**

Baseline (verify with a quick run): typecheck clean · lint 0 err (49 pre-existing `any`-warns ok) ·
`test:unit` **2022 pass + 11 todo** (139 files) · `build` ok · boot→Play→Stop smoke 0 real console errors.

## STEP 1 — Read, in order
1. `CLAUDE.md` — rules. **NO AI attribution in git, EVER** (commits/PRs/tags read as Moheeb Zara's).
   **Commit/push only when explicitly asked.** Stay on `phase0-file-format` (branch off `main` for new work).
   Each step ends green. **Never assume — read the real code / verify against the actual git original.** Honor
   `strategy/05` **DON'T-OVERCLAIM**.
2. `docs/HANDOFF.md` TOP entries **(later 66 → 55)**, newest first. Recent arc: (66) end-of-session runtime
   smoke + snippets searchable; (65/64) `flowToPreview` thumbnails on starter + snippet cards + a self-audit;
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
    starter cards + all 34 explorer snippet cards (later-64/65); snippets now findable by search (later-66).
  - **Remaining non-a11y Phase-4:** a **dedicated snippets tab** (the `flowToPreview` thumbnail primitive it needs
    is DONE), **onboarding**, **drag-a-wire-into-empty-space → compatible-node suggestions**, **on-wire debugging**
    (freeze-frame + per-port value preview). `<Controls>`+`<MiniMap>` already cover zoom/fit + the toolbar.
- **Phases 5–9: not started.** Phase 5 = the modulation gap (input ports on modulatable params). Phase 6 =
  **full per-node co-location** (`registry/<cat>/<node>/`) — the largest single item and the deepest
  "node-isolation" work. Phase 7 subflow rebuild, 8 VJ/kiosk, 9 multiplayer.

## WHAT'S NEXT — pick a thread with me (each flagged)
1. **Dedicated snippets tab** — a browse-all-snippets surface (search + the ready thumbnails), vs the current
   category-scoped section at the bottom of the node grid. Additive; the thumbnail primitive is done. *If it
   becomes a 3rd consumer of the category-colour lookup, extract the shared resolver now (rule of three).*
2. **Drag-a-wire-into-empty-space → compatible-node suggestions** — high-value workflow accelerator that
   leverages the typed-port system (`validateConnection`); reuse the node explorer as the (accessible) picker
   rather than a new popup. Medium.
3. **On-wire debugging** — per-port value preview / freeze-frame; persona-critical for a dataflow tool, but
   larger (needs runtime value exposure). Scope first.
4. **Onboarding**, or a **node-isolation pivot** (Phase 6 co-location — scope one category first).
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
