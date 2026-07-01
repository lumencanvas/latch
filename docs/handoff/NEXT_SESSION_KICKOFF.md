# Next-session kickoff — Phase 3 (Control system + declarative UI) underway

Copy everything in the block below as your first message to a fresh Claude Code
session to continue LATCH with full context.
(Last updated 2026-07-01 — HEAD `83533ec`; tree clean & green; 19 commits this session, all committed.)

---

ultrathink You're continuing **Phase 3** of LATCH — a free/open web+desktop node-based creative-coding tool (Vue 3 + TS + Vite, Electron Forge) at `/Users/obsidian/Projects/lumencanvas/latch`, branch `phase0-file-format` (HEAD `83533ec`). **Phases 0–2 done (foundations · de-monolith/lifecycle · register-once subsystems incl. connections, model derives, and security at Node-RED parity); Phase 3 (Control system + declarative UI) is underway.** Tree is CLEAN and green. Get oriented before touching code.

Baseline (verify with a quick run): typecheck clean · lint 0 err (49 pre-existing any-warns ok) · `test:unit` **1818 pass + 11 todo** · `build` ok.

## STEP 1 — Read, in order
1. `CLAUDE.md` — rules. **NO AI attribution in git, ever** (history/PRs read as Moheeb Zara's). **Commit only when asked.** Stay on the branch. Each step ends green. **Never assume — read the real code / verify against the actual git original.** Honor `strategy/05` DON'T-OVERCLAIM.
2. `docs/HANDOFF.md` TOP entries **(later 32 → 27)** — this session's arc, newest first: (32) `<ControlRenderer>` extracted + BaseNode migrated (via an ultracode spec→build→per-type-fidelity-verify workflow, 0 drift); (31) shared control helpers dedup; (30) security verified **AT Node-RED parity → done**; (29) credential redaction (Node-RED-style public-API masking); (28) deep 5-agent audit of Phases 0–2 (everything verified vs real code + git); (27) SECURITY_MODEL capability-enforcement spine.
3. `docs/plans/ROADMAP_2026-06-28.md` — progress snapshot (top) + the **Phase 3** section (deliverable 1 = unify control renderers into `<ControlRenderer>` + unify `visibleWhen`/`showWhen` into one `when`).
4. Recall memories: **audit-against-true-original** (verify each migration vs its OWN pre-migration git original — bit twice; it's how the BaseNode migration was verified), **latch-component-test-gotchas** (@vue/test-utils: import stores before `.vue`, stub `Handle`, template `| undefined` casts trip an eslint filter rule), **latch-undefined-css-tokens** (recurring bug: `var()` refs to tokens absent from `tokens.css` silently fall back — verify before UI/CSS work), **latch-smoke-test-harness**.

## WHERE WE ARE — Phase 3 (Control system + declarative UI)
- **Phase 2 complete** (do NOT re-open): `defineProtocol`/`protocolRegistry` + no-secret `ConnectionHandle` (mqtt/ws/http + BLE registered); both model catalogs **DERIVED** from co-located `services/ai/models/**/ *.model.ts` (WebLLM **24**, transformers `AI_MODELS` **35**) + deep-equal gated, `modelRegistry` count guard = exact set-equality (webllm ∪ transformers; MediaPipe deferred); `SECURITY_MODEL` enforcement spine (origin-assigned **trust tiers** + capability gate in `resolveConnectionHandle` + deny-by-default **grants**) + **credential redaction** — security verified **AT Node-RED parity → DONE**.
- **Phase 3 started (2 steps landed):**
  - `composables/useControlHelpers.ts` — shared `isDeviceOptions` + `clampControlNumber` (pure) + `useControlSelectOptions` (device-coupled), de-duplicated from BaseNode + PropertiesPanel.
  - `components/controls/ControlRenderer.vue` — presentational component `{ control, modelValue, context }` → emits `update`; owns the **6 primitive widgets** (slider/toggle/select/number/text/color) + their CSS, lifted **byte-faithful** from BaseNode. **BaseNode now delegates** to it (`−274/+7` lines). Guarded by the BaseNode component test (mutation-verified) + a new `ControlRenderer.test.ts`. **The `context` prop exists but ONLY `'canvas'` behavior is implemented.**

## WHAT'S NEXT — Phase 3, in order
1. **Migrate `PropertiesPanel.vue` to `<ControlRenderer>`.** Add a `context='panel'` branch to ControlRenderer (NO `@mousedown.stop`, NO ON/OFF toggle text, normal/panel styling — lift from PropertiesPanel's ORIGINAL scoped CSS, `git show HEAD:...PropertiesPanel.vue`). PropertiesPanel keeps its **panel-only** delegates (`connection`→`ConnectionSelect`, `template-select`→`TemplateSelect`, `asset-picker`→`AssetPickerControl`, `code`→read-only preview) + the expose-to-panel chrome + its `showWhen` visibility. This is a **partial** migration (primitives via ControlRenderer, delegates stay inline). **Add a PropertiesPanel number-clamp test first** (there is none today) so the migration is guarded.
2. **Migrate `ProtocolFormFields.vue`** (connection config form) — disjoint vocab: `checkbox`/`textarea`, `text` supports `props.type` (password/email), `showIf` visibility, 2-col layout, inline `description`. Likely a `context='config'` branch or its own thin path; it's already presentational (emit-only), lowest blast radius.
3. **Unify the three visibility schemas** — `visibleWhen{controlId,value}` (BaseNode filter) · `showWhen{k:v}` (Panel v-show) · `showIf{field,value|values}` (form filter) — into one `when` (multi-key + operators), a testable evaluator, keeping back-compat. (ROADMAP Phase 3.)

## HOW TO WORK
- Each step ends green: `typecheck` + `lint` + `test:unit` (`build` for production-source; **smoke for any runtime/registry/UI change** — the accessor/render paths are hot).
- **Smoke** with the boot→Play→Stop harness: write `smoke.mjs` to repo root (Playwright `chromium.launch({channel:'chrome',headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']})`, `permissions:['camera','microphone']`; goto `localhost:5173`, click `button[title="Play"]`, wait ~4s, `button[title="Stop"]`; filter benign `NotAllowedError`/`[WebcamCapture]`/`XNNPACK`/`TensorFlow Lite`/`DeviceEnumeration`), `npm run dev` in background, `NODE_PATH="$(pwd)/node_modules" node smoke.mjs`, `rm smoke.mjs`. Clean = 0 real console errors.
- **Mutation-verify every migration:** hand-break the migrated widget → its test reds → restore (NEVER `git checkout` to undo — wipes uncommitted work; restore with a `.bak`/hand-edit). Verify each migrated control against its **OWN pre-migration original** (`git show HEAD:PropertiesPanel.vue`), not a sibling's pattern (audit-against-true-original). The BaseNode test guards the canvas widgets end-to-end through ControlRenderer.
- **For risky cross-cutting UI migrations, an ultracode adversarial workflow (spec → build → per-control-type fidelity verify vs `git show HEAD:`) caught 0 drift on the BaseNode migration and is the recommended pattern.** (Only use Workflow when the user opts in with "ultracode".)
- Commit only when asked; logical, individually-revertible commits; **no AI attribution** (author stays Moheeb Zara). Update `docs/HANDOFF.md` + the ROADMAP snapshot at close.

## INHERITED INVARIANTS (don't regress)
- **ControlRenderer is byte-faithful** to BaseNode's canvas rendering; the `context` prop is the seam for panel/config forks — **canvas behavior must not change** when you add the panel branch. ControlRenderer is **presentational (emit-only)**; each consumer keeps its own value source, persistence/undo, and visibility filtering.
- **Security is DONE at Node-RED parity** — no-secret runtime handle + public-API secret redaction + the shareable `.latch` file carries no connection secrets (only local IndexedDB does). Do NOT re-harden; Worker-isolation / at-rest encryption are OPTIONAL and gated on community-node distribution (which doesn't exist). `ConnectionManager` holds configs in a `#`-private map; public getters redact secrets; `connect()`/`exportConnections()` read raw — don't regress.
- **Model catalogs are DERIVED + deep-equal gated** (`ai-models.baseline.ts`, the webllm snapshot + external `@mlc-ai/web-llm` id anchor). Adding a model = drop one `*.model.ts` + reference it (transformers `taskCatalog.ts` / webllm `order.ts`).
- The **capability gate + trust tiers are DORMANT** for built-ins (`core` → bypass) — don't wake them; the cap context is passed CLOSED-OVER to `createExecutionContext` (never on the executor `ctx`) so trust can't be spoofed.
- Every register-once subsystem (node/protocol/model) is glob-collected with a count/set-equality gate — keep that pattern.
