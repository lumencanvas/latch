# LATCH — Session Handoff Log

Running log of work sessions, newest first. Each entry: what changed, current state,
and what's open. Detailed analysis lives in the dated docs under `docs/` (esp.
`NODE_LIBRARY_REVIEW_2026-06-18.md` and `AUDIT_2026-06-16.md`).

---

## 2026-07-12 (later 92) — commit the authoring-DX delta + A1/A4 docs rewrite

**Committed the accumulated A5+A3+E1+A2 delta** (maintainer said the word) as one clean boundary before
Workstream B's churn: `95a4303` "Add node-authoring toolkit: multi-node units, drop-in categories, models,
scaffold" (34 files, +1312/−146; author Moheeb Zara, no AI attribution). Baseline re-verified green first:
typecheck clean · `test:unit` **2333** pass + 11 todo (149 files); tree now clean through `95a4303`, `main`
untouched.

**A1/A4 docs done — Workstream A is complete.** Rewrote the STALE `docs/nodes/contributing.md` (632 lines that
still taught the deleted pre-Phase-6 model: `index.ts` barrel exports, executor `case` statements in giant
files, `definition.ts`+`index.ts` custom-UI shims, the removed `getInput`/`getData`/`setOutput` executor API)
to the real reality:
- A node = one `registry/<cat>/<id>/node.ts` = `defineNode({ definition, executor, pure?, component?, version?,
  migrate?, requires?, connections?, models? })`, auto-discovered by the glob — no barrel/registration edits.
- Covers: the `NodeDefinition`/ports/controls/`info` schema; the `ctx.num/bool/str/trig/level` accessors;
  `defineNodeState` (self-registering gc/dispose); the `ui`-schema-vs-`component` decision **with the exact
  widget list `NodeView` dispatches** (primitives slider/number/toggle/select/text/color + rich knob/xy/eq/env/
  wave/readout/asset/connection; piano/gamepad/curve/gradient/image/button = reserved, no renderer → use
  `component`); versioning + `migrate()`; **testing via `tests/helpers/testNode`** (the real `smooth` worked
  example); the **nodeset** (`nodes.ts`/`defineNodes`) + **drop-in category** (`defineCategory`/`new-category`)
  shapes; and the declarable **`models:`/`connections:`** paths. Opens with a **60-second quickstart** (the A4
  deliverable) — `npm run new-node` → edit → `test:unit`.
- **Reconciliation (plan-vs-reality):** the plan named `docs/nodes/README.md` for the quickstart, but that file
  is already the *node reference catalog*. Kept the catalog; folded the 60-sec quickstart into `contributing.md`'s
  top section, and added a prominent **"Authoring a node? → contributing.md"** callout atop the catalog README
  for discoverability. (Left the catalog's stale "208 nodes" counts alone — that's a Workstream-D honesty task,
  not A1/A4.)
- Source of truth: `docs/architecture/NODE_SPEC.md` (v2.0). This increment is **markdown-only** — no `.ts`/`.vue`
  touched, so the code gates are unaffected (baseline green preserved); all relative doc links resolve.

**State:** `95a4303` committed; docs rewrite (`contributing.md` + README callout + this HANDOFF entry) uncommitted
on `phase0-file-format`. **Next: commit the docs (on the maintainer's word), then B** (behavior co-location — move
executor bodies into node.ts, the big multi-session refactor), then C / D.

---

## 2026-07-12 (later 91) — holistic audit (SAFE TO COMMIT) + A2 scaffold (`new-node`/`new-category`)

**Holistic audit of the whole uncommitted delta** (increments 1–3 + E1) via a 16-agent workflow (5 dimensions
× adversarial verify + synthesis): **verdict SAFE TO COMMIT — 0 critical, 0 major.** The combined 241-node
boot/cycle graph, all four architecture invariants (no stores→registry edge, eager-glob import hygiene,
engine catalog-agnosticism, count-equality co-location gate), and the frozen `defineNode` contract are intact.
3 confirmed minors, all folded in: (1) a stale "before the glob" comment in `defineNode.ts` I'd missed when
fixing its siblings during E1 (corrected); (2) the drop-in-category "live wiring" test looped an empty set —
strengthened to drive the real `applyDiscoveredCategories` against the live `categoryMeta` (+ getCategoryIcon
resolves); (3) HANDOFF "8 AI nodes" → 7.

**A2 scaffold done — hand-authoring is now a one-command task.** `scripts/new-node.mjs` + `npm run new-node` /
`npm run new-category`:
- `new-node <cat> <id> [--name] [--component] [--stateful]` → `registry/<cat>/<id>/node.ts` + `node.test.ts`
  (component also emits `<Pascal>Node.vue` + `markRaw`; stateful emits a `defineNodeState`).
- `new-node <cat> <family> --set <id…>` → one `nodes.ts` family (`defineNodes([...])`).
- `new-category <id> [--label --icon <LucideName> --color --starter]` → `category.ts` (lucide-component icon)
  + a starter node — a whole drop-in category in one command, zero `stores/nodes.ts` edits.
- Templates use ONLY the public surface (`defineNode`/`defineNodes`/`defineCategory`, the `ctx.num/bool/str/
  trig` accessors, the `tests/helpers/testNode` runner at the correct `../../../../../` depth). Fails loudly on
  a dup id (scans the registry, mirroring the glob guard) or a non-kebab id.
- **Verified end-to-end**: generated a node, a stateful node, a `--set` family, and a category into the
  registry → all typecheck + pass their own `node.test.ts`; `node-import-hygiene` scanned the generated
  `category.ts` (cycle-clean); the drop-in-category live-merge guard ran against the real `demo-cat` (glob →
  merge → `categoryMeta` proven) — then the demo artifacts were removed (registry back to 241, no product
  clutter). Persistent guard: `tests/unit/scripts/new-node.test.ts` pins every template's output shape
  (import paths, brands, accessors, testNode depth) so a convention drift can't silently break the scaffold.

**Gates:** typecheck clean · lint 0 err (49 warns) · `test:unit` **2333** pass + 11 todo (149 files) · build
ok. On `phase0-file-format`; not committed. **Next: A1/A4 docs** (rewrite the STALE `docs/nodes/contributing.md`
to the real defineNode/co-located reality incl. all authoring shapes + models/connections + testing; add a
60-sec `docs/nodes/README.md` quickstart pointing at the scaffold), then **B** (behavior co-location) / C / D.

---

## 2026-07-12 (later 90) — E1: declarative `models:` fully wired (retire `withModelSelect`, migrate 7 AI nodes)

**The declarative AI-model path now works for ANY node — the "half-exposed" gap is closed.** A plain
`defineNode({ models: [{ task }] })` yields a populated `model` select + the standardized
loading/progress/done/error outputs, with no per-node shim.
- **`engine/defineNode.ts`** — a module-level `modelSelectResolver` + `setModelSelectResolver()`;
  `defineNode`/`defineNodes` pass it into `deriveModelDefinition`. Stays catalog-agnostic (arrow points
  AI→engine). `deriveModelDefinition` now **defers** the select entirely when no resolver is present
  (instead of baking an inert empty one), so a later re-derive can populate it.
- **`services/ai/AIInference.ts`** — calls `setModelSelectResolver((task)=>({options:getModelSelectOptions(task),
  default:''}))` at module scope (the resolver injection; `getModelSelectOptions` unchanged).
- **`registry/nodeRegistry.ts`** — eager side-effect `import '@/services/ai/AIInference'` + **re-derives every
  `models:` spec after the glob** (`specsById[id] = defineNode(specsById[id])`). This is the robust
  registry-assembly injection seam: the module body runs after ALL imports, so the resolver is guaranteed
  set — populating the select for ANY node, not just AI ones that self-wire. Idempotent for the 7 AI nodes.
- **7 AI nodes** (`registry/ai/{object-detection,text-generation,text-transformation,feature-extraction,
  sentiment-analysis,image-classification,image-captioning}`) migrated: `withModelSelect(definition,TASK)` →
  `models:[{task:TASK}]`. Task strings preserved exactly (image-captioning=`image-to-text`,
  text-transformation=`text2text-generation`). **`registry/ai/modelSelect.ts` DELETED.**

**Two wiring mechanisms, both verified:** (a) each AI node imports its executor (`@/engine/executors/ai` →
`AIInference`) before its own `defineNode()`, so ES import order sets the resolver in time — populates AI
selects at glob time (proven by `ai-catalog.test.ts`'s 34 assertions, imported specs directly). (b) the
nodeRegistry post-glob re-derive covers everything else. **Adversarial review** (5-agent workflow): 0 crit/
major; the 1 confirmed minor was a *false comment* — Vite PREPENDS the glob's node imports above the eager
AIInference import, so "before the glob" was wrong and a hand-authored non-AI `models:` node would've gotten
an empty select. **Fixed** by the defer-+-registry-re-derive design (comments corrected too).

**Gates:** typecheck clean · lint 0 err (49 warns) · `test:unit` **2323** pass + 11 todo (148 files) · build
ok · browser smoke count 241, object-detection model select has 2 live options (`odModelOptions`), Play→Stop
0 errors. On `phase0-file-format`; not committed. **Next: A2 scaffold** (`new-node`/`new-category` — ships
the first real `category.ts`, activating A5's dormant guards), then A1/A4 docs, then B (behavior co-location).

---

## 2026-07-12 (later 89) — A5 drop-in categories: `defineCategory` glob + `category` relaxed to validated string

**Increment 3 done — the second maintainer ask ("adding a category = drop a folder") is now real.** A whole
node category ships as a `registry/<cat>/category.ts` (`export default defineCategory({ id, label, icon, color })`)
with **ZERO edits to `stores/nodes.ts`**. How it fits together:
- **`engine/defineCategory.ts`** (new leaf, twin of `defineNode`) — `CategorySpec` + brand. `icon` is
  `string | Component`: pass a lucide **component** to render an icon, a string is inert metadata (renders the
  neutral fallback). Store-free so a `category.ts` never closes the eager-glob cycle.
- **`registry/categoryRegistry.ts`** (new, twin of `nodeRegistry`) — eager-globs `./**/category.ts`, pure
  exported `collectCategories()` (dup-id / invalid guards, throws at import) + `applyDiscoveredCategories()`
  (the merge helper, built-ins win). Store-free leaf.
- **`registry/allNodes.ts`** merges discovered categories into `categoryMeta` — a **one-way registry→stores
  push** (mirrors `setCustomNodeTypeIds`; the deliberately-severed `stores→registry` edge stays severed).
  DEV-warns nodes with an unregistered category AND drop-ins that reuse a built-in id (silently dropped).
- **`stores/nodes.ts`** — `categoryMeta` is now a built-in SEED (`satisfies Record<NodeCategory,…>` keeps it
  exhaustive) spread into a widened, mutable `Record<string, CategoryMeta>`; `NodeDefinition.category` relaxed
  to `LiteralUnion<KnownNodeCategory>` (autocomplete kept, any string accepted); `categoryFilter`/`byCategory`/
  `categories` relaxed to `string`. Consumers relaxed: `utils/categoryIcons` (widened + `getCategoryIcon()`
  fallback helper, resolves a drop-in's component icon), `utils/nodeColor`, `stores/node-explorer`,
  `CategoryNav`/`NodeExplorer`/`AppSidebar`/`BaseNode` (route icons through `getCategoryIcon`).

**Guards:** `node-import-hygiene` extended to `category.ts` (+ forbids `@/registry/categoryRegistry` self-import);
new `tests/unit/registry/drop-in-category.test.ts` (12 cases: `collectCategories` dup/invalid/known-clash,
`applyDiscoveredCategories` add/never-override, `getCategoryIcon` drop-in component vs string-fallback, live
wiring). **Adversarial review** (15-agent workflow): 0 critical / 0 major confirmed — the two scariest candidates
(a `stores→registry` boot cycle; a broken custom-node validator) were REFUTED. 3 confirmed minors fixed (inert
drop-in icon → now `string | Component`; hygiene missed `categoryRegistry`; built-in-clash now DEV-warns);
accepted nits (empty-set live-wiring test + dormant hygiene arm — activate when the first real `category.ts`
ships via the A2 scaffold; empty-string id left for parity with `nodeRegistry`).

**Gates:** typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit` **2320** pass + 11 todo (148 files)
· build ok · browser smoke count **241**, 18 categories render, Play→Stop 0 errors. On `phase0-file-format`; not
committed (~20 uncommitted files across increments 1–3; `main` untouched). **Next:** E1 `models:` wiring (retire
`withModelSelect`, 7 AI nodes), then A2 scaffold (`new-node`/`new-category` — ships the first real `category.ts`,
activating the dormant guards), A1/A4 docs, then B/C/D.

---

## 2026-07-12 (later 88) — new plan: effortless hand-authoring (approved) + first increment (multi-node units)

**Plan approved** (`~/.claude/plans/majestic-bouncing-lollipop.md`, memory `latch-authoring-dx-plan`). After
a full-repo audit, the north star is now: make the existing 241-node library excellent + **trivially easy to
hand-author a node / nodeset / category**. Scope = authoring DX + polish (subflows/live-VJ/multiplayer OUT).
Workstreams: **A** toolkit (fix the STALE `docs/nodes/contributing.md`, `new-node` scaffold, test helper) ·
**B** FULL behavior co-location (move executor bodies out of the 6 giant files — ai 2474/visual 2150/conn
1874/audio 1696/clasp 1603/3d 1073 LOC — into each node.ts) · **C** converge `CustomNodeLoader` onto
`defineNode` · **D** docs reorg + README honesty (it falsely says "Phase 9 Complete") · **E** make the
AI-model + connection subsystems declarable by ANY node (the `models:` field only half-works today — empty
select unless you use the internal `withModelSelect` shim). Maintainer asks folded in: multi-node units +
drop-in categories, and declarable subsystems.

**Increment 1 done — A5 multi-node units (the "one unit registers many nodes", Node-RED-style):**
`engine/defineNode.ts` gains `defineNodes([...])`; `registry/nodeRegistry.ts` globs `node.ts` **and**
`nodes.ts` and flattens a `NodeSpec | NodeSpec[]` default via a new pure exported `collectSpecs()` (dup-id /
missing-default / empty-family guards apply per spec). `node-import-hygiene` extended to `nodes.ts`. New
`tests/unit/registry/multi-node-unit.test.ts` (7 cases). the 241 existing single-`node.ts` nodes untouched
(count-equality still 241).

**Increment 2 done — A3 isolated node-test helper + co-located `node.test.ts` convention:**
`tests/helpers/testNode.ts` — `runNode(spec,{inputs,controls,…})` / `runFrames(...)` / `resetNodeState()`,
using the engine's real `createExecutionContext` so `ctx.num/bool/str/trig` coerce faithfully (no fake).
`vitest.config.ts` include extended to `src/renderer/registry/**/*.{test,spec}.ts` so a node can ship its
own test next to `node.ts`; demonstrative `registry/math/smooth/node.test.ts` proves it. Gates: typecheck
clean · lint 0 err · `test:unit` **2308** pass + 11 todo (147 files, +9) · build ok. On `phase0-file-format`;
not committed. Next: A5 drop-in categories (`defineCategory`), E1 `models:` wiring, A2 scaffold, then B/C/D.

---

## 2026-07-12 (later 87) — committed the Phase-6 completion to phase0-file-format (2 commits)

The whole later-80→86 body (Phase 6 finished to 241/241 + the deep-audit fixes + the doc refresh) is now committed
to `phase0-file-format` — author Moheeb Zara, no AI attribution — as two each-green commits:
- **`254d77d`** — *Complete Phase-6 per-node co-location: all 241 nodes.* The ~168-node tail (shared-executor /
  clean-inline / stateful / component buckets, import-variant) + the `nodeTypeIds` component-`.vue` cycle-break +
  the `node-import-hygiene` guard + the `counter`/`sample-hold` dual-id resolution (winning def+executor co-located,
  losing rivals deleted) + the tightened count-equality gate. 251 files, +1477/−1533. Gate at tip: typecheck clean ·
  lint 0 err · `test:unit` 2299 pass + 11 todo · build ok.
- **(this docs commit)** — *docs: Phase 6 complete + refresh NODE_SPEC/ARCHITECTURE to v2.0* + HANDOFF/ROADMAP.

`main` untouched. `smooth` and everything else from earlier this session (later-73→79) was already on the branch;
the split here is code (254d77d) vs docs, each independently green. Nothing material remains on the co-location
thread — see later-86 for the ui-migration audit (migrate 0) and the honest end-state.

---

## 2026-07-12 (later 86) — maturity close-out: ui-migration audit (verdict 0) + architecture-doc refresh + stale-comment fixes

The remaining optional Phase-6 polish, done and closed honestly.

**ui-schema migration AUDITED (22-agent workflow + adversarial verify) → migrate ZERO more.** The optional
Phase-D item ("migrate bespoke component SFCs → declarative `ui` schema") is effectively COMPLETE: the 4 cleanly-
mappable nodes were already migrated (xy-pad→xy, parametric-eq→eq, wavetable→wave, envelope-visual→env); a rigorous
per-node investigation of the remaining **22 found 0 safe migrations** — every one correctly stays `component`.
Root cause: `NodeView.vue` only dispatches `slider/number/toggle/select/text/color/xy/eq/env/wave/knob/readout/asset/
connection`; the `WidgetType` enum also declares `piano/gamepad/button/curve/gradient/image` but they have NO
render branch. Every remaining component needs a `<canvas>` (7 mediapipe overlays, oscilloscope/graph, main-output),
an embedded runtime (emulator), a code editor (function), an interactive instrument/control with an unimplemented
widget (keyboard/synth→piano, gamepad-visual→gamepad, trigger→button, monitor→button + JSON pretty-print, textbox→
multi-line textarea), or bespoke port/resize chrome (knob, dispatch, step-sequencer). **These ARE the legitimate
`component` escape-hatch cases** (EXTENSIBILITY principle #1: declarative for the 90%, code for the 10%). Migrating
more would mean BUILDING new NodeView widgets — a separate feature effort, deliberately NOT done (marginal benefit,
real regression risk, unverifiable visual parity). Verdict recorded in the `latch-colocation-phase6` memory so it
isn't re-litigated.

**Architecture docs refreshed to post-Phase-6 reality (fork).** `docs/architecture/NODE_SPEC.md` (v1.0→2.0) and
`ARCHITECTURE.md` (v1.0→2.0, −1610/+433) rewritten: excised the never-built class-based design (`class NodeRegistry`/
`BaseNodeExecutor`/`FlowGraph`/`WorkerPool`, `src/nodes/` layout, `ClaspFlowDB`) and documented the ACTUAL
architecture — `defineNode` frozen contract, the eager-glob co-location registry, the engine's acyclic
never-imports-registry/stores injection rule, per-frame rAF execution, `defineNodeState` lifecycle draining, the
`nodeTypeIds` cycle-breaker, `builtinExecutors = {...colocatedExecutors, ...subflow}`, the guard-test suite, and the
`ui`-vs-`component` widget reality. Renamed "CLASP Flow"→"LATCH" throughout (CLASP = only the connectivity
protocol/`clasp` category). Reviewed for accuracy against the live code — sound.

**3 stale source comments fixed** (flagged by the doc fork): `defineNode.ts` + `nodeRegistry.ts` said co-location/
glob "come later / matches ZERO files" (now complete); `stores/nodes.ts` `WidgetType` said "only `env` dispatched,
xy/eq/wave reserved" (all 4 dispatched; piano/gamepad/curve/gradient/image/button correctly noted as reserved/no
render branch).

**State:** Phase 6 fully complete + matured. typecheck clean · lint 0 err · count 241 · (no functional code changed
this pass — comments + docs only, so the later-85 gate results stand: test:unit 2299, build ok, browser smoke 0
errors). On `phase0-file-format`; `main` untouched; **not committed**. Nothing material remains on the co-location
thread; further work is net-new features (build NodeView widgets to migrate more nodes; the Phase 7+ roadmap items).

---

## 2026-07-12 (later 85) — Phase 6 COMPLETE: 241/241 co-located (counter/sample-hold dual-id resolved) + end-state cleanup

**Resolved the final 2 dual-id nodes and finished the migration.** `counter` (historically defined in data+code)
and `sample-hold` (logic+code) each shipped TWO executor implementations; the registry deduped by id and could pair
the surviving definition with the WRONG executor (the real historical bug: sample-hold's def declared output
`output` while its executor wrote `result`). **The mature fix: co-locate each id in ONE folder pairing the surviving
def with its WINNING executor — which structurally eliminates the crossing hazard — and DELETE the losing rivals.**
The winners align with each node's own category, so no merged-folder awkwardness:
- **`counter` → `registry/code/counter/node.ts`** (imports code.ts's rich counterExecutor: count/normalized/atMin/
  atMax). Deleted utility.ts's poorer `counterExecutor` + `counterState` (dead — never registered, only self-tested).
- **`sample-hold` → `registry/logic/sample-hold/node.ts`** (imports utility.ts's sampleHoldExecutor: outputs
  `result`). Deleted code.ts's dead `sampleHoldExecutor` (the `output`-writing crossed rival).
- Both defs **byte-faithful**. `code`/`logic` barrels → `[]`; the now-empty `codeExecutors`/`utilityExecutors` maps
  deleted (+ their index.ts import/spread).

**Tests reworked:** `registry-integrity.test.ts` rewritten from map-key-presence checks (which referenced the now-
deleted maps) to a **behavioural dual-id guard** — imports the co-located node.ts defaults and asserts each
executor's outputs match its def's ports (counter emits count/normalized/atMin/atMax; sample-hold holds `result`),
so a future wrong-executor swap fails. Removed the deleted-rival coverage: utility.test.ts's counter block (5 cases,
tested dead code) + engine-leak's counter seed.

**Count-equality gate TIGHTENED (POLICIES §1):** `nodeRegistry.test.ts` now asserts `colocatedNodeIds.length ===
allNodes.length` (+ every allNodes id ∈ colocated) — this **PROVES the whole library is co-located**: any lingering
legacy-only def would diverge the counts. `find registry -name node.ts` = **241**; zero legacy definition files
remain.

**End-state cleanup:** `builtinExecutors` collapsed to `{ ...colocatedExecutors, ...subflowExecutors }` — the glob
plus the ONE dynamic `subflow` instance node (no NodeDefinition, so not glob-discovered). Deleted the now-empty
`audioExecutors`/`visualExecutors`/`aiExecutors` maps + their imports/spreads. `executors/index.ts` is now a thin
barrel: the public-export contract re-exports + this minimal assembly. (Honest note: `executors/index.ts` and
`components.ts` are NOT deleted — the EXTENSIBILITY end-state hoped to, but they serve real roles: assembling
`builtinExecutors` + the contract surface, and deriving `nodeTypes` for Vue Flow. They're now minimal, not the
"node smeared across 6 files" problem Phase 6 solved.)

**Phase 6 DONE: 241/241 (100%).** Gates: typecheck clean · lint 0 err (49 any-warns) · `test:unit` **2299** / 144
· build ok · **browser smoke: count 241, counter/sample-hold present, Play→Stop clean, 0 errors.** On
`phase0-file-format`; `main` untouched; **not committed**. Remaining Phase-6-adjacent polish (optional): migrate the
~22 bespoke component SFCs to the declarative `ui` schema where sensible (canvas-heavy ones like oscilloscope stay
`component`); refresh the stale `NODE_SPEC.md`/`ARCHITECTURE.md` (still say "CLASP Flow", pre-`defineNode`).

---

## 2026-07-12 (later 84) — deep audit (clean) + broke the component cycle + finished the bucket: 214 → 239/241 (99%)

**Deep adversarial audit first (27-agent workflow: 16 per-category byte-faith diffs vs git + 8 dimension audits,
each finding adversarially verified).** Result: **0 critical, 0 major, 0 refuted.** All 141 session migrations
byte-faithful (def objects identical to HEAD originals; import-variant executors unchanged in their category
files); registration/contract-pins/test-integrity/state-lifecycle/runtime-functional all clean; plan-honesty
verified the docs TRUE (214/241, bucket counts, the component-cycle claim all real). Only **3 minor + a few nits**,
all fixed:
1. **Cycle-safety is an unenforced convention** → added `tests/unit/registry/node-import-hygiene.test.ts`: scans
   every co-located `node.ts` and fails on a non-`type` value-import of `@/stores/*`, `@/registry/{components,
   allNodes,nodeRegistry}`, or `@/engine/ExecutionEngine` (the eager-glob boot-crash footgun). Mutation-verified.
2. **`messagingExecutors` empty dead map** → deleted (+ its index.ts import/spread).
3. **`connectivityExecutors` shadowed http/ws/mqtt entries** (superseded by the ConnectionManager execs) → removed.

**Then broke the component blocker (later-83's cycle) with a leaf registry.** New `registry/nodeTypeIds.ts` (imports
NOTHING) holds the bespoke-component id set; `allNodes.ts` (the earliest registry module) PUSHES it via
`setCustomNodeTypeIds`; `stores/flows.ts` reads `isCustomNodeTypeId` instead of importing `CUSTOM_NODE_TYPE_IDS`
from `components.ts`. That severs the sole `stores → registry` edge (`flows → components → allNodes → nodeRegistry`),
so a component `node.ts`'s `.vue → stores/flows → leaf` now dead-ends — no cycle. `components.ts` still owns
`CUSTOM_NODE_TYPE_IDS` + `nodeTypes` (usePersistence + tests unchanged). **Boot-order proven safe empirically:** the
browser smoke's auto-loaded starter flow has **9 component nodes and all 9 resolved to their bespoke types (0
misresolved)** through the real rehydration path.

**Then co-located all 22 component `.vue` nodes + 3 specials (25 nodes → 239/241):** debug monitor/oscilloscope/
graph/equalizer · inputs trigger/textbox/keyboard/knob/gamepad-visual · ai mediapipe×7 · logic dispatch · outputs
main-output · timing step-sequencer · audio synth · code function · emulation emulator (in-place `definition.ts`→
`node.ts`, keeping the `./XNode.vue` import; `_synth`/`_knob`/`_function` de-underscored; emulator's CORE_LIST/
DEFAULT_EJS_DATA imports preserved) + **llm** (moved the WEBLLM catalog consts + repointed the `webllm.ts ↔
registry/ai/llm` import to `/node`; the resulting `node.ts ⇄ webllm.ts` cycle is harmless — neither touches the
other's export at init) + **midi-input/webcam** (re-categorized flat nodes → co-located in their home folders,
inputs barrel emptied). All defs **byte-faithful**. `input`/`audio`/`emulation`/`connectivity`/`messaging` barrels
+ maps now fully drained.

**Co-located total: 239 / 241 (99.2%).** Remaining **2 = `counter` + `sample-hold`** — dual-id nodes (code+utility,
guarded by `registry-integrity`); co-locating needs a merged-folder decision (which category owns the id + update
the guard), not a mechanical migration. **Gates:** typecheck clean · lint 0 err (49 any-warns) · `test:unit`
**2302** / 144 (+ the 240-case hygiene guard) · build ok · **browser smoke: count 241, all component/special ids
present, starter-flow component nodes resolve correctly, 0 errors.** On `phase0-file-format`; `main` untouched;
**not committed** (~409 changed files, git diff HEAD −9451 lines).

---

## 2026-07-12 (later 83) — component bucket BLOCKED by a module-load cycle (investigated, attempted, reverted clean)

Ran a 54-agent verification workflow → precise per-node manifest for the final 27 (component `.vue` bucket +
specials). Generated the 17 clean component-folder nodes (`definition.ts`→`node.ts` in-place, keeping the
`./XNode.vue` import) — typecheck passed, but the **coupled tests exposed a systemic circular-import**, so the
whole batch was **reverted to a clean 214/241** (all defs/barrels/maps restored; typecheck clean · `test:unit`
2062 · build ok · browser smoke count 241, all 22 component/special ids present, 0 errors).

**THE BLOCKER (why component co-location can't be a mechanical migration):** the eager `nodeRegistry` glob loads
every `node.ts` at startup. A component `node.ts` must `import XNode from './XNode.vue'` and put
`component: markRaw(XNode)` on the definition **synchronously** (the `custom-node-components.test.ts` gate asserts
`nodeTypes[id].__name === 'MonitorNode'` AND reference-identity `nodeTypes[id] === def.component`, so
`defineAsyncComponent`/lazy wrapping is out). But **all 22 component `.vue` files import `@/stores/flows`**, and
`stores/flows` → `@/registry/components` (for `CUSTOM_NODE_TYPE_IDS`) → `@/registry/allNodes` →
`@/registry/nodeRegistry` (the glob, mid-run) → back to the component `node.ts` → `colocatedDefinitions` is still
`undefined` → `allNodes.ts:57` throws (`Cannot read properties of undefined (reading 'map')`). Same cycle class as
clasp (later-81) but via the `.vue`, so the lazy-executor trick does NOT help — you can't defer the component ref.

**THE FIX (deliberate, not tail-of-session):** break the `stores/flows → registry/components` module-load edge.
`flows.ts` uses `CUSTOM_NODE_TYPE_IDS` only at runtime (line 14 `resolveNodeType`, line 338 rehydration). Introduce
a leaf `registry/nodeTypeIds.ts` (`setCustomNodeTypeIds`/`isCustomNodeTypeId`) that `components.ts` populates after
deriving, and switch `flows.ts` to the leaf getter. **RISK that needs care:** the rehydration path (flows.ts:338)
can run early at boot — if `isCustomNodeTypeId` fires before `components.ts` has evaluated, nodes silently render as
generic `custom`. Must guarantee population order (or a safe fallback) + test the persistence/rehydrate path. This
is a core-store change → do it focused, with the maintainer aware, then the 22 component nodes co-locate mechanically
via the recipe below. `counter`/`sample-hold` (dual-id) still need the merged-folder decision; `llm` needs its
`webllm.ts ↔ registry/ai/llm` import repointed (manifest has the exact 9-step plan).

**Component-node recipe (once the cycle is broken):** each is `registry/<cat>/<id>/` = `definition.ts` (imports
`markRaw`+`./XNode.vue`, `export const xNode`) + `index.ts` (shim) + `XNode.vue`. Convert `definition.ts`→`node.ts`
IN-PLACE: keep `markRaw`+`./XNode.vue` (same folder), swap type import to `@/stores/nodes`, add `import { defineNode }`
+ the executor import, `export const xNode`→`const definition`, append `export default defineNode({ definition,
executor })`; delete `index.ts`; trim barrel; strip map entry (mediapipe→aiExecutors, dispatch→utilityExecutors,
main-output→visualExecutors, monitor/osc/graph/eq + trigger/textbox/keyboard + step-sequencer→index builtin;
synth→audioExecutors, function→codeExecutors; knob/gamepad-visual/emulator have the def in `index.ts` not
`definition.ts`; synth/knob are `_`-folders to de-underscore; emulator's def imports CORE_LIST/DEFAULT_EJS_DATA).
Generator: `scratchpad/gen-component.mjs` (works for the 17 clean ones; the cycle is the only blocker). Full verified
per-node manifest archived in the workflow output.

---

## 2026-07-12 (later 82) — clean-inline (23) + stateful (24) buckets co-located: 167 → 214 (89%)

Continued the Phase-6 sweep with the same import-variant recipe (co-locate the def in node.ts, import the
executor const from its category file — the executor **and any `defineNodeState` store stay put**, so every
leak/gc/pin test keeps passing with no store move). All gates green each step; browser-verified.

- **Clean-inline (23): logic 9 · data 3 · visual color+color-ramp 2 · code template 1 · inputs constant/slider/
  xy-pad 3 · timing time/lfo/euclidean 3 · math random 1 · ai retrieve 1.** Import-variant (not literal inline —
  faster/safer; executors stay in their shared files which still hold non-migrated nodes). Handled: `index.ts`
  builtin-map entries (constant/slider/xy-pad/time/lfo/euclidean/random/color-ramp/retrieve register there, not a
  category map) removed + their now-unused imports dropped (tsconfig `noUnusedLocals` catches these precisely).
  `_`-folder/`definition.ts` orphans (xy-pad) deleted + tests repointed. `retrieve`/`color-ramp` pins stay valid
  via `export * from './rag'`/per-cat.
- **Stateful (24 of 31): timing start/interval/delay/timer/metronome/tap-tempo 6 · math spring/slew/deriv/integral/
  tween 5 · connectivity http/ws/mqtt 3 · logic gate/changed/latch 3 · data debounce/throttle 2 · messaging send/
  receive 2 · debug console 1 · inputs gamepad 1 · ai vector-memory 1.** Stores stay in the category files →
  `engine-leak`/`executor-gc`/`public-exports` (59) all green with zero repoints.
  - **AUDIT MISCLASSIFICATION caught (7 reverted):** the audit tagged `debug/monitor`, `debug/oscilloscope`,
    `debug/equalizer`, `inputs/trigger`, `timing/step-sequencer` as *stateful* but they are **component+stateful**
    (bespoke `.vue` via `markRaw` — verbatim def copy pulled in `component: markRaw(X)` with no import → typecheck
    caught it). `ai/llm` is special (WEBLLM catalog + a `webllm.ts ↔ registry/ai/llm` import cycle). `logic/
    sample-hold` is **dual-id** (logic+code, guarded by `registry-integrity` like `counter`). All 7 reverted to
    legacy (barrels + defs + map entries restored) → belong to the component bucket / dual-id follow-up.

**Co-located total: 214 / 241 (89%).** Gates: typecheck clean · lint 0 err (49 any-warns) · `test:unit` **2062** /
144 · build ok · **browser smoke: count 241, 31 sampled stateful+reverted ids present, Play→Stop drains state
stores cleanly, 0 errors.** On `phase0-file-format`; `main` untouched; **not committed** (~327 changed files).

**Remaining 27 — the component + special bucket (hardest; per-node care needed):** ~20 component nodes (bespoke
`.vue`): ai 7 mediapipe, inputs textbox/knob/keyboard/gamepad-visual/trigger, debug graph/monitor/oscilloscope/
equalizer, timing step-sequencer, audio synth, code function, logic dispatch, + emulation/outputs. **Recipe
(worked out, folder-structured):** each lives in `registry/<cat>/<id>/` with `definition.ts` (imports `markRaw`
+ `./XNode.vue`) + `index.ts` (shim) + `XNode.vue`. Convert `definition.ts` → `node.ts` in-place: keep the
`markRaw`+`./XNode.vue` imports (same folder → path unchanged), swap the type import to `@/stores/nodes`, add
`import { defineNode }` + the executor import, change `export const xNode` → `const definition`, append
`export default defineNode({ definition, executor: xExec })`; delete `index.ts`; trim barrel; strip the map entry;
delete the orphaned `definition.ts`. The `custom-node-components.test.ts` gate verifies the `component`-derivation.
**Specials:** `llm` (break the webllm cycle — lazy or move the WEBLLM constants), `counter`+`sample-hold` (dual-id
→ merged-folder decision), `midi-input`/`webcam` (re-categorized cross-imports). Generators in scratchpad
(`migrate-shared.mjs`).

---

## 2026-07-12 (later 81) — ultracode audit + shared-executor sweep: 74 → 167 co-located (93 nodes this session)

**Full Phase-6 audit (Workflow, 36 agents): verified inventory + per-node migration manifest.** 167 legacy + 74
co-located = 241 (clean 1:1 file→node; the count "gap" was `_`-folder re-export shims). Remaining tail buckets
(verified against real code, not the stale later-77 guess): **shared-executor 94, clean-inline 23, stateful 31,
component 15.** Full test-coupling + contract-pin map captured (audit.json in scratchpad; workflow output archived).

**Then swept the shared-executor bucket — 93 nodes co-located across two batches, all gates green each step:**
- **Batch 1 (37, fully-migratable categories):** 3d 16 · opencv 9 · clasp 10 · subflows 2. Barrels → `[]`; the
  `<cat>Executors` map + its import/`...spread` removed from `executors/index.ts`; the `.ts` files KEPT (executor
  consts + dispose/gc infra stay — node.ts import them). subflows keeps its map's third `subflow` key (instance
  node, no def). **Cycle trap hit + solved:** clasp.ts imports a Pinia store → the eager glob loading
  `clasp/node.ts` formed a load-time cycle (`node.ts→clasp.ts→stores/flows→registry/components→allNodes→
  nodeRegistry`, undefined executor). Fix = **lazy executor** in node.ts: `const executor = async (ctx) => (await
  import('@/engine/executors/clasp')).xExecutor(ctx)` — glob no longer loads the cyclic module; it still loads at
  startup via index.ts. Only store-importing executor files need this (`grep -lE "from '@/stores/" executors/*.ts`
  = clasp only; subflow's is `import type`, safe).
- **Sweep (56, partial-map categories):** visual 11 · audio 18 · ai 13 · connectivity 7 · code 3 · inputs
  (audio-input) 1 · data (texture-to-data) 1 · math (noise/easing) 2. Per-category: generate node.ts (import the
  executor const), remove only the migrated keys from the category map + barrel, delete the flat def file, keep
  the executor file. **Variants handled:** (a) audio's `wavetable`/`parametric-eq`/`envelope-visual` were
  `_`-folder shims → the manifest defFile pointed at the real `_folder/index.ts`; co-located byte-faithfully, the
  3 orphaned `_folders` deleted, their migration tests repointed to `node.ts`. (b) ai's 7 model nodes wrap the def
  in `withModelSelect(definition, 'task')` (task ≠ id for image-captioning/text-transformation) → node.ts
  replicates the wrapper; behavior preserved. (c) `noise`/`easing` map entries live in `index.ts`'s builtin map,
  not a category map → removed manually. (d) `code.counter` DEFERRED — dual-id (code+utility), guarded by
  `registry-integrity.test.ts`. **Def-side test repoints** (legacy flat-file def imports → `node.ts` default's
  `.definition`): when-migration, vla, node-requirements (7 connectivity + speech-recognition + audio-input),
  ai-catalog (7), easing, + the 3 audio migration tests. All **byte-faithful** (def diffs clean, generator-driven).

**Co-located total: 167 / 241 (69%).** Gates at checkpoint: typecheck clean · lint 0 err (49 any-warns) ·
`test:unit` **2062** / 144 · build ok · **browser smoke: count 241, 22 sampled ids across all swept categories
present, Play→Stop clean, 0 errors.** On `phase0-file-format`; `main` untouched; **not committed**. Remaining 74:
clean-inline 23 (executor-body inline), stateful 31 (smooth pattern + barrel re-export for pinned stores),
component 15 (carry `component:`, incl. 6 `_`-folders), + `counter`/`sample-hold` dual-id. Reusable generators in
scratchpad (`migrate-shared.mjs`, `gen-data.mjs` pattern).

---

## 2026-07-12 (later 80) — de-risked the stateful `defineNodeState` co-location path (proven on `smooth`)

**The biggest un-proven Phase-6 bucket (~57 stateful nodes) is now proven end-to-end.** Per the maintainer's
call, took the one node that isolates the risk — `smooth` (simplest stateful node: a single `number` store, no
dispose) — and co-located it fully, then verified the state-lifecycle survives the move.

**The risk, resolved.** The open question was whether a `defineNodeState` store still gets its gc/dispose drained
after moving out of `executors/math.ts` into a co-located `node.ts`. It does, structurally: the `nodeRegistry`
glob is **`{ eager: true }`**, so `node.ts` loads at startup and its module-scope `defineNodeState(...)`
self-registers into `nodeState.ts`'s module-level `lifecycles[]` exactly as before; the engine holds that array
**by reference** (`registerLifecycles(collectedLifecycles())` in `composables/useExecutionEngine.ts:26`), so a
registration from any eagerly-imported module is seen. No leak, no timing gap.

**What moved.** `registry/math/smooth/node.ts` now owns the def + the `smoothState` store + `smoothExecutor`
(all **byte-identical** to their git originals — def-diff + exec/state-diff both clean). Stripped from
`executors/math.ts` (now just `randomExecutor`; the `defineNodeState` import went with it), the barrel/import/
map-entry in `registry/math/index.ts` + `executors/index.ts`.

**The contract wrinkle — the memory's warning was RIGHT.** `tests/contracts/public-exports.ts` pins `smoothState`
AND `smoothExecutor` (plus ~14 other state stores + several executors) as resolving from `@/engine/executors`.
Deleting them from `math.ts` would drop them from the `export * from './math'` surface and red the
`public-exports` gate. **Template established (keeps the gate green with ZERO fixture edits):**
`executors/index.ts` adds `export { smoothState, smoothExecutor } from '@/registry/math/smooth/node'`. Bonus:
`smooth.test.ts` (imports both from `@/engine/executors`) needed **no change** — same instance, identity
preserved. So for the ~16 pinned stateful nodes, prefer the barrel re-export over repointing the test. No cycle
risk (`executors/index.ts` already imports `colocatedExecutors` from nodeRegistry → already depends on every
node.ts transitively).

**Co-located total: 74 nodes** (73 + smooth). **Gates:** typecheck clean · lint 0 err (49 any-warns) · `test:unit`
**2062** / **144 files** (smooth.test.ts + public-exports 59 both green unchanged) · build ok · **browser smoke:
count 241, `smooth` registered once, Play→Stop drained the store cleanly, 0 real console errors**. On
`phase0-file-format`; `main` untouched; **not committed**. Next: the recipe is now proven for the whole stateful
tail — sweep it (each pinned store needs the barrel re-export; dispose-bearing stores also verify teardown), OR
knock out the highest-yield low-risk shared-executor batch (3d 16 / opencv 9 — zero test/component coupling).

---

## 2026-07-12 (later 79) — committed later-73→78 to phase0-file-format (3 commits)

The whole uncommitted body (later-73 through later-78, ~120 files) was reviewed clean (two ultracode audits) and
is now committed to `phase0-file-format` as three dependency-ordered, each-green commits (no AI attribution;
author Moheeb Zara):
- **`6c28815`** — *Add modulation input ports to the image-fx shader nodes + atan2/min/max.* The Phase-5
  feature work: real modulation ports on all 8 image-fx nodes (tips now true), + the atan2/min/max primitives,
  PURE_NODE_TYPES 24→27.
- **`91cf4d1`** — *Co-locate the pure math, logic, string, and data nodes (Phase 6).* 58 nodes moved to
  registry/<cat>/<node>/node.ts (13 math + 6 logic + 12 string + 27 data); executors inline verbatim;
  string.ts/data.ts deleted; test repoints; pathHelpers shared module; nodeRegistry guard fixed.
- **(this docs commit)** — HANDOFF later-73→79 + ROADMAP/kickoff/strategy sync.

**Co-located total: 73 nodes** (the 4 math from later-71 were already committed; +8 image-fx +3 primitives +13
math +6 logic +12 string +27 data this body). `main` untouched. Split rationale: per-increment commits were
infeasible (the 4 co-location increments all edit `executors/index.ts`), so the split is by clean file boundary
(Phase-5 files ∩ Phase-6 files = ∅), each commit a self-contained green unit. Gate baseline at commit tip:
typecheck clean · lint 0 err · `test:unit` 2062/144 · build ok · browser 0 errors · count 241.

**Remaining tail (from the later-77 classification, ~132 legacy nodes):** clean-inline one-offs (visual `color`,
math `random`, code `template`, logic `match-value`, inputs constant/slider/xy-pad, timing lfo/time — cross-file
execs); the **shared-executor sweep** (~68: 3d 16 / opencv 9 / clasp 10 / ai / audio / visual-remaining — import
the exported executor, image-fx style); the **stateful `defineNodeState` path** (~57, NOT yet proven — the
biggest un-de-risked chunk); component (~18); data's 6 deferred. See the co-location memory for the full map.

---

## 2026-07-12 (later 78) — ultracode per-node verify + 27 data nodes co-located (generator-assisted)

**Per-node verification workflow (33 agents, one per data node): exact migration manifest.** Each returned
executor location, purity, test-coupling, output ids, and gotchas — catching what a coarse classification misses.
Buckets: **27 clean-inline in data.ts** (array-* 12, object-* 8, type-conversion 7), 3 cross-file (json-parse/
json-stringify executors in connectivity.ts, router in utility.ts), 2 stateful (debounce/throttle), 1 service
(texture-to-data). The manifest's gotchas were load-bearing: e.g. several "boolean" output ports actually emit
numeric 1/0, array-get JSON.parses its default + supports negative indexing — all preserved by verbatim copy.

**Migrated the 27 clean-inline data nodes** → registry/data/<id>/node.ts. Because 27 is large, I generated them
with a **byte-faithful generator script** (`scratchpad/gen-data.mjs`): id→executor from the `dataExecutors` map
(source of truth), def extracted from each legacy file, executor extracted from data.ts by name, assembled
verbatim. **Verified: all 27 defs + executors byte-identical** to git originals (the safety net — no generator
drift). Shared-helper handling: `getByPath` (used by object-get + object-has) and `setByPath` (object-set) were
extracted verbatim into **`registry/data/pathHelpers.ts`**; those 3 node.ts import from it (rule-of-three → shared
module, not duplication).

**Full-category cleanup:** `executors/data.ts` **deleted** (its map held exactly the 27; helpers moved); the
`dataExecutors` import + spread removed from `executors/index.ts`; barrel trimmed to the 6 deferred. The 6
deferred nodes keep their defs + executors (json-* in connectivity.ts, router/debounce/throttle in utility.ts,
texture-to-data in visual.ts — all verified still registered). `data.test.ts` (73 tests) repointed to the 27
node.ts defaults (aliased).

**Co-located so far: 73 nodes** (20 math + 8 image-fx + 6 logic + 12 string + 27 data). **Gates:** typecheck
clean · lint 0 err · `test:unit` **2062** / **144 files** (data.test.ts green via repoint) · build ok · **browser
0 errors**, count **241** (all 27 + 6 deferred present, object-get pathHelpers import works at runtime). On
`phase0-file-format`; `main` untouched; **not committed** (~120 files across later-73→78). Next per the plan:
data's 6 remainders + the shared-executor sweep (3d 16 / opencv 9 — service-singleton import variant), or the
stateful `defineNodeState` path.

---

## 2026-07-11 (later 77) — ultracode tail-classification plan + string category fully co-located (12)

**Multi-agent classification of the whole remaining tail (Workflow, 16 category agents): 204 legacy nodes
classified** into migration buckets, giving a verified map for draining Phase-6. Result:
- **clean-inline** (pure/simple self-contained → inline the executor): biggest in **data (~30)**, **string (12)**,
  **logic-remaining (9)**, **inputs (3)**, **timing (2, cross-file — lfo/time executors live in input.ts)**,
  plus one-offs (visual `color`, math `random`, code `template`, logic `match-value`, data `json-parse`/
  `json-stringify` whose executors live in connectivity.ts).
- **shared-executor** (import the exported executor, image-fx style): **~68** — all of 3d (16), opencv (9), clasp
  (10), most ai (15) + audio + most visual-remaining (12). These call service singletons (three renderer / audio
  manager / cv service).
- **stateful** (`defineNodeState` / module Map → the NOT-yet-proven path): **~57** — connectivity (11), most
  audio, timing (6), math-remaining (6: random is the exception), messaging (2), logic gate/latch/sample-hold, etc.
- **component** (bespoke SFC): **~18** — ai (7 vision), debug (4), inputs (3), etc.
- **CAVEAT (never trust the plan blindly):** the string agent misclassified string as "no test coupling", but
  `string.test.ts` imports all 12 executors directly. I verified every node against the actual code before
  migrating — the plan is a guide, not gospel. Full plan JSON archived in the workflow output.

**Then continued — co-located the entire `string` category (12 nodes):** `string-concat`/`-split`/`-replace`/
`-slice`/`-case`/`-length`/`-contains`/`-starts-ends`/`-trim`/`-pad`/`-template`/`-match` → registry/string/
<id>/node.ts (executor INLINE). Notes: (1) migrated **without `pure:true`** — they're pure fns but none were in
PURE_NODE_TYPES, so omitting preserves exact current behavior (a pure-promotion is a separate optional increment).
(2) `string-case`'s 4 helpers (toCamelCase/Snake/Kebab/Title) moved inline with it. (3) **Fully-migrated category
handling:** barrel → `export const stringNodes = []` (kept so allNodes.ts import stays), and `executors/string.ts`
+ its `stringExecutors` map + the `import`/`...spread` in executors/index.ts were **deleted** wholesale.
(4) `string.test.ts` (106 tests) repointed to the node.ts defaults (aliased). All 12 defs + executors
**byte-identical** to git originals.

**Co-located so far: 46 nodes** (20 math + 8 image-fx + 6 logic + 12 string). **Gates:** typecheck clean · lint
0 err · `test:unit` **2062** / **144 files** (string.test.ts green via repoint) · build ok · **browser 0 errors**,
count **241**. On `phase0-file-format`; `main` untouched; **not committed**. Next per the plan: `data` (~30 clean,
mostly test-coupled array-ops), then the shared-executor sweep (3d/opencv), then the stateful path.

---

## 2026-07-11 (later 76) — ultracode audit of later-73/74/75 (clean) + 4 nit fixes + logic co-location

**Multi-agent adversarial audit (Workflow, 11 agents): 4 confirmed findings, 0 critical/major, 0 dismissed.**
7 review dimensions (byte-faithfulness, registration/imports, purity/dirty-mode, modulation, tests, honesty/docs,
whole-diff bug hunt) each with an independent high-effort skeptic verify pass. Every core dimension came back
**clean** — byte-faithful migrations, sound registration (count 241, dedup, colocated-wins, no cycles), all pure
nodes genuinely pure, modulation correct end-to-end (the dead-slider risk confirmed absent), test integrity
intact, tips honest, no functional defect in the whole diff. The 4 findings + fixes:
1. **[minor, test-quality] `nodeRegistry.test.ts` "no orphans" guard was tautological** — it checked colocated
   ids against `allNodes` (which unconditionally contains them), so it could never fail; its premise (colocated ⊆
   legacy) is also now false (atan2/min/max born co-located; migrated nodes leave the barrel). **Fix:** rewrote it
   to the real invariant — each colocated id resolves in `allNodes` **exactly once** (colocated-wins dedup holds;
   catches a dropped node or a double-registration). *Note: the verify agent's suggested fix (compare vs
   `legacyNodes`) was WRONG — migrated ids aren't in the barrels either, so it would fail for every migrated node;
   applied the correct invariant instead.*
2. **[nit] doc off-by-one** — ROADMAP/HANDOFF said "only 7 image-fx nodes lacked ports"; actually all 8 did (4 had
   over-promising tips; later-73 retrofitted 7, chroma-key in later-74). Corrected both docs.
3. **[nit] `pure-node-types.test.ts` stale docstring** — "literal 24-id set" + "no nodes co-located yet"/
   "Vacuously true until Phase 6" now false (27 ids; co-location live). Refreshed the comments.
4. **[nit] stray `orig_math.ts` backup at repo root** — a migration backup that `git add` would stage. Deleted.

**Then continued the main thread — co-located the 6 pure logic nodes** (`compare`/`and`/`or`/`not`/`select`/
`switch`) to registry/logic/<node>/node.ts (executor moved INLINE, `pure:true`). Cleaner than math: the 6 pure
executors have ZERO test imports and `public-exports.ts` explicitly does NOT pin individual logic executors (only
the stateful `gate`/`monitor`), so no test rewiring. `gate` (stateful `defineNodeState`) correctly stays legacy;
`executors/logic.ts` trimmed to just `gateLastValue`/`gateExecutor`; barrel + index import/map stripped. All 6
defs + executors **byte-identical** to git originals.

**Co-located so far: 34 nodes** (20 math + 8 image-fx + 6 logic). **Gates:** typecheck clean · lint 0 err ·
`test:unit` **2062** / **144 files** · build ok · **browser 0 errors**, count **241** (migrations preserve count;
all 6 logic present, `gate` still legacy). On `phase0-file-format`; `main` untouched; **not committed**. Next:
continue the tail, or take the stateful `defineNodeState` co-location path (gate/smooth/counter/monitor).

---

## 2026-07-11 (later 75) — Phase-6 co-location: the 13 pure math nodes (true self-containment)

Continued the confirmed main thread (per-node co-location). Migrated the whole **pure-math subset** —
`abs`, `clamp`, `map-range`, `modulo`, `power`, `trig`, `vector-math`, `lerp`, `step`, `smoothstep`, `remap`,
`quantize`, `wrap` (13) — to `registry/math/<node>/node.ts`. Unlike the image-fx family (heavy shared executor
→ imported), these executors are trivial and self-contained, so each moved **inline** into its `node.ts` (true
co-location: def + executor together, `pure: true`), and the bodies were deleted from `executors/math.ts`.

**The one non-obvious wrinkle — tested executors.** `executors/index.ts` does `export * from './math'`, and
`math.test.ts` imported 10 of these executors (`trig`/`power`/`vector-math`/`modulo`/`lerp`/`step`/`smoothstep`/
`remap`/`quantize`/`wrap`) directly to unit-test them. Deleting the bodies would break those imports. Fix:
`math.test.ts` now imports each co-located `node.ts` default and aliases `const trigExecutor = trigNode.executor`
— **zero call-site changes**, all assertions preserved. (This is the recipe for co-locating any executor that has
a direct unit test; the untested `abs`/`clamp`/`map-range` were clean moves.)

**Strips:** deleted the 13 legacy defs + barrel refs (`registry/math/index.ts` now lists only the 9
stateful/impure remainders — `random`/`noise`/`easing`/`spring`/`smooth`/`slew-limiter`/`derivative`/`integral`/
`tween-to-target`); trimmed `executors/math.ts` to just `smoothState`/`smoothExecutor`/`randomExecutor`; removed
the 13 imports + 13 map entries from `executors/index.ts`. No circular imports (executors/math.ts imports nothing
from registry). `smooth` (stateful, `defineNodeState`) and `random` (impure) correctly stayed legacy.

**Verification:** all 13 defs **byte-identical** to their git originals (def-object diff) and all 13 executor
bodies **byte-identical** (stripped-signature diff) — no transcription drift. `PURE_NODE_TYPES` unchanged (these
ids were already in it; the pure-set gate stayed green). Co-located math count so far: the 7 from later-71/73
(add/subtract/multiply/divide/atan2/min/max) + these 13 = 20; plus the 8 image-fx = 28 nodes co-located.

**Gates:** typecheck clean · lint **0 err** (49 any-warns) · `test:unit` **2062** / **144 files** (math.test.ts
rewired, count unchanged) · build ok · **browser 0 errors**, count **241** (migrations preserve count; all 13
present, `vector-math` outputs x/y/z/magnitude intact). On `phase0-file-format`; `main` untouched; **not
committed**. Next: continue the co-location tail (logic category is the next clean pure batch) or the stateful
`defineNodeState` co-location path (smooth/counter/etc.), or the remaining Phase-5 stateful primitives.

---

## 2026-07-11 (later 74) — Deep adversarial audit of later-73 (clean) + chroma-key consistency + doc sync

**Ultrathink audit of the later-73 increment: no bugs.** Two independent review agents (adversarial correctness +
gate/honesty completeness) plus my own decisive checks. Everything still uncommitted; gates green throughout.

**What was verified:**
- **The crux — no control-shadowing regression.** The input-override (`ctx.inputs.get ?? ctx.controls.get ??
  default`) is correct because `ExecutionEngine.getNodeInputs` (line ~395) **only** sets `ctx.inputs` for edges
  that actually target the node with a defined source value — it never pre-populates unconnected ports. So an
  unwired modulation port ⇒ `ctx.inputs.get` is `undefined` ⇒ the slider is honored; a wired one ⇒ coerced value
  wins. Proven by reading the engine, not assumed. (This closes the verification boundary later-73 flagged.)
- **Behavior preservation:** all 8 co-located image-fx defs diffed **byte-identical** to their pre-migration
  git originals (only a trailing blank line differs) — no field transcription errors.
- **Correctness review (agent): clean, 0 bugs** — no circular imports (`executors/visual.ts` never imports
  `@/registry`), single registration path (colocated-wins), no dangling refs (`makeImageFxExecutor` + the 8
  exported consts still used by the co-located `node.ts`), `atan2`/`min`/`max` genuinely pure (safe in dirty mode).
- **Honesty sweep (agent): no over-promising tips remain anywhere** across all 290 registry files — the 4 image-fx
  tips are now true against the generated ports; every other wiring tip names a real input port, routes an output,
  or references dynamic ports.
- **Hard gates all derived, none stale.** Live browser: count 241, all image-fx modulation ports + `atan2`/`min`/
  `max` present and discoverable via the real fuzzySearch path, 0 console errors. (Note: Vue Flow keeps its own
  internal node state, so direct store-mutation smokes don't reflect on canvas — registry-level checks are the
  reliable signal; BaseNode renders `definition.inputs` via existing, tested layout.)

**Follow-ups done (from the reviewers' notes):**
- **chroma-key modulation ports** — the one flagged family inconsistency: `image-fx-chroma-key` now exposes its 3
  numeric keying params (`u_similarity`/`u_smoothness`/`u_spill`) as modulation input ports like the other 7
  (the vec3 `u_key_color` stays control-only); the executor already read `ctx.inputs ?? ctx.controls` for them, so
  it "just works." All 8 image-fx nodes are now uniformly modulatable. Browser-verified.
- **Doc drift sync** — the audit found no stale *hard gate*, only soft doc drift. Fixed the actively-misleading
  ones: `docs/handoff/NEXT_SESSION_KICKOFF.md` got a later-73/74 UPDATE banner (it still said "count stays 238 /
  first 4 math migrated"); `docs/strategy/00-repo-orientation.md` 238→241. **Deliberately NOT cherry-patched:**
  `docs/nodes/*` (README "208 nodes", math.md documents 14 of ~31 live math nodes) is broadly stale and slated for
  Phase-5 auto-regeneration from live defs — half-fixing it for 3 nodes would falsely imply it's maintained.

**Gates:** typecheck clean · lint **0 err** (49 pre-existing any-warns) · `test:unit` **2062** / **144 files** ·
build ok · browser **0 real errors**, count **241**. On `phase0-file-format`; `main` untouched; no AI attribution;
**nothing committed** (awaiting ask). Next: stateful Phase-5 primitives (`phasor`/`edge`-detector/LFO `reset` via
`defineNodeState`) or continue Phase-6 co-location on the next category.

---

## 2026-07-08 (later 73) — Close the Phase-5 honesty gap (image-fx modulation, for real) + first primitives, co-located

Acted on later-72's recommendation. Three interleaved increments, each gate-green; **not committed** (awaiting ask).

**First, an empirical correction to the audit's scope.** later-72/AUDIT §C said `image-fx-*`, audio (`wet`/
`feedback`/`Q`), and 3D material/light all lack modulation input ports. Reading the actual defs: **only the 8
shader-preset `image-fx-*` nodes did** (retrofitted 7 in this increment; chroma-key followed in later-74). Audio
(`svf-filter` cutoff/resonance, `filter` frequency, `distortion`
amount, `wavetable` frequency), 3D (`camera` posX/…, `transform` rotX/…), and the rest of visual (`blur` radius,
`blend` mix, `displacement` strength, `color-correction` hue/…, `color-ramp` t, `transform-2d` rotate) **already
had** input ports — their "Drive X from an LFO" tips are honest. The dishonesty was localized to four image-fx
tips (glitch "Intensity", kaleidoscope "Rotation", pixelate "Pixels", rgb-shift "Angle") whose params were
control-only. So instead of deleting those tips, I made them **true**.

**A — Retrofit image-fx modulation for real (honesty via capability).** The infra already existed: added
`generateModulationInputs(uniforms)` (numeric-only; `type:'number' as const` so it's `PortDefinition`-assignable
without importing the store type) beside the existing `generateInputsFromUniforms`, and a **one-line** change in
`runImageFx` — `ctx.inputs.get(def.name) ?? ctx.controls.get(def.name) ?? def.default` — **byte-identical idiom to
the live `colorCorrectionExecutor`**. Every image-fx float uniform (Intensity/Speed/Segments/Rotation/Pixels/
Amount/Angle/Lines/Scroll/Levels/Scale) is now a real input port; the four tips are honest. Unit-tested the pure
generator (numeric-only filter **mutation-verified**: neuter it → 2 tests red) + **browser-verified** all 7 nodes
expose the new ports in the live bundle, 0 console errors.
  - *Verification boundary (honest):* the executor input-override path is verified by **code inspection +
    parity** with the proven `colorCorrectionExecutor`, plus the def/port change fully verified (unit + mutation +
    live-registry browser check). I did **not** run a full WebGL pixel-diff of a wired LFO→uniform modulation (a
    brittle headless-GPU harness for a 1-line nullish-coalesce); the port generation is the genuinely new logic
    and it is thoroughly covered.

**B — Co-locate the whole image-fx family (Phase 6, 8 nodes).** Moved all 8 `image-fx-*` defs to
`registry/visual/image-fx-*/node.ts` (`export default defineNode({definition, executor})`). The executors are
**shared** (heavy renderer plumbing in `executors/visual.ts`), so each `node.ts` imports the exported
`imageFx*Executor` const; the `visualExecutors` map entries were removed so the co-located spec is the single
registration site (colocated-wins). Deleted the 8 legacy defs + all barrel refs. No circular import (visual.ts
doesn't import registry). chroma-key co-located **behavior-preserving** (no new ports — its tips were already
honest). Count for these stays 238 (co-location preserves count); browser re-verified 238, ports intact, 0 errors.

**C — First new primitives, born co-located (Phase 5 + Phase 6 at once).** Verified genuinely missing (never
assume): `trig` has single-input `atan` but **no `atan2`**; `min`/`max` existed only as clamp/wrap *bound
controls*, never as two-signal nodes. Added `registry/math/{atan2,min,max}/node.ts` (pure, inline executors,
mirroring the `add` reference). `PURE_NODE_TYPES` **24→27** (engine set + the canonical witness in
`pure-node-types.test.ts`, all three `24` counts bumped — the deliberate "read the executor first" friction). New
`math-primitives.test.ts` exercises each via its `node.ts` default export; **atan2 arg-order mutation-verified**
(swap `(y,x)`→`(x,y)` → red). Node count **238→241** (new nodes legitimately grow the library; no hardcoded-238
gate exists — count-equality is dynamic legacy-vs-colocated).

**Still open in the modulation gap** (deferred, correctly): `phasor`/`ramp` + an `edge` *detector* + LFO
`phase`/`reset` (all **stateful** → the `defineNodeState` co-location path, the recipe's harder case), a
**feedback (frame-delay) visual node**, audio `wet`/`feedback`/`Q`/`ratio`/sidechain + 3D material/light
colour/emissive ports, `blur.passes` wiring, gain/volume unit unification, filter response-curve, the inline
connection picker, and `connectivity.md` regen.

**Gates (all green):** typecheck clean · lint **0 err** (49 pre-existing any-warns) · `test:unit` **2062**/**144
files** (+3 ShaderPresets, +9 math-primitives; pure-set gate rewritten to 27) · build ok · **browser 0 real
errors**, live count **241**, all image-fx modulation ports + all 3 new primitives present. On `phase0-file-format`;
`main` untouched; no AI attribution. Next: continue Phase-6 co-location per category, or take the stateful Phase-5
primitives (phasor/edge/LFO-reset) as their own `defineNodeState` increment.

---

## 2026-07-08 (later 72) — Deep plan-vs-reality audit (whole repo + app) + one doc fix

A full audit (ultrathink, two review agents + direct metrics + Chrome visual pass). **No code changed except one
doc fix** (`15a7d50`: `divide`'s help text claimed divide-by-zero yields Infinity/NaN, but the executor is guarded
and returns 0 — a pre-existing inaccuracy carried into the co-located file). Repo is clean, on-branch (`main`
untouched at `d390b05`), all pushed; full gate green (typecheck · lint 0 err · `test:unit` **2050**/143 · build ok);
app visually + functionally verified in Chrome, 0 console errors on every surface (editor, explorer both tabs,
properties, on-wire overlay, control-panel view).

**Adversarial code review of the whole session diff (`c467554..HEAD`): clean** — no critical/major findings.
Co-location verified byte-faithful (all 4 `node.ts` diffed vs the deleted originals), dedup correct, count 238,
no circular imports, pure-set intact.

**Plan-vs-reality (vs ROADMAP + POLICIES + EXTENSIBILITY + SECURITY + AUDIT + node-library-review):**
- **DONE & verified:** Phase 0 (foundations/format/primitives), Phase 1 (de-monolith/leak class; only `subflow`
  state group deferred to Phase 7).
- **Mostly done, honest remainders:** Phase 2 (Serial/MIDI adapters, BLE picker UX, MediaPipe derive,
  model version-resolve/lazy-load open), Phase 3 (`range`/`curve`/`gradient` control types unbuilt — no consumers),
  Phase 4 (a11y 100%; onboarding + on-wire tail [freeze-frame/history/error-deep-link] open).
- **The credibility gap — Phase 5 (modulation) is essentially NOT STARTED** ⚠️ — AUDIT's #2 headline, fully open:
  `image-fx-*`/audio `wet`/`feedback`/`Q`/3D material-light params have **no input ports**; LFO has no
  `phase`/`reset`; no feedback (frame-delay) node; no `atan2`/`edge`/`phasor` primitives; `connectivity.md` stale.
  **Worst part: node *tips* already promise these** (e.g. `image-fx-glitch` tip "Drive Intensity from an LFO" —
  there is no Intensity port). The UI is making claims the engine can't keep — a real honesty problem given the
  strategy prizes exactly that.
- **STARTED:** Phase 6 co-location (4/238; infra live). **NOT STARTED (correctly sequenced later):** Phase 7
  subflow rebuild (still runtime-dead — AUDIT's #1 finding, now unblocked), Phase 8 VJ/kiosk, Phase 9 multiplayer.

**Test health:** 2050/143, strong CI gate net (count-equality, 24-id pure-set, export-list, per-type leak,
registry-integrity, format round-trip, prompt-format), mutation-verified efficacy. **Two honest boundaries:**
(1) **CI can't catch app-chrome regressions** — `test:e2e` is a script with NO tests behind it (no
`playwright.config`/specs); EditorView/BaseNode/NodeExplorer are verified by *manual* Playwright smokes only.
(2) **The POLICIES-mandated a11y-lint (axe) CI gate does not exist** — no `vuejs-accessibility`/axe eslint plugin;
a11y is covered by per-component ARIA *unit* tests instead (decent, not the mandated automated gate). Coverage %
unmeasured. **Code-health watch:** `EditorView.vue` grew **1044 → 1239** this session (drag-wire + on-wire) —
partially undoing the later-61 de-bloat; the `openWireSuggestions*` cluster is a future extraction candidate.

**Governance/sustainability (POLICIES §3, maintainer-owned, OPEN, flagged "Critical"):** license is MIT ✓, but no
funding/governance model + no published "we'll never orphan your files" durability commitment — should exist
*before* marketing the durability narrative publicly.

**Recommendation (carried into the kickoff):** highest-leverage next move is **closing the Phase 5 modulation
gap** — or, as a fast honesty patch, **correcting the node tips that reference ports that don't exist yet**. It's
small, concrete, and removes a real credibility problem. Phase 6 co-location remains the maintainer-confirmed
"main reason" thread; the two can interleave.

---

## 2026-07-08 (later 71) — Phase 6 STARTED: per-node co-location goes live (first 4 math nodes)

**The main event.** The whole modernization plan (Phase 0 `defineNode`/`defineNodeState`, Phase 1 de-monolith,
Phase 3 declarative `ui`/`component`) was foundation for **per-node co-location** — every node becoming a
self-contained `registry/<cat>/<node>/node.ts`. The `nodeRegistry` glob (`registry/**/node.ts` → `defineNode`
specs) has existed since Phase 0 but was **inert** (0 files). This increment makes it **live** and migrates the
first 4 nodes, establishing the pattern + the one-time merge infrastructure the other ~234 follow.

**The merge path (the one-time infra — read this before migrating more):**
- `registry/allNodes.ts` now unions `colocatedDefinitions` (from `nodeRegistry`) with the legacy per-category
  arrays, **deduped so a co-located node WINS** over any legacy copy of the same id.
- `engine/executors/index.ts` spreads `colocatedExecutors` at the **end** of `builtinExecutors` (so colocated
  wins).
- Net: **migrating a node = (1) create `registry/<cat>/<node>/node.ts` with `export default defineNode({definition,
  executor, pure?, component?, ...})`, (2) delete its legacy `.ts` def + barrel refs (export/import/array) +
  executor body + the `id: xExecutor` map entry + its import in `executors/index.ts`.** Total count stays 238.

**Migrated (all pure, stateless, no component — the simplest case):** `add`, `subtract`, `multiply`, `divide` →
`registry/math/<node>/node.ts` (definition + executor + `pure:true` together). Legacy files/refs deleted.

**Gates all green (the safety net for the whole Phase 6):** count-equality (still **238**; the `nodeRegistry`
count guard is `≤` today, `TODO(phase6)` tightens to `===` when all are migrated), `COLOCATED_PURE_NODE_TYPES ⊆`
the 24-id canonical pure set (add/subtract/multiply/divide are all in it), must-not-break public exports, and
`registry-integrity` (counter/sample-hold). **Verified in-browser:** registry loads 238, a co-located `add(2,40)`
computes **42** in the live engine, `subtract 10-3=7` / `multiply 6*7=42` / `divide 20/4=5` / divide-by-zero
guard `1/0→0` preserved; boot→Play→Stop **0 console errors**.

**Notes for the migration tail:**
- Node order: co-located nodes append after legacy in `allNodes`, so a migrated node moves to the end of its
  category in the explorer (cosmetic; the whole list becomes glob-ordered once fully migrated).
- Import idiom in `node.ts`: `defineNode` from `@/engine/defineNode`, `NodeDefinition` type from `@/stores/nodes`,
  `ExecutionContext`/`NodeExecutorFn` from `@/engine/ExecutionEngine`. No circular-import issues (executor is
  inline; nodeRegistry only pulls `defineNode`).
- **Harder cases still ahead:** stateful nodes (`defineNodeState` stores — the `public-exports` gate pins some,
  e.g. `smoothState`/`gateLastValue`, so co-locating them means moving the store too + updating the fixture);
  the 6 `_`-prefixed folders (rename, remove `_`); the ~22 bespoke-`component` nodes; and `counter`/`sample-hold`
  (each currently in two categories — resolve to one folder). Do these per category with the gates green each time.

State: typecheck clean · lint 0 err (49 warns) · `test:unit` **2050** (behavior-preserving; the gate tests already
existed) · build ok · smoke 0 errors. Committed + pushed on `phase0-file-format`; no AI attribution.

---

## 2026-07-08 (later 70) — later-69 audit (clean) + on-wire debugging: live per-port value overlay

**Self-audit of later-69 (the keyboard `n`→picker trigger): clean.** Browser-checked the one path not covered
last turn — pressing `n`/`Shift+N` on the live canvas with **no wire in progress** is a no-op (no popover, no
console error). The trigger + overlay-guard + on-screen-clamp fixes all hold. One honest edge noted, not fixed
(astronomically rare): `n` on a source port that NO node type accepts would silently cancel the wire (no
popover) — every real port type has compatible nodes via `any` inputs.

**Continue — on-wire debugging, increment 1: live per-port value overlay.** Picked this over onboarding (which
has an unresolved design fork) because the engine **already exposes the values**: `ExecutionEngine` writes each
node's per-port `outputValues` to `runtimeStore.updateNodeMetrics` every frame, and `getNodeMetrics().outputValues`
is UI-reachable + reactive. So this slice computes nothing new — it just surfaces what's there.

- **`utils/formatPortValue.ts`** — pure, non-throwing formatter for any emitted value (numbers with trailing
  zeros trimmed, booleans, quoted/truncated strings, `[n]` arrays, `{…}` objects, `null` / `—`). **6 unit tests +
  3 mutations** (trailing-zero trim, boolean, array-length).
- **`ui` store `showPortValues` + `togglePortValues`** (off by default), beside the existing showMinimap/showGrid.
- **BaseNode** shows a `.port-value` chip on each output port label when `showPortValues && runtimeStore.isRunning`
  — reading `getNodeMetrics(id).outputValues[portId]` through the formatter. Reuses the existing hover-label
  element (forced visible in debug mode), so no new port layout.
- **Toggle** = an eye `ControlButton` in the Vue Flow `<Controls>` (aria-pressed + active highlight).

Browser-verified (system Chrome, sample flow running): toggle off → 0 chips; toggle on → **17 output-port chips**
with sensibly-formatted live values (`0`, `false`, `""`, `null`, a truncated `"Model not loaded…"`, `{…}` for
audio/texture object ports), aria-pressed/is-active correct; toggle off → hidden; **Stop → hidden** (not running,
state persists); **0 console errors** (screenshot confirms readable chips on the live graph).

**On-wire debugging remaining (future increments):** freeze-the-frame (pause + inspect a held frame), value
history/sparkline, and error→exact-node deep-linking. Edge-level (value on the wire) vs the current port-level is
a later option. This increment is the foundation.

State: typecheck clean · lint 0 err (49 warns) · `test:unit` **2050** (+6 formatPortValue) · build ok · smoke 0
errors. Committed + pushed on `phase0-file-format`; no AI attribution.

---

## 2026-07-08 (later 69) — later-68 audit + make the wire-drop picker keyboard-operable

**Self-audit (ultrathink, browser) of later-68.** Two minor real issues found + fixed, plus one honest gap closed:
- *Drop on canvas overlays opened the picker:* releasing a wire on the **MiniMap / Controls** (which sit over the
  pane) passed the empty-space guard (they aren't `.vue-flow__node`) → the picker appeared over them. Extended
  the guard to also exclude `.vue-flow__minimap`/`.vue-flow__controls`/`.vue-flow__panel` — only the actual pane
  counts. Verified: drop on minimap/controls now suppressed.
- *Picker overflowed the bottom edge:* the on-screen clamp reserved 320px but the full popover is ~340px (header
  + input + 260 list + borders), so a low drop pushed it ~11px below the viewport. Bumped the reserve to 344.
  Verified: edge drop now sits fully on-screen (bottom 887 < 900).
- Rapid successive drops stay clean; the search input is still editable (`@mousedown.prevent` is on the options,
  not the input); 0 console errors throughout.

**The gap: the picker was mouse-only** — a keyboard user dragging a wire had no way to reach it, in an
accessibility-first tool. Closed it by hooking the picker into the existing **keyboard wire machine**
(`useCanvasKeyboard`): during a keyboard wire (`w`), pressing **`n`** hands the chosen source output to the same
`WireSuggestionPopover`, positioned beside the source node; pick → insert + auto-wire (the mouse path's
`openWireSuggestions`, reused). This also gives the **"No compatible target" dead-end an escape** (the wire
machine used to just announce the dead-end and sit there — now: "…Press N to add a new node"). The source-stage
live-region string advertises `n`; the trigger is an **optional injected dep** (`suggestNodeFromWire`) so the
composable stays store/EditorView-agnostic. **+2 unit tests + mutations** (n hands off the right origin + cancels
the wire; n is a no-op with no wire).

Browser-verified (system Chrome): focus canvas → `w` (wire from a trigger output) → `n` → picker "accepts
Trigger" (85 options, input focused) → Enter → node+edge added, `textbox` wired, focus returns to
`#flow-canvas-panel`; **0 console errors**. So the suggestions feature is now fully keyboard-operable end to end.

State: typecheck clean · lint 0 err (49 warns) · `test:unit` **2044** (+2 useCanvasKeyboard) · build ok · smokes
0 errors. Committed + pushed on `phase0-file-format`; no AI attribution. (Saved the `latch-canvas-interaction-
gotchas` memory earlier this session — the `project()` pane-relative + combobox `@mousedown.prevent` traps.)

---

## 2026-07-08 (later 68) — Phase 4 non-a11y: drag-a-wire-into-empty-space → compatible-node suggestions

Shipped the ROADMAP Phase-4 "drag-a-wire-into-empty-space → compatible-node suggestions" item. Dragging a wire
off a port and releasing it on empty canvas now opens a small **inline picker** (the maintainer chose the
contextual popover over reusing the node-explorer modal) of the nodes whose ports are type-compatible with the
dragged-from port; picking one inserts it at the drop point and **auto-wires it, as a single undo**. Two
increments:

**1. `utils/nodeSuggestions.ts` — `suggestNodesForPort(origin, definitions, isCompatible)`.** Pure: given the
dragged-from port's `{type, direction}`, returns the node types with a compatible port + the exact port to wire
(`'source'` drag → candidate INPUT via `isCompatible(originType, portType)`; `'target'` drag → candidate OUTPUT).
`areTypesCompatible` is injected (store-agnostic), matching the other connection utils. **5 unit tests + 3
mutations** (invert inputs/outputs, swap the compatibility args — caught by a number↔string asymmetric case, and
first-vs-last port — caught by a two-compatible-port candidate). A TDD catch: my first "direction" assertion was
wrong (number→string IS compatible via coercion) — the helper was right; fixed the test.

**2. `components/canvas/WireSuggestionPopover.vue` + EditorView wiring.** The popover is an **ARIA 1.1 combobox**
(search input + `role=listbox` with `aria-activedescendant`), category-colour dots, keyboard nav
(arrows/Home/End/Enter/Escape), closing on Escape / click-away / focus-loss; the active option **scrolls into
view** on the long (85-item) list. **8 unit tests + 3 mutations** (wrap, active-reset-on-filter, Enter-picks-active).
EditorView captures the origin on `connectStart`, marks `connect` as made, and on `connectEnd` (fired without a
`connect`) opens the picker; pick → `addNode` at the drop + `addEdge` in one `startBatch`/`endBatch`.

**Bugs the build + the polish pass caught (both browser-only-visible):**
- *Combobox click-race:* clicking an option blurred the input, and the `focusout`-close fired (via nextTick,
  before `mouseup`) and unmounted the popover so the click never landed → **nothing inserted**. Fixed with
  `@mousedown.prevent` on the options (keeps focus on the input; the standard combobox fix).
- *Placement off by a sidebar-width:* `project()` takes **pane-relative** coordinates, but I passed raw client
  coords, so the node landed ~283px (the left toolbar width) to the right of the drop. Fixed by subtracting the
  `.vue-flow__pane` rect (as the existing palette-drop handler does). Verified: drop at screen x≈300 → node at x≈303.

**Polish (maintainer asked):** (A) the picker only opens on a **genuine empty-canvas** drop — a rejected drop onto
a node no longer hijacks into it (via `elementFromPoint`, robust for touch whose `touchend.target` is the
touchstart element); (B) active option scrolls into view; (C) the new node is nudged so its wired handle lands
near the cursor (up to the first port row; input-drags shift left a node-width so the OUTPUT edge meets the drop).

Browser-verified end-to-end (0 console errors): source-drag → 85 trigger-compatible suggestions → pick →
node+edge wired `trigger→trigger`; keyboard pick (filter + Enter) → `console`; input-handle drag → header "accepts
Object 3D", pick → new node wired as the edge **source** (reverse direction); Escape cancels + returns focus to
`#flow-canvas-panel`; undo removes node+edge as one; drop-on-node suppressed; drop-on-empty opens.

State: typecheck clean · lint 0 err (49 warns) · `test:unit` **2042** (+13: 5 nodeSuggestions, 8 popover) · build ok ·
smokes 0 errors. Committed + pushed on `phase0-file-format`; no AI attribution.

---

## 2026-07-07 (later 67) — Phase 4 non-a11y: dedicated snippets tab (+ the rule-of-three colour-resolver extraction)

Shipped the **dedicated snippets tab** — the ROADMAP Phase-4 item the `flowToPreview` thumbnail primitive was
built for. Snippets used to be an appended section at the bottom of the node grid (findable only by scrolling
past ~200 nodes); they now have a first-class home. Delivered as two clean, individually-revertible changes:

**1. Extracted `utils/nodeColor.ts` — `nodeTypeColor(nodeType, getCategory)` (the rule-of-three trigger later-65
predicted).** The `categoryMeta[category]?.color ?? neutral` resolver had drifted into **3 copies**
(`FlowSnippet.nodeColor`, `EditorView.templateNodeColor`, `EditorView.getNodeMinimapColor`). Extracted to one
pure helper with an **injected `getCategory` resolver** (same store-agnostic idiom as `flowToPreview`'s
`getColor`) — **4 unit tests + 2 mutations** (dropped-fallback, ignore-resolver) each confirmed red. Routed all
three call sites through it (behavior-preserving; dropped now-dead `categoryMeta`/`NodeCategory` imports from
EditorView). Browser-verified the three consumers still colour correctly: snippet thumbnails, starter-template
cards (audio green / visual pink / logic red — real category colours, not the neutral fallback), and the minimap.

**2. The snippets tab.** Added `activeTab: 'nodes' | 'snippets'` + `setTab` to the node-explorer store (reset on
open; **3 unit tests + 2 mutations**). NodeExplorer's content area is now a proper **`role="tablist"`** with a
**Nodes | Snippets** switcher built on the **same roving-tabindex keyboard model as `FlowTabs`** (Enter/Space
activate, Arrow/Home/End move+select+focus, `aria-selected`/`aria-controls`/`role="tabpanel"`). Snippets moved
out of the appended grid-section into their own tabpanel (reusing the existing thumbnail cards), each panel with
its own scoped search + empty-state; a count badge on the Snippets tab tracks the current filter.

Browser-verified end-to-end (system Chrome): tablist with 2 tabs (`Nodes` / `Snippets 6`); click switches panels
(node grid ↔ 6 snippet cards + 6 SVG thumbnails); search narrows 6→2 with the badge tracking, no-match →
empty-state; **keyboard roving** (ArrowLeft/Right select + move focus); insert from the tab closes the modal and
adds the snippet's nodes; **0 console errors**. NodeExplorer is app-chrome → browser-verified, not unit; the
store + util halves are unit+mutation.

**Doc correction:** later-65 said "all **34** snippets" — the real count is **6** (`data/flow-snippets.ts`). No
user-saved-snippet feature exists; the tab surfaces the 6 built-ins. (Also noted, not fixed: `--radius-xs` used
by `FlowSnippet`'s `.snippet-thumb` is undefined in tokens.css → silent no-radius fallback; pre-existing.)

**Self-audit (ultrathink, browser).** One real finding, fixed: the inactive tab's `aria-controls` pointed at a
panel that's `v-if`'d out of the DOM (a dangling reference). Since the grid mounts **all 238** node cards,
keeping both panels mounted (to make `aria-controls` resolve) is the wrong trade — so instead the tabs now
**omit `aria-controls`** (WAI-ARIA APG: don't reference a panel that isn't rendered; the panel→tab
`aria-labelledby` reverse link stays). Everything else measured clean: initial focus unchanged (Close button, as
before), sticky tablist holds on scroll, category filter narrows snippets on the snippets tab (AUDIO → 2), the
NodeDetail card→detail→back→focus-restore flow still works, 0 console errors, no visual regression (screenshots).

State: typecheck clean · lint 0 err (49 warns) · `test:unit` **2029** (+7: 4 nodeColor, 3 store-tab) · build ok ·
smoke 0 errors. Committed + pushed on `phase0-file-format`; no AI attribution.

---

## 2026-07-07 (later 66) — End-of-session audit (runtime clean) + snippets are now searchable

**Audit (ultrathink):** a final full-app runtime smoke after ~11 session increments — boot → **Play**
(`runtime.isRunning` true) → **Stop** (false) — came back with **0 real console errors** (only the benign
XNNPACK INFO line). The assembled app (canvas keyboard/marquee/thumbnails/the EditorView extraction) is
runtime-healthy. The audit also surfaced a papercut, fixed below.

**Continue: node-explorer snippets narrow with the search box.** They used to vanish the moment you typed
(`v-if … && !searchQuery`, and `categorySnippets` ignored the query), so a snippet was findable only by
category. Added a `visibleSnippets` computed that runs the query through the existing `fuzzySearch` (over
name + description) and drops the `!searchQuery` gate. Browser-verified: typing "audio" narrows 6→2 snippets,
a no-match query → 0, clearing restores 6, **0 console errors**. Additive + low-risk (NodeExplorer is
app-chrome → browser-verified, not unit).

State: typecheck clean · lint 0 err · `test:unit` **2022** · build ok · final runtime smoke 0 real errors.
All committed + pushed on `phase0-file-format`; no AI attribution.

---

## 2026-07-07 (later 65) — Audit of the thumbnail work + roll thumbnails out to the explorer snippet cards

**Audit (self, ultrathink) of later-64.** Investigated two suspected issues, both concretely in the browser:
- *Suspected:* `getColor`'s `var(...)` fallback wouldn't render as an SVG `fill` **attribute** (presentation
  attributes classically don't resolve `var()`). *Verdict: non-issue* — Chromium (the web+Electron target) DOES
  resolve `fill="var(--token)"` to the token colour (measured `rgb(140,140,140)`). Disproven by measurement.
- *Real (latent):* `FlowPreview`'s root `svg` carried `.flow-preview {height:auto}` AND the card's
  `.starter-thumb {height:48px}` — two single-class scoped rules on the same element, so the correct 48px height
  depended on stylesheet **cascade order**; if it flipped, the thumb would size by width (~150px) and blow out
  the card. **Fixed** (`ffb01b4`): FlowPreview no longer imposes a height, so the consumer's box always governs
  (rendered size unchanged, verified). a11y / honesty / over-abstraction lenses were clean.

**Continue: thumbnails on the node-explorer snippet cards.** Applied the same `FlowPreview` primitive to
`FlowSnippet.vue` (a small 56×40 preview at the left of each card), so **all snippets** get a schematic —
not just the 4 starters — completing the thumbnail rollout across both snippet surfaces. (NB: later-67 found
the real snippet count is **6**, not the "34" first written here.) Kept a local
`nodeColor` resolver (2nd copy of the 2-line category-colour lookup); will extract a shared helper only if the
dedicated snippets tab becomes a 3rd consumer (rule of three, avoiding premature abstraction).

Browser-verified: explorer snippet cards render category-coloured thumbnails (40px, correct node/edge counts),
**0 console errors**. typecheck clean · lint 0 err · `test:unit` 2022 · build ok. Uncommitted card change on
`phase0-file-format`; no AI attribution.

---

## 2026-07-07 (later 64) — Phase 4 non-a11y: flowToPreview thumbnails on the starter-template cards

Built the reusable thumbnail primitive the ROADMAP pairs with the snippets tab, and applied it to the
starter-template cards shipped in later-60 (text-only → visual). Deliberately scoped as a **testable primitive
+ one real consumer** (not the whole snippets tab), so it's clean and immediately useful.

- **`utils/flowPreview.ts` — `flowToPreview(nodes, edges, opts)`** — pure geometry: bounding-box-fit projection
  of node positions into a target box (uniform scale = aspect-preserving), each node a coloured dot, each edge
  a line between two dots. Node colour comes from an **injected `getColor(type)` resolver** (the same
  store-agnostic idiom as `snippetToInsertableNodes`), so it's registry-free and unit-testable. Handles the
  empty flow (empty model, box size kept) and a single/zero-span node (centred, no NaN/Infinity — a bug caught
  in TDD: the div-by-zero guard was wrongly feeding the centring math). **7 unit tests + 3 mutations** (aspect,
  edge-endpoint guard, colour resolver) each confirmed red.
- **`components/preview/FlowPreview.vue`** — thin, decorative (`aria-hidden`) SVG renderer of that model
  (edges as `<line>`, nodes as `<circle>`); geometry stays in the tested util.
- **Starter cards** now show a `FlowPreview` thumbnail, nodes coloured by category (`categoryMeta`).

Browser-verified (system Chrome): all 4 starter cards render an SVG thumbnail with the right node/edge counts,
category colours (audio green / visual pink / logic red …), every dot inside the viewBox, **0 console errors**.
typecheck clean · lint 0 err · `test:unit` **2022** (+7) · build ok. The primitive is ready for the snippets
tab. Uncommitted on `phase0-file-format`; no AI attribution.

---

## 2026-07-07 (later 63) — Phase 4 non-a11y: mouse marquee / box-select (Vue Flow built-in)

Enabled rubber-band selection — the mouse counterpart to the keyboard select work — using Vue Flow's
**built-in** selection (v1.48.2), not a hand-rolled one. Vue Flow's box-select was explicitly disabled
(`selection-key-code`/`multi-selection-key-code` both `null`); flipped them on:

- `:selection-key-code="'Shift'"` — **Shift+drag draws a marquee** box.
- `:multi-selection-key-code="['Meta', 'Control']"` — **Cmd/Ctrl+click adds** a node to the selection.

**Chosen for the touch/tablet persona:** this version has no `selectionOnDrag`, so the only way to make
left-drag itself a marquee is `panOnDrag: [1,2]`, which **breaks one-finger touch panning** — a real downgrade
for VJs/installation users. So the change is deliberately *additive*: plain left-drag still pans (touch intact);
Shift+drag and Cmd/Ctrl+click gain new powers. No new selection-sync code needed — the existing
`getSelectedNodes` watcher already fans Vue Flow's selection into `uiStore.selectedNodes` (so Delete/copy/
properties all work on a marquee selection).

Browser-verified (system Chrome): Shift+drag box-selected **10 nodes** (propagated to the store) · Cmd+click
went 1→2 selected · **plain drag still pans** (a node's screen position shifted by the drag delta while its flow
position stayed put — no regression) · **0 console errors**. typecheck clean · lint 0 err · `test:unit` 2015 ·
EditorView config change → browser-verified, not unit. Optional follow-up: token-style the `.vue-flow__selection`
box to match the LATCH theme (default Vue Flow styling for now). Uncommitted on `phase0-file-format`; no AI
attribution.

---

## 2026-07-07 (later 62) — Refactor cont'd: adopt useApplicationKeyboard across the control editors (finish the DRY)

Completed the shared-scaffolding half of the refactor and, in doing so, **corrected the abstraction's shape**.
Surveying the four `role="application"` control editors showed they do NOT share the canvas's *imperative*
announce string — they bind a *reactive* `valueText` computed — so the only genuinely-universal piece is the
`focused` flag + focus/blur handlers. Two consequences:

- **Tightened `useApplicationKeyboard` to just `{ focused, onFocus, onBlur }`** (dropped `announce`, which 4 of
  5 consumers would have ignored — a dead surface is the kind of over-abstraction this pass was meant to avoid).
  The canvas's `canvasAnnounce` now lives in `useCanvasKeyboard`, where the imperative pattern belongs.
- **Adopted it in EnvelopeEditor, EQEditor, WaveformEditor** — each dropped `const focused = ref(false)` + inline
  `@focus="focused = true"` for the shared primitive. **XYPad deliberately left alone:** it has no `focused`
  flag (it manages its cursor differently), so migrating it would *add* behaviour, not DRY it — honest scope.

So the primitive now has 4 real consumers (canvas + 3 editors), which justifies its existence, instead of the
1 it had when introduced. Locked its contract with a tiny unit test (incl. that each surface gets *independent*
focus state, not a shared singleton; mutation-verified). Behaviour-preserving: the 3 editors' existing
role=application tests stay green.

State: typecheck clean · lint 0 err (49 warns) · `test:unit` **2015** (+2) · build ok. Uncommitted on
`phase0-file-format`; no AI attribution. The 5-surface a11y-chrome duplication the kickoff flagged is now
resolved (4 share the primitive; XYPad is a documented, deliberate exception).

---

## 2026-07-07 (later 61) — Refactor: extract the canvas keyboard machine out of EditorView (god-component paydown)

A code-health audit (prompted by "make sure the code isn't becoming shitty") found the real debt: `EditorView.vue`
had grown to **1539 lines**, ~485 of them a **single inlined canvas-keyboard state machine** (navigate + move +
wire, ~30 functions) that — because EditorView is app-chrome — was **only ever browser-verifiable**. Chose
refactor-before-extend.

- **New `composables/useApplicationKeyboard.ts`** — the shared `role="application"` scaffolding (focus flag +
  polite `announce` string + base focus/blur) that the node canvas and the 4 control editors all need. One home
  instead of copy-paste across 5 components.
- **New `composables/useCanvasKeyboard.ts`** — the whole nav/move/wire machine moved verbatim, built on
  `useApplicationKeyboard`. Vue-Flow viewport helpers (`setCenter`/`getViewport`/`flowToScreenCoordinate`/
  `addEdges`), the history batch (`startBatch`/`endBatch`), and the connection-error toast are **injected as
  deps** so the machine is store-mockable. Owns its own move-batch flush on teardown via `onScopeDispose` (was
  EditorView's `onUnmounted`).
- **EditorView** now just calls `useCanvasKeyboard({...})` and binds `{ canvasAnnounce, onCanvasKeydown,
  onCanvasFocus, onCanvasBlur }` to the host — **1539 → 1044 lines (−495)**.

**The payoff the audit was about:** ~485 lines of previously-browser-only logic are now **unit-tested** — a new
`useCanvasKeyboard.test.ts` (6 tests, `effectScope`-wrapped, mocked deps) covers cursor nav + wrap, Enter-select,
grid-nudge inside one history batch, and the wire machine (draft → **commit adds a real edge** → cancel). This is
a behaviour-preserving extraction: the surgery was a content-anchored script (asserts every marker) + a manual
import fix, and it's verified both ways — **unit** (6 tests, incl. edge-commit) **and browser** (nav/select/wire
stage progression + commit all behave on the live canvas, 0 console errors).

State: typecheck clean · lint 0 err (49 warns) · `test:unit` **2013** (+6) · build ok. Uncommitted on
`phase0-file-format`; no AI attribution. **Follow-up (deferred, tracked):** migrate the 4 control editors onto
`useApplicationKeyboard` to finish DRYing the shared scaffolding (lower-risk; each editor is unit-mountable).

---

## 2026-07-07 (later 60) — Phase 4 non-a11y: starter templates on the empty canvas (first non-a11y Phase-4 feature)

Pivoted from the (now-complete) accessibility stream to the non-a11y Phase-4 body. Shipped the first item:
**starter templates on the empty canvas.** The empty-canvas overlay was a bare "drag nodes to get started"
hint; it now offers a curated set of 4 beginner-friendly starter flows (Audio Reactive Visuals · Keyboard to
Synth · Color Cycling · Value Threshold — curated by id with a fallback to the first snippets) as accessible
`<button>` cards that insert the flow on click, plus a "Browse the node library" button.

- **New helper `utils/snippets.ts` — `snippetToInsertableNodes(snippet, getDefinition)`** maps a snippet's
  stored nodes into the shape `flowsStore.insertSubgraph` expects (stamping `nodeType`, enriching with the
  live definition label/ref when known, omitting those keys for unknown types). `getDefinition` is injected
  so it's store-agnostic + unit-testable, and so the snippet-insertion path can't drift between call sites.
  **Unit + mutation-verified** (3 tests; 3 mutations — nodeType-stamp / definition-guard / data-spread — each
  confirmed red; fixed a test-efficacy gap where a stale `nodeType` in the fixture masked the stamp, and an
  `in`-vs-`toBeUndefined` gap that let the definition-guard mutation survive).
- **NodeExplorerModal** refactored onto the helper (behavior-preserving; store-verified the modal snippet
  insert still works).
- **EditorView** empty-state rewritten with the template cards + a store-reusing `insertStarterTemplate`
  (same `insertSubgraph` path). The overlay stays `pointer-events: none` (canvas still pans around it); only
  the buttons opt back in.

**Debugging note (important for future canvas work):** initial smoke looked broken — after insert the store
had the nodes but the canvas showed 0 and an `.empty-state` seemed stuck. Two red herrings: (1) `.empty-state`
is a class shared by several panels (PropertiesPanel/DebugPanel/…), so an unscoped `querySelector('.empty-state')`
matched the WRONG element — scope canvas-empty checks to `.editor-view .empty-state` / the unique `.empty-title`;
(2) inserted nodes land at world coords outside the empty viewport and `only-render-visible-elements` culls
them until a fitView. The real fix: frame via `vueFlow.onNodesInitialized(() => { fitView(); off() })` — a bare
`nextTick(fitView)` fires before Vue Flow ingests the v-model:nodes change, so it frames nothing. **No
pre-existing app bug** — the alarm was a probe artifact + the fitView-timing issue, now fixed.

Verified (system Chrome): empty flow → 4 starter cards; click → 2 nodes + 1 edge inserted, empty-state hides,
canvas **auto-frames** the result (`canvasNodes: 2`); buttons are real `<button>`s; **0 console errors**.
typecheck clean · lint 0 err (49 warns) · `test:unit` **2007** (+3 snippet helper) · build ok. Uncommitted on
`phase0-file-format`; no AI attribution.

---

## 2026-07-07 (later 59) — Phase 4 a11y Increment 6: Theme-D port/edge type cue — the LAST a11y finding CLOSED

Closed the one remaining (maintainer-deferred) accessibility finding: port/edge data type conveyed by
colour alone (WCAG 1.4.1). The maintainer chose **line-style always on + a per-type glyph on hover**; a
port and its edge share the **same** `lineStyle` cue so they read as one type.

- **Shared line style.** `dataTypeMeta.lineStyle` was defined but wired up nowhere (dead design intent, like
  the earlier invisible Tailwind badge). Now `AnimatedEdge`'s persistent `BaseEdge` carries a per-type
  `stroke-dasharray` (`dotted → 1.5 5` round · `dashed → 8 6` · `solid → none`); the running/selection chase
  overlays keep their own animation dashes. `BaseNode`'s port dot mirrors it — **solid types stay a filled
  dot (unchanged, the majority)**; **dotted/dashed types become a hollow ring** in the type colour, via a
  `--port-color` var + a `.port-line-dotted`/`.port-line-dashed` class declared *before* the Theme-F
  wire-glow rules (so the glow still wins mid-wire). Only `boolean`/`any` (dotted) + `texture` (dashed)
  change appearance — the red/green-confusable and pink cases.
- **Per-type glyph.** New `dataTypeMeta.glyph` (`#`,`B`,`~`,`▦`,`[`, 3D = `S/O/G/M/C/L/T`, …) revealed with
  the existing port label on hover/select/wire — the only cue that separates all 17 types incl. the 7 near-
  identical 3D blues. Decorative (`aria-hidden`; the Handle `aria-label` already names the type).
- **Legend.** The node-explorer "PORT TYPES" key now shows glyph + a swatch mirroring the port (filled /
  dotted / dashed), so it no longer implies colour-only.

Verification: `dataTypeMeta` glyph + BaseNode data-wiring **unit + mutation-verified** (3 new BaseNode tests;
3 mutations — glyph-fallback / line-class / `--port-color` — each red). Canvas **browser-verified** (system
Chrome): solid = filled dot; dotted = hollow `#EF4444` dotted ring; dashed = hollow `#EC4899` dashed ring;
edge dash resolves `none`/`1.5 5`/`8 6`; glyphs render; legend shows glyph + line-style — **0 console
errors**. typecheck clean · lint 0 err (49 warns) · `test:unit` **2004** (+3 BaseNode) · build ok.

Honest scope (audited): the finding ("type conveyed by colour alone") is addressed — type now carries
non-colour cues (persistent line-style for the dotted/dashed types, a glyph + text label on interaction).
It is **not** a strict per-type-at-rest guarantee: the 14 *solid* types are still identical filled dots
differing only in hue at rest, so two same-hue solid types (e.g. number vs audio, both green) are separated
by the **glyph on hover/select**, not the resting dot. This is the maintainer's chosen compromise (option 3;
persistent-glyph option 2 was rejected as too cluttered across 208 nodes), and connection-validity already
blocks incompatible wires. Glyphs live in one map and are trivially tunable.

**All 33 findings from the app-wide a11y audit are now closed** (Theme-D per the maintainer-chosen approach
above). All uncommitted on `phase0-file-format`; no AI attribution.

---

## 2026-07-04 (later 58) — Phase 4 a11y Increment 5: the low tails — a11y stream now all-closed bar the deferred Theme-D cue

Closed the four remaining low-severity a11y tails from `A11Y_APP_AUDIT_2026-07-03.md`, each a
small, individually-revertible change ending green.

1. **`.search-input` focus ring (2.4.7).** The scoped `outline: none` on the three search inputs
   (node-explorer, sidebar, asset browser) stripped the keyboard focus indicator — the known LATCH
   bug class. Added a `:focus-visible` token ring (`2px solid var(--color-primary-500)`, offset 2px)
   to each. Browser-verified: node-explorer + sidebar inputs render a live `2px solid rgb(26,154,122)`
   ring on focus (`:focus-visible` matches); all three compiled scoped rules ship. CSS-only →
   browser-verified, not unit (happy-dom can't measure CSS focus).
2. **Grid→detail focus (2.4.3).** Selecting a node card swaps the explorer grid for `NodeDetail`;
   focus now moves to the detail's node-name `<h2>` (`tabindex="-1"`, ring suppressed — the view swap
   is the visible cue, so a screen reader announces which node opened) and re-runs on in-detail
   navigate-to. **Back** restores focus to the originating card (`data-node-id` lookup within the
   grid; attribute falls through NodeCard's single `<button>` root). Browser-verified end to end
   (card → Enter → heading → Back → same card), 0 console errors. App-chrome → browser-verified.
3. **Template listbox roving (#14, 2.1.1).** `TemplateSelect`'s `role="listbox"` now honours the
   listbox keyboard model — open focuses the selected/first option, Arrow/Home/End move between
   options (wrapping), Escape closes and returns focus to the trigger (selecting also refocuses it).
   Options stay individually Tab-reachable so each row's edit affordance stays operable (a deliberate
   carry-over of the Theme-B decision, not a strict single-tab-stop APG listbox). Unit +
   mutation-verified: 7 new tests; 4 mutations (no-wrap / no-open-focus / no-Escape-restore /
   ArrowUp-from-a-non-option-button) each confirmed red.
4. **Flow tab → region association (1.3.1).** Each `role="tab"` gained `aria-controls="flow-canvas-panel"`
   and the EditorView host gained that stable `id`, exposing the tab↔region relationship. A separate
   `role="tabpanel"` is **deliberately not** applied: that host is already `role="application"` (the
   Theme-F canvas keyboard surface — one role per element) and carries its own dynamic "Node canvas,
   N nodes" label; `aria-controls` conveys the association without the conflict. Rationale documented
   inline in FlowTabs. Browser-verified: every tab's `aria-controls` resolves to the unique live
   application host, 0 console errors.

**Adversarial review (ultracode):** a 4-dimension multi-agent review of the diff (correctness / a11y /
regression / honesty) → adversarial verify surfaced **1 confirmed low finding**, fixed here: `ArrowUp` on
the template listbox while focus sat on a Tab-reachable non-option button (edit / Add-Template) wrapped to
the *second* option instead of the last (`indexOf` = −1 → `focusOptionAt(−2)`). Normalized the out-of-list
index (ArrowDown→first, ArrowUp→last) + added a regression test. The rest were correctly rejected nitpicks
(the `--color-primary-500` ring matches the local component-focus convention; the mouse-click ring on a text
input is standard native behaviour; `aria-controls`→`role="application"` is valid ARIA).

State: typecheck clean · lint 0 err (49 warns) · `test:unit` **2001** (+7 TemplateSelect) · build ok.
**Phase 4 accessibility stream is now fully closed except the maintainer-deferred port/edge type-colour
cue** (Theme D — a visual-language call across 208 nodes). Committed to `phase0-file-format` as four
logical, individually-revertible commits (`a784d3b` search-ring · `fc1a68f` grid→detail focus · `2b52234`
template listbox · `b9534b9` tab↔canvas association) + this docs commit; author Moheeb Zara, no AI
attribution.

**Remaining Phase 4 (non-a11y):** canvas toolbar + marquee selection, snippets tab + `flowToPreview`
thumbnails, templates on the empty canvas, onboarding. Optional Theme-F inc-4 polish (spatial nav,
edge-cursor delete, ghost edge, shared `useApplicationKeyboard` composable).

---

## 2026-07-04 (later 57) — Phase 4 a11y Theme F Increment 3 (keyboard wiring) — the headline 2.1.1 finding CLOSED

Built increment 3 — keyboard **wiring**, from scratch (Vue Flow ships none). `w` on the cursor node starts a
wire; a 3-stage machine drives it: **pick source output** (↑↓ cycle, auto-picked when there's one) → **pick
target node** (←→ cycle — only nodes that have a `validateConnection`-valid input for this source) → **pick
target input port** (↑↓ cycle, valid only) → **Enter** commits. It reuses the pointer `onConnect` path exactly
(`addEdges([conn])` + `flowsStore.addEdge` + `markDirty`) inside one `Add connection` undo entry; **Escape**
cancels, **Backspace** steps back a stage (no dead-ends). Every stage is announced via the live region.

Full per-handle visual (maintainer's choice): a new `ui.wireDraft {sourceId, sourceHandle, targetId,
targetHandle}` drives a **glow on the exact source output + candidate-target input handles** in `BaseNode.vue`
(and reveals those two nodes' port labels). BaseNode gained `useUIStore` + `isWireSourceHandle`/
`isWireTargetHandle`/`isWireNode` + a scoped box-shadow glow (no transform, to avoid clobbering the handle's
`translateY`).

Verification was **store-truth** (read Pinia `flows.activeFlow.edges.length` via the page), because
`:only-render-visible-elements` makes both DOM edge counts and screen coordinates unreliable — a lesson from
inc 2. Smoke (system Chrome): `w`→source-handle glow · source-port / target-node / target-port cycling with
announcements · **commit creates a real new edge (store 18→19) that persists across a full reload** · Escape
cancels + announces · glow clears after commit · **0 console errors**. Several apparent "failures" during
verification were all measurement artifacts (screen-coord panning, virtualization, a regex matching "input" in
the target-node prompt) — none were real bugs.

State: typecheck clean · lint 0 err (49 warns) · `test:unit` **1994** · EditorView/BaseNode are app-chrome →
browser-verified, not unit. **Theme F 2.1.1 finding CLOSED — select, move, and wire are all keyboard-operable.**
Committed separately (author Moheeb Zara, no AI attribution).

**Remaining (optional, inc 4):** spatial nearest-in-direction nav, an edge-cursor sub-mode (delete edges by
keyboard), a rubber-band ghost edge, and extracting the copy-pasted `role="application"` chrome into a shared
`useApplicationKeyboard` composable. Also still open in Phase 4 a11y: the deferred port/edge type-colour cue
(Theme D, maintainer visual-language call) and the low `.search-input` focus-ring tail.

---

## 2026-07-04 (later 56) — Phase 4 a11y Theme F Increment 2 (keyboard move) + a batch-split bug fix

Built increment 2 of the canvas keyboard model: **move**. With a selection, Arrow keys nudge the selected
node(s) by grid step (Shift = 5× coarse); with no selection they still rove the navigation cursor (Escape
deselects to go back to browsing). A burst of nudges collapses into a single `Move node` undo entry — opened
on the first nudge, closed after a 600 ms idle, any non-move key, blur, or unmount — reusing the pointer
drag-stop path exactly (`flowsStore.updateNodePosition` + `markDirty`, `startBatch`/`endBatch`). Panning only
happens when a node nears the viewport edge (via `flowToScreenCoordinate`) — unlike navigation, move must not
re-centre on every keystroke or the node would look stationary while the canvas slides. New position is
announced.

**Bug caught + fixed during verification:** `Shift+Arrow` dispatches two keydowns — a bare `Shift` then the
arrow — and the bare `Shift` (not an arrow) was hitting the "any non-move key ends the burst" path and
**splitting the move history into two undo entries** (fine nudges vs the coarse one). Fixed by ignoring bare
modifier keydowns (`Shift`/`Alt`/`Meta`/`Control`) as the leading half of an in-progress chord. Only surfaced
because verification measured **flow coordinates** (node inline transform, pan-invariant) and probed undo
granularity — screen-coordinate checks were confounded by `setCenter` panning.

Browser smoke (system Chrome, flow-coordinate): directional move (grid 20; coarse 100) · multi-select moves
all 16 nodes together · **one undo reverts the whole fine+coarse burst** to exact start · redo restores ·
navigate-mode after Escape announces "node i of n" not a move · **move persists across a full page reload** ·
0 console errors. typecheck clean · lint 0 err · `test:unit` **1994** (EditorView is app-chrome → browser-
verified, not unit). Committed separately (author Moheeb Zara, no AI attribution).

**Next:** inc 3 **WIRE** (from scratch — needs the maintainer's `w`-key confirmation); inc 4 polish +
optional shared composable + spatial nav.

---

## 2026-07-04 (later 55) — Phase 4 a11y Theme F: canvas keyboard operation, Increment 1 (select/navigate)

Opened the headline a11y item — making the node canvas keyboard-operable (WCAG 2.1.1). A **7-agent design
workflow** (recon: current canvas / the 4-editor `role=application` idiom / store+VueFlow seams → 3 independent
interaction-model proposals → adversarial synthesis) produced a recommended model + a 4-increment plan, every
file/line ref verified against real code. Maintainer approved the model and increment-1 scope.

**Recommended model:** one owned `role="application"` host on `.editor-view` (forced by
`:only-render-visible-elements` — off-screen node DOM doesn't exist, so no per-node roving tabindex), with a
store-backed keyboard **cursor** distinct from selection, mirroring the 4 control editors' idiom. Modes
NAVIGATE (done) + WIRE (later). Every action reuses an existing write path (select = the Cmd+A `node.selected`
write; move = `updateNodePosition`; wire = the `onConnect` body) so keyboard and mouse can't diverge.

**Increment 1 (shipped, browser-verified):**
- `.editor-view` → `role="application" tabindex="0"` + `aria-roledescription`/`aria-label`/`aria-valuetext`,
  `@focus`/`@blur`/`@keydown`; a `:focus-visible` inset ring; an `aria-live="polite"` sr-only region.
- New `ui.canvasCursor` state + `setCanvasCursor`. A cursor that Arrow-keys rove over spatially-sorted
  `activeNodes` (top→bottom, left→right; wrapping; `setCenter` pans it into view); Enter/Space select
  (Shift = additive), Escape clears. Cursor shown as a dashed `.kbd-cursor` node ring (a `node.class` toggle,
  gated on focus). Select mirrors the Cmd+A path (`node.selected` + `uiStore.selectNodes` + inspect).
- `node.ariaLabel` set on newly-added nodes (`flows.addNode`) — Vue Flow's wrapper has no fallback name.
- Guards: text inputs + Cmd/Ctrl chords pass through (the window `handleKeyDown` keeps owning undo/copy/
  select-all/**Delete** — Delete now reachable because selection is keyboard-reachable); unhandled keys bubble.

Browser smoke (system Chrome, 22 nodes): host ARIA correct · focus + summary announce · Arrow roving with
cursor ring + per-node live announcements · Enter selects + announces · Escape clears · **Cmd/Ctrl+A passes
through** (not swallowed) · focus-ring rule compiled · **0 console errors**. typecheck clean · lint 0 err ·
`test:unit` **1994** (the `ariaLabel` addition didn't trip the `.latch` round-trip gate). EditorView is
app-chrome → browser-verified, not unit (per policy).

**Deferred (planned):** inc 2 keyboard **move** of selected nodes (grid-nudge + history batch + persistence);
inc 3 **WIRE** mode (built from scratch — needs the maintainer's `w`-key confirmation); inc 4 polish + optional
`useApplicationKeyboard` composable + spatial nav. `node.ariaLabel` currently new-nodes-only (announcements use
`data.label`, so this is a minor bonus; a load-time back-fill is a tiny follow-up). All uncommitted on
`phase0-file-format`; no AI attribution.

---

## 2026-07-04 (later 54) — Phase 4 a11y Theme D (non-color cues) + a real invisible-badge fix

Closed the two mechanical **Theme D** (WCAG 1.4.1) findings; the maintainer **deferred** the port/edge
type-colour cue (a visual-language call — a shape/letter on every port across 208 nodes; ports/edges stay
visually identical). Along the way, the "connection status conveyed by colour alone" finding turned out to be
a **rendering bug**, not a polish item:

- **ConnectionStatusBadge was invisible.** It was styled entirely with Tailwind utility classes
  (`w-2 h-2 rounded-full bg-emerald-500` …) but **this project ships no Tailwind** — no config, not in
  `package.json`, nothing defines those classes. Proven live in the running app: a span with the badge's exact
  classes renders `0×0`, transparent, `border-radius: 0`. So the badge (used in 4 connection surfaces) had
  rendered **nothing** since it was introduced (`1d4e5de`); the audit read the colour intent from source.
  Rewrote it onto real **scoped CSS + design tokens** (connected `--color-success` · connecting/reconnecting
  `--color-warning`+pulse · disconnected `--color-neutral-400` · error `--color-error`) with **error drawn as
  a soft square** — the only non-circular state, so the critical green/red pair is hue-independent (1.4.1).
  `role="img"`+`aria-label` name it. TDD + **mutation-verified** (5 tests / 4 mutations red); **browser-verified**
  against the compiled scoped CSS + a rendered measurement (error `rgb(239,68,68)` @ `2px` vs connected
  `rgb(34,197,94)` @ circle; tokens resolve to real hex, 0 console errors).
- **Tag filter chips (NodeExplorer)** — active state was the primary-colour fill alone; added a `✓` prefix on
  the active chip (the non-colour cue) + `aria-pressed`. Browser-verified: click flips `aria-pressed`
  false→true, text `ai`→`✓ ai`, fill preserved; the global `:focus-visible` ring covers the chip.

Observed-not-fixed (out of Theme-D scope, logged in the audit misc table): `.search-input { outline: none }`
in NodeExplorer unconditionally kills its own keyboard focus ring (the known LATCH `:focus`-suppression bug
class) — a 2.4.7 item, not among the original 33.

**Adversarial regression audit (ultracode, 5 agents / 4 lenses over the uncommitted diff): CLEAN — 0 confirmed
regressions or correctness defects.** Lenses: badge consumer integrity, badge a11y/scoped-CSS correctness,
tag-chip regression, test efficacy; each finding independently verified. Verifier confirmed all four colour
tokens exist (no undefined-token fallback), the badge's public prop API is unchanged so all 4 consumers stay
safe, and the tag-chip `aria-hidden` check + `aria-pressed` don't double-announce. The one finding (rejected
as not-a-regression) noted the `:title` tooltip binding wasn't asserted — added that assertion,
mutation-verified (dropping `:title` now fails). Also confirmed the dead-Tailwind-class bug is **isolated**: a
scan of every `.vue`/`.ts` file found zero other components using Tailwind-signature classes, so the badge was
the only casualty.

State: typecheck clean · lint 0 err (49 warns) · `test:unit` **1989 → 1994** (134 → 135 files) · browser
smoke 0 console errors · regression-audited clean. **Theme D: 2 of 4 closed, 2 deferred → ~32 of 33 app-audit
findings.** Remaining a11y:
port/edge non-colour cue (deferred, design call) + **Theme F** canvas keyboard wiring (the headline) + low
tails (#33, search-input focus ring, template-listbox roving). All on `phase0-file-format`; not committed
(awaiting the go-ahead); no AI attribution.

---

## 2026-07-03 (later 53) — adversarial regression audit of the Phase-4 a11y commits + hardening

Three parallel read-only review agents (modal focus layer · div→button restructures · ARIA/tablist) over
`83736bd..HEAD`, each finding adversarially verified inline. **No functional regressions in the shipped
mouse paths** (Ctrl+S, `@click.self`, toggle `:checked` sibling selector, aria-label id uniqueness,
event-payload identity, drag preservation, dropdown open/close all confirmed intact). **5 real gaps found +
fixed** (`f6f3d0a`), none a regression from pre-session behaviour:
- **Tablist Tab-unreachable while editing a subflow** (med) — `activeFlowId` is a subflow id not in the tab
  strip → every tab `tabindex=-1`. Added a `rovingTabId` fallback so one tab is always tabbable.
- **Context-menu → Rename/Delete dropped focus to `<body>`** (med) — the modal captured the about-to-unmount
  menu item as its restore target. Fixed by closing the menu first, then opening the modal on `nextTick` (the
  clean decouple; a watch-declaration-order attempt did NOT work — verified empirically via a focus-trace
  smoke, F2 path always worked, menu path was the bug).
- **Context menu over-claimed `role="menu"`/`menuitem`** (low) without the APG arrow-key model → downgraded to
  a labelled `role="group"` (DON'T-OVERCLAIM).
- **ConnectionList right-edge dead-zone** (low) — only the inner button selected. Delegated `@click` to the
  row so the whole row selects (button Enter/Space bubbles); unit + mutation-tested.
- **Textbox/Trigger collapsed-state `expand-btn` unlabelled** (low) — added `aria-label`+`aria-expanded`.

Deferred (noted, not a regression): `role="tab"` lacks a `tabpanel`/`aria-controls` association (needs a
small cross-component decision — the canvas is the shared panel). typecheck clean · lint 0 err · `test:unit`
**1988 → 1989** (134 files) · build OK · audit-fix smoke 7/7, 0 console errors.

---

## 2026-07-03 (later 52) — Phase 4 a11y kickoff: app-wide audit + modal focus layer + Theme-B div→button sweep

Opened **Phase 4 (accessibility)** proper. An ultracode 5-surface read-only audit (canvas,
layout chrome, modals, node explorer, connections/assets) → adversarial verify → **33 confirmed
findings** (16 high / 15 med / 2 low; 2 rejected). Recorded in `docs/A11Y_APP_AUDIT_2026-07-03.md`.
Then executed the two highest-leverage themes (7 commits):

- **Increment 1 — modal focus management (10 findings).** New `composables/useDialogA11y.ts`
  (focus move-in · Tab focus-trap · focus restore to opener · Escape-to-close), applied to all 8
  dialogs (4 editor modals + connection manager + FlowTabs rename/delete). Each gained
  `role="dialog"`/`aria-modal`/`aria-labelledby`, named close buttons, a `role="status"` toast, and
  the AIModelManager toggle checkboxes moved off `display:none` to the visually-hidden-but-focusable
  pattern. Composable is TDD + **mutation-verified** (7 tests / 5 mutations each red). Browser-smoke
  12/12 (system Chrome), 0 real console errors.
- **Increment 2 — Theme B: mouse-only `<div>`s → real controls (≈14 findings).** Asset cards,
  connection rows, debug rows (wrap-select-button or plain button); node palette + category filter
  (buttons + listbox); flow tabs (roving `tablist` + arrow/F2/Delete/Shift+F10 + focus-managed context
  menu); HTTP template edit control (sibling button + listbox semantics). Unit + mutation-verified for
  the unit-mountable components (AssetCard/ConnectionList/DebugPanel/TemplateSelect — +10 tests);
  **browser-verified** for the app-chrome that won't unit-mount in isolation (AppSidebar 11/11,
  FlowTabs 13/13, 0 console errors).
- **Increment 3 — Theme C (names/labels) + E (live region) (6 findings).** Accessible names for the
  connection `<select>`, both node-search inputs, and the port handles (aria-label forwards through Vue
  Flow); `aria-label`+`aria-expanded` on the collapse toggle (BaseNode + 5 bespoke node shells);
  `aria-pressed` on category filters; `role="alert"` on the connection-error toast. ConnectionSelect +
  CategoryNav unit+mutation-verified; canvas/explorer names browser-verified (7/7, 0 errors).

State: typecheck clean · lint 0 err (49 warns) · `test:unit` **1967 → 1988** (134 files) · build OK.
**~30 of 33 findings closed.** Remaining: **Theme D** non-color port/edge/status/tag cues (#18/21/22/31 —
needs light design judgment), **Theme F** canvas keyboard wiring (#1 — the headline, a dedicated
multi-increment effort), + low #33 and the #14 combobox tail. All committed, no AI attribution.

---

## 2026-07-03 (later 51) — audit of the a11y commits + small cleanup

Adversarial regression audit (read-only agent + inline checks) of the later-50 a11y commits
(`815af39`/`8f60a2a`/`2ce7b7f`). **Verdict: NO real regressions.** All mouse/pointer paths, visual state,
layout, and the EQ watch change are behavior-preserving; `:focus-visible` coverage is complete
(select/number/text × canvas/panel are ringed for keyboard, ring-free for mouse; slider/color/toggle have no
outline-suppression so they keep the global ring); the AssetPicker clear button (`@click.stop`) still clears
without toggling the picker; `input:checked + .toggle-track` still drives the faux switch. Two minor items
fixed:
- Removed orphaned `.preview-content` CSS (its wrapper `<div>` was dropped in the AssetPicker restructure).
- Added `position: relative` to `.control-toggle` (both contexts) so the visually-hidden absolute checkbox
  is contained by its own label rather than anchoring to a far positioned ancestor (robustness).

**Noted-not-done:** the toggle's MOUSE (label-click) path is not unit-tested — the fix is a CSS
`display:none` removal that happy-dom can't guard (no scoped CSS); it's browser-confirmed in later-50
instead. typecheck clean · build 0 · a11y tests green.

---

## 2026-07-03 (later 50) — ultracode a11y audit + fixes: control / NodeView / editor surface

A 15-agent workflow audited keyboard/ARIA/focus across the declarative-UI control surface (ControlRenderer,
NodeView, the 4 canvas editors, PropertiesPanel) → 11 findings, **7 confirmed** by adversarial verify (4
rejected), all WCAG-grounded and all fixed:
- **AssetPickerControl** (2.1.1 A) — the opener was a mouse-only `<div>`, a full keyboard lockout of the
  picker (and everything behind it). Now a real `<button>` (`aria-expanded`/`haspopup`); the clear control
  moved to a SIBLING button (no nested interactive). Unit-tested (activation opens the picker) + mutation-
  verified.
- **Toggle control** (2.1.1 A + 2.4.7 AA) — the checkbox was `display:none` → unfocusable, so every boolean
  control was keyboard-inoperable. Swapped for the visually-hidden-but-focusable pattern + a focus ring on
  the faux switch. **Browser-confirmed**: `display:block`, `opacity:0`, receives focus.
- **Focus rings** (2.4.7 AA) — scoped `:focus{outline:none}` on number/text/select suppressed the global
  keyboard ring (only a low-contrast border tint remained). Added same-specificity `:focus-visible` rules
  (later in source order → win for keyboard focus) restoring a 2px ring; mouse focus stays ring-free.
  **Browser-confirmed**: 2px outline on focus.
- **EQEditor selection feedback** — never drew the keyboard-selected band as active (divergence from
  Envelope/Waveform). Added `focused` state + active-band highlight + a watch on the selection (so the
  canvas tracks Left/Right too).
- **Readout widget** (1.3.1 A / 4.1.3 AA) — a runtime output is now a named polite `role="status"` region
  (announced on change); a static control-value readout stays a plain text span (no live-region spam).
  Unit-tested + mutation-verified.
- **Waveform preset buttons** (4.1.2 A) — single-letter labels ("S"/"Q") + no state → added `aria-label`
  (full preset name) + `aria-pressed`. Unit-tested + mutation-verified.

**Deferred:** finding #7 (visible control labels not programmatically associated in BaseNode — LOW; already
partially mitigated by the `aria-label` pass; a broader label-association refactor). typecheck clean · lint
0 err · `test:unit` **1963 → 1967** (127 files, +4 a11y tests) · browser smoke 0 real errors.

---

## 2026-07-03 (later 49) — ultracode pass: finish the generated-index cleanup + adversarial review of the uncommitted diff

A 39-agent workflow (per-category dead-code sweeps → cross-cutting review dimensions → adversarial verify).

**Generated-index cleanup (increment-5 follow-up now DONE).** Per-category read-only agents produced a
**44-removal manifest** of the now-unused bespoke-component-symbol re-exports (leaf `index.ts`
`export { XxxNode }` / `export { default as XxxNode } from './XxxNode.vue'` → wrapper `.ts` like
`inputs/knob.ts` → category barrel `export { xxxNode, XxxNode } from './x'`). A safety skeptic independently
re-grepped and confirmed **manifestSafe** — zero real consumers, and no removal touches a `component:
markRaw(...)` line, a definition's `.vue` import, or a node DEFINITION export (`xxxNode` stays). Applied all
44 + cleaned the dangling `// Export the custom node component` comments / blank lines. `components.ts` is
now a **fully generated index** with no leftover manual component plumbing (the `.vue` stay referenced via
their definitions).

**Adversarial review of the full uncommitted diff.** 4 review dimensions raised 25 findings; the verify
phase confirmed **6** (rejected 19 as noise/nits/pre-existing) — all fixed:
1. Stale JSDoc on `NodeDefinition.component` ("RESERVED / NOT yet consumed") → rewritten: it's the single
   source `components.ts` derives from.
2. **The persistence-list equality test was a spread-copy tautology** — `[...A].sort()` deepEquals
   `[...B].sort()` can't distinguish an alias from a value-equal copy. Replaced with reference identity
   `expect(PERSISTENCE_SPECIAL_NODE_TYPES).toBe(CUSTOM_NODE_TYPE_IDS)`. **Mutation-verified**: a value-equal
   copy (`[...CUSTOM_NODE_TYPE_IDS]`) now reds (the old test would have passed). (Matches the
   `latch-component-test-gotchas` "redundant mechanisms → un-killable mutant" note.)
3. WaveformEditor had no guard that NAVIGATION keys (Left/Right/Page/Home/End) don't emit — folded a
   `expect(emitted).toBeUndefined()` into the nav test. **Mutation-verified** (a nav key that emits reds).
4–6. Three stale kickoff claims: HANDOFF read-range (`46→40`→`48→40`), a mixed HEAD (`6c80fe2` vs
   `c4b7b78`), and an INHERITED-INVARIANT still saying "`component?` declared but NOT consumed" — all
   reconciled to the DONE state.

typecheck clean · lint 0 err · `test:unit` **1963** (unchanged — strengthened existing tests, no net new) ·
build 0. ~25 registry files touched (pure dead-export removal, validated by typecheck+build+registry guards
which import the whole barrel chain).

---

## 2026-07-03 (later 48) — Phase 3 bullet 3: WaveformEditor keyboard a11y (the last pointer-only editor)

Closed the remaining a11y gap flagged in later-43/46: `WaveformEditor` (used by the `wavetable` node's
`wave` aggregate — `NodeView.vue:303`) was pointer-only for its freehand canvas. Freehand *drawing* is
inherently a pointer affordance, but the editor is now keyboard-**operable** (WCAG 2.1.1) with the same
`role="application"` + selected-target idiom as XYPad/Envelope/EQ, adapted to a long sample sequence:
- **Horizontal (index)**: Left/Right ±1 sample, PageUp/Down ±8, Home/End first/last.
- **Vertical (value)**: Up/Down ±0.05 (Shift = ×4 coarse), clamped -1..1; emits the SAME
  `{ samples, preset:'custom' }` as the drag.
- Announced via `aria-valuetext` ("sample 12/64: 0.35") + a polite live-region span; `:focus-visible`
  ring; the keyboard-selected sample is highlighted on the canvas while focused (mirrors the other
  editors' active handle). `stopPropagation` so arrows don't leak to Vue Flow. Mouse/preset paths
  untouched (the 4 preset `<button>`s were already keyboard-accessible and cover the common shapes).

**No overclaim.** This is keyboard *operability* (navigate + adjust samples), NOT "draw a freehand curve
by keyboard" (impractical; presets + per-sample editing serve keyboard users). 7 tests on the real
component with real keydown events, **mutation-verified** (ArrowUp-inverted + ArrowRight-noop both red).
typecheck clean · lint 0 err · `test:unit` **1956 → 1963** (126 files) · build-safe.
**Browser status (honest):** app boots clean (0 real console errors) and adding a wavetable mounts the
editor with 0 errors; the sibling EQEditor renders as `role="application"` in the node-body DOM in the same
app, and this component uses the identical pattern (EQ/Envelope were browser-confirmed in later-46) — but a
live keyboard capture on the rendered WaveformEditor was NOT achieved (couldn't automate the node-explorer
add-flow blind). Logic is unit+mutation-verified; the `draw()` highlight is structurally identical to the
shipped `isDrawing` arc block (safe with a real 2D context).

**▶ NEXT.** New control TYPES (`range`/`curve`/`gradient`) still await a real consumer node (deferred).
Optional: a manual browser pass on the WaveformEditor keyboard when convenient; the hygiene follow-ups from
later-47 (feed `node.component` into the dead store map; drop the 18 unused re-exports).

---

## 2026-07-03 (later 47) — Phase 3 bullet 2 / increment 5: `component` is the single source of routing truth

Resolved design **Q2** (maintainer decision): `component?` = a **real Component import on the node
definition**, and `registry/components.ts` becomes a **generated index**. Wired it end-to-end.

**Step 1 — derive the component map from `definition.component`.** All 22 bespoke nodes now declare
`component: markRaw(XxxNode)` on their definition (18 via their `definition.ts`, 4 inline in `index.ts`:
`_knob`/`gamepad-visual`/`_synth`/`emulator`). Extracted the aggregated `allNodes` list into a new
`registry/allNodes.ts` so `components.ts` can read the definitions WITHOUT importing `registry/index.ts`
(which re-exports `nodeTypes` — a cycle). `components.ts` now derives BOTH `nodeTypes` and
`CUSTOM_NODE_TYPE_IDS` from `allNodes.filter(d => d.component)` — no more hand-maintained map. Guard test
`tests/unit/registry/custom-node-components.test.ts` (5) pins: derived set == the frozen 22-id historical
set == the set of definitions carrying a `component`; migrated-to-`ui` nodes carry none. Mutation-verified
(drop one `component` → 3 assertions red).

**Step 2 — collapse the redundant SECOND routing list.** `PERSISTENCE_SPECIAL_NODE_TYPES` was a
hand-maintained subset that had **already drifted** — `gamepad-visual`/`dispatch`/`emulator` were in
`components.ts` but missing from it (a latent rehydration bug masked only by the `healNodeTypes` fixup on
flow activation; read-only audit surfaced this). Made it `= CUSTOM_NODE_TYPE_IDS` (one source), killing the
drift. New equality guard in `migration-routing.test.ts`; mutation-verified against a re-hardcoded divergent
list (the structural regression it guards).

**Verification.** typecheck clean · lint 0 err (49 pre-existing any-warns) · `test:unit` **1947 → 1953**
(125 files) · build 0 · **browser smoke 0 real errors**: a persisted demo flow rehydrated with every
bespoke node routing to its correct component type (`vue-flow__node-trigger/-monitor/-synth/…`) while
`ui`/plain nodes stayed `vue-flow__node-custom` — proving the derived map AND the unified persistence path
end-to-end. (The `components.ts↔allNodes↔index.ts` cycle is also exercised at import time by the routing
unit tests, and by the prod build.)

**Adversarial audit (ultrathink, read-only agent + inline decisive checks) — verdict: SAFE, no bugs.**
- **Identity preserved** — a git-diff script proved all 22 id→component mappings are byte-identical to the
  old hand-map, each imported from its own `.vue` (no silent cross-wiring).
- **Security** — a community/local custom node CANNOT inject a bespoke SFC: `customNodes/validator.ts:373`
  deliberately never copies `component`, and `nodeTypes`/`CUSTOM_NODE_TYPE_IDS` are built once from built-in
  `allNodes` (custom nodes register into the store's `definitions` map, which does not feed `nodeTypes`).
- **The cycle is real but pre-existing + benign.** Every bespoke `.vue` imports `useFlowsStore`, and
  `flows.ts` imports `components.ts` → so `components.ts → allNodes → definition → .vue → stores/flows →
  components.ts` is a cycle. It resolves in BOTH entry orders because `components.ts`'s only top-level cyclic
  read is `allNodes` (nothing in the `allNodes` subtree re-enters `components.ts`), and `flows.ts`'s
  `CUSTOM_NODE_TYPE_IDS` use + the `.vue`'s `useFlowsStore` call are runtime-only (tolerate a temporarily
  uninitialized live binding). The old `components.ts` already imported the `.vue` directly, so this loop
  pre-dates the change. `usePersistence` (now importing `components.ts`) is only pulled in from
  `App.vue`/`FlowTabs`/`AppHeader` — no worker/preload/main context.
- **markRaw/serialization** — definitions are never JSON-serialized (flows persist `node.data` only); spreads
  (`deriveModelDefinition`) preserve the markRaw reference; the custom-node share/export path excludes it.
- **Test hardening from the audit** (+3 tests, all mutation-verified): components are DISTINCT objects
  (kills a copy-pasted wrong-`.vue` import → duplicate); each `nodeTypes[id].__name` equals its expected SFC
  (kills a single wrong import); each entry is its definition's own component (derive not cross-wired). Also
  `Object.freeze`d `CUSTOM_NODE_TYPE_IDS` (→ `readonly`) so an accidental in-place `.push`/`.sort` can't
  silently mutate both routing lists (the persistence list aliases it). `test:unit` **1953 → 1956**.

**Honest state / not-done.** The nodes store's `components: Map` + `getComponent` getter remain **dead**
(`initializeNodeRegistry` calls `register(node)` without a component; no consumer) — left as-is; feeding
`node.component` there is an optional hygiene follow-up. The 18 per-node `index.ts` still carry now-unused
`export { default as XxxNode }` re-exports — harmless (not flagged by tsc/lint; keep the `.vue` referenced),
optional cleanup. `NodeSpec.component` (defineNode) stays inert — the live registry is `NodeDefinition`.

**▶ NEXT (Phase 3 remainder).** Increment 6 / new control TYPES (`range`/`curve`/`gradient`) still need a
real consumer node (deferred). WaveformEditor freehand-keyboard remains a documented a11y limitation
(optional focus+announce / stricter-ARIA polish). Increment 5 (`component?` consumption) is now DONE.

---

## 2026-07-03 (later 46) — Phase 3 bullet 3: aggregate-editor keyboard a11y (Envelope + EQ) + audit

Restored keyboard editing that the `ui` migrations had removed. **Insight from the ultracode audit:** because
a migrated node renders its aggregate editor INSTEAD of the flat number controls (NodeView is `v-if` per
widget; PropertiesPanel skips the flat-control loop when `definition.ui` is present), the pointer-only canvas
editors made **envelope-visual / parametric-eq keyboard-INOPERABLE on both surfaces** — a real WCAG 2.1.1
regression the migrations introduced. Fixed both editors with the XYPad pattern:
- **EnvelopeEditor** (`a2611b8`) — focusable `role="application"`; Left/Right cycle the selected ADSR stage,
  Up/Down/PageUp-Down/Home/End adjust it (per-stage range + clamp), `aria-valuetext` ("attack 0.10s") + live
  region; focused stage's control point highlighted. Audit verdict **clean** (mouse path untouched, release —
  which has no visual handle — correctly editable, cycling/clamp/valuetext all sound).
- **EQEditor** (`6c80fe2`, the audit's must-fix) — same pattern over a flat list of the 9 band×param targets;
  frequency by a log-ish ×1.1 step, gain ±1 dB, Q ±0.1 (matching drag/wheel), `aria-valuetext` "Band 1 200 Hz".

Both: 6 tests each, mutation-verified (4-mutant battery per editor), browser-confirmed on the migrated node
(focus → cycle → adjust, 0 console errors). typecheck clean · lint 0 err · `test:unit` **1935 → 1947** ·
build 0.

**Honest a11y state (no overclaim).** Custom widgets now keyboard-operable: RotaryKnob, XYPad, EnvelopeEditor,
EQEditor, + all native inputs (ControlRenderer `aria-label`) + drag-to-scrub. **NOT done:** WaveformEditor
**freehand draw** is still pointer-only — its 4 preset buttons ARE keyboard-accessible (native `<button>`s,
cover the primary use), but arrow-key freehand-curve-drawing is impractical, so it's a **documented
limitation**, not claimed done. Also a minor ARIA nuance: `aria-valuetext` on `role="application"` is outside
the spec's supported-states set (some AT may ignore it) — mitigated by the duplicated `aria-live` span;
consistent with the shipped XYPad.

**▶ NEXT (bullet-3 remainder).** New control TYPES (`range`/`curve`/`gradient` — need consumers). Optionally a
stricter ARIA pass (the `role=application`/valuetext nuance) + WaveformEditor announce. Then `component?`
consumption (blocked on Q2).

---

## 2026-07-03 (later 45) — Phase 3 bullet 2: orphan-SFC cleanup (migrations fully finished)

Deleted the 4 now-dead bespoke `.vue` components (EnvelopeVisualNode/ParametricEqNode/WavetableNode/
XYPadNode) left by the `ui` migrations — unimported since they left `components.ts`, kept only as
revert-safety while the migrations were verified. An ultracode workflow (reference sweep + contract-gate
impact, both agents `safe=true`, cross-checked against my own grep + fixture read) confirmed no real
consumer and no gate edits. Removed the 4 files + trimmed the component symbols out of their re-export
chains (leaf `index.ts` → wrapper `.ts` → category barrels), keeping every node DEFINITION export intact.
Pure dead-code removal (the `.vue` were already tree-shaken; no runtime path touched) — typecheck clean ·
lint 0 err · `test:unit` **1935** (unchanged) · build 0 · registry/contract gates green. **Bullet 2 is now
fully finished** (no dead SFCs). The other ~24 bespoke SFCs stay by design.

---

## 2026-07-03 (later 44) — Phase 3 bullet 3: drag-to-scrub on the number control

Added Blender/AE-style drag-to-scrub to the shared `<input type="number">` in `ControlRenderer`
(used by ~566 controls), spec'd + adversarially risk-analysed via an ultracode workflow (verdict
**implement-with-care**). Safe-by-design so it can't regress the hot path:
- **Click-to-edit preserved** — mousedown NEVER preventDefaults; preventDefault is deferred until a >4px
  horizontal move proves scrub intent, so a plain click still focuses + places the caret (double-click,
  caret-drag untouched). Browser-confirmed: click focuses the field, a horizontal drag scrubs it (0→15).
- Value maps **absolutely** (mousedown value + total dx, reversible), snapped to step, clamped ONLY against
  **declared finite** min/max — both optional here, so it reuses `clampControlNumber`'s typeof-guard rather
  than the knob's unconditional clamp (which would NaN-poison unbounded controls). Shift = finer.
- Coexists with the canvas node-drag guard (`onControlMousedown`) + the blur-clamp; adds NO keydown handler
  (native arrow increment intact); `ew-resize` cursor on hover-when-unfocused; window listeners removed on
  mouseup + `onUnmounted` (leak-safe across the ~566 instances).
- 7 tests (threshold/click passthrough, absolute mapping, finite-only clamp, unbounded non-NaN, Shift-fine,
  unmount teardown), all mutation-verified. typecheck clean · lint 0 err · `test:unit` **1928 → 1935** ·
  build 0 · browser 0 errors. (The design spec agent hit the StructuredOutput cap; the risk agent's spec was
  complete, so I implemented from it.)

**▶ NEXT (bullet-3 remainder).** New control TYPES (`range`/`curve`/`gradient` — need consumers) and canvas
aggregate-editor keyboard (Envelope/EQ/Waveform — harder) are the remaining a11y/control items. Then the
deferred orphan-SFC cleanup + `component?` consumption (blocked on Q2).

---

## 2026-07-03 (later 43) — Phase 3 bullet 3: control keyboard + ARIA (a11y)

Started bullet 3 with the no-decision-needed accessibility slice. An ultracode workflow produced
WCAG-grounded implementation specs for the custom control widgets (the native inputs were already
keyboard-operable); implemented all three, each keyboard path emitting the SAME event as the pointer
path with the same clamp/step:
- **RotaryKnob** — canvas gains `role="slider"`, tabindex, `aria-valuemin/max/now/valuetext` + `aria-label`,
  keydown (Arrow ±step, Shift/PageUp-Down coarse, Home=min/End=max), `:focus-visible` ring, and
  `stopPropagation` so arrows don't leak to Vue Flow.
- **XYPad** — a 2D pad has no native ARIA control, so a single focusable `role="application"` host
  announcing both axes via `aria-valuetext` + a polite live region; arrow keys move the point (y-up),
  Shift=bigger, Home=center, End=corner (chosen over nested per-axis sliders to mirror the atomic {x,y}
  pointer emit — the spec agent justified this).
- **ControlRenderer** — `:aria-label="control.label"` on all 6 native inputs; the visible label in
  BaseNode/PropertiesPanel is adjacent text, NOT programmatically associated, so inputs were nameless to AT.

Each widget has a11y tests (roles/attrs + keyboard emits), all mutation-verified (5-mutant battery: knob
ArrowRight no-op, knob aria-valuenow, xy ArrowUp inversion, xy role, CR aria-label). Knob keyboard also
confirmed **end-to-end in a browser** (focus → ArrowRight → `aria-valuenow` changes, 0 errors). typecheck
clean · lint 0 err · `test:unit` **1909 → 1928** (+19) · build 0. (The ControlRenderer spec agent hit the
StructuredOutput retry cap again — did that analysis inline.)

**▶ NEXT (bullet 3 remainder).** New control TYPES (`range`/`curve`/`gradient` — need real consumers, so
deferred per the design doc) and **drag-to-scrub** on number inputs (additive, no decision). Then the
deferred orphan-SFC cleanup + `component?` consumption (blocked on Q2). The aggregate editors
(Envelope/EQ/Waveform) remain canvas-drag-only (no keyboard) — a harder a11y follow-up (would need
per-handle focus/arrow control), noted not done.

---

## 2026-07-02 (later 42) — Phase 3 bullet 2: xy-pad + wavetable migrations + ultracode regression audit

Self-driven ultracode continuation. Migrated the last two aggregate-backed bespoke nodes, then ran an
adversarial audit workflow that caught three real regressions — fixed + guarded.

**xy-pad → `ui` xy aggregate** (first MULTI-ROW schema): xy pad (normalizedX/Y) + rawX/rawY output
readouts + 4 range number controls. Two documented deltas: readouts are running-only, range renders
always-visible (no RANGE toggle). **wavetable → `ui` wave aggregate**: needed a data-only `waveform`
control (default = 64-sample sine) because its drawn samples lived in a bare `node.data` key the aggregate
(declared-controls-only) couldn't read; verified runtime-safe against the executor (samples used only when
preset==='custom'). Both: parity test (5 each, mutation-verified) + full gate + browser (wavetable incl.
Play/Stop). **All 4 aggregate-backed nodes now migrated** (env/eq + xy/wave).

**Ultracode audit workflow** (4 parallel adversarial agents: wavetable runtime/serialization, xy-pad
functional parity, env+eq, cross-cutting registry). wavetable + xy-pad + env/eq came back clean on
runtime/data, but the audit found **3 regressions the per-migration tests missed** (they checked the panel,
not the canvas / persistence) — all fixed in commit `e7b1f9b`, each with a mutation-verified test:
1. **Node-drag hijacked editor drags** — bespoke SFCs wrapped editors in `@mousedown.stop`; NodeView
   didn't (EQEditor/XYPad self-stop, envelope/waveform didn't). Added `@mousedown.stop` on `.nv-widget`.
2. **Persisted migrated nodes broke on reload** — `usePersistence.toFlowState` (IndexedDB rehydration) had
   its OWN `specialNodeTypes` list still naming the 4 nodes, forcing a dead Vue Flow `type`. Removed them
   (hoisted to exported `PERSISTENCE_SPECIAL_NODE_TYPES`; new test pins the two-list invariant). Verified
   end-to-end in browser (add → autosave → reload → rehydrates as 'custom' + NodeView, 0 errors).
3. **`ui` audio nodes compacted to an icon** — `isCompactNode` compacts audio-category nodes with inline
   controls (env-visual/parametric-eq/wavetable matched), hiding the canvas editor. Exempted `hasUi` nodes.

typecheck clean · lint 0 err · `test:unit` **1888 → 1909** · build 0 · browser round-trips 0 errors.
Commits this session: 14 (author Moheeb Zara, no AI attribution).

**▶ NEXT / open.** (a) NICE-TO-HAVE: delete the 4 now-orphaned bespoke SFCs (EnvelopeVisualNode/
ParametricEqNode/WavetableNode/XYPadNode.vue) + their re-export chains — deferred (cascades into the
`public-exports` contract gate; harmless/tree-shaken meanwhile). (b) `component?` consumption — blocked on
design Q2. (c) Bullet 3 (new control types, drag-to-scrub, control keyboard+ARIA). The remaining bespoke
SFCs (mediapipe/emulator/function/keyboard/gamepad/synth/step-sequencer/dispatch/monitor/...) legitimately
keep `component?` (live surfaces / raw input / bespoke geometry) — not migration candidates.

---

## 2026-07-02 (later 41) — Phase 3 bullet 2: second migration (parametric-eq) + ultracode feasibility sweep

Ran an **ultracode workflow** (6 agents: per-node analyze → adversarial fidelity verify, in parallel) over
the three remaining aggregate-showcase nodes, then migrated the one it cleared.

**parametric-eq → `ui` eq aggregate — DONE** (same pattern as envelope-visual). Its whole body was an
EQEditor bound to 9 flat band controls (freq1/gain1/q1…q3), all declared, positional order + defaults an
exact match. Added `ui: { rows: [{ widgets: [{ type: 'eq', props: { fields: [freq1..q3] } }] }] }`, removed
it from `components.ts`. New `parametric-eq-migration.test.ts` (4 tests, mutation-verified: 9-tuple exact
fan-out reds a field swap; re-registration reds the routing test). Browser: panel renders NodeView +
EQEditor canvas, 9 raw controls subsumed, 0 page errors. Only cosmetic delta: EQEditor 220×100 → default
240×120 (accent #06b6d4 unchanged). typecheck clean · lint 0 err · `test:unit` **1884 → 1888** · build 0.

**Feasibility verdicts (workflow, cross-verified against BaseNode plumbing) — the other two are NOT clean:**
- **wavetable → DEFER (real blocker).** Its drawn `samples` live in a bare `node.data.waveform` key with NO
  declared control. `BaseNode.controlValues` (the source of NodeView's `props.values`) copies ONLY declared
  controls (`for (const control of controls.value)…`), so the wave aggregate reads `undefined` → `[]` and
  loses custom waveforms. Fix needs a declared `waveform` control whose default is the 64-sample sine table
  (runtime-safe: the executor already seeds `ctx.controls` from node.data), plus `frequency`/`volume` ui
  rows. Also a minor visual gap (an untouched non-`custom` preset would show sine until interacted).
- **xy-pad → NEEDS-WORK (no blocker, more UX delta).** normalizedX/Y are declared (default 0.5, matches),
  but the aggregate covers only x/y: the 4 range controls (minX/maxX/minY/maxY) need their own `number` ui
  rows, the live rawX/rawY display becomes a `readout` that only shows while running (bespoke computes it at
  rest), and the RANGE disclosure toggle is lost (rows render always-visible). Migratable, but with visible
  changes — hold for a maintainer call.

**▶ NEXT.** wavetable + xy-pad need decisions before migrating (add an array-control type / accept xy's UX
deltas). Otherwise: `component?` consumption (blocked on design Q2), then bullet 3 (new control types,
drag-to-scrub, control ARIA).

---

## 2026-07-02 (later 40) — Phase 3 bullet 2: first real bespoke→`ui` migration (envelope-visual)

Migrated the first shipping bespoke node off its SFC onto the declarative `ui` path (maintainer picked
`envelope-visual` as the cleanest first target — its whole body was an EnvelopeEditor). Two source edits:
(1) added `ui: { rows: [{ widgets: [{ type: 'env', props: { fields: ENV_ORDER } }] }] }` to the definition;
(2) removed `envelope-visual` from `registry/components.ts`, so `resolveVueFlowType` returns `custom` →
BaseNode renders `<NodeView>` (the env aggregate) instead of the bespoke SFC. `EnvelopeVisualNode.vue` is
now orphaned (left in place + still exported for easy revert; archive it on accept).

**Behavioral parity, not pixel parity (design Q3).** New `envelope-visual-migration.test.ts` (4 tests,
mutation-verified): the definition declares the env aggregate on the 4 ADSR controls in ENV_ORDER; it's no
longer in `CUSTOM_NODE_TYPE_IDS`; NodeView assembles EnvelopeData from the 4 controls and disperses edits
back to attack/decay/sustain/release; absent values fall back to the control defaults — matching the old
`envelopeData` getter/setter exactly. Mutants killed: ui field-order swap (reds 3), re-registration (reds
the routing test).

**Browser check.** Added the node live (Playwright) and confirmed the **properties panel renders
`<NodeView>` + the EnvelopeEditor canvas** (`hasUi` true) with **0 raw number inputs** (the 4 ADSR controls
are subsumed by the aggregate) and **0 page errors**. Note: freshly-added nodes don't paint their canvas
*body* in headless — but an untouched `gain` node behaves identically, so that's a pre-existing
added-node/headless quirk, NOT a migration regression (verified side-by-side; not chased).

**One UX change to note (flagged for accept/revert).** Because the `ui` applies to both surfaces, the
properties panel now shows the EnvelopeEditor (drag) instead of the 4 typeable ADSR number inputs it
auto-layouted before. For this drag-first node it's arguably better (consistent editor canvas+panel), but
it removes numeric entry from the panel. One-line revert if undesired (the current `ui` schema can't put
env-on-node + numbers-on-panel in one schema — UIWidget has no per-widget surface field, only UISchema does).

typecheck clean · lint 0 err · `test:unit` **1880 → 1884** (+4) · build exit 0 · browser 0 page errors.

**▶ NEXT.** More migrations (each needs a which-node confirm + accept its shell/panel change) — the other
aggregate-showcase nodes (`parametric-eq`, `wavetable`, `xy-pad`) are the next-cleanest. Then `component?`
consumption — **blocked on design Q2** (real `Component` import on the definition vs. a string key via a
registry) — needs a maintainer decision. Then bullet 3 (new control types, drag-to-scrub, control ARIA).

---

## 2026-07-02 (later 39) — Phase 3 bullet 2: Tier-B complete (eq + wave + xy/XYPad)

Finished the Tier-B aggregate set in `NodeView`. **`eq`** (`EQEditor`, reused): 9 flat controls chunked
by 3 ↔ `{ bands: [{frequency,gain,q}×3] }`, positional, fidelity-mirrors bespoke `_parametric-eq` (band b
← `freq_(b+1)/gain_(b+1)/q_(b+1)`). **`wave`** (`WaveformEditor`, reused): 2 *heterogeneous* fields ↔
`{ samples[], preset }` (mirrors bespoke `_wavetable`: `waveform↔samples`, `preset↔preset`); per-type
fallback (array→`[]`, string→`'sine'`). **`xy`** (new `XYPad` control): 2 flat controls ↔ `{ x, y }`
(0..1), mirrors bespoke `xy-pad` `normalizedX/normalizedY` — **range (min/max) stays as separate primitive
controls** (maintainer decision on the model). All aggregates assemble value→control-default→0 via the
shared `fieldNumber` helper (extracted from the env adapter this session, so env's own fallback test now
guards it too); every edit fans one `update` per field (host's debounced `recordParamEdit` coalesces →
one undo step). **Built-in only** — `validateUISchema` already rejects `eq`/`wave`/`xy` for custom nodes
(`validator-ui.test.ts` line 28; `CUSTOM_UI_WIDGETS` excludes them) — no validator change, no security gap.

**New `components/controls/XYPad.vue`** — a reusable pad extracted from the archived node SFC: draggable
point over a square area, `modelValue {x,y}` 0..1 (y up), clamped, window-drag on mousedown, listener
teardown on mouseup + unmount. Presentational (host owns write/undo). Same look as the bespoke pad so a
future migration is visually faithful.

**Test-efficacy catch (the session's real finding).** The first XYPad had BOTH an `isDragging` flag AND
listener attach/detach stopping post-mouseup emits — two redundant mechanisms, so no single mutation could
red the "stops after mouseup" test (M3/M3b/M4 all *survived*). That's the "passing test ≠ guarding test"
trap. Fix: **removed the redundant `isDragging` flag** (the move listener only exists during a drag, so the
guard was dead weight) → single teardown mechanism, which the test now genuinely kills (M3b reds it).

**TDD + mutation-verified** each increment (edit→red→restore via `.bak`, never `git checkout`): eq
chunk-arithmetic + fan-out; shared-`fieldNumber` fallback (reds BOTH env+eq fallback tests); wave
field-index + preset-default + fan-out; XYPad y-inversion + clamp + teardown; xy axis-index + fan-out —
all killed. typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit` **1869 → 1879** (+10,
new `XYPad.test.ts`) · build exit 0 · **boot smoke 0 real errors** (6 nodes inspected, Play→Stop). Note:
no shipping node has `ui`, so the smoke confirms no boot regression from the new module-graph imports —
it does NOT exercise XYPad live (nothing renders it yet; that waits on the first bespoke migration).

**▶ NEXT.** First real bespoke-node migration to `ui` (e.g. `knob`, or `xy-pad`/`parametric-eq` now that
their aggregates exist) — changes the node shell (bespoke → BaseNode+NodeView), a product/visual call
needing a browser parity check + maintainer sign-off on which of the ~10–14 migratable nodes change look.
Then `component?` consumption (formalize `components.ts`), then bullet 3 (new control types, drag-to-scrub,
control ARIA). Tree is green + uncommitted (commit on request).

---

## 2026-07-02 (later 38) — Phase 3 bullet 2: first Tier-B aggregate (envelope)

Extended `NodeView` with the first **Tier-B aggregate** widget (commit `01cd7ac`). `env` maps one
`EnvelopeData` (ADSR) ↔ four flat controls via positional `props.fields`, reusing the shipping
`EnvelopeEditor`. Assemble reads the bound control values (fallback: control default → 0); disperse
fans an edit out as one `update` per field (host's debounced `recordParamEdit` coalesces → one undo
step). **Built-in only** — `validateUISchema` rejects env/eq/wave/xy for custom nodes (now explicitly
tested across all aggregate/event types). xy/eq/wave stay reserved enum slots.

**Ultracode audit** (conformance+fidelity · test-efficacy → mutation battery → synthesis): **good,
conforms to plan (B1), no must-fix, no security hole** — the "custom node smuggles an aggregate" mutant
is killed (independently verified: `CUSTOM_UI_WIDGETS` excludes aggregates). **Fidelity verified**
against the REAL node: `registry/audio/_envelope-visual` declares exactly 4 flat controls
(attack/decay/sustain/release) in ENV_ORDER, so the positional adapter is a faithful **no-migration**
mirror. Acted on 2 nice-to-haves it found: the uniform-`?? 0` default diverged from the bespoke node's
per-field defaults → now falls back to the control's declared default (also killed the dead-code M5
survivor, verified with a value→default→0 branch test). typecheck clean · lint 0 err · `test:unit`
**1867 → 1869** · build exit 0. (The test-efficacy agent crashed on the StructuredOutput cap again;
the mutation battery + fidelity agent covered its ground.)

**▶ NEXT (bullet-2 remainder).** More Tier-B adapters — `eq` (9 fields → 3 bands, needs chunking; reuse
EQEditor) and `wave` (WaveformEditor); `xy` needs a small XYPad widget (the shipping one is archived).
Then the **first real bespoke-node migration** to `ui` — deferred because it changes a shipping node's
shell (bespoke → BaseNode+NodeView), a product/visual decision needing a browser parity check, not a
headless refactor. Then `component?` consumption (formalize `components.ts`). Then bullet 3.

---

## 2026-07-01 (later 37) — Phase 3 bullet 2: declarative `ui` + `NodeView` (Tier A), increments 1-3

Design-first (maintainer approved a proposal — `docs/plans/DECLARATIVE_UI_NODEVIEW_DESIGN_2026-07-01.md`),
then built the first slice. Key insight the design captured: bullet 1 already unified the control
switches (`<ControlRenderer>`) and visibility (`evaluateWhen`), so **`NodeView` layers on top** rather
than rewriting them.

**Landed (commits `7eacb4c` · `fff8aae` · `fd7ee6e`).**
- **Inc 1 — schema + operators.** `UISchema`/`UIRow`/`UIWidget` (closed `WidgetType`) + `ui?` +
  reserved `component?` on `NodeDefinition`; `evaluateWhen` gains `{ne}`/`{gt}`/`{lt}` (bare = strict
  eq; `gt`/`lt` false for non-numbers). Backward-compatible.
- **Inc 2 — `NodeView` interpreter.** Renders `ui.rows` per surface, same `evaluateWhen`, primitives →
  `<ControlRenderer>`, dispatches knob/asset/connection/readout, readout from `runtimeStore` metrics.
  Wired **opt-in** into BaseNode + PropertiesPanel (`ui?` present → NodeView, else auto-layout). No
  shipping node has `ui`, so behavior is unchanged (smoke 0 errors).
- **Inc 3 — `validateUISchema`.** Untrusted custom nodes may use Tier-A widgets only; every `bind`
  must resolve (Set-membership, prototype-safe); `props` per-type-whitelisted + primitive-only; `when`
  primitive-only; **reserved keys** (`__proto__`/`constructor`/`prototype`) rejected; **`component`
  never copied** — no code crosses the boundary.

**Ultracode audit (plan-conformance · validator-adversarial · test-efficacy → 13-mutant battery →
synthesis).** Verdict **good, conforms to plan**; the battery **killed all 13 mutants** incl. the 5
security-critical validator ones; **no must-fix, no bypass**. Acted on it: (1) the adversarial security
agent crashed (StructuredOutput retry cap) so I ran the probe myself — **no global prototype pollution**,
binds/props already safe, but `__proto__`/`constructor` were accepted as `when` keys → **added the
reserved-key rejection** (+ regression test, mutation-verified); (2) fixed 3 honest doc overclaims —
`component?` is **reserved/not-yet-consumed** (was described as "formalizes components.ts"; nothing reads
it — live order is `ui? → auto-layout`), the §9 operator wire-format supersession, and readout being
metrics-only this increment. (Ignored one stale audit finding — "no NodeView test" — the file exists.)

**Verification.** typecheck clean · lint 0 err · `test:unit` **1846 → 1867** (+21) · build exit 0 ·
smoke 0 real errors. Every increment TDD'd + mutation-verified; committed as 3 logical units, author
Moheeb Zara, no AI attribution.

**▶ NEXT (bullet-2 remainder).** Tier B aggregate widgets (eq/env/wave via closed registry adapters,
option B1 — no data migration); migrate the first real bespoke node(s) to `ui` with behavioral parity
checks; then `component?` consumption (make `components.ts` derive from it). Then bullet 3 (new control
types + control a11y). Open questions Q1-Q4 in the design doc §11 are settled to the recommended defaults.

---

## 2026-07-01 (later 36) — Phase 3 committed + audited (this session's ledger)

Phase 3 (control system + declarative UI) landed as 5 logical, individually-revertible commits on
`phase0-file-format`, author **Moheeb Zara**, **no AI attribution** (verified):
- `33f4892` — unified `when` control-visibility schema + `evaluateWhen` (foundation; independently green)
- `05afd6a` — PropertiesPanel → `<ControlRenderer>` panel context (+ panel visibility via `evaluateWhen`)
- `7a46782` — route BaseNode + ProtocolFormFields visibility through the shared evaluator
- `cb97d6f` — migrate built-in nodes (cv-threshold / clasp-video-receive / http-request) to `when`
- *(docs)* — this HANDOFF + ROADMAP update

**Audit.** Dependency-ordered so each cumulative tree builds; the foundation commit checks out green in
isolation (composable tests + typecheck). Authorship + message scan clean (no `claude`/`co-authored`/🤖).
Full gate on HEAD: typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit` **1846** · build
exit 0. Details in later-33→35.

**Scope correction (don't overclaim).** This completes only **Phase-3 bullet 1** (unify the control
renderers + the `when` visibility schema). ROADMAP Phase 3 has **two more bullets, NOT started:**
(2) a declarative `ui` schema + one `NodeView` interpreter (+ closed widget registry, `validateUISchema`,
first-class `component?` escape hatch); (3) new control types (`xy`/`range`/`curve`/`gradient`),
custom controls first-class, drag-to-scrub, control keyboard + ARIA. Verified absent in code
(no `NodeView`/`validateUISchema`, no `ui`/`component` field on `NodeDefinition`). So the real next
step is the Phase-3 remainder — **not** Phase 4.

---

## 2026-07-01 (later 35) — Phase 3: `when` migration (3b) — registry moved off legacy, honoring harmonized

Completed the visibility unification: migrated the **8 built-in producers** off the three legacy schemas
onto the canonical `when`, which — because every consumer already honors `when` (3a) — makes panel and
canvas **consistent** for the first time. This deliberately *changes which controls render*.

**Migrated (behavior-preserving semantics, `evaluateWhen(when) ≡ old check`):**
- `cv-threshold` ×3 `visibleWhen: {controlId:'mode',value}` → `when: {mode: value}`.
- `clasp-video-receive` ×3 `visibleWhen: {controlId:'videoMode',…}` → `when: {videoMode: …}`.
- `http-request` ×2 — `showWhen` lifted OUT of `props` into top-level `when: {templateId:''}`.
- No `showIf` producer exists (that adapter stays dormant for external/custom connection defs).

**The intended harmonization (new behavior, verified correct):** the **panel** previously ignored
`visibleWhen`, so it showed clasp/cv's conditional controls unconditionally; now it hides
room/peerId/address by `videoMode` and the threshold/adaptive params by `mode`. The **canvas**
previously ignored `props.showWhen`, so http-request's url/method showed inline always; now they hide
when a template is selected. No data loss — hidden values persist in node data.

**Verification.** New `tests/unit/registry/when-migration.test.ts` pins each migrated control's `when`
+ that no legacy field remains (mutation-verified: regress one control to `visibleWhen` → red).
Parametrized the BaseNode + PropertiesPanel visibility tests to cover BOTH the canonical `when` and the
legacy field — the panel's `when` case is the harmonization guard (mutation-verified: make the panel
ignore `control.when` → only that case reds). typecheck clean · lint 0 err · `test:unit` **1843 →
1846** (+3) · build exit 0 · standard boot→inspect→Play→Stop smoke **0 real errors** (registry defs
load + run clean). NOTE: an end-to-end *visual* smoke of the toggle via store-injection was infeasible
— injecting a node into the shared store doesn't register it with Vue Flow, whose selection-sync then
clears `inspectedNode` (harness artifact, 0 errors). The panel/canvas visibility logic is instead
covered by **real component-mount** tests exercising the exact production code path (Vue Flow isn't in
that path).

**▶ NEXT.** The renderer + visibility unification (Phase-3 bullet 1) is done. The Phase-3 REMAINDER is
the real next step (see later-36 correction): (2) the declarative `ui` schema + `NodeView` interpreter
+ `validateUISchema` + `component?` escape hatch; (3) new control types (`xy`/`range`/`curve`/`gradient`)
+ drag-to-scrub + control keyboard/ARIA. Optional micro-polish: a deprecation lint for the legacy
visibility fields. Commit the session's units when the maintainer asks.

---

## 2026-07-01 (later 34) — Phase 3: unified `when` visibility schema (3a); ProtocolFormFields kept separate

**Step 2 decision (ProtocolFormFields — NOT force-migrated).** Read it closely: it shares little with
`<ControlRenderer>` — 2 widgets it lacks (`textarea`, `checkbox`; its `toggle` is a switch not a
checkbox), `text` needs `props.type` password, `number` uses `Number()` with **no** blur-clamp (vs
ControlRenderer's `parseFloat||0` + clamp), and an entirely separate grid/label/description CSS. A
real `context='config'` branch would ~double ControlRenderer to absorb ~one cleanly-shared widget —
the opposite of the phase goal. Maintainer chose **skip → do Step 3**; ProtocolFormFields stays its
own config-form path (documented). The genuine unification win is the visibility schema, below.

**Step 3a — one `when`, behavior-preserving (the three schemas map onto a single evaluator).** The
repo had three divergent visibility schemas that *disagreed*: `visibleWhen` (honored only on-canvas),
`props.showWhen` (only in the panel), `showIf` (only in the connection form). Introduced the canonical
**`when: Record<key, value | { in: [...] }>`** (multi-key AND, `in` = membership) on `ControlDefinition`
(`WhenSchema`/`WhenCondition` in `stores/nodes.ts`) + one pure **`evaluateWhen(when, values)`** in
`useControlHelpers`. All three consumers now compute visibility via `evaluateWhen(control.when ?? <its
own legacy field mapped>, values)` — so each honors the new canonical schema OR exactly its prior
legacy field. **Zero registry churn, zero behavior change** (the cross-consumer disagreement is
deliberately preserved for now — see 3b). Legacy `visibleWhen` marked `@deprecated`.

**Verification.** TDD evaluator (equality · multi-key AND · `{in}` · strict-eq/empty-string · absent
→visible). Added **consumer-wiring** tests per the later-33 audit lesson (pure fn ≠ wiring): BaseNode
`visibleWhen` filters an inline control (×2); PropertiesPanel `props.showWhen` toggles a control's
v-show `display:none` (×2). **Mutation-verified** the evaluator (always-true → 4 unit reds) AND both
consumer mappings (drop BaseNode's visibleWhen map → BaseNode red; drop panel's showWhen map → panel
red; restore → green). typecheck clean · lint 0 err · `test:unit` **1834 → 1843** (+9) · build exit 0
· boot→Play→Stop smoke 0 real errors.

**▶ NEXT — Step 3b (deliberate, behavior-changing; visual-verify).** Migrate the registry producers
to `when` (`clasp-video-receive` ×3, `cv-threshold` ×3 `visibleWhen`; `http-request` ×2 `showWhen`;
any connection-def `showIf`) and **harmonize cross-consumer honoring** — once a control declares
`when`, every consumer honors it, so the panel starts hiding conditionally-irrelevant controls
(e.g. clasp room/peerId/address by `videoMode`) and canvas honors `showWhen`. This is the intended
consistency fix but it *changes which controls render* → verify with the smoke screenshot + a manual
panel check before/after. Keep the legacy adapters for back-compat/custom nodes.

---

## 2026-07-01 (later 33) — Phase 3: PropertiesPanel migrated to `<ControlRenderer>` (panel context)

Second consumer folded onto the shared control component. `<ControlRenderer>` gained a
`context='panel'` branch; **PropertiesPanel** now delegates its six primitive widgets
(number/slider/toggle/select/text/color) to it, keeping its own delegates + chrome.

**The `context` seam.** One prop drives three things: (1) a `ctx-canvas`/`ctx-panel` class on each
widget root, with the CSS **fully qualified per context** (canvas values kept byte-identical; panel
values lifted verbatim from PropertiesPanel's original `.control-input`/`.control-slider`/… blocks —
roomier sizing, `font-size-sm`, 36×20 toggle, 36×28 color); (2) `@mousedown.stop` → a
`onControlMousedown` method that stops propagation only when **not** panel (canvas still guards Vue
Flow's node-drag; panel opts out, matching its original which had no guard); (3) the toggle's ON/OFF
caption `v-if`'d off in panel. Clamp-on-blur is context-independent and identical (panel's
`modelValue` == its old `controlValues[id]` fallback).

**PropertiesPanel slimmed.** Replaced the 6 inline widget branches with a single guarded
`<ControlRenderer context="panel" v-if="usesRenderer(control.type)">`; removed the now-dead script
(`useControlSelectOptions`/`getSelectOptions`, `isDeviceOptions`, `clampControlNumber` +
`clampNumberControl`) and the 6 primitives' CSS (kept `.control-code`/`.code-preview` + all chrome:
`.control-item`/`.control-header`/`.expose-btn`, `v-show="shouldShowControl"`). Connection/
template-select/asset-picker/code delegates unchanged.

**TDD + verification.** Wrote the panel-context tests first (toggle omits ON/OFF · clamp-on-blur ·
`ctx-panel` class) → watched red → implemented → green. **Mutation-verified** both forks (break
label fork / ctx class → their tests red; restore via `.bak` → green). typecheck clean · lint 0 err
(49 pre-existing warns) · `test:unit` **1824 → 1828** (+4) · build exit 0 · boot→Play→Stop smoke: 6
nodes inspected, **25 panel widgets rendered via the new path**, slider round-trip, **0 real
errors**; screenshot confirms panel keeps its roomy styling while on-canvas nodes are unchanged.

**Ultracode adversarial test audit (5-agent workflow: efficacy · byte-fidelity · coverage-gap →
serial 13-mutant battery → synthesis).** Verdict: tests **genuinely good, not cosmetic** — 10/13
mutants killed by the specific test pinning each behavior; the fidelity audit confirmed every
`ctx-panel` CSS value matches the pre-migration original verbatim. Found + **closed 3 real holes**
(each mutation-proven): (1) the `onControlMousedown` drag-guard fork was unpinned both ways (mutant
survived) → added canvas-stops / panel-passes tests via a bubbling mousedown to a parent listener;
(2) select `@change` emitted-value contract was untested (only option rendering) → added a
change-emits-value test; (3) **PropertiesPanel was mounted by zero tests** → new
`PropertiesPanel.test.ts` guards the delegation (primitive→`<ControlRenderer context="panel">` with
bound value, code control does NOT delegate) + the recorded `updateNodeData` write path. The 1
surviving CSS-pixel mutant is an **expected** survivor (jsdom has no layout → guarded by the fidelity
audit + smoke, deliberately not unit-tested). `test:unit` **1828 → 1834** (+6), 112 files.

**▶ NEXT (Phase 3).** (2) **ProtocolFormFields** — disjoint vocab (checkbox/textarea, `props.type`
password, `showIf`); already emit-only, lowest risk → likely a `context='config'` branch or its own
path. (3) Unify the three visibility schemas (`visibleWhen`/`showWhen`/`showIf`) into one `when`.

---

## 2026-07-01 (later 29) — credential redaction (Node-RED-style), pragmatically scoped

Maintainer: "do it, but it's not the worst thing if it's not perfectly hardened — don't over-engineer;
elegant if we can. What does Node-RED do?" Researched Node-RED (flows/`flows_cred.json` separation +
encryption-at-rest + password masking + `this.credentials` per-node scoping) and mapped the LATCH credential
flow: `ConnectionManager.getConnection*` returned configs **with `password`**, copied into reactive UI state.
So the achievable, no-regression, Node-RED-aligned fix is "never hand secrets out." (Correction to an
earlier note: the shareable `.latch` file does NOT contain connection configs — see later-30 — so nothing
was leaking via flow-sharing; the gap was the runtime/UI-facing public API, which this closes.)

**Done (commit `8fc2562`).** `redactSecrets.ts` + `ConnectionManager`: (1) configs held in a `#`-private map
(not reachable via `(mgr as any).connections`); (2) public `getConnection*` + `connection-added/updated`
events return configs with secret fields (declared `props.type:'password'` — clasp `token` now marked — or
secret-named) masked to a placeholder; (3) `connect()`/`exportConnections()` read the raw map, so auth +
flow persistence are **unchanged**; (4) `updateConnection` merge-preserves a masked field (Node-RED's
`__PWRD__`) so a UI round-trip can't erase a saved secret. Bounded (one service + helper), unit-tested +
mutation-verified, zero regression.

**Verification.** typecheck clean · lint 0 err · `test:unit` **1806 → 1813** · boot→Play→Stop smoke 0 errors.

---

## 2026-07-01 (later 32) — Phase 3: `<ControlRenderer>` extracted; BaseNode migrated

Built the unified control component via an ultracode workflow (spec → build → 6 parallel adversarial
fidelity checks, one per control type, each diffing the result against `git show HEAD:BaseNode.vue`).
**0 drift found; independently re-verified.**

**Landed (commit `16b8ae2`).** `components/controls/ControlRenderer.vue` — presentational, props
`{ control, modelValue, context }`, emits `update`; owns the 6-type widget dispatch
(slider/toggle/select/number/text/color) + their CSS, lifted byte-faithful from BaseNode (markup, classes,
`@mousedown.stop`, number `@input(parseFloat||0)`+`@blur`-clamp, slider parseFloat, ON/OFF text, `#808080`
default). BaseNode now delegates (`−274/+7` lines), keeping its `.inline-control` wrapper + label. The
existing BaseNode test guards it end-to-end (mutation-verified: break ControlRenderer's `:min` → red); a new
`ControlRenderer.test.ts` (+6) pins each type. typecheck · lint 0 · `test:unit` **1818** · smoke green.

**▶ NEXT (Phase 3).** Migrate **PropertiesPanel** to `<ControlRenderer>` — needs a `context='panel'` branch
(no `@mousedown.stop`, no ON/OFF text, normal styling) + it keeps its delegates (connection/template-select/
asset-picker/code-preview) and the expose-to-panel chrome. Then **ProtocolFormFields** (disjoint vocab:
checkbox/textarea + `props.type` password + `showIf` — likely a `context='config'` branch or its own path).
Then unify the three visibility schemas (`visibleWhen`/`showWhen`/`showIf`) into one `when` (ROADMAP Phase 3).
The `context` prop is the scaffold; currently only `'canvas'` behavior is implemented.

---

## 2026-07-01 (later 31) — Phase 3 START: shared control-rendering helpers (dedup)

Phase 2 effectively complete → moved to **Phase 3 (Control system + declarative UI)**. Mapped the three
control renderers (`BaseNode` on-canvas · `PropertiesPanel` panel · `ProtocolFormFields` config form) for
the eventual unified `<ControlRenderer>`; the map found real divergence (types, value sourcing, number
commit, boolean widget, THREE different visibility schemas — `visibleWhen`/`showWhen`/`showIf`) so
full unification is medium-risk and staged.

**First bounded increment (commit `a7481ee`).** `BaseNode` + `PropertiesPanel` carried byte-identical copies
of the select-option resolver + `isDeviceOptions` + the number clamp. Extracted to `useControlHelpers.ts`
(pure `isDeviceOptions`/`clampControlNumber` + a `useControlSelectOptions` composable for the device-coupled
part); each component keeps its thin clamp wrapper so behavior is exact. Near-zero risk, guarded by the
existing BaseNode clamp test. typecheck · lint 0 err · `test:unit` **1813 → 1818** · smoke 0 errors.

**▶ NEXT (Phase 3).** Step B: introduce `components/controls/ControlRenderer.vue` (the shared primitives +
delegation to ConnectionSelect/TemplateSelect/AssetPickerControl/code-preview, with a `context:
canvas|panel|config` hint for the behavioral forks — mousedown.stop, ON/OFF vs checkbox, clamp-vs-Number).
Migrate PropertiesPanel first (superset, already store-wired), then BaseNode, then ProtocolFormFields
(disjoint vocab — separate track). Add a PropertiesPanel clamp test before migrating it. Unify the three
visibility schemas is its own later task. Full map in the later-31 agent output / this entry.

---

## 2026-07-01 (later 30) — security verified AT Node-RED parity; declared good-enough

Maintainer set the bar: "if we are as secure as Node-RED then that is good enough." Verified LATCH's posture
against the real code and confirmed we are **at or above** it:
- **Shareable `.latch` file carries NO connection configs or secrets** — `fileFormat.ts`/`flowStateToDoc`
  serialize only nodes/edges/layout; connections live solely in local IndexedDB (`PersistedFlow`,
  `usePersistence`), and nothing exports that store to a file. So **sharing a flow never leaks a credential**
  (matches Node-RED's flows/`flows_cred.json` split; arguably better — no exported cred file to mis-share).
  Corrects an earlier note that wrongly said the flow file embeds the secret.
- **Runtime STRONGER:** nodes get a no-secret handle, never `this.credentials` (Node-RED hands over the
  decrypted credential).
- **Public API PAR:** secret fields masked (later-29).
- **At-rest:** local IndexedDB is plaintext on web (browsers have no secure key store — same local-access
  class as Node-RED's locally-keyed file); Electron *could* add `safeStorage` encryption but that's
  beyond-parity on web.

**Conclusion: security is DONE at the accepted bar.** No further hardening warranted. Optional, explicitly
gated beyond-parity items (Worker-isolating community executors; Electron at-rest encryption) wait on a real
need — community-node distribution doesn't exist yet. Full comparison in `SECURITY_MODEL_IMPL_2026-07-01.md`.
Docs corrected in `redactSecrets.ts` + the impl plan. No code change; verification only.

---

## 2026-07-01 (later 28) — deep audit of the whole plan-so-far (Phases 0-2); everything verified

Maintainer: "what are the remaining phases… audit everything deeply… full thorough check on everything
so far in plan vs what it was, then proceed." Ran a 5-agent parallel audit (Phase 0/1 · connections ·
model derives · security spine · docs-vs-code+regressions), each adversarially verifying the ROADMAP/HANDOFF
CLAIMS against the real code + git.

**Verdict: the plan's claimed state matches reality.** Every substantive Phase-0/1/2 claim verified —
- Phase 0/1: file format + all primitives + every quick-win fix (commit-evidenced); de-monolith `index.ts`
  is exactly 241 lines; 22/23 state-group migration (engine hand-wires only `subflow`); leak/pure-set(24)/
  export-list gates real + green; `_`-split GC fix confirmed.
- Phase 2 connections: `defineProtocol`+glob-authoritative registry (set-equality gate, 6 types); no-secret
  handle leaks nothing; mqtt/ws/http on `ctx.connection`; BLE registered + Electron pairing.
- Phase 2 models: **independent git-diffs** confirm derived `AI_MODELS` is byte-identical to the c534c53
  original and `WEBLLM_MODELS` is set+order-identical minus the removed DeepSeek id; exact set-equality gate;
  24/35 file counts; 13/13 text-gen `promptFormat`.
- Phase 2 security: anti-spoof holds (cap closed-over, never on ctx); trust sourced from the authoritative
  registry def; per-connection grants; validator whitelists declarations + strips `trust`; **no new holes**
  from the hardening. The `getAdapter`/ambient-`fetch` residual is honestly documented, not concealed.
- Baseline: typecheck clean · lint 0 err · `test:unit` **1806 / 0 fail** · **build exit 0**. Git clean, all 9
  session commits authored Moheeb Zara, **no AI attribution**.

**Fixes applied (commit `66ac9ce`).** The only findings were 4 stale in-file doc-comments (protocolRegistry/
defineProtocol "glob inert", trigger "nothing consumes this yet", webllm derive "25 models") — corrected —
plus a LOW/unreachable latent: a missing registry def would default trust to `core`. Now **fails closed**
(→ `community`) so the fail-safe invariant is explicit. All green.

**Phase map (canonical: `ROADMAP_2026-06-28.md`).** 0 ✅ · 1 ✅ (~95%, subflow → P7) · **2 🔄 in progress** ·
3 Control system + declarative UI (`<ControlRenderer>` + `ui`/`NodeView`) · 4 Canvas + onboarding + a11y ·
5 Node functionality + modulation gap · 6 Full per-node co-location (largest tail) · 7 Subflow rebuild ·
8 Live/VJ + installation · 9 Multiplayer. Phase-2 remainder: version-resolve+lazy-load models, Serial adapter
(MIDI is a poor fit), the security Worker-isolation + credential-WeakMap follow-on, MediaPipe (deferred), BLE
picker + desktop check.

---

## 2026-07-01 (later 27) — SECURITY_MODEL steps 2-6: the capability-enforcement spine (+ derives committed)

Maintainer picked the SECURITY_MODEL design proposal, then "do this and then act on it… the whole goal is a
better architecture for modularity; the code works, restructure per plan; don't worry if you can't verify
serial/BLE headlessly — the code is the code." So: designed steps 2-6 grounded in a 5-agent code map, then
implemented the buildable enforcement spine.

**First, committed the model derives** (earlier work, uncommitted): WebLLM derive, transformers `AI_MODELS`
derive, docs, and the count-guard tightening — commits `33ba64c` / `6238b75` / `6e4e551` / `4343942`.

**Design (`docs/plans/SECURITY_MODEL_IMPL_2026-07-01.md`).** The map found step 2 is 90% pre-wired (one
choke point `resolveConnectionHandle`; `NodeSpec.connections` already declares; a tested-but-dead
`ConnectionValidator`), no provenance signal exists, and no CSP + no executor isolation (`new Function` is
NOT a sandbox). So the buildable spine is **steps 3→2→4**; steps 5-6 hit hard limits (per-node egress needs
Worker isolation; install disclosure needs a manifest system) — documented honestly, not faked.

**Implemented (all dormant for existing nodes — every built-in is `core` → bypass; zero regression).**
- **Step 3 — trust tiers** (`services/security/trust.ts`): `TrustTier` on `NodeDefinition`, assigned by
  ORIGIN at load (built-in→`core`, `CustomNodeLoader` stamps `local`/`community`), never author-declared.
- **Step 2 — capability gate** in `resolveConnectionHandle`: a `community` node may only obtain a handle
  for a protocol it DECLARED; trust + declarations come from the AUTHORITATIVE registry def (not the
  spoofable embedded copy).
- **Step 4 — approval grants** (`services/security/capabilityGrants.ts`): deny-by-default; the sync gate
  fires the async approval once and denies until granted (injected resolver → UI-agnostic); grants keyed
  per (nodeType, protocol, **connection id**).
- **Step 6 core** (`services/security/capabilities.ts`): `describeCapabilities`/`formatCapabilityConsent`
  render the consent list an install dialog shows.

**Adversarial red-team (13 agents) → 6 confirmed, fixed (commit `a3b6071`).**
- **CRITICAL:** the capability context was a property on the executor-facing `ctx` → a community executor
  could `ctx.capabilityContext.trust = 'core'` to bypass. Now passed as a closed-over arg to
  `createExecutionContext` (never on ctx) + frozen. Mutation-verified (re-exposing it reds the anti-spoof test).
- The validator STRIPPED `connections`/`requires` (rebuilds from a whitelist) → the declare→approve path
  was dead for the only tier it gates. Now whitelisted + validated (still strips author `trust`).
- Grant key omitted the connection id → one approval unlocked every same-protocol broker. Now per-connection.
- `compiler.ts` falsely claimed `new Function` sandboxes → corrected; the honest boundary is documented.
- **Honest limit (no overclaim):** without isolation, a malicious community node can still `fetch`/reach
  credentials via ambient access; the spine stops accidental/undeclared misuse and becomes a real boundary
  only once community executors run in a Worker + credentials move off the adapter (the priority follow-on).
  Trust/provenance is the mitigation until then. There is no marketplace/install flow yet, so this is dormant.

**Verification.** typecheck clean · lint 0 err · `test:unit` **1778 → 1806** · boot→Play→Stop smoke 0 errors.
Committed as logical units.

**▶ NEXT.** Security follow-on: Worker-isolate `community` executors + move adapter credentials to a
broker-private WeakMap (the real step-5 boundary), then the install/manifest UX (step 6 full). Otherwise:
Serial/MIDI adapter drift (MIDI is a poor fit for the connection-adapter model — flag), MediaPipe derive
(deferred, poor fit), BLE picker + desktop BLE check.

---

## 2026-06-30 (later 26) — second catalog DERIVE: transformers `AI_MODELS` now derived (per-task rollup); audit clean

The hard fork from `MODEL_REGISTRY_IMPL` (maintainer: "continue"). Turned the per-task `AI_MODELS`
catalog into derived data — the memo's **fork 1a**: per-task wrapper metadata in a hand-authored
`taskCatalog` + one `*.model.ts` per model; the derive groups specs by task and reconstructs the
`ModelDefinition[]` shape, with `defaultSize`/`defaultLicense` sourced from the default model's own spec.

**What changed.**
- **35 `services/ai/models/transformers/<slug>.model.ts`** (9 defaults + 26 alternates), each
  `defineModel({ id, name, family:'transformers', task, size, license })`. Generated by *evaluating* the
  git-original array (no manual parsing). The 13 `text-generation` specs also carry
  `load:{promptFormat:'chat'}` — migrating `textGenFormat.isChatModel` onto `spec.load.promptFormat` per the
  memo invariant (all 13 verified chat via `isChatModel` + `text-gen-format.test.ts`).
- **`models/transformers/taskCatalog.ts`** — `TASK_CATALOG`: 9 task entries (id, name, task, description,
  category, supportsWebGPU, defaultModel id, ordered alternate ids). Note `vision-language` has id
  `'vision-language'` but pipeline task `'image-text-to-text'` — the derive keeps them distinct.
- **`models/transformers/derive.ts`** — `deriveAiModels()`. Both-direction guards at load: a TASK_CATALOG id
  with no spec throws; a co-located transformers spec not referenced (or referenced twice) throws; a spec
  missing a license throws.
- **`AIInference.ts`** — the 148-line literal (lines 77–224) deleted; `AI_MODELS = deriveAiModels()`. The
  `type`-only import of `ModelDefinition`/`ModelOption` back into `derive.ts` is erased at runtime → **no
  import cycle** (audit-verified). Exports/types unchanged, so every consumer (`getModelSelectOptions`,
  `getDefaultModel`, worker keying, `AIModelManagerModal`, the model-select seam) sees a byte-identical catalog.

**Gate + audit.** `tests/fixtures/ai-models.baseline.ts` = the git-original `AI_MODELS` array copied VERBATIM
(whole objects) — an anchor **independent** of the per-model spec generation (the shared-provenance lesson
from later-25 applied up front). `ai-models-derive.test.ts` deep-equals `AI_MODELS` against it;
`modelRegistry.test.ts` adds transformers set-equality. Deep-equal + completeness guards mutation-verified
(a flipped alternate size reds; a deleted referenced spec throws the named-id error). A 4-dimension
adversarial audit (fidelity · consumers · module-graph/circular · semantics-guards) returned **0 findings**;
I independently re-diffed the baseline fixture against `git show c534c53` byte-for-byte (147 lines, identical).

**Verification.** typecheck clean · lint 0 err · `test:unit` **1775 → 1778** (+2 derive gate, +1 transformers
set-equality) · boot→Play→Stop smoke **0 real errors** (`AIInference` now pulls the transformers glob).
Uncommitted.

**Fork decisions made (maintainer can veto):** fork-1a (taskCatalog + per-model specs); alternate/task order
carried by `taskCatalog` lists (fork-2 "explicit order"); MediaPipe still deferred (fork-3). promptFormat
migrated onto text-gen specs now (advances the isChatModel→spec move).

**▶ NEXT.** Only MediaPipe remains un-derived (deferred — URL-built, low value); deriving it would let the
`modelRegistry` count guard tighten to whole-catalog set-equality. Then Serial/MIDI drift, `SECURITY_MODEL`
2–6, BLE picker — all still gated/hardware-bound.

---

## 2026-06-30 (later 25) — adversarial audit of the WebLLM derive; external anchor added; a real dead-id bug found + removed

Ran a 5-dimension adversarial-audit workflow (fidelity · module-graph · gate-strength · semantics · pattern),
each finding verified by an independent refute pass. **5 confirmed, 1 refuted.** The headline finding was the
one I'd flagged myself: the deep-equal snapshot shared provenance with the generated `*.model.ts` files (both
seeded from the same source), so a common generation-time error could ship green — the verifier *reproduced*
it (a `~4.5 GB` typo pasted into both artifacts passed the gate).

**Fixes applied (all green, mutation-verified).**
- **External anchor (the real fix).** New test imports the installed `@mlc-ai/web-llm` `prebuiltAppConfig`
  (163 models, no shared provenance) and asserts every derived id exists upstream — the drift that actually
  matters (a wrong id fails to load; a wrong size/name is cosmetic). Mutation-verified with the exact
  shared-provenance blind spot: a bogus id injected into file+order+snapshot *together* leaves the deep-equal
  green but reds the anchor.
- **A REAL PRE-EXISTING BUG the anchor caught → fixed.** `DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC` is **not
  in web-llm 0.2.84** (only the 7B variant ships) — the catalog docstring claimed all ids were "verified
  present," but this one would fail to load (upstream removed it; version skew). **Removed** it (model file +
  `order.ts` + snapshot); catalog is 25 → **24**. Independently confirmed via `git show c534c53` + a shell
  reconstruction (a *different* method than the original node regex) that the remaining 24 match the git
  original exactly. ⚠️ **Maintainer review point:** this is a user-facing catalog change; revert (or bump
  web-llm to restore the 1.5B id) if you'd rather keep it.
- **Lower-severity fixes.** Set-equality tightened to full `{id,name,size}` tuples (guards the derive's
  projection, not just ids); prompt-format gate tightened to enum membership; the stale "glob matches ZERO
  files / inert" doc-comments in `modelRegistry.ts` + `defineModel.ts` corrected (webllm is live now); a
  shape-agnostic-collector rationale added near the glob (family derives live under `models/<family>/`).
- **Refuted (correctly):** the `as const` → mutable `WebllmModel[]` type-widening — an inert contract nit, no
  live bug.

**Verification.** typecheck clean · lint 0 err · `test:unit` **1774 → 1775** (+1 external anchor) · boot→Play→
Stop smoke **0 real errors**. Uncommitted.

**▶ NEXT (this session, continuing):** the transformers `AI_MODELS` derive (the hard per-task fork).

---

## 2026-06-30 (later 24) — first catalog DERIVE: `WEBLLM_MODELS` now derived from co-located `*.model.ts` specs

Maintainer picked (A) — the model derive, WebLLM first — off the gated menu (fork picks from
`MODEL_REGISTRY_IMPL`: webllm-first · explicit order list · defer MediaPipe · the auto error-outputs
sub-step already landed earlier this session). This turns the first of the three hand-authored catalogs
into data collected by the `modelRegistry` glob — the scaffold built in later-14 goes from inert to live
for WebLLM.

**What changed.**
- **25 `services/ai/models/webllm/<slug>.model.ts`** — one `defineModel({ id, name, family:'webllm',
  task:'text-generation', size, load:{promptFormat:'chat'} })` per model. *Generated by regex from the
  existing `WEBLLM_MODELS` array* (zero manual transcription of ids/names/sizes). `task:'text-generation'`
  + `promptFormat:'chat'` satisfies (meaningfully — all are MLC instruct/chat builds) the scaffold's
  prompt-format gate.
- **`models/webllm/order.ts`** — `WEBLLM_MODEL_ORDER`, the curated display order (tiny→large, coder +
  reasoning grouped) that a glob sort can't reproduce (the memo's fork-2 pick over a per-spec `order`
  field).
- **`models/webllm/derive.ts`** — `deriveWebllmCatalog()` reads `modelSpecs`, projects `{id,name,size}` in
  `order.ts` order. Checks **both directions at load**: an ordered id with no spec throws; a co-located
  `webllm` spec absent from the order throws — so dropping a file without updating `order.ts` (or vice-versa)
  fails loudly in CI, never silently shrinks the catalog.
- **`registry/ai/llm.ts`** — the 30-line literal is deleted; `WEBLLM_MODELS = deriveWebllmCatalog()`.
  `DEFAULT_WEBLLM_MODEL = WEBLLM_MODELS[0].id` unchanged (Llama-3.2-1B still first). Exports stay at the
  same module, so the two consumers (`AIModelManagerModal.vue`, `executors/webllm.ts`) are untouched.

**Load-bearing facts (verified).** (1) Only the modal + the webllm executor import these symbols, both from
`@/registry/ai/llm` — keeping the export site stable = zero consumer blast radius. (2) `*.model.ts` are
metadata-only (import only `defineModel`), so eager-globbing 25 more at app startup is cheap — smoke stayed
clean. (3) The `as const` → `WebllmModel[]` type widening (literal-union → `string`) breaks nothing —
typecheck clean.

**Gates (+3 tests, mutation-verified).** `webllm-models.test.ts`: an **independent pasted snapshot** of the
pre-derive 25 entries that the derived catalog must `toEqual` (ids/names/sizes/**order**), plus
`WEBLLM_MODEL_ORDER` === the snapshot ids. `modelRegistry.test.ts`: **WebLLM set-equality both directions**
(co-located `webllm` spec ids === `WEBLLM_MODELS` ids). Mutations: a flipped size in one `*.model.ts` reds
exactly the deep-equal test; a removed `order.ts` id makes the derive throw the named-id error at load.
Restored → green.

**Verification.** typecheck clean · lint 0 err (49 pre-existing any-warns) · `test:unit` **1771 → 1774**
(+2 derive gate, +1 set-equality) · boot→Play→Stop smoke **0 real errors** (module-load graph changed —
`llm.ts` now pulls the glob). Uncommitted (commit only when asked).

**▶ NEXT (still gated).** The remaining derives — transformers `AI_MODELS` (per-task rollup, the hard fork)
and MediaPipe (deferred, low value) — would tighten the `modelRegistry` count guard to whole-catalog
set-equality. Otherwise unchanged: Serial/MIDI adapter drift, `SECURITY_MODEL` 2–6, the BLE renderer picker,
and the 1× desktop-build check of the Electron BLE pairing handler (`c534c53`).

---

## 2026-06-30 (later 20) — A2 model-select population: first registry-populated `model` select (text-generation)

Self-driven Phase-2 step (maintainer authorized forward progress). Mapped the models sub-stream with a
5-agent Understand workflow first (defineNode derivation, catalogs, model-registry scaffold, versioning,
co-location target), which surfaced the exact architecture and one contradiction to resolve by reading the
real code.

**Load-bearing facts (verified, not assumed).** (1) `AI_MODELS` DOES have a `task:'text-generation'` entry
(a map agent's "not in AI_MODELS" claim was wrong). (2) `AIInference.ts` statically imports only light modules
(no transformers runtime — that's in the worker), so the catalog is cheap to import. (3) **Every** infer
method + `isModelLoaded`/`getModelInfo` resolve `modelId || getDefaultModel(task)` — they use the task
default, NOT `getSelectedModel` — so an absent/empty modelId falls back to the default *everywhere*. That makes
adding a `model` control purely additive: default `''` = "auto → task default", old saved flows (no control)
resolve identically, **no `migrate()` needed**. (4) AI nodes are bare `NodeDefinition`s with executors in a
separate map, so full `defineNode`+executor co-location is **Phase 6** — not attempted here.

**What changed (well-architected, minimal).**
- `services/ai/AIInference.ts`: pure `getModelSelectOptions(task)` — an "auto" entry (`value:''`) + every
  alternate, mapped from `AI_MODELS`. Trivially testable, cheap at node-def time; source swaps to the model
  registry after the derive.
- `engine/defineNode.ts`: exported `deriveModelDefinition` + added an optional injected `ModelSelectResolver`.
  The engine stays **catalog-agnostic** (it never imports the AI service); the AI registry injects catalog
  knowledge. `defineNode` still calls it with no resolver (the non-AI library stays byte-identical / inert).
- `registry/ai/text-generation.ts`: routed its definition through `deriveModelDefinition(..., resolver)` — it
  gains a registry-populated `model` select; its already-declared loading/progress/done/error outputs dedup to
  no-ops. First AI node with a populated select.

**Tests (+9), mutation-verified.** `defineNode.test.ts`: resolver populates options+default, empty without a
resolver (inert path preserved), resolver not consulted when the select is suppressed/authored. `ai-catalog.test.ts`:
`getModelSelectOptions` shape/auto-entry/unknown-task/every-task, and the text-generation node's populated select
+ no output/control duplication. Mutations (ignore the resolver / drop the auto entry) red exactly the right tests.

**Verification.** typecheck clean · lint 0 err · `test:unit` **1740 → 1749** · **boot→Play→Stop smoke 0 real
errors** (registry/def change + new registry→service import at module load). Architecture note: engine↔AI
decoupling preserved via dependency injection; the same seam serves the post-derive source swap unchanged.

**▶ NEXT — done same session (later 21).**

---

## 2026-06-30 (later 23) — adversarial audit of the model-select + BLE commits; fix Electron BLE pairing

Ran a 7-agent adversarial audit (5 dimensions → verify) over the un-audited commits (39ed9f3, cc07f01,
0fb7971) before continuing.

**Model-select work (39ed9f3 + cc07f01): CLEAN — all claims hold.** (a) "Additive, no migrate()" confirmed —
`fileFormat` persists only explicit control *values*, definition defaults merge at runtime, so an old flow
without the `model` control reads `undefined` → `modelId || getDefaultModel(task)` → the same default. (b)
**Zero output ports added** — all 6 adopted nodes already declared loading/progress/done/error (verified per
node via `git show cc07f01^:…`), so `deriveModelDefinition` deduped to a pure no-op. (c) All 7 task strings
match executor↔`AI_MODELS`; `selectedModels`/`getSelectedModel` are UI-only, never read by executors.

**BLE (0fb7971): one finding real, one refuted.**
- **Orphaned-registration → REFUTED.** OSC and CLASP are *also* registered connection types with
  self-contained executors (no `ctx.connection`), so BLE registered-but-not-yet-consumed matches the
  deliberate existing architecture — not a defect. A "hide BLE" patch would inconsistently single it out.
- **`platforms: ['web','electron']` over-claim → REAL, FIXED.** The audit claimed Electron BLE is broken;
  before touching code I checked the **actual Electron docs** (WebFetch) — with **no `select-bluetooth-device`
  listener, requestDevice() is cancelled**, so my recollection was wrong and the audit was right. This is a
  *pre-existing, project-wide* gap (all 4 BLE nodes + `bleConnectionType` + `connectivity.md` claim electron),
  so the honest fix is to make the claim TRUE, not to strip `electron` from one line (which would single out
  BLE and abandon desktop BLE). **Added a `select-bluetooth-device` handler in `src/main/index.ts`** (canonical
  documented form: preventDefault, pick the first UUID-filtered device, wait through the incremental re-fires) —
  unbreaking desktop BLE for the whole feature. Left `platforms` as-is (now honest + consistent with the 4
  BLE nodes).

**Verification.** typecheck clean (`tsconfig.json` covers `src/**`, so the main-process handler IS typechecked
against Electron's types) · lint 0 err · `test:unit` **1771** (unchanged — Electron main isn't unit-testable
headlessly). **Not runtime-verified in this harness** (no Electron); needs a 1× desktop-build check that BLE
now pairs — consistent with the repo's other "needs a runtime check" caveats.

**▶ NEXT / follow-ups surfaced by the audit.** (1) `TODO(ble-ux)`: forward `deviceList` to a renderer device
picker so the user chooses among matches (today: auto-first). (2) `docs/nodes/connectivity.md` "full BLE
support" in Electron is now true *with* the handler. Otherwise unchanged: Serial/MIDI adapters + executor
migration; catalog **derive** + `SECURITY_MODEL` (maintainer-gated).

---

## 2026-06-30 (later 22) — register BLE as a first-class connection protocol (Phase 2 drift fix)

Self-driven (maintainer: "do what you think is best"). Mapped the BLE/Serial/MIDI drift with a 5-agent
Understand workflow, then scoped to the **complete, fully headlessly-testable subset**: the full drift fix
(new Serial/MIDI adapters + migrating the legacy `navigator.*` executors to `ctx.connection`) is large and
hardware-bound, but **BLE was already a complete, tested adapter** (`adapters/BleAdapter.ts`, listener-leak
test passing) that was simply **never registered as a protocol**.

**What changed (mirrors the mqtt/ws/http registration exactly).** Added `bleConnectionType`
(`ConnectionTypeDefinition<BleConnectionConfig>`) co-located in `BleAdapter.ts` — metadata + configControls
(serviceUUID/autoConnect/autoReconnect/reconnectDelay) + `createAdapter: (c) => new BleAdapter(c.id, c)`
(BleAdapter's ctor is `(connectionId, config)`, unlike the one-arg impls — the id travels on the config).
`autoConnect` defaults **false** (Web Bluetooth needs a user gesture to pick a device). Exported it from the
`adapters/` barrel and added `protocols/ble/protocol.ts` (`export default defineProtocol(bleConnectionType)`).
The `protocolRegistry` glob auto-discovers it and `registerBuiltInTypes()` loops the glob — **so `index.ts`
needed no edit**; the manager goes 5→6 types. BLE falls through `createConnectionHandle`'s default to the
no-secret **base handle** (a typed `BleHandle` is YAGNI until an executor consumes it — the legacy BLE
executor still uses `navigator.bluetooth` directly and is untouched, so zero regression).

**Tests (+4), mutation-verified.** `protocolRegistry.test.ts`: added `bleConnectionType` to the
drift-proof `builtInProtocolIds` set (5→6, so the set-equality gate now asserts BLE is co-located AND
registered); a BLE-included assertion; and a `bleConnectionType` block — well-formed + autoConnect-off,
`createAdapter` builds a `ble` adapter carrying the config id without touching hardware, and the resolved
handle leaks no `serviceUUID`/config/adapter. Mutation: moving `protocols/ble/protocol.ts` out of the glob
reds the gate + BLE-included test; restored → green.

**Verification.** typecheck clean · lint 0 err · `test:unit` **1767 → 1771** · boot→Play→Stop smoke 0 real
errors (connection manager now initializes 6 types).

**▶ NEXT (self-drivable / gated).** The larger drift remainder: write `SerialAdapter`/`MidiAdapter` classes +
migrate the 4 legacy `navigator.*` executors (serial/midi-in/midi-out/ble) to `ctx.connection` +
`defineNodeState` (hardware-bound — plumbing testable, I/O manual); fix the `midiInputNode` export gap
(one-line bug — defined but not exported/registered). Still maintainer-gated: the catalog **derive**
(`MODEL_REGISTRY_IMPL`, 5 forks), `SECURITY_MODEL` steps 2–6. Phase-6 executor co-location is separate.

---

## 2026-06-30 (later 21) — model-select adopted across all transformers AI nodes + DRY seam

Continued self-driven forward. Extracted the wiring into one shared AI-registry seam and adopted the
catalog-populated `model` select on every remaining applicable node.

- **`registry/ai/modelSelect.ts`** — `withModelSelect(definition, task)`: the single place the AI registry
  wires the engine's catalog-agnostic `deriveModelDefinition` to the catalog (injects
  `getModelSelectOptions`). DRY — replaces the per-file resolver; text-generation refactored onto it too.
- **6 more nodes adopted:** sentiment-analysis, feature-extraction, image-captioning (`image-to-text`),
  image-classification, object-detection, text-transformation (`text2text-generation`). Each executor already
  reads `ctx.controls.get('model')` via `runModelInference`; the `task` passed to `withModelSelect` is exactly
  the string that executor uses (verified against `AI_MODELS.task`), so the select's `''` default resolves to
  the model the node actually runs. All additive — no `migrate()`. vla/llm keep their bespoke selects
  (SmolVLM / WebLLM catalogs).

**Tests.** `ai-catalog.test.ts` node block **parameterized over all 7 nodes** (`it.each`): each has a populated
select whose options equal `getModelSelectOptions(task)` (guards against a task-string typo — a wrong task
would yield `[]`), default `''`, the 4 standardized outputs present without duplication, and a single model
control. **Verification:** typecheck clean · lint 0 err · `test:unit` **1749 → 1767** · boot→Play→Stop smoke
0 real errors.

**▶ NEXT (self-drivable / gated).** The AI model-select feature is now uniform. Remaining Phase-2, all
maintainer-gated: the catalog **derive** (`MODEL_REGISTRY_IMPL`, 5 forks — the deep-equal gate wants explicit
order/default decisions); `SECURITY_MODEL` steps 2–6; BLE/Serial/MIDI protocol drift. Phase-6 executor
co-location (folding these defs + executors through `defineNode`) is the larger separate effort.

---

## 2026-06-30 (later 19) — texture-render swallowed-catch surfacing + A1 empty-error shadow fix (Phase 2)

Plan check first (ROADMAP is canonical for this branch): we're mid **Phase 2** — connections sub-stream
(defineProtocol/ConnectionHandle/ctx.connection + mqtt/ws/http) done; models sub-stream runtime foundation
(runModelInference + A1 + A2-core + scaffold) done and regression-clean. Corrected the stale ROADMAP progress
snapshot (it still said "Phases 2–9 not started"). Maintainer chose **texture-render catch surfacing** as the
next thread.

**What changed.** The 3 continuous **texture-render** AI nodes — `object-detection-live` + `-yolo` (both via the
shared `runLiveDetection` loop) and `depth-estimation` — swallowed their inference `catch` into `console.error`
(AUDIT §G; they don't fit `runModelInference`, which is request→single-result). Applied the **already-approved STT
pattern** (`800451b`): cache the caught message → emit on a **public `error` output** (badge via the A1 latch),
cleared by the next successful inference. Texture-render / overlay / throttle logic untouched; the transient
"Unsupported source" status stays on the internal `_error` channel. Added the `{ id:'error', type:'string' }`
output port to all three registry defs (matching STT; adding an *output* port is non-breaking — outputs aren't
persisted, so no version bump / migrate).

**A1 hardening (necessary, not incidental).** Emitting `error:''` every clean frame *reachably* triggered the
`??` shadow the later-17 coercion audit had flagged as latent: `outputs.get('error') ?? outputs.get('_error')`
picked the empty string (non-nullish), blanking the badge on an "Unsupported source" frame. Fixed the A1 selection
in `ExecutionEngine` to prefer the public `error` **only when it's a non-empty string**, else fall back to
`_error`. This also retroactively closes the same latent gap for STT and any future `error:''` emitter.

**Tests.** `live-detection.test.ts` +2 (live loop + depth: a thrown inference error surfaces on `error`, cleared
on the next success — the existing harness stubs `getContext`→null so no WebGL). `ExecutionEngine.test.ts` +1
(empty `error` no longer shadows a real `_error`). All **mutation-verified** (neutralize each catch's error-cache /
revert the A1 selection → the matching test reds → restore via `perl`, never `git checkout`).

**Verification.** typecheck clean · lint 0 err (49 warns) · `test:unit` **1737 → 1740** · **boot→Play→Stop smoke
0 real errors** (the A1 change is engine-wide, so smoked). The 7 MediaPipe executors + text-to-speech remain on
their own services (not this pattern); every swallowed *inference* catch across the AI family is now surfaced.

**▶ NEXT (maintainer-gated, unchanged):** A2 follow-through (registry-populated model selects + co-locate one AI
node end-to-end — needs a version bump + `migrate`); the catalog **derive** (`MODEL_REGISTRY_IMPL`, 5 forks,
AWAITING SIGN-OFF); `SECURITY_MODEL` steps 2–6; BLE/Serial/MIDI protocol drift.

---

## 2026-06-30 (later 18) — corrected the empty/invalid-input clear regressions (the later-17 fix was wrong)

Ran a second adversarial-audit workflow (8 executor comparisons vs their **true git originals** →
adversarial refute → 3 cross-cutting dimensions) over the later-17 regression fixes **before**
committing. It found the fixes — and the later-17 audit that prescribed them — targeted the **wrong
contract**. later-17 pattern-matched every executor to text-generation's `triggered && !input ? zero :
cached` shape without reading each executor's actual pre-migration code. Reading the real originals
(`git show <migrate-commit>^`) proves the truth: sentiment / feature-extraction / text2text / image-
captioning / VLA all cleared their domain ports **unconditionally on empty/invalid input** (gated on
model-*loaded*, never on a trigger). So the later-17 fixes only restored the *with-trigger* half and left
the common **no-trigger** path serving stale.

**Corrected (all 5, `src/renderer/engine/executors/ai.ts`), each verified against its git original:**
- **sentiment-analysis** (fa18a06^) & **feature-extraction** (0a95293^) — original clears domain ports on
  BOTH not-loaded and empty text. Fix: `!text.trim() ? zero : (result ?? …)` (dropped the trigger gate).
- **text2text / textTransformationExecutor** (0a95293^) — **missed entirely by later-17.** Original clears
  `result` on empty text after the model-loaded gate. Fix: `!text.trim() ? '' : (result ?? '')`.
- **image-captioning** (fa18a06^) — original cleared `caption` on ANY `!imageData` (absent AND unsupported);
  later-17's `imageInput && !imageData` missed the **absent-image** case. Fix: clear on `state !==
  'not-loaded' && !imageData`, flag `error` only when `imageInput` is present.
- **VLA** (0a95293^) — an **unfound regression** (I never touched it; the migration introduced it). Original
  cleared `action` via `emit('', false)` on bad image; migrated code served a **stale action** — audit rated
  HIGH (a VLM-as-policy node could drive an action off a frame that no longer exists). Fix mirrors captioning.

**Confirmed NOT regressed (leave alone):** **text-generation** — its original genuinely IS trigger-gated
(without-trigger serves cached, with-trigger+empty clears); current preserves it. **image-classification** &
**object-detection** — both original and current SERVE cached on bad image, trigger-agnostic; no domain-port
change. **A1 coercion guard** (`typeof softErrorValue === 'string' …`) — audit dimension rated clean (no
executor emits a non-string `error`/`_error`; the `error:0` ?? shadow is latent-only, unreachable today).

**Tests reworked** (`ai-vision-text.test.ts`, `ai-text-vla.test.ts`) — the later-17 tests *encoded the bug*
(they asserted "blank text without trigger serves cached"). Now assert **unconditional clear** (with AND
without trigger), plus new **absent-image** (captioning) and **VLA bad/absent-image** coverage.
**Mutation-verified 5/5** (each fix reverted → exactly its own test reds → restored via `perl`, never `git
checkout`).

**Verification.** typecheck clean · lint 0 err (49 warns) · `test:unit` **1735 → 1737** · smoke skipped
(logic-only output-mapping; no lifecycle/registration/render change). **Meta-lesson:** an audit that reasons
from a *sibling's* contract instead of reading the subject's own original will confidently prescribe the
wrong fix — read the real pre-migration code per executor.

**▶ Deferred (out of scope, unchanged):** model-NOT-loaded now serves cached instead of hard-clearing domain
ports (intentional step-A `runModelInference` behavior; practically unreachable since models don't unload) ·
`disposeAINode` prefix bug (dead code) · the `error:0` coercion shadow.

---

## 2026-06-30 (later 17) — adversarial audit of step A (no code change)

Ran a 5-reviewer → adversarial-verify → synthesize audit workflow over the step-A diff
(`3dbd413..e0fda5a`, A1 + A2-core + the 8 `runModelInference` migrations + STT).
**Bottom line: step A is structurally sound — no critical/high, no blocker.** 7 findings
confirmed (all medium/low), 4 candidate claims refuted as not-bugs. One reviewer
(test-adequacy) failed its schema retries, so those gaps are filled from author knowledge
below — treat that dimension as un-audited by the workflow.

**REGRESSIONS I INTRODUCED (must-fix — my "behavior-preserving" claim was wrong here).**
Three migrated executors dropped the original's *clear-outputs-on-empty/invalid-input*
contract that text-generation/text2text kept (`triggered && !input ? <zero> : result`):
- **sentiment-analysis** (`ai.ts:481-484`) — empty-text trigger emits the *cached* sentiment/
  score/positive/negative instead of zeroing. Fix: gate on `hasTriggerValue(trigger) && !text.trim()`.
- **feature-extraction** (`ai.ts:~575`) — empty-text trigger emits cached embedding, not `[]`.
- **image-captioning** (`ai.ts:517`) — unsupported/invalid image keeps the stale caption
  (old code set `caption:''`). Note `image-classification`/`object-detection` are CORRECT —
  their originals *also* served cached on bad image (refuted claim), so don't "fix" those.

**ROBUSTNESS (should-fix, cheap).**
- **A1 soft-error coercion** (`ExecutionEngine.ts:~512`) — `String(softErrorValue)` turns a
  non-string `error`/`_error` (`0`/`false`/`{}`) into `'0'`/`'[object Object]'` on the badge.
  Harden to `typeof softErrorValue === 'string' && softErrorValue !== '' ? … : null`.
- **`FakeImageData` test mocks** (`tests/unit/executors/live-detection.test.ts`,
  `opencv.test.ts`) only accept `(w,h)`, diverging from setup.ts's dual-signature
  `MockImageData`; latent footgun if those paths gain 3-arg coverage.

**PRE-EXISTING latent (NOT from step A — fix opportunistically).**
- **`disposeAINode` prefix bug** (`ai.ts:~2265`) — `k.startsWith(nodeId)` (no `':'`) can wipe a
  sibling node `abcd` when disposing `abc`. Same class as the resolved [[latch-nanoid-underscore-split]]
  bug; `gcAIState` already does it right (`split(':')[0]`). `disposeAINode` is dead code today.
- **`disposeAINode` misses `liveDetectState` cleanup** (THREE.Texture GPU leak if ever wired).

**TEST GAPS (test-adequacy reviewer failed; from author knowledge).** Image-executor *success*
paths (image-classification/captioning/object-detection/VLA valid-image → output mapping) are
NOT unit-tested (happy-dom ImageData fragility) → labels/caption/objects/count mapping is
unverified (simple, low-risk, but unproven). `progress` is asserted nowhere; interval-throttle /
`started`→lastFrame is untested (tests use `frameCount:0`); STT continuous/vad error paths untested.

**Verified CLEAN (so coverage is known):** new `runModelInference` cache keys are properly
`${nodeId}:`-prefixed and covered by `gcAIState`/`disposeAllAINodes`; STT error read-ordering
(after early returns) is correct; no orphaned pre-migration cache keys; object-detection
cached-value handling matches the original.

**▶ Recommended first actions next session:** fix the 3 regressions + the A1 coercion guard in
one commit, add a regression test asserting each empty/invalid-input trigger zeroes its
executor's outputs, then mutation-verify. The pre-existing `disposeAINode` items + the image
success-path tests are lower priority.

---

## 2026-06-30 (later 16) — step A continued: runModelInference + AI executor migrations

Built the shared `runModelInference()` helper (top of `engine/executors/ai.ts`) and
migrated the AI executors whose shape fits it — discrete request→single-result
inference. Every migration deletes the copied model-gate + preamble + the
**silently-swallowed catch**, so an inference exception now surfaces on the public
`error` port (→ node badge via A1), and declares the standardized
`progress`/`done`/`error` ports. All authored Moheeb Zara, no AI attribution.

**Helper contract.** `runModelInference(ctx, outputs, { task, infer, shouldRun,
notLoadedMessage? }) → { result, state, started }`. Resolves the `model` control,
gates on load, dedups in-flight ops via `pendingOperations`, latches loading/progress/
done/error into `outputs`, returns the cached result for domain mapping. `started`
lets interval/text-change executors update their throttle bookkeeping. Per §3 it now
distinguishes a **downloading** model (spinner via `loading`, no error — the Q3
transient) from a not-loaded one (needs-user-action error) — generalizing VLA's old
bespoke logic to every node. State lives in the existing `nodeCache`/`pendingOperations`
(keyed `${nodeId}:…`), so `disposeAINode`/`gcAIState` clean it up unchanged.

**Migrated (8), one cluster-commit each:** `4c67ef4` text-generation (+ helper) · `fa18a06`
image-classification + sentiment + image-captioning (+ `started`, + an `ImageData`
polyfill in tests/setup for happy-dom) · `0a95293` VLA + feature-extraction + text2text
(+ downloading-transient + `notLoadedMessage`; updated pre-existing vla.test.ts `_error`→
`error`) · `c291d28` object-detection.

**NOT migrated to the helper (don't fit discrete inference — documented in c291d28):**
`object-detection-live`, `object-detection-yolo`, `depth-estimation` are continuous
**texture-render** nodes (per-frame redraw into a held THREE.Texture; depth has no
model-loaded gate). The 7 **MediaPipe** executors + **text-to-speech** use different
services entirely. **STT** (speech-recognition) is real-time streaming audio with
VAD/manual/continuous modes and stateful `fullText` accumulation. ALL still benefit from
A1's badge latch for their existing `_error` states.

**STT — targeted fix (`800451b`).** Since STT doesn't fit the helper, its swallowed
transcription catch was surfaced directly: cache the message → new public `error` port
(cleared on next success), audio/VAD/mode logic untouched, transient connecting/no-audio
left on `_error` (status-not-error split). The texture-render nodes' swallowed catches
remain the only unsurfaced ones.

**Verification.** typecheck clean · lint 0 err · `test:unit` **1708 → 1731** (+23, +5 test
files) · build ok · boot→Play→Stop smoke 0 errors. Mutation-verified per cluster
(error-latch, downloading-transient, input-error precedence, STT catch) by hand-edit
(never `git checkout`).

**▶ NEXT (maintainer-gated).** (a) The texture-render nodes' swallowed catches, if wanted,
need a separate pattern (they have no fire-and-latch result). (b) A2's
`model` select auto-population from the model registry (still empty placeholder) +
co-locating an AI node through `defineNode({models})` end-to-end (needs version bump +
migrate for the new control). (d) The model-derive (MODEL_REGISTRY 5 decisions) and
connection-security 2–6 remain sign-off-gated.

---

## 2026-06-30 (later 15) — Phase 2 committed + step A (auto AI loading/error outputs) A1+A2-core

**Committed the whole Phase-2 changeset** (was dirty across sessions 10–14) as a dependency-ordered
5-commit split on `phase0-file-format`, then built the first two slices of step A. All commits authored
Moheeb Zara, no AI attribution.

**Phase-2 commits (5):** `c03a850` protocol+ConnectionHandle scaffold (defineProtocol/protocolRegistry +
no-secret handle + `ctx.connection()`) · `be45ad5` co-locate built-ins into the glob registry (index.ts →
`colocatedProtocolTypes`, set-equality gate) · `c518efc` mqtt on handle · `fd7c945` ws+http on handle
(shared throttle now in `engine/connection.ts`; http keeps its no-connection fetch fallback) · `3dbd413`
inert `defineModel` scaffold + the two decision memos + this handoff.

**Step A — design pass first** (multi-agent workflow mapped 4 surfaces). Load-bearing finding: `defineNode`
was identity and **no AI node flows through it** (all are plain `NodeDefinition` in `allNodes`), and `_error`
is set in ~25 ai.ts sites but read nowhere — the badge only reflected *thrown* errors. So A splits into a
runtime latch (A1) + declarative derivation (A2). Maintainer chose **A1 first, public wireable `error` port**.

- **A1 `5ea7fe6` — soft-error badge latch.** `ExecutionEngine.executeNode` now latches
  `outputs.get('error') ?? outputs.get('_error')` into `lastError` via `updateNodeMetrics({softError})`
  (runtime.ts). Public `error` wins over legacy `_error`; does NOT push to `errors[]` or inflate
  `errorCount` (steady-state status, not a crash); clears on the next clean frame. Lights up every existing
  `_error` writer across **all** executor families with zero per-executor change. +5 tests
  (`ExecutionEngine.test.ts`), mutation-verified (hand-edit, not checkout), browser smoke boot→Play→Stop 0
  errors.
- **A2-core `8df2900` — `defineNode` model derivation.** A spec declaring `models` gets the canonical
  `loading`/`progress`/`done`/`error` outputs + a `model` select appended (dedup by id, idempotent,
  order-stable). Strict no-op without `models` → non-AI library byte-identical; **inert** (no node sets
  `models` yet). +5 tests, mutation-verified, build ok. Select options populate from the model registry later.

**Verification.** typecheck clean · lint 0 err · `test:unit` **1698 → 1708** (+10) · build ok · A1 smoked.

**▶ NEXT — step A continuation (A2 migrations), maintainer-gated.** Build `runModelInference()` (the shared
inference preamble: model resolution + loading/progress/done/error latching, per
`MODEL_REGISTRY_IMPL` design §3) then migrate the ~12 ai.ts executors one green, smoked commit at a time.
**Open design fork (Q3):** transient states ("Connecting to audio source…", ai.ts:880,2317) → route to
`loading`+status, NOT `error` (recommended). Each migration also surfaces the currently-swallowed inference
`catch` blocks as real `error`. The model-derive (MODEL_REGISTRY 5 decisions) and connection-security 2–6
remain separately sign-off-gated.

---

## 2026-06-30 (later 14) — Phase 2: `defineModel` + `modelRegistry` scaffold (step 7 foundation)

Pivoted to step 7 (Phase C, parallel to step 6 which is at a natural stopping point — its leftovers are
maintainer-sensitive/hardware-bound/Phase-E). Built the **additive, inert** model-registry scaffold,
mirroring the 6a protocol scaffold exactly. **NOT committed.**

**What landed:**
- **`services/ai/defineModel.ts`** — `ModelSpec` (`id`/`name`/`family:'transformers'|'webllm'|'mediapipe'`/
  `task`/`size`/`license?`/`supportsWebGPU?`/`load?.promptFormat?`) + `defineModel` identity fn. Frozen
  public contract; metadata-only (never imports the heavy runtime).
- **`services/ai/modelRegistry.ts`** — globs `models/**/*.model.ts` (eager, default-export, dup-id +
  missing-default + structural throws). Files are free-slug-named (model ids contain `/`); keyed by
  `spec.id`. Exports `modelSpecs`/`colocatedModelIds`/`colocatedModelSpecs`. **Inert** (zero files) — the
  three catalogs stay authoritative.
- **`tests/unit/services/ai/modelRegistry.test.ts`** (5) — count guard + no-orphans vs the live catalogs
  union (`AI_MODELS` defaults+alternates ∪ `WEBLLM_MODELS`), valid-family/task structural check, and the
  **prompt-format contract** (every co-located `text-generation` spec declares `load.promptFormat`).
  Mutation-verified (4 cases via a temp `models/` dir, removed with `rm` — not `git checkout`): orphan id →
  count/orphan red; text-gen missing `promptFormat` → contract red; duplicate id → dup throw; valid → green.
- **`defineModel.ts` + `defineNode.ts`** — added `ModelRequirement` (`{task, selectable?}`) and the
  `NodeSpec.models?: ModelRequirement[]` field (the §3 declarative-capability surface a node uses to declare
  a model need — the analogue of `connections?`). Additive/inert (the auto `model` select + load/error
  outputs derive from it later); `defineNode.test.ts` +1 (preserves connections + models). Type-only import,
  no cycle (`defineModel.ts` imports nothing).

**Verification.** typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit` **1692 → 1698** (+6,
+1 file) · build ok. Additive/inert → no runtime path touched, no smoke needed (as with 6a).

**▶ NEXT (sign-off-gated derive — `docs/plans/MODEL_REGISTRY_IMPL_2026-06-30.md`).** The per-model→per-task
rollup has real forks (task-wrapper metadata location, default/order reproduction for the deep-equal gate,
MediaPipe's weak fit, whether the auto loading/error-output `defineNode` work lands here or separately,
first-PR scope). Surfaced for maintainer decision before deriving `AI_MODELS`/`WEBLLM_MODELS`. The
higher-value half — auto `loading/progress/done/error` outputs + `runModelInference` latching the real error
(fixing the dead-`_error` for every AI node) — is independent of the catalog derive.

---

## 2026-06-30 (later 13) — Phase 2: ws + http migrated to `ctx.connection()` (6b complete for the three protocols)

Applied the proven mqtt pattern to WebSocket + HTTP (the approved typed-handle design; no new sign-off
needed). **NOT committed.**

**What landed:**
- **`ConnectionHandle.ts`** — added `createWebSocketHandle` (forwards `send`/`onMessage`) and
  `createHttpHandle` (forwards `request`/`executeTemplate`, signatures matched to `HttpAdapterImpl`); wired
  both into `createConnectionHandle`'s switch. This closes the latent footgun where ws/http fell through to
  the capability-less base handle. `baseUrl`/auth-headers/url/token never reachable.
- **`executors/websocket.ts`** — migrated to `ctx.connection<WebSocketHandle>({ protocol:'websocket' })`;
  deleted `getWebSocketAdapter`/`ensureConnected`/local throttle/`useConnectionsStore`+adapter imports. The
  `nodeListeners` store (dispose = unsubscribe) is unchanged — ws has no topic-level sub, so no `releaseTopic`.
- **`executors/http.ts`** — connection path migrated to `ctx.connection<HttpHandle>({ protocol:'http' })`;
  deleted the same helper block. **The no-connection direct-`fetch` fallback (`executeDirectRequest`) + the
  rising-edge/in-flight gating + `httpCache` are untouched.**
- The auto-connect throttle now lives once in `engine/connection.ts`, shared across mqtt/ws/http.

**Tests.** `ConnectionHandle.test.ts` +2 (ws: send/onMessage forward, config/token hidden; http:
request/executeTemplate forward, auth headers hidden). `websocket-throttle.test.ts` rebuilt to route through
`createExecutionContext` so it validates the *relocated* shared throttle via the real `ctx.connection` (3
cases: ≤once/2s while down, stops when connected, rewire releases old listener once — all preserved).
`http.test.ts` unchanged behavior (its cases only hit the direct-fetch/no-connection paths, so
`ctx.connection` is never reached; added a `connection: () => null` stub for shape safety).

**Verification.** typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit` **1690 → 1692** (+2) ·
build ok · **smoke** boot→Play→Stop **0 real errors**, 5 protocols register, canvas identical.

**▶ NEXT.** The three persistent/request protocols are now on `ctx.connection()`. Remaining Phase-2
connection work: deferred SECURITY_MODEL steps 2–6 (capability-declaration enforcement, trust-tier tagging
beyond the handle, Community approval + CSP `connect-src`); adapter physical co-location into
`protocols/<name>/`; BLE/Serial/MIDI drift fix (register + add adapters). Or pivot to step 7 (`defineModel`).

---

## 2026-06-30 (later 12) — Phase 2: `ctx.connection()` + no-secret `ConnectionHandle` — mqtt slice (6b)

Maintainer signed off the impl memo (`docs/plans/CONNECTION_HANDLE_IMPL_2026-06-29.md`): **typed
per-protocol handles**, **HTTP gets a handle too**, **mqtt-first**. Built the mqtt slice. **NOT committed.**

**What landed:**
- **`services/connections/ConnectionHandle.ts`** — `ConnectionHandle` base (protocol/status/onStatusChange)
  + `MqttHandle`/`WebSocketHandle`/`HttpHandle` interfaces; `createConnectionHandle(adapter)` returns the
  protocol's no-secret wrapper (mqtt concrete; ws/http fall back to base until their executors migrate). The
  adapter is closed over, never returned; **no `config`/url/token/adapter reachable**.
- **`engine/connection.ts`** — `resolveConnectionHandle(read, opts)`: the one shared connection lookup
  (replaces the ~50-line `getXAdapter`/`ensureConnected` block the three executors each copied). Resolves the
  id from control/input (default `connectionId`), optional protocol assert, **shared auto-connect throttle**
  (2s), WeakMap handle cache. Synchronous + fire-and-forget connect (the old awaited connect could block a
  frame; this no longer does — executors already serve last-value until `status==='connected'`).
- **`ExecutionEngine.ts`** — added `ctx.connection<T>(opts?)` to `ExecutionContext` (+ `'connection'` to the
  `ExecutionContextData` Omit) wired in `createExecutionContext`. The engine already imports Pinia stores, so
  the connection-store dependency is consistent (no purity regression).
- **`executors/mqtt.ts`** — migrated to `ctx.connection<MqttHandle>({ protocol:'mqtt' })`; deleted
  `getMqttAdapter`/`ensureConnected`/the local throttle. Sub entry gains `releaseTopic` (captured
  `handle.unsubscribe(topic)` closure) so teardown needs no live ctx; rewire/clear/gc semantics preserved
  verbatim (`set()` doesn't dispose the overwritten entry — verified in `nodeState.ts`). **CLASP/ws/http
  untouched.**

**Tests.** New `ConnectionHandle.test.ts` (3): no-secret invariant (no config/credentials/adapter reachable,
JSON has no secret), curated-op forwarding, live status getter. `mqtt-teardown.test.ts` rebuilt to route
through `createExecutionContext` (exercises `ctx.connection` end-to-end against the mocked store) + a
`nodeSubscriptions.size===0`-after-gc leak assertion. **Both gates mutation-verified** (leaking `config`
through the handle → no-secret red; dropping `releaseTopic` from dispose → clear/gc teardown red).

> Process note: a `git checkout` during mutation-verify reverted the *tracked* `mqtt.ts` to HEAD (wiped the
> migration) and couldn't touch the *untracked* `ConnectionHandle.ts` (left the mutation in). Both repaired +
> re-verified. Lesson: never `git checkout` files with uncommitted work to undo a mutation — edit it back.

**Verification.** typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit` **1687 → 1690** (+3,
+1 file) · build ok · **smoke** boot→Play→Stop **0 real errors**, 5 protocols register, canvas identical.

**▶ NEXT.** ws + http migrate to `WebSocketHandle`/`HttpHandle` against this proven pattern (http keeps its
no-connection `fetch` fallback). Then the deferred SECURITY_MODEL steps 2–6 (capability enforcement, Community
approval + CSP), adapter physical co-location, BLE/Serial/MIDI drift fix.

---

## 2026-06-29 (later 11) — Phase 2 START: `defineProtocol` scaffold (6a) + glob-authoritative registration (6b registration half)

Branch **`phase0-file-format`** (maintainer chose to continue here, not merge→`main`+rebranch — recorded
for the eventual merge). Began Phase 2 (register-once subsystems) with the **additive, zero-behavior-change**
protocol-registry scaffold (EXTENSIBILITY §7, ROADMAP step 6a), mirroring exactly how Phase 0 added
`defineNode`/`nodeRegistry`. Read the real `ConnectionTypeDefinition` (`types.ts:203-224`) +
`mqttConnectionType` shape (`MqttAdapter.ts:228-379`) + `registerBuiltInTypes()` (`index.ts:79-93`) FIRST so
the type matches. **NOT committed.**

**What landed (3 new files, additive — nothing imports them yet, so production behavior is unchanged):**
- **`services/connections/defineProtocol.ts`** — identity function that brands the existing
  `ConnectionTypeDefinition` as the single authored unit (the `defineNode` analogue for protocols).
  Generic over `TConfig extends BaseConnectionConfig`. Frozen-public-contract doc (POLICIES §2); notes the
  capability/trust-tier metadata (SECURITY_MODEL) arrives in a later, sign-off-gated step.
- **`services/connections/protocolRegistry.ts`** — globs `./protocols/<name>/protocol.ts`
  (eager, `import:'default'`), dup-id throw + missing-default throw at module load. Exports `protocolSpecs`,
  `colocatedProtocolIds`, `colocatedProtocolTypes` (the array `registerBuiltInTypes()` will loop over in 6b).
  Mirrors `registry/nodeRegistry.ts` line-for-line. **Inert today** — zero `protocol.ts` files exist, so the
  hand-wired `registerBuiltInTypes()` list stays authoritative.
- **`tests/unit/services/connections/protocolRegistry.test.ts`** — the protocol-count gate (5 cases),
  mirroring `nodeRegistry.test.ts`: dup-id/missing-default (meaningful immediately, run at load), no-orphans
  vs the built-in id set (derived live from the 5 `*ConnectionType` objects, can't drift), and the count
  guard `≤` built-in count with a `TODO(6b)` to tighten to `toBe` once protocols are co-located.

**Gate mutation-verified (4 cases, dir created+removed under `protocols/`):** (A) a valid
`protocols/mqtt/protocol.ts` re-exporting `mqttConnectionType` → collects, count+orphan pass (proves the glob
is live, not vacuous); (B) orphan id → no-orphans case red; (C) named-only export → missing-default throw with
actionable message; (D) two folders, same id → dup throw with actionable message. `protocols/` dir deleted
after; tree is exactly the 3 new files.

**Then — step 6b registration conversion (the security-INDEPENDENT half; "audit and proceed").** Made the
glob authoritative so the scaffold is no longer inert:
- **5 new `protocols/<name>/protocol.ts`** (clasp/websocket/mqtt/osc/http) — each a thin unit re-declaring the
  existing `*ConnectionType` through `defineProtocol`, importing from `adapters/<Name>Adapter.ts`. The adapter
  class + config stay put (physical co-location into the folder deferred to the Phase-E move). CLASP is
  co-located for *registration* (it stays exempt from the future `ctx.connection()` helper).
- **`connections/index.ts` `registerBuiltInTypes()`** now loops over `colocatedProtocolTypes` from the glob
  instead of 5 hardcoded `registerType` calls (dropped the second `*ConnectionType` import block; the public
  barrel re-export block is untouched). One folder = one protocol; no edit here.
- **Gate tightened** to set-equality (`new Set(colocatedProtocolIds)` === built-in id set, derived live from
  the 5 `*ConnectionType` objects) + a new integration case asserting the manager actually registers every
  co-located protocol (proves the loop is wired, not just that the glob collects). Mutation-verified: removing
  one `protocol.ts` reds the count gate; restore → green.
- **Contained/low-risk (verified):** the `*ConnectionType` objects are imported ONLY in `connections/index.ts`;
  `ConnectionManager.test.ts` uses the RAW `getConnectionManager` (no built-ins) so it's insulated. Only
  visible change is protocol-picker order (now glob-sorted: clasp/http/mqtt/osc/websocket) — cosmetic.

**Verification (whole entry).** typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit`
**1682 → 1687** (+5, +1 file; net unchanged across the 6b rework — replaced the orphan case with the
registration-wiring case) · build ok. **Smoke (Playwright + system Chrome, boot→Play→Stop):** all 5 protocols
registered at runtime via the glob (`["clasp","http","mqtt","osc","websocket"]`), log "initialized with 5
built-in types", **0 real console errors**, canvas renders identically to baseline. **NOT committed.**

**▶ NEXT — step 6b `ctx.connection()` + the security mechanism (GATED on maintainer sign-off).** Implement the
context helper once at `ExecutionEngine.ts:378` (resolves id from control/input, auto-connects, shared
throttle), replacing the ~50-line `getMqttAdapter`/`ensureConnected` block in `mqtt.ts`/ws/http. **Decision to
settle first (SECURITY_MODEL):** `ctx.connection()` should return a no-secret `ConnectionHandle`
(`send`/`subscribe`/`status`, broker holds the credential), NOT a raw adapter — the kickoff's "returns the
adapter" framing conflicts with SECURITY_MODEL step 1. Confirm that shape (+ trust-tier tagging,
Community-tier CSP `connect-src`) before wiring. Gate: subscribe/unsubscribe leak test. Adapter physical
co-location + BLE/Serial/MIDI drift fix are separate follow-ups once the folder pattern is blessed.

---

## 2026-06-29 (later 10) — Audit checkpoint: Phase 1 verified COMPLETE (no code change)

Stepped back to adversarially audit the `(later 9)` heavy-tier migration + `_`-split fix. **All checks
pass; Phase 1 is complete** (modulo `subflow`, deferred to Phase 7). No code changed this entry.

**Critical check — is the migration genuinely wired, or silently leaking?** A `defineLifecycle`-wrap
removes the explicit engine `disposeAll*` call and relies on the generic loop; a smoke test catches a
*throwing* teardown but NOT a *missing-but-silent* one. Confirmed the production path: `useExecutionEngine.ts:26`
calls `engine.registerLifecycles(collectedLifecycles())` with the **live array by reference**, so every
self-registered lifecycle (incl. visual/3d/connectivity/clasp) is genuinely drained by the engine's
gc/disposeAll/onStart loops. Wired, not leaking. ✓

**Other audit results:**
- **Only `subflow` remains hand-wired** in `ExecutionEngine` (`gcSubflowState` + `clearAllSubflowContexts`);
  every other category is on the generic loop. ✓
- **Audio `_`-split fix — suffix set is COMPLETE.** Full re-grep of every `audioNodes`/`getOrCreateNode`
  key: bare id + exactly `_{input,fft,gain,meter,output}`; the multiline comp/dist/crusher calls use the
  bare id. `audioNodeBaseId`'s regex covers all five. ✓
- **Node ids are 21-char `nanoid()`** (`flows.ts`), fixed-length → `shaderCacheKeyOwned`'s `${id}_` prefix
  match is unambiguous; and the fix degrades gracefully (worst case a rare false-keep, never the old
  false-DELETE of live state). ✓
- **Both GC helpers mutation-verified** — reverting either to the old `split('_')[0]` reds the regression
  test (audio: 3 cases; visual: 3 cases, incl. the bare-id-with-underscore case the old code also broke). ✓

**State:** typecheck clean · lint 0 err · `test:unit` 1682 + 11 todo · build ok · tree clean. **Phase 1
DONE; next is Phase 2** (register-once subsystems — `defineProtocol`/`defineModel`/connection security).
See `docs/handoff/NEXT_SESSION_KICKOFF.md` for the Phase-2 entry.

---

## 2026-06-29 (later 9) — Heavy-tier migration FINISHED (22/23) + `_`-split GC bug fixed

Branch **`phase0-file-format`** (continuing). Completed the leak-class kill: the 4 remaining heavy
categories converted, and the latent `_`-split GC bug fixed. **Phase 1 is now ~95% — only `subflow`
(deferred to Phase 7) is still engine-hand-wired.** Three commits, each verified + in-app smoke'd.

**(1) `780e46b` — visual/3d/connectivity/clasp → `defineLifecycle`** (the last 4 hand-wired categories).
Each self-registers its UNCHANGED `gc`/`disposeAll` (behavior-identical wrap, no marker/onStart needed —
none have asymmetric teardown). `ExecutionEngine` now hand-wires **only `subflow`** (+ node-metrics)
alongside the generic gc/disposeAll loops; removed 4 imports + 4 gc calls + 4 disposeAll calls + the stale
comment block. `engine-leak.test`'s self-registration guard now asserts all **8** heavy-tier labels.
State-group migration: **18/23 → 22/23.**

**(2) `04e2cd0` — fix GC disposing LIVE audio/visual state for underscore node ids**
(the [[latch-nanoid-underscore-split]] latent bug, now RESOLVED). `gcAudioState`/`gcVisualState` derived
the owning id via `key.split('_')[0]`, but ~26% of nanoid ids contain `_` → live node truncated → its
Tone graph / compiled shader material disposed on ANY unrelated node removal (self-healed next frame, but
glitched). Fix: `audioNodeBaseId()` strips the complete known suffix set (meter/gain/input/fft/output);
`shaderCacheKeyOwned()` keeps a key when a valid id owns it (exact or `${id}_` prefix, mirroring
`disposeVisualNode`). New regression test (7 cases, mutation-verified). Other gc maps keyed on the bare id
— unaffected.

**Verification.** typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit` **1675 → 1682**
(+7 regression) · build ok. In-app smoke (Playwright + system Chrome, boot→Play→4s→Stop): **0 real console
errors** after both the conversions and the GC fix; screenshot confirms 3D/scope/EQ/webcam/output render
identically to the pre-change baseline. Smoke recipe + reusable `smoke.mjs`: [[latch-smoke-test-harness]].

**Phase-1 status now:** de-monolith split DONE · all 4 CI gates DONE (incl. export gate) · heavy-tier
migration **22/23** (only `subflow` deferred) · `_`-split bug RESOLVED. **Remaining for Phase 1 close-out:**
`subflow` migration is intentionally deferred to its Phase-7 rebuild — so Phase 1 is effectively complete
pending that decision. A *later* refinement pass could convert the `defineLifecycle`-wrapped categories
into per-map `defineNodeState` stores for intra-category leak-safety (touches teardown; wants in-app
worker/GPU verification) — optional, not blocking.

---

## 2026-06-29 (later 8) — De-monolith split FINISHED (`executors/index.ts` 1482 → 241 lines)

Branch **`phase0-file-format`** (continuing). Completed Phase-1 deliverable (4): the remaining inline
groups in `executors/index.ts` are extracted into their own category files; `index.ts` is now a thin
**barrel + registry** (241 lines: preamble imports, the documented re-exports, the `builtinExecutors`
map). Guarded by the `(later 7)` export gate the whole way. Tests: typecheck clean · lint 0 err (49
pre-existing warns) · `test:unit` **1675** (unchanged — no test lost; the gate + math/timing/console/leak
tests all pass against the new structure, proving the barrel contract survived) · build ok.

**What landed (NOT committed):** 7 new files, all **verbatim slices** of the inline code (no logic change),
each with its own imports:
- `input.ts` (constant/trigger/textbox/slider/knob/xy-pad/keyboard/time/lfo)
- `math.ts` (arithmetic + advanced: add…modulo, lerp…wrap; `smoothState`)
- `logic.ts` (compare/and/or/not/gate/select/switch; `gateLastValue`)
- `timing.ts` (start/interval/delay/timer/metronome/step-sequencer + their state stores)
- `debug.ts` (monitor/oscilloscope/graph/equalizer/console; Tone analysers + `disposeAnalyzer`)
- `rag.ts` (retrieve/vector-memory; `VectorStore`/`cosineSimilarity`)
- `webllm.ts` (llm; `webLLMService` + its `defineLifecycle` cleanup)

`index.ts` now: drops the 7 imports that were only used by the moved code (Tone, `defineNodeState`/
`defineLifecycle`, `cosineSimilarity`/`VectorStore`, `webLLMService`, `DEFAULT_WEBLLM_MODEL`, and the
value-side `ExecutionContext`); imports the executors the registry references from the new files;
`export *`s each group so the public barrel keeps exposing their executors + state stores. `builtinExecutors`
is unchanged (still references every executor by name; the already-extracted categories still spread in).

**Why one commit:** the slices are behavior-identical and the split is revertible as a unit (revert →
monolith). Pattern mirrors the 24 categories extracted earlier. `defineNodeState`/`defineLifecycle`
registrations still fire at barrel load (same timing as before — they were always module-level).

**Phase-1 status now:** de-monolith split **DONE**; export gate **DONE**; leak gate / pure-set gate DONE.
Remaining Phase-1 work: the **4 heavy state-group conversions** (visual/3d/connectivity/clasp via
`defineLifecycle`-wrap, smoke-verified) + the latent `_`-split fix (fold into visual + patch audio).
`subflow` stays deferred to Phase 7.

---

## 2026-06-29 (later 7) — Must-not-break export-list gate BUILT (closes the headline Phase-1 gap)

Branch **`phase0-file-format`** (continuing). Built the CI gate the `(later 6)` audit flagged as the
clearest skipped Phase-1 deliverable (POLICIES §1 "Must-not-break export list"). **No production source
changed** — fixture + test only. Tests: typecheck clean · lint 0 err (49 pre-existing warns) ·
`test:unit` **1616 → 1675** (+59 cases, +1 file) · build unaffected (tests excluded from the build graph).

**What landed (NOT committed):**
- **`tests/contracts/public-exports.ts`** — the checked-in fixture POLICIES §1 names verbatim. A pure-data
  `PUBLIC_EXPORT_CONTRACT: ExportContract[]` mapping each public module → the named exports that must
  resolve. Scope = the genuine **governed** contract surface (NOT every executor): (1) the
  `@/engine/executors` barrel surface the split must keep re-exporting — `builtinExecutors`, the 14
  "external use" cleanup utils, the moved groups' state stores + debug/RAG/LLM executors; (2) **every name
  PRODUCTION `src/` code imports from a per-category path** — `emulation`
  (registerEmulatorNode/unregisterEmulator/getEmulatorLoader, via EmulatorNode.vue), `clasp`
  (disposeAllClaspConnections/gcClaspState, via ExecutionEngine), `easing`(EASINGS), `noise`(fbmNoise),
  `euclidean`(bjorklund), `color-ramp`(PALETTES/sampleStops) — the preview components + engine; (3) the
  leak-gate store paths (`spring`/`signal`/`gamepad`); (4) `CUSTOM_NODE_TYPE_IDS`. Deliberately excluded
  (documented in the header): individual math/logic/timing executors that only flow through
  `builtinExecutors` (owned by the registry-count gate; their by-name barrel imports are self-guarding via
  math/timing tests), and test-only deep imports into stable per-category files (self-guarding).
- **AUDIT (this session) found + closed a completeness hole:** the first cut pinned only `spring`/`signal`/
  `gamepad` among per-category paths. A clean re-grep of all `from '@/engine/executors/<cat>'` imports
  surfaced **6 production `src/` consumers** (the previews + EmulatorNode + ExecutionEngine's clasp
  cleanup) that were unprotected — the true external surface, where a refactor could drop an export with
  its consumer and no in-repo test would notice. Added them as tier (2). Per-category loader path then
  re-mutation-verified (corrupted `EASINGS` name → that case red).
- **`tests/unit/contracts/public-exports.test.ts`** — the gate (under `tests/unit/**` so `test:unit`/CI
  actually runs it; the fixture stays at the POLICIES path `tests/contracts/`). Asserts every contract
  name resolves; a coverage check that fixture-modules === loader-modules; and a `builtinExecutors`
  non-empty-record-of-functions sanity. Uses static `import()` literals (so Vite resolves `@/` aliases)
  + a 30s timeout on the import-bearing cases (the barrel pulls Tone+three on first load).
- **Mutation-verified:** temporarily dropping the `gcEmulationState`/`disposeAllEmulationNodes`
  re-exports from `index.ts` turned the gate red with an actionable message ("...no longer resolves...
  update tests/contracts/public-exports.ts"); restored via `git checkout`. The gate genuinely catches
  the de-monolith-split breakage it exists to guard.

**Deviations recorded (defensible):** (1) POLICIES §1 writes the id-list module as `@/registry`, but
`CUSTOM_NODE_TYPE_IDS` actually lives at / is consumed from `@/registry/components` (the `@/registry`
barrel doesn't re-export it) — fixture pins the real path; noted in the fixture header. (2) Fixture path
(`tests/contracts/`) vs test path (`tests/unit/contracts/`) split is forced by the vitest include glob
(`tests/unit/**`); without it the gate would never run in CI.

**Phase-1 CI-gate compliance now:** registry count-equality ✓, format round-trip ✓, per-type leak ✓,
exact-pure-set ✓, **must-not-break export list ✓ (NEW)**, a11y lint — Phase 4. The `(later 6)` "✗ not
built" line is now closed.

**▶ NEXT (unchanged priority order, now that the guardrail exists):** (A) the 4 heavy conversions
(visual/3d/connectivity/clasp via `defineLifecycle`-wrap, one per green commit, smoke-verified; fold the
`_`-split fix into visual + patch audio) and (C) finish the de-monolith split of `index.ts` — the new
gate will catch a dropped re-export during (C). Commit only when asked.

---

## 2026-06-29 (later 6) — Deep audit + plan-adherence checkpoint (no code change)

Stepped back to audit the whole Phase-1 migration against `ROADMAP_2026-06-28.md` + `POLICIES`.
**Verdict: following the plan well on the headline goal (kill the leak class, test-driven, gates in
CI, no AI attribution), but Phase 1 is NOT complete — ~70%, with three real gaps.** A progress overlay
was added to the top of the ROADMAP.

**Where we are (overall ROADMAP Phase 0–9):** Phase 0 DONE. Phase 1 in progress (~70%). Phases 2–9 not
started. 54 commits on `phase0-file-format`, never below test baseline (1595→1616).

**Phase 1 — four deliverables, status:**
1. **State-group migration → generic lifecycle loop: 18/23 done.** Remaining 4 heavy (visual, 3d,
   connectivity, clasp) + subflow (deferred to Phase 7). Engine gc/disposeAll loops now hold only those.
2. **Per-type leak gate: DONE** (`engine-leak.test.ts`, in CI, mutation-verified). ✓
3. **Exact-pure-set gate: DONE** (`pure-node-types.test.ts`, pins 24); derive-from-`pure:true` correctly
   deferred to Phase-6 co-location. ✓
4. **De-monolith split of `executors/index.ts`: PARTIAL** — 24 category files extracted, but `index.ts`
   is still **~1482 lines** (input/timing/debug/math/logic/RAG/WebLLM + the `builtinExecutors` registry).

**GAPS found this audit (the honest "what's left in Phase 1"):**
- **Must-not-break export-list gate is NOT built.** POLICIES §1 specifies a checked-in fixture
  `tests/contracts/public-exports.ts`; the `tests/contracts/` dir does not exist. This is a Phase-1+ CI
  gate we skipped. Build it before/with the remaining de-monolith split (the split is exactly what could
  silently break a public export).
- **De-monolith split unfinished** (index.ts still monolithic for ~7 groups + the registry map).
- **4 heavy conversions remain** (visual, 3d, connectivity, clasp) — all `defineLifecycle`-wrap +
  run→stop smoke. subflow stays deferred to Phase 7.
- **Latent `_`-split bug** in gcAudioState/gcVisualState (see `(later 5)` + the
  [[latch-nanoid-underscore-split]] memory) — pre-existing, not from the migration; fold the fix into
  the `visual` conversion + patch `audio`.

**Plan-adherence notes / deviations (all defensible, recorded so they're not silent):**
- **`defineLifecycle`-wrap vs `defineNodeState` for the heavy tier.** The ROADMAP says "convert to
  `defineNodeState`"; for ordering-sensitive (audio Tone-sequence) / marker (opencv/ai disposedNodes) /
  asymmetric (emulation keep-on-stop) teardown, a blind store restructure risks real bugs, so we wrapped
  the unchanged functions via `defineLifecycle` (the documented escape hatch). This removes the
  hand-wiring (the leak-class kill) but leaves the *intra-category* leak risk (a future added map without
  gc) — a known tradeoff; a later pass can refine wrapped categories into stores with in-app verification.
- **Split deferred until after conversion** — deliberate: converted/wrapped categories move between files
  cleanly; engine-wired ones don't.

**CI-gate compliance (POLICIES §1):** registry count-equality ✓, format round-trip ✓ (golden), per-type
leak ✓ (new), exact-pure-set ✓ (new), **must-not-break export list ✗ (not built)**, a11y lint — Phase 4.

---

## 2026-06-29 (later 5) — `audio` → `defineLifecycle` + first in-app smoke verification

Branch **`phase0-file-format`** (continuing). **18/23 converted; 4 heavy + `subflow`(deferred) remain**
(visual, 3d, connectivity, clasp). Also: confirmed an **in-app browser smoke harness** works and used it
to verify this conversion end-to-end — see the [[latch-smoke-test-harness]] memory.

**`audio` via `defineLifecycle` (not `defineNodeState`):** audio has 8 per-node maps, but
`disposeAllAudioNodes` encodes a specific **Tone teardown sequence** (audioNodes first, then synth
voices / players / filters) and `audioNodes` uses **suffixed keys** (`${id}_meter`, gc'd via
`key.split('_')[0]`). Splitting into 8 independent stores could reorder disposal and break Tone graphs —
a subtle audio bug a smoke test can't catch (can't hear output). So wrap the unchanged
`gcAudioState`/`disposeAllAudioNodes` via `defineLifecycle`. Removed the 3 engine wirings; gc loop +
`stop()` now hold **4 heavy** + `subflow` (+ metrics). `engine-leak.test.ts`'s self-registration guard
now covers `audio` too. Tests: typecheck/lint/`test:unit` 1616 + build all green.

**Smoke harness PROVEN (the verification gap is closed).** Playwright + system Chrome (`channel:'chrome'`)
drive `npm run dev`. The first-visit Starter Flow (19 nodes, incl. Synth/Parametric-EQ/EQ/Audio-Output)
loads, then **Play → wait → Stop** exercises every converted category's runtime AND `stop()`'s
`disposeAll` loop. Result for the committed conversions AND this audio change: **0 real console errors**
through boot→run→stop (after filtering headless-Chrome webcam-permission noise + a benign MediaPipe
`INFO`). So the unit tests prove teardown FIRES; the smoke proves the conversion doesn't BREAK the app
(incl. the cleanup path). Recipe + noise filters: [[latch-smoke-test-harness]].

**Pattern now settled for the heavy tier:** `defineLifecycle`-wrap (keep the existing gc/disposeAll,
behavior-identical, smoke-verified) is the SAFE conversion for categories with ordering-sensitive /
asymmetric / marker teardown (emulation, opencv, ai, audio — all done). `defineNodeState` (restructure
into self-cleaning stores) is reserved for independent-per-node state (the sockets). The remaining 4
(visual/3d/connectivity/clasp) are WebGL/media/MIDI-BLE — `defineLifecycle`-wrap each, smoke-verify
run→stop (3d/visual also screenshot the render). A later pass can refine wrapped categories into stores.

---

## 2026-06-29 (later 4) — `opencv` + `ai` → `defineLifecycle` (the marker categories, done safely)

Branch **`phase0-file-format`** (continuing). Applied the `(later 3)` insight: the two marker-based heavy
categories I'd earlier flagged "unsafe to convert blind" are in fact **safe via `defineLifecycle`**,
because that mode changes ZERO cleanup logic — it only moves WHERE the existing functions are invoked
(explicit engine calls → generic loop, same timing). **17/23 converted; 5 heavy + `subflow`(deferred)
remain** (audio, visual, 3d, connectivity, clasp).

**Why `defineLifecycle` (not `defineNodeState`):** both have a `disposedNodes` marker Set that is
**asymmetric** — `gc`/`disposeAll` ADD to it (so a late worker/model result for a torn-down node is
dropped), and ONLY `onStart` (engine start) CLEARS it (stop→restart guard). A store's uniform
`disposeAll`-clears-the-map can't express that. So each self-registers its UNCHANGED `gc`/`disposeAll` +
`onStart: reset` functions.

**Landed (all green — typecheck clean · lint 0 err · `test:unit` 1615→**1616** · `build` ok). NOT committed:**
- **`executors/ai.ts`** + **`executors/opencv.ts`**: added `defineLifecycle({ label, gc, disposeAll,
  onStart: reset })` at the bottom of each. All cleanup logic (incl. the marker Sets + worker teardown)
  is **byte-for-byte unchanged**.
- **`ExecutionEngine.ts`**: removed **8** wirings — 2 imports, `gcAIState`/`gcOpenCVState` (gc loop),
  `disposeAllAINodes`/`disposeAllOpenCVNodes` (`stop()`), and the **explicit** `resetAINodeDisposal()`/
  `resetOpenCVNodeDisposal()` calls in `start()` (now run via the generic `onStart` loop, which executes
  in the same spot — before `runtimeStore.start()` and the rAF loop; resets just clear independent Sets,
  so order-independent). gc loop + `stop()` disposeAll now hold **5 heavy** + `subflow` (+ metrics).
- **Tests**: `engine-leak.test.ts` gets a marker self-registration guard (opencv/ai/emulation register
  `gc`/`disposeAll`, opencv/ai also `onStart`). Existing `opencv.test.ts` + `ai-stt.test.ts` stay green
  (behavior unchanged) — they prove the wrapped functions still work; the engine-drains-lifecycle
  mechanism is proven by `ExecutionEngine.test.ts`'s lifecycle spy.

**Safe to do blind:** like emulation, zero logic/timing change — a pure registration-mechanism refactor.
(A *later* pass could refine opencv/ai's clean sub-maps — `opencvState`, `pendingOperations`, ai's
`nodeCache` etc. — into `defineNodeState` stores for intra-category leak-safety, but that DOES touch
teardown and wants in-app worker/GPU verification.)

**▶ NEXT — only the 5 genuine WebGL/Tone/media restructures remain** (audio, visual, 3d, connectivity,
clasp). These have clean-ish per-node maps but REAL resource teardown (Tone nodes, WebGL textures/geometry,
media streams, MIDI/BLE) — `defineNodeState` with `dispose` callbacks is the right tool, but the resource
release needs **in-app verification** (`dev:electron`). `clasp` has a websocket-shaped `nodeSubscriptions`
unsubscribe map (`clasp.ts:63`) that's partially socket-style; `connectivity` has MIDI/BLE unsubscribe
paths. `audio`/`visual`/`3d` are the big Tone/WebGL ones — recommend doing each WITH the maintainer
driving verification before its commit.

---

## 2026-06-29 (later 3) — `emulation` → `defineLifecycle` (the asymmetric-cleanup pattern)

Branch **`phase0-file-format`** (continuing). Third heavy category off the engine's hand-wired list, via
a DIFFERENT (and important) technique. **15/23 converted; 7 heavy + `subflow`(deferred) remain** (audio,
visual, ai, opencv, clasp, connectivity, 3d).

**Why `defineLifecycle`, not `defineNodeState`:** emulation's cleanup is **asymmetric** — `gc`/node-removal
tears down resources, removes the parked host, AND drops the registration; `disposeAll`/flow-stop tears
down resources but **KEEPS** the registration (node components register once on mount and must survive
stop→restart — clearing the map once orphaned them, a documented past bug). `defineNodeState`'s
`disposeAll()` *always* clears the map, so forcing emulation into a store would reintroduce that bug.
`defineLifecycle` (the documented escape hatch) lets the plain `emulators` Map + its **unchanged**
`gcEmulationState`/`disposeAllEmulationNodes` self-register into the engine's generic loop.

**Landed (all green — typecheck clean · lint 0 err · `test:unit` 1612→**1615** · `build` ok). NOT committed:**
- **`executors/emulation.ts`**: added `defineLifecycle({ label: 'emulation', gc, disposeAll })` at the
  bottom. Cleanup logic (`cleanupEntry` + the two functions) is **byte-for-byte unchanged**.
- **`ExecutionEngine.ts`**: removed the 3 emulation wirings (import + `gcEmulationState` in the gc loop +
  `disposeAllEmulationNodes` in `stop()`). Hand-wired set: **7 heavy** + `gcSubflowState` + `gcNodeMetrics`.
- **`tests/unit/executors/emulation-lifecycle.test.ts`** (new, +3 — emulation's FIRST tests): self-
  registration guard (`collectedLifecycles()` has label `emulation`), gc drops the registration, and the
  **asymmetry regression guard** — `disposeAll` tears down resources but KEEPS the registration (this
  test fails if anyone later "tidies" emulation into a `defineNodeState` store). Uses a mock loader; an
  un-booted entry has no texture/audio, so no WebGL/Tone is touched.

**Why this is safe to do blind (no in-app verification needed):** unlike websocket/mqtt this changed ZERO
cleanup logic and ZERO invocation timing — the generic loop runs `gc`/`disposeAll` in the *same*
updateGraph/`stop()` spots the explicit calls did, and emulation's teardown is order-independent of other
categories. It is a pure registration-mechanism refactor.

**KEY INSIGHT for the remaining heavy tier — two valid conversion modes:**
1. **`defineNodeState` (ideal for clean nodeId-keyed maps):** restructure state into self-cleaning stores
   with `dispose` callbacks. Eliminates *intra-category* leak risk too, but requires understanding +
   restructuring the teardown (what websocket/mqtt got). Riskier; real resource release often needs in-app.
2. **`defineLifecycle` (correct for asymmetric / marker / global state):** keep the existing map(s) +
   `gc`/`disposeAll`/`onStart` functions UNCHANGED, just self-register. Behavior-identical, safe blind.
   **This means `opencv` and `ai` (the marker categories I earlier flagged "unsafe blind") CAN be done
   safely THIS way** — `defineLifecycle({ gc, disposeAll, onStart: resetOpenCVNodeDisposal })` wrapping
   their existing functions removes the hand-wiring with zero behavior change (the `disposedNodes` marker
   Set + worker logic stay exactly as-is). A *later* pass can refine their clean sub-maps (opencvState,
   pendingOperations) into stores once someone can verify worker teardown in-app. The genuinely
   restructure-needing ones are `audio` (Tone, 8 maps), `visual`/`3d` (WebGL), `clasp` (media),
   `connectivity` (MIDI/BLE/serial) — those want defineNodeState + in-app verification.

---

## 2026-06-29 (later 2) — First heavy-tier conversions: `websocket` + `mqtt` → `defineNodeState`

Branch **`phase0-file-format`** (continuing). Picked the **lowest-semantic-risk** heavy categories to
break the seal on the heavy tier. Audited `opencv` (marker Set + worker-result ordering — NOT safe
blind) and `3d` (11 maps + renderer coupling — gnarly) and rejected both; chose the **socket protocols**
(`websocket`, then `mqtt`) because their only real resource is a subscription **`unsubscribe` closure** —
the cleanup is a function call, so it is *meaningfully* verifiable headless (unlike GPU/WASM, which a
mock can only stub). **14/23 groups now converted; 8 heavy + `subflow`(deferred) remain** (audio, visual,
ai, opencv, clasp, connectivity, 3d, emulation).

**`mqtt` (this session, same pattern + one real subtlety):** `mqttState` + `nodeSubscriptions` are now
exported `defineNodeState` stores; `nodeSubscriptions` dispose = **full teardown** (`sub.unsubscribe()`
+ error-safe `getMqttAdapter(sub.connectionId)?.unsubscribe(sub.topic)`), matching the old
`disposeMqttNode`. **The subtlety vs websocket:** mqtt has THREE release paths with DIFFERENT teardown —
(1) *rewire to a new topic* releases only the message listener (NOT `adapter.unsubscribe`), so that path
keeps a manual `existingSub.unsubscribe()` + relies on `.set()` overwrite (NOT `.delete()`, which would
run the full dispose); (2) *topic cleared* and (3) *node removal* are full teardown → both route through
`.delete()`/the dispose callback. A new **`tests/unit/executors/mqtt-teardown.test.ts`** (mqtt's first
behavioral coverage) pins all three paths; `nodeSubscriptions` also gets a dedicated engine-gc teardown
test in `engine-leak.test.ts`, and `mqttState` joined `CONVERTED_STORES`. Minor consistency gain: the
topic-cleared path now `adapter.unsubscribe`s using the subscription's OWN connection (via dispose),
matching node-removal — the old inline code used the current frame's adapter (latent edge-case bug).
Engine wiring removed (import + `gcMqttState` + `disposeAllMqttNodes`); helpers kept store-backed.

**`websocket` (earlier this session):**

**Landed (all green — typecheck clean · lint 0 err / 49 pre-existing `any` · `test:unit` 1606→**1612**
pass +11 todo · `build` ok). NOT committed:**
- **`executors/websocket.ts`**: `wsState` + `nodeListeners` are now **exported `defineNodeState`** stores.
  `nodeListeners` carries `dispose: (l) => l.unsubscribe()` — **moving the real teardown into the store**,
  so engine gc / `stop()` / a rewire `.delete()` all release the adapter listener. **Rewire double-fire
  fix:** the connection-change path used to `unsubscribe()` *and* `nodeListeners.delete()`; now `.delete()`
  disposes (unsubscribes), so the manual unsubscribe was removed (else it would fire twice). `lastConnectAttempt`
  stays a plain Map (keyed by **connectionId, not nodeId** — doesn't fit `defineNodeState`'s model, and
  the original never gc'd it; behavior preserved). `disposeWebSocketNode`/`disposeAllWebSocketNodes`/
  `gcWebSocketState` kept as **store-backed** test/compat helpers (the index barrel re-exports + 2 test
  files import them) — the engine no longer calls them.
- **`ExecutionEngine.ts`**: removed the 3 websocket wirings (import, `gcWebSocketState` in the updateGraph
  gc loop, `disposeAllWebSocketNodes` in `stop()`). Same timing/guard as before — cleanup now flows
  through the generic lifecycle loops. (After both socket conversions the updateGraph gc loop hand-wires
  **8** heavy categories + `gcSubflowState` + `gcNodeMetrics`; `stop()`'s disposeAll loop matches.)
- **Tests**: `wsState` added to `engine-leak.test.ts`'s `CONVERTED_STORES` ({}-seeded size check);
  `nodeListeners` gets a **dedicated real-teardown test** (seed two listeners with `vi.fn()` unsubs,
  remove one via `updateGraph` → its unsub fires once, the live one's doesn't; `stop()` releases the
  rest). A **rewire regression test** added to `websocket-throttle.test.ts` (old listener released
  exactly once on connection change). `engine-leak.test.ts` is now +8 tests.

**Verification status:** the websocket executor's leak fix is **fully covered headless** — the executor's
sole responsibility is calling `unsubscribe` at the right moments, which the tests prove; the adapter's
unsubscribe correctness is the adapter's own contract. A 60-second in-app sanity check (add a WebSocket
node, delete it, confirm no console error / dangling listener in `dev:electron`) is still recommended
before commit, but the GPU/WASM "mocks insufficient" caveat does **not** bite here.

**▶ NEXT (the easy socket wins are now DONE):** only the genuinely gnarly heavy categories remain —
`audio` (Tone, 8 maps), `visual` (WebGL), `3d` (11 maps + renderer), `opencv` (worker + marker Set —
plan in the entry below), `ai` (workers + `resetAINodeDisposal` marker), `clasp` (media; note clasp has
its OWN `nodeSubscriptions` unsubscribe map at `clasp.ts:63` — a websocket-shaped sub-conversion is
possible there), `connectivity` (MIDI/BLE/serial), `emulation` (EmulatorJS WebGL). These need **real
in-app verification** (`dev:electron`) — mocks are necessary but not sufficient. Recommend doing each
WITH the maintainer driving verification before its commit. `connectivity` is large but its MIDI/BLE
unsubscribe paths may yield a partial socket-style win; `audio`/`visual`/`3d` are the big WebGL/Tone
teardowns.

---

## 2026-06-29 (later) — Engine-level leak-test GATE + `PURE_NODE_TYPES` GATE landed (audited)

Branch **`phase0-file-format`** (continuing). Two roadmap Phase-1 gates landed and an `ultrathink`
self-audit hardened them. The **"per-type create+delete leak test"** gate is now in place — the missing
half of the leak-class kill. Per-category unit tests (`executor-gc.test.ts`) already pin each store's
`gc`/`disposeAll` *in isolation* (calling `store.gc(...)` directly); the new gate proves the **engine
itself** drains them through its generic `for (const l of this.lifecycles) …` loops.

**AUDIT (this session, all findings actioned):**
- **The gate has teeth (mutation-verified):** commenting out the engine's `for (const l of this.lifecycles)
  l.gc(validNodeIds)` line turns exactly the 4 gc-dependent leak tests + the new `ExecutionEngine` gc
  spy test RED, while the `stop()`/disposeAll and canvas-mock tests correctly stay green (they don't
  depend on that loop). A leak test that can't fail is worthless — this one provably can.
- **Reconciled a stale NOTE:** `ExecutionEngine.test.ts:550` carried a NOTE that the gc-on-removal path
  was deliberately left untested because the legacy gc path touched `canvas.getContext` ("Phase 1's
  per-type leak tests will add a canvas mock"). That promise is now fulfilled, so the NOTE was rewritten
  and a now-unblocked **`drains gc on updateGraph node removal`** spy test added there (asserts the loop
  fires with the correct empty `validNodeIds`).
- **Closed the compound-key gap:** all 28 *exported* converted stores use identity keys, so the
  `keyToNodeId` gc path wasn't exercised end-to-end through the engine (only at the `defineNodeState`
  unit level, `nodeState.test.ts:67`). Added a `keyToNodeId` probe to `engine-leak.test.ts` (suffixed
  `keep:a`/`drop:a` keys, prove only the removed node's entries drop). `code`/`http` are the real
  compound-key stores but non-exported; the probe covers the mechanism the engine drains them with.
- **`PURE_NODE_TYPES` discrepancy was already RESOLVED — the handoff's "19" was STALE.** The live set
  (`ExecutionEngine.ts:67`, not `:84` — that ref drifted too) is **24 ids** and already matches the docs.
  Counted directly; no purity re-audit needed (the set is the verified source of truth from 2026-06-14).
- **Found + closed a store with ZERO gc coverage (2nd audit pass):** `engine/trigger.ts`'s `edgeState`
  (the `risingEdge` store) is a *converted* `defineNodeState` store but **non-exported** and uses a
  **unique** `keyToNodeId` (`indexOf('::')` slicer — every other store splits on a single `:`), so
  neither `trigger.test.ts` (no gc tests), `nodeState.test.ts` (`_` splitter), nor the `:`-split probe
  exercised it. A regression in that slicer would silently leak edge state on node deletion — the exact
  Phase-1 leak class. Closed with a **behavioral** integration test in `engine-leak.test.ts`: drive the
  exported `risingEdge()` to seed `keep::trigger`/`drop::trigger`, remove `drop` via `updateGraph`, and
  assert `drop` re-fires (state gc'd) while `keep` stays latched (selectivity — also catches a broken
  splitter, which would wrongly drop `keep`'s state). `code`/`http`'s non-exported stores use the
  `:`-splitter the probe already represents.
- **Hardened `beforeEach`:** now resets **every** registered lifecycle via
  `collectedLifecycles().forEach((l) => l.disposeAll())` (was only the 28 exported stores), so the
  non-exported `edgeState`/code/http stores and any probe can't bleed state across cases.
- **`opencv` heavy-tier conversion investigated (NOT done — needs in-app verify).** Concrete groundwork
  for whoever picks it up: state is `opencvState` (Map, per-node canvas+texture) + `pendingOperations`
  (Map, in-flight throttle guard) + **`disposedNodes` (Set, a late-worker-result guard that must
  GROW on dispose and be cleared ONLY on engine start)** + module singletons `scratchCanvas`/
  `imageDataCanvas` + the worker side (`openCVService.dispose(id)`/`.disposeAll()`). Plan:
  `opencvState` → `defineNodeState` with `dispose(state, id)` doing `texture.dispose()` +
  canvas 0×0 + `openCVService.dispose(id)` + `pendingOperations.delete(id)` + **`disposedNodes.add(id)`**
  (the marker MUST be set inside dispose, and `disposedNodes` must NOT itself be a gc'd store or markers
  vanish for removed nodes); `pendingOperations` can stay a Map cleaned in that `dispose`; the
  `resetOpenCVNodeDisposal` (clear `disposedNodes`) + `openCVService.disposeAll()` + canvas-singleton
  nulling go in a `defineLifecycle({ onStart, disposeAll })`. **Why it's not safe headless:** mocks can
  verify the wiring but not that the real WASM Mats free or that the late-result drop timing holds —
  exactly the subtle marker/ordering semantics. Verify optical-flow + MOG2 nodes in `dev:electron`
  (add/remove/re-add; stop→restart) before committing.

**Landed (all green — typecheck clean · lint 0 err / 49 pre-existing `any` · `test:unit` 1595→**1606**
pass +11 todo · `build` ok). NOT committed (awaiting maintainer go-ahead):**
- **`tests/unit/engine/engine-leak.test.ts`** (new, +7 tests). Wires `engine.registerLifecycles(
  collectedLifecycles())` exactly as production, seeds all **28 exported converted stores** (the 12
  categories' `defineNodeState` stores), then asserts: (a) `updateGraph` **removal** empties every store
  via the engine gc loop (no direct `store.gc()` call); (b) a keep/drop graph drops only the removed
  node; (c) `stop()` empties every store; (d) a **freshly-registered** `defineNodeState` (created after
  the engine started) is drained AND its `dispose(state)` callback fires — the live-array guarantee that
  a custom/user executor inherits auto-cleanup for free; (e) a **`keyToNodeId` compound-key probe**
  (engine resolves the owning node id from suffixed keys); (f) the non-exported `::`-keyed `edgeState`
  (`risingEdge`) is gc'd end-to-end; (g) the canvas mock sanity check. Seed value is `{}` (analyser
  `dispose` reads `s.waveform`/`s.fft` null-safely, so it disposes cleanly).
- **`tests/unit/engine/ExecutionEngine.test.ts`**: rewrote the stale lifecycle-gc NOTE and added the
  now-unblocked **`drains gc on updateGraph node removal`** spy test (h.gc called once with empty set).
- **`tests/unit/engine/pure-node-types.test.ts`** (new, +3 tests — the `PURE_NODE_TYPES` Phase-1 gate).
  Pins the set to **exactly the canonical 24-id literal** (independent second witness; order-independent
  equality; no dup), asserts the known-impure nodes (`gate`/`smooth`/`random`/`counter`/`metronome`/
  `timer`) stay **excluded** (the only dangerous direction — a wrong *addition* can freeze a node in
  dirty mode), and pins `COLOCATED_PURE_NODE_TYPES ⊆ PURE_NODE_TYPES` — the **Phase-6 derivation
  bridge** (vacuously true today: **0 co-located `node.ts` files** exist, so the `pure:true`-derived set
  is empty; it becomes a real check the moment Phase 6 co-locates a pure node). Full *replacement* of the
  hand-maintained literal by the derived set waits on Phase-6 co-location; adding `pure` to the 24 legacy
  `NodeDefinition`s now would be throwaway work Phase 6 redoes, so it was deliberately NOT done.
- **`tests/setup.ts`**: added a safe `HTMLCanvasElement.getContext` mock (Proxy-based no-op **2D**
  context; `getImageData`/`createImageData` return correctly-shaped buffers; **WebGL → null** so guarded
  branches take their fallback). **Safe by construction:** happy-dom leaves `getContext` *undefined*
  (it throws), and the whole suite was green, so **no existing test reached a real `getContext` call** —
  the mock can only unblock new headless coverage, never change current behavior. Verified: all 89 test
  files still pass.
- **`executors/visual.ts` `gcVisualState`** (small production fix): the Three renderer was fetched
  **eagerly** at the top (`getThreeShaderRenderer()`), so removing *any* node — even a non-visual one —
  spun up a WebGL context (throws headless; wasted work in prod). Now fetched **lazily**, only inside the
  `nodeTextures` loop right before `disposeNode`. Behavior-identical (memoized singleton, already built
  by GC time in prod); makes `gcVisualState` a true no-op when no visual textures need disposing. This
  was the *actual* blocker for the engine-removal test — the canvas mock alone is insufficient because
  Three needs a real WebGL context.

**▶ NEXT ACTION:** the **heavy/in-app tier** conversion is now the only remaining Phase-1 item
(audio/visual/ai/opencv/clasp/connectivity/mqtt/websocket/3d/emulation — `subflow` deferred to Phase 7).
Each has **real resource teardown** (Tone/WebGL/workers/sockets/media): move it into a `dispose(state)`
callback (or `defineLifecycle` for service/global side effects), then **VERIFY IN-APP** (`npm run dev` /
`dev:electron`) — mock-based unit tests are necessary but NOT sufficient here. One category per green
commit. As each heavy group migrates to `defineNodeState`, **add its store(s) to
`engine-leak.test.ts`'s `CONVERTED_STORES` list** (the regression gate) and remove its hand-wired
`gc*`/`disposeAll*` line from `ExecutionEngine.ts`. The canvas mock (`tests/setup.ts`) + the now-lazy
`gcVisualState` renderer fetch mean a fuller engine-removal test that seeds **visual** state is also
unblocked. (`PURE_NODE_TYPES` is DONE — gate landed; full derive-from-`pure:true` replacement is a
Phase-6 co-location follow-up.)

---

## 2026-06-29 — Phase 1 in progress: `defineNodeState` migration (kill the leak class)

Branch **`phase0-file-format`** (continuing). Phase 0's autonomous work is complete (see entry
below); **Phase 1** (de-monolith + convert ~23 hand-wired state groups to `defineNodeState` so the
engine's generic lifecycle loop is authoritative and the leak class is structurally impossible) is
**~12/23 done** — every group convertible/verifiable **headless** is migrated; only the heavy/in-app
tier remains.

**▶ NEXT ACTION:** convert the **heavy/in-app tier** (audio, visual, ai, opencv, clasp, connectivity,
mqtt, websocket, 3d, emulation — `subflow` deferred to Phase 7). Each has **real resource teardown**
(Tone/WebGL/workers/sockets/media): move it into a `dispose(state)` callback (or `defineLifecycle` for
service/global side effects), then **VERIFY IN-APP** (`npm run dev` / `dev:electron`) that audio/video/
connections actually tear down — green unit tests with mocks are necessary but NOT sufficient here.
One category per green commit. Alternatively, lower-risk headless wins still open: (a) the
**engine-level per-type leak-test gate** (roadmap) — add a `canvas.getContext` mock to `tests/setup.ts`,
then an `updateGraph` add→remove→assert-store-empty test (per-category UNIT gc tests exist via
`store.gc`, but the engine-integration leak test is still TODO and is the actual roadmap gate);
(b) **`PURE_NODE_TYPES`** derivation — still the hardcoded **19-id** set (`ExecutionEngine.ts:~84`),
docs say "24"; reconcile before deriving from `pure:true`.

**Current state (audited 2026-06-29, all green):** `typecheck` clean · `lint` 0 errors (49 pre-existing
`any` warnings) · `test:unit` **1595 pass** (+11 todo) · `build` ok. 43 commits on the branch, tree
clean, no AI attribution. Engine `updateGraph` gc loop + `stop()` disposeAll loop verified to hold
**exactly** the 11 heavy groups + `gcNodeMetrics`; every converted group flows through
`for (const l of this.lifecycles) …`. Earlier audit invariants confirmed: generic gc runs in the same
`if (hasRemovedNodes)` guard as the removed hand-wiring; generic `disposeAll` is unconditional in
`stop()`; the `endFrame` loop replaced the bespoke `endMessagingFrame` call site; production
registration via `useExecutionEngine.onMounted` (live-array reference, so order-independent); Vue 3.5
computed value-equality means the error badge's `nodeMetricsVersion` dep causes no per-frame re-render.

**Foundation landed:** `defineNodeState`'s store now exposes **`gc(validNodeIds)` + `disposeAll()`**
directly (`engine/nodeState.ts`); the auto-registered lifecycle hook delegates to them. So a converted
category needs **no bespoke `gcXState`/`disposeAllXState`** — production cleanup runs via the generic
loop (already wired: `ExecutionEngine` `registerLifecycles(collectedLifecycles())` from
`useExecutionEngine.ts:26`, draining gc/disposeAll/onStart/endFrame), and tests drive cleanup through
the store.

**Canonical conversion recipe (per category):**
1. In the category file: `export const xState = defineNodeState<T>({ label, dispose? })` (replace
   `new Map()`). The store's `.get/.set/.has/.delete` match `Map`, so executor bodies usually don't
   change; `Map.clear()`→`.disposeAll()`, `Map.keys()`-gc loop → delete the whole hand-rolled `gc` fn.
2. Delete the `gcXState`/`disposeAllXState` functions.
3. `ExecutionEngine.ts`: remove the category's import + its line in the `updateGraph` gc loop (~:324)
   + its line in the `stop()` disposeAll loop (~:972).
4. `executors/index.ts`: remove any re-export of those functions (e.g. gamepad had one).
5. Tests: import the store; replace `disposeAllXState()` with `xState.disposeAll()` (or a tiny local
   `const disposeAllXState = () => xState.disposeAll()` to avoid churning many call sites; for
   multi-store categories like signal, the helper clears each store).

**Converted so far (12) — entire NON-HEAVY tier + `http`:** `spring`, `signal` (signalState+tapState),
`gamepad`, `utility` (6 stores), `code` (compound `nodeId:…` keys via `keyToNodeId`), the
`executors/index.ts`-internal groups `RAG`/`input`/`timing` (incl. `startFiredNodes` **Set** →
`defineNodeState<true>` presence store)/`debug` (analysers via per-entry `dispose` callback — no
double-dispose since rewire mutates in place)/`WebLLM`, `messaging`, and `http` (pure response cache,
compound keys — the one connection-group executor with no real teardown; `disposeHttpNode`/etc. kept as
store-backed test helpers). Each its own commit.

**AUDIT NOTE (2026-06-29, perf — not a bug, not yet fixed):** `createExecutionContext`
(`ExecutionEngine.ts`) allocates 6 closures (read + num/bool/str/trig/level) **per node per frame** in
`executeNode`, and the accessors have **zero consumers yet**. Negligible vs the Maps `executeNode`
already allocates each frame, so not worth fixing in isolation — but when profiling 500+ nodes / when
executors start using `ctx.num`, switch to a **class-based context** (prototype methods allocated once).

**New infra: `defineLifecycle(hook)` in `nodeState.ts`** — registers a lifecycle NOT backed by a
`defineNodeState` map, for cleanup that is a *side effect* rather than per-node state (gc/disposeAll
default to no-ops). Used by `WebLLM` (`webLLMService.gc`/`stopActive`) and `messaging` (channel-keyed
`receiveProcessed` GC + `messageBus.clear` + the end-of-frame change-flag flush, replacing the bespoke
`endMessagingFrame` engine call site — the generic `endFrame` loop now drives it). Pattern for any
remaining group with non-map side effects: convert nodeId-keyed maps to stores, register the rest via
`defineLifecycle`. `messaging` keeps `disposeAllMessagingState`/`gcMessagingState` exported as
test/teardown helpers (reimplemented on the stores) — the engine no longer calls them.

**Engine is much slimmer now:** the `updateGraph` gc loop and `stop()` disposeAll loop only retain the
**heavy/in-app** categories below; everything else flows through `for (const l of this.lifecycles) …`.

**⚠️ LESSON (cost me a red full-run): before deleting a `disposeXState`/`gcXState`, grep ALL of
`tests/` for it — not just the test file you know about.** `input`'s removal broke `smooth.test.ts`
(imported `disposeAllInputState`) which I hadn't checked; per-file tests pass but the full
`test:unit` caught it. Always run the FULL suite after a conversion, and migrate every importer to a
local `const disposeAllXState = () => store.disposeAll()` helper (keeps call sites unchanged).

**Remaining state groups, by risk tier (do NOT batch blindly):**
- **`messaging` is NOT a simple conversion** (handoff previously mis-said "safe"): its `receiveProcessed`
  is keyed by **channel, not nodeId** (an inner `Map<channel, Map<nodeId, bool>>`), so it doesn't fit
  `defineNodeState`'s nodeId-keyed model; and `disposeAllMessagingState`/`endMessagingFrame` have
  `messageBus` side effects (`messageBus.clear()` / `clearChangeFlag`). Convert `sendPrevValues` +
  `activeReceiveNodes` to stores but keep a bespoke path (or a non-nodeState helper) for
  `receiveProcessed` + the messageBus calls. Has `executor-gc.test.ts` coupling.
  (`WebLLM` + `messaging` are DONE — see above; `defineLifecycle` landed.)
- **ONLY the heavy/in-app tier remains** (real resource teardown — convert by moving teardown into a
  `dispose(state)` callback, then **verify in-app**, one category per green commit): `audio` (Tone),
  `visual` (WebGL/canvas), `ai`, `opencv` (workers + `disposedNodes` marker Set + `onStart` reset →
  `defineNodeState({ onStart })` or a `defineLifecycle`), `clasp` (media), `connectivity` +
  `mqtt`/`websocket` (sockets/MIDI/BLE — unsubscribe/close on dispose; unit-mockable but real teardown
  needs the app), `3d` (Three geometry/material `.dispose()`), `emulation` (EmulatorJS WebGL).
  `subflow` is best left for its **Phase-7 rebuild** (state will be restructured). `code`/`http` are
  done (caches, no real teardown).

**Still pending for the engine-level per-type leak test gate** (roadmap): add a `canvas.getContext`
mock to `tests/setup.ts` first — an engine `updateGraph`-removal test runs the *remaining* hand-wired
`gcVisualState`, which touches canvas (happy-dom lacks it). Per-category unit gc tests (seed via
executor → `store.gc(validIds)` → assert) work without it and are sufficient per-category until then.

**Discrepancy to resolve when deriving `PURE_NODE_TYPES`:** the live set is **19 ids**
(`ExecutionEngine.ts:84`), but ROADMAP/handoff say "24-id". Re-audit before flipping the glob count
guard to strict `===` (Phase 6) or deriving from `pure:true` (`NodeSpec` has the field; `NodeDefinition`
does not yet).

---

## 2026-06-28 — Phase 0 foundations: `.latch` v2 file format + extensibility scaffolding

Executing **`docs/plans/ROADMAP_2026-06-28.md` (canonical)** Phase 0. Branch:
**`phase0-file-format`** (off `main`) — **15 commits, all green, working tree clean** (no AI
attribution). License decision: **MIT confirmed** — already in `LICENSE` + `package.json`; no change
needed. Governance/funding stays maintainer-owned (POLICIES §3), non-blocking.

**▶ NEXT ACTION:** Open/next #1 (number `:min`/`:max`), #2 (per-node error badge), #6 (undo for param
edits), and #7 (**2b** ctx accessors + factory) are **DONE**. Remaining clean autonomous work is thin:
#8 policies fixture needs a public-API-surface decision (maintainer call). #3 (single-input edge
replace) and #5 (texture traps, P0) need **in-app verification**; #4 (`random`) needs a design call.
Next session likely starts **Phase 1** (de-monolith `executors/index.ts` + `defineNodeState`
conversion) — see the §1 add-`canvas.getContext`-mock-to-`tests/setup.ts` prerequisite below.

**Landed this session** (15 commits): planning corpus · `.latch` v2 file format (+ store wiring) ·
engine registry-resolved definitions + boundary input coercion · extensibility scaffold
(`defineNode`/`trigger`/`defineNodeState`/`nodeRegistry`) · `power` finite-guard · import toasts ·
engine lifecycle wiring · edge-triggered `latch`/`sample-hold` · Tone-analyser dispose · clasp
`captureStream` stop · **number control `:min`/`:max` + blur-clamp (first component test)** ·
**per-node error badge** · **undo for param edits (debounced)** · **2b ctx accessors + factory**.
Test count **1517 → 1593**.

**State at end of session:** `typecheck` + `lint` + `test:unit` + `build` (web) all green —
**1593 tests** (was 1517). Committed to `phase0-file-format` (no AI attribution). Every step was kept individually revertible. (One pre-existing flaky timer test,
`adapters.test.ts > connectWithRetry`, occasionally fails in the full run and passes on retry —
unrelated to this work.)

### ⚠️ Critical engine fix (third `ultrathink` audit) — required by the v2 format
`ExecutionEngine.executeNode` read the node definition **only** from `node.data.definition`
(`:340`) and used it to populate control **defaults** (`:358`). The `.latch` v2 format **drops** the
embedded definition, so imported flows (incl. the **first-visit `sample-flow.json`**) would execute
with control defaults missing — masked only where executors have their own `?? default`. Fixed per
FILE_FORMAT_SPEC ("resolve from the registry by type at load"):
`definition = node.data?.definition ?? this.nodesStore.getDefinition(nodeType)` (+ `private nodesStore
= useNodesStore()`). **Conservative** (embedded-first → zero change for existing/autosaved flows that
still carry a definition; registry fallback fixes v2-imported and NodeExplorer-added nodes). No
executor reads `ctx.definition` (verified 0 occurrences), so the undefined-`ctx.definition` case was
already harmless. Tests: registry default reaches the executor when no embedded def; explicit value
still overrides. Golden + dirty-equivalence suites green. **Follow-up (not blocking):** `EditorView.vue:192`
still embeds `definition` at node creation — drop it later so the format is uniformly registry-resolved.

### Sub-task 3 quick-wins — STARTED
- **`power` finite-guard DONE** (AUDIT §E): `powerExecutor` returned `isNaN(result) ? 0 : result`,
  letting `±Infinity` through (`log(0)=-∞`, `0^-1=+∞`, `exp(710)=+∞`). Now `Number.isFinite(result) ?
  result : 0` (`executors/index.ts:381`). Four bug-characterizing tests in `math.test.ts` were
  tightened from "tolerates Infinity" to asserting the guarded `0`.
- **Boundary coercion DONE** (AUDIT §D P0 — the "coercion lie"): `getNodeInputs` copied upstream
  values verbatim, so a boolean into a `number` port arrived as `true` (`true + 0 === 1`; `?? 0` never
  caught it). New exported `coerceToPortType(value, portType)` in `ExecutionEngine.ts` honors the
  connection-matrix coercions (number→{string,boolean}, boolean→{number,string}); `getNodeInputs`
  resolves the target node's definition (registry) once and coerces each value to its port type.
  **Conservative**: only primitive number/boolean/string targets when the runtime type mismatches;
  `any`/trigger/textures/3D/`data`/placeholder ports pass through untouched. Golden + dirty-equivalence
  green (correctly-typed flows unchanged). Pure-fn + engine-integration tests added.
- **Edge-trigger `latch` / `sample-hold` DONE** (AUDIT §E P1): both were level-triggered despite the
  docs — a held-high gate made `sample-hold` a per-frame pass-through. Now use `risingEdge(nodeId, key,
  value)` from `engine/trigger.ts` (sample-hold on `trigger`; latch on `set`/`reset`, reset wins).
  **This is the first real consumer of `risingEdge`** — so `utility.ts` now imports `trigger.ts` at
  boot, registering its `defineNodeState` lifecycle which the engine drains (the §11-step-1 wiring is
  now exercised in production, not just a no-op). Existing tests kept passing (they used clean low→high
  transitions); 3 discriminating edge tests added. Held-value state stays in the legacy `gcUtilityState`
  path; edge state GCs via the new lifecycle loop.
- **Tone-analyser dispose DONE** (AUDIT §F P1): oscilloscope (`Tone.Waveform`) and equalizer
  (`Tone.FFT`) `.disconnect()`'d their analyser but never `.dispose()`'d it, leaking a Web Audio
  `AnalyserNode` on every add/remove/stop/rewire (and the equalizer's no-audio branch dropped the
  reference without disconnecting). One error/null-safe `disposeAnalyzer(node, source)` helper now
  replaces all six discard sites (2 rewire, equalizer no-audio, per-node dispose, 2 disposeAll loops).
  Tested via a partial `vi.mock('tone')` (stub Waveform/FFT) asserting dispose fires at each site.
- **clasp `captureStream` stop DONE** (AUDIT §F P1): `disposeClaspVideoReceiveNode` disposed the
  texture but never stopped the canvas `captureStream` tracks or tore down the `<video>` (clasp.ts:967),
  leaking MediaStream tracks per video-receive remove/stop. New exported `stopVideoElement(video)` helper
  (stop tracks + pause + clear srcObject, error-safe) is called on dispose. Helper unit-tested directly.
- **`random` sample-on-trigger — NOT done** (deferred): needs an optional `trigger` input on the
  definition + reliable "is the trigger wired" detection. `ctx.inputs.has('trigger')` is unreliable
  (depends on whether the upstream emits continuously vs only on fire), so this needs either engine
  support for per-input edge-presence or an explicit mode control — design it deliberately, don't guess.

### Sub-task 1 — `.latch` v2 file format (FILE_FORMAT_SPEC) — COMPLETE
The strategic centerpiece (diff-friendly, durable, versioned). Logic (`flow.nodes` controls) is
separated from layout (positions/size/custom label) so moving a node never churns a logic diff.
- **`src/renderer/services/fileFormat.ts`** (new, pure — no store/registry/IO/random):
  v2 types; `migrateDocument`/`migrateToExport` (legacy v1.0 single + v1.0.0 multi → v2);
  byte-deterministic `serializeDocument`/`serializeExport` (sorted keys, nodes/edges by id,
  `controls` deep-sorted); `validateDocument` (drops dangling edges, PRESERVES unknown-type nodes);
  `endpoint`/`parseEndpoint` (`"node:port"`, `:` delimiter — **never `/`**, so subflow-expanded
  `a/b` ids stay safe); `migrateNode`/`migrateDocumentNodes` (per-node `version`+`migrate`,
  resolver-injected — no-op today, all nodes v1); `looksLikeLatchFile` guard.
- **`src/renderer/stores/flows.ts`**: `exportFlow`/`exportAllFlows` now **write v2 only** (maintainer
  chose v2-only over dual-write); `importFlow`/`importFlows` read v1.0 + v1.0.0 + v2 via one
  `migrateToExport → docToFlowState` path. Unknown types load as **placeholders** (controls + wires
  preserved; dynamic ports derived from surviving edges). `importFlows` returns a structured
  **`ImportReport`** (imported / migrated / unknownNodes / droppedEdges / warnings). **Persistence is
  untouched** — `usePersistence` stores `FlowState` directly in Dexie, independent of the file format.
- **`src/renderer/stores/ui.ts`** + **`components/layout/NotificationToasts.vue`** (new, mounted in
  `App.vue`): minimal toast system (`notify`/`dismissNotification`). `AppHeader.importProject` now
  surfaces the `ImportReport` as a success/warning toast (errors sticky) instead of `console.log`/`alert`.
- Gates (all green, unit-level): byte-identical round-trip, logic/layout isolation, legacy
  `public/sample-flow.json` upgrade, missing-node placeholder. **Integration gate**: the real sample
  flow (19 nodes/18 edges) upgrades through the **full 238-node registry with 0 unknown / 0 dropped**.

### Audit findings fixed (two `ultrathink` self-audits)
- **REGRESSION**: store-export stripped all `_`-prefixed data keys while legacy-migrate kept them →
  silently dropped real persisted state (`_width`/`_height` KeyboardNode sizing;
  `_dynamicInputs/_dynamicControls/_dynamicOutputs`, which regenerate **only while the engine runs**,
  `ExecutionEngine.ts:461`). Both paths now preserve everything except `{nodeType, label, definition,
  _unknownType}`.
- **Placeholder dynamic-port leak**: a placeholder's edge-derived `_dynamic*` must not be persisted
  (would pollute the node with stale handles if its type later loads) — stripped on export for
  `_unknownType` nodes only.
- **Validation hole**: arbitrary JSON imported as an empty "success" flow → `looksLikeLatchFile` guard.
- Defensive `delete data._unknownType` on load; fatal validation errors surfaced as report `warnings`.
- Determinism proof: a round-trip test was order-fragile (`nodes[0]` after id-sort) — fixed to resolve
  by `nodeType`.

### Sub-task 2 — extensibility primitives (additive, alongside existing code)
- **2a DONE** — `engine/defineNode.ts` (`NodeSpec`, frozen-contract identity fn — core fields only;
  `ui`/`models`/`lifecycle` are additive-later per POLICIES §2), `engine/trigger.ts`
  (`TRIGGER`=1/`isHigh`/`risingEdge`), `engine/nodeState.ts` (`defineNodeState` + `collectedLifecycles`
  + lifecycle registry). Unit-tested; **not yet wired into the engine**.
- **2c DONE** — `registry/nodeRegistry.ts` globs `./**/node.ts` (eager, `import:'default'`); throws on
  duplicate id / missing-default at load; exports `nodeSpecs`/`colocatedNodeIds`/`colocatedExecutors`/
  `COLOCATED_PURE_NODE_TYPES`. Glob matches **0 files today** (inert; app still uses the legacy
  registry). Guard tests are **green-from-commit-1**: dup-id + default-export are meaningful now;
  count-equality is `colocated ≤ legacy` with a `TODO(phase6)` to tighten to `===` once every node is
  co-located. NOTE (EXTENSIBILITY §6 risk #3): the guard test must load `@/registry/components`
  **before** `@/registry` — importing `@/registry` re-exports `./components` mid-eval (`index.ts:72`)
  and trips a happy-dom `markRaw(undefined)` circular-init hazard otherwise.
- **2b DONE** — `ctx.num/bool/str/trig/level` on `ExecutionContext`, required, via a new exported
  `createExecutionContext(data)` factory now used at the sole runtime site (`ExecutionEngine.ts:431`).
  Accessors read `input ?? control ?? fallback`: `num` coerces + NaN/±Infinity-guards; `bool`/`str`
  coerce; `trig` = `risingEdge(nodeId, id, value)`; `level` = `isHigh`. **The prior "breaks ~25 test
  helpers" deferral premise was WRONG**: `tsconfig.json` `include` is `src/**` only, so `vue-tsc`
  **does not typecheck `tests/`** — the test helpers' `: ExecutionContext` annotations are esbuild-
  stripped at runtime and never checked (proof: `math.test.ts`'s helper already omits `definition` and
  carries a stale `getInputNode` not in the interface, yet typecheck is green). So making the accessors
  required broke nothing, and **the mass 25-helper refactor is unnecessary churn** — no executor uses
  the accessors yet, so each helper migrates incrementally when its executor adopts `ctx.num` (Phase 1+).
  Shipped instead: a shared, factory-based test helper `tests/unit/_helpers/executionContext.ts`
  (`makeContext`) for new/migrated executor tests, plus `tests/unit/engine/executionContext.test.ts` (7).

### Open / next (remaining Phase-0 work, roughly priority order)
Done already: file format (Sub-task 1), scaffold 2a/2c, **engine lifecycle wiring**, and 5 quick-wins
(power, boundary coercion, edge-trigger latch/sample-hold, Tone dispose, clasp captureStream). Remaining:
1. **number `:min`/`:max` — DONE** (AUDIT §B P0, 127 controls). Both number branches (`BaseNode.vue`
   inline + `PropertiesPanel.vue`) now bind `:min`/`:max` (cast `as number` — a bare `unknown` value is
   omitted at runtime, so unbounded controls stay unbounded). NOTE: a union cast `as number | undefined`
   in a template trips eslint `vue/no-deprecated-filter` — the `|` parses as a Vue-2 filter pipe; use
   `as number`. A shared `clampNumberControl(control, raw)` settles the value to the range **on blur
   only** (not per keystroke, so typing intermediate values isn't broken). **First `@vue/test-utils`
   component test** in the repo: `tests/unit/components/BaseNode.test.ts` (4 tests). GOTCHA captured
   there: import the store/registry chain (`@/stores/flows`) **before** `BaseNode.vue` — if BaseNode is
   the cycle entry point, `registry/components.ts`'s module-scope `markRaw(BaseNode)` runs with BaseNode
   undefined → crash (same circular-init hazard as the nodeRegistry guard test). `units`/`precision`
   display is a P1 follow-on and currently **0 controls define it** — don't build dead UI for it.
2. **per-node error badge — DONE** (AUDIT §G). `BaseNode` reads `runtimeStore.getNodeMetrics(id)
   .lastError` (reactive via `nodeMetricsVersion`) → red `.node-content` border (`--color-error`) + an
   `AlertTriangle` header badge with the message as its `title`. Two **runtime-store behavior fixes**
   were required (no prior runtime-store tests existed): (a) `addError`/`recordNodeError` now create a
   metrics entry if the node failed before ever running (was guarded by `if (metrics)` → first-frame
   failures showed no badge) — extracted into `setNodeError(nodeId, message)`; (b) `updateNodeMetrics`
   now clears `lastError` on success so the badge reflects live state, not a stale failure (errorCount
   and the `errors[]` log stay cumulative, so StatusBar/Debug are unchanged). Tests:
   `tests/unit/stores/runtime.test.ts` (4) + 2 added to `BaseNode.test.ts`.
3. **single-input edge replacement** (AUDIT §D) — in `addEdge` (`flows.ts`), replace the existing edge
   into a non-`multiple` target (registry via `useNodesStore` gives the `multiple` flag). **CAVEAT**:
   `onConnect` also calls Vue Flow's `addEdges()` independently (`EditorView.vue:133`), so a store-side
   replacement risks a store↔VF desync — must keep them in sync and verify in-app, not just unit tests.
4. **`random` sample-on-trigger** (AUDIT §E, `index.ts:284-298`) — needs a `trigger` input + reliable
   wired-detection (engine per-input edge-presence, or a mode control). Design first; don't guess.
5. **texture traps** (AUDIT §D P0) — shader `iChannel` + `displacement` via `resolveEffectSource`
   (`visual.ts:611-612`/`:1282`); make render-3d depth canvas-backed (copy `emulation.ts:88-110` blit).
   Hard to unit-test under happy-dom (WebGL); verify in-app.
6. **undo for param edits — DONE** (AUDIT §G P0). Wired at the **`updateControl` seam** (BaseNode +
   PropertiesPanel) — NOT in `flowsStore.updateNodeData`, which is also hit by engine-driven dynamic-port
   churn (`_dynamicInputs/_dynamicControls/_dynamicOutputs`) and would pollute history. New
   `recordParamEdit(nodeId, desc, mutate)` in `useFlowHistory` coalesces rapid edits (typing/dragging)
   into one debounced (500ms) entry via module-level burst state; a burst commits early when the edit
   target changes, when any structural action snapshots (`beforeAction` now calls `flushParamEdit`), or
   on undo/redo. GOTCHA captured in the test: `FlowSnapshot.timestamp` always differs between burst-start
   and flush, so the no-op/changed diff compares `nodes`/`edges` content only (the legacy `afterAction`
   full-snapshot compare is timestamp-fragile but works because its before/after are ~synchronous).
   Tests: `tests/unit/composables/useFlowHistory.test.ts` (7). **Follow-up (non-blocking):** the
   Code/Shader editor modals call `updateNodeData` directly and are still unrecorded — wrap them in
   `withHistory` (they're discrete saves, not rapid) when convenient.
7. **2b ctx accessors — DONE** (see the "extensibility primitives" section above). Factory + required
   accessors landed; the 25-helper refactor was found unnecessary (tests aren't typechecked) — migrate
   each helper to `makeContext` only when its executor adopts `ctx.num` (Phase 1+).
8. **Sub-task 4 policies** — checked-in `tests/contracts/public-exports.ts` must-not-break fixture
   (activates as a Phase-1+ gate); the `defineNode` deprecation policy is already in POLICIES.
9. **Phase 1+** — convert executors to `defineNodeState` (delete the 23×3 hardcoded gc/disposeAll),
   split `executors/index.ts`, derive `PURE_NODE_TYPES` (24-id exact set), then Phase-6 co-location that
   makes `nodeRegistry` authoritative + flips its count guard to strict `===`. **The per-type leak tests
   here exercise engine node-removal → MUST add a `canvas.getContext` mock to `tests/setup.ts`** first
   (the legacy visual gc touches canvas; happy-dom lacks it — see the lifecycle-wiring test gap).

### Key decisions/invariants for the next session
- Node ids are **opaque, no `/`** (subflow rebuild joins ids with `/`); the format uses `:` for edge
  endpoints. Never `.split('/')` an id.
- `defineNode` is a **frozen contract** — additive optional fields only; retire via deprecation + a
  node-data `migrate()` (POLICIES §2).
- Honor `strategy/05` DON'T-OVERCLAIM (never claim raw GPU/DSP perf, "scales to huge graphs", deep
  hardware interop, GC-free, touch-first authoring). Positioning = open/durable/accessible.

---

## 2026-06-28 — v1.2.14: CONFIRMED working + stripped OpenCV debug logging

User confirmed in their browser: **OpenCV CV nodes paint** (the v1.2.12 worker init + MessageChannel
port fix landed) **and** the **emulator survives going off-screen** (v1.2.13). Both the long
"CV nodes never paint" saga and the emulator off-screen crash are RESOLVED.

Cleanup shipped here:
- `opencv.worker.ts`: `DEBUG` flipped to **false** (lifecycle logs are gated behind it — one flip to
  re-enable the load→ready→process→result trace if CV ever regresses). Removed the unconditional
  top-level boot log.
- `OpenCVService.ts`: removed the two diagnostic `console.info`s (`spawning worker`, `worker reported
  ready`). Real errors (`console.error`, node `_error` output) are unchanged.
- Production CV console is now quiet. Gates green (typecheck / lint / test:unit 1494 / build:web).

No open OpenCV/emulator items remain. (Deferred, unrelated tech debt still in the architecture-audit
notes below: shared `WorkerFacade` is only mock-tested for AIInference; built-in nodes aren't authored
as isolated packages like `CustomNodeLoader`; `executors/index.ts` mixes aggregation + inline executors.)

---

## 2026-06-28 — v1.2.13: emulator survives Vue Flow virtualization (off-screen crash)

User report: the Emulator node crashes (`RuntimeError: Aborted(undefined)` from the libretro core,
then `Cannot read properties of null (reading 'classList')`) when the node is scrolled/zoomed
partially off-screen. Root cause: `EditorView.vue` sets `:only-render-visible-elements="true"`, so
Vue Flow **unmounts** off-screen nodes. `EmulatorNode.vue`'s `onUnmounted` tore the emulator down on
EVERY unmount — `unregisterEmulator()` + `removeChild(host)` — ripping the EmulatorJS WebGL canvas
out of the DOM → context loss → core abort → EmulatorJS error path hits a now-null element. The
existing `onActivated`/`onDeactivated` park/dock only covered KeepAlive tab-switches, not
virtualization. (Not related to the OpenCV/WorkerFacade work — separate subsystem.)

Fix — decouple the emulator's lifetime from the node component's mount:
- **`EmulatorNode.vue` `onUnmounted`**: if the node is still in `flowsStore.activeFlow.nodes`
  (virtualized, just off-screen) → `parkHostOffscreen()` and KEEP it alive; only on real removal
  (node deleted / flow closed) → `unregisterEmulator()` (frees loader/texture/host). `onMounted`
  now RE-ADOPTS a still-running emulator via `getEmulatorLoader(id)` + `loader.getHost()` (re-dock,
  reuse loader, refresh callbacks — preserves the captured texture/audio) instead of booting anew.
- **`emulation.ts`**: new `getEmulatorLoader(nodeId)`; `cleanupEntry` gained a `removeHost` flag so
  `unregisterEmulator`/`gcEmulationState` (node gone) remove the parked host, but `disposeAll`
  (flow stop, component still mounted) does not.
- **`emulatorjs.ts`**: `EmulatorJSLoader.getHost()`.
- Bonus: the emulator now keeps running AND keeps outputting its captured texture while the node is
  virtualized off-screen — matching the expectation that it's an "off-screen canvas". Triggers
  (start/stop/reset inlets) no-op while virtualized (callbacks bound to the unmounted instance) and
  refresh on re-mount — acceptable since the node is off-screen.
- Gates green (typecheck / lint / test:unit 1494 / build:web). **Confirmed working in the user's
  browser** (couldn't headless-repro Vue Flow node virtualization with a live ROM).

---

## 2026-06-27 — v1.2.12: OpenCV worker ACTUALLY works (init + port comms)

Root-caused via a local Playwright repro (the key move — opencv is same-origin now, so it loads
headlessly). Two distinct worker bugs, both fixed; validated end-to-end against the BUILT worker
chunk (load → ready → process → Canny → result, incl. the MOG2/video module):

1. **Init never completed.** opencv.js 4.9.0 is the Promise-returning MODULARIZE build; awaiting that
   Promise (self.cv) HANGS in a dedicated worker because its resolution is deferred through a
   postMessage-based `setImmediate` that never fires (self.postMessage in a worker goes to the
   parent, not back). Fix: the CANONICAL pattern — set `Module.onRuntimeInitialized` BEFORE
   importScripts and read `cv.Mat` off the Module synchronously in that callback. Never touch the
   promise. (`opencv.worker.ts` rewritten to a top-level Module hook + lazy one-time `startLoad` +
   synchronous `handleProcess`.)
2. **Messages were intercepted.** opencv/emscripten installs a capturing `self` 'message' listener
   (its setImmediate emulation), which entangled the facade's `self.postMessage`/`onmessage` traffic
   (responses didn't arrive; the 2nd message wasn't received). Fix: route ALL facade↔worker comms
   over a dedicated **MessageChannel port** — opencv's `self` listeners never see it. Added opt-in
   `usePort` to `WorkerFacade` (port handshake + `_send`/terminate close); `OpenCVService` enables
   it; the worker adopts `event.ports[0]` and replies via `respond()`.

Other: kept the self-hosted `/vendor/opencv/4.9.0/opencv.js` (same-origin importScripts works and
is fast). Gates green (typecheck / lint / test:unit 1494 / build:web). Repro scripts were in scratch
(not committed).

### Post-deploy audit (2026-06-28) — clean
Audited the shipped diff (3 files) for regressions:
- **All 9 cv ops intact** (grayscale/canny/threshold/blur/morphology/contours/corners/optical-flow/
  background-subtraction) and the per-node Mat discipline survived the worker rewrite: `prevGrayByNode`
  /`subtractorByNode` + `disposeNode`/`disposeAllNodes`/`safeDelete`; `handleProcess` frees `scratch`
  + `src` in `finally`; optical-flow `prevGray` retention preserved. `handleProcess` is now fully
  synchronous (no `await`).
- **`WorkerFacade` change is safe for `AIInference`.** `usePort` defaults `false`, so AIInference keeps
  the original `w.onmessage` path; `_send` falls back to `worker.postMessage`; `terminate` skips the
  port. Port mode is strictly opt-in (only `OpenCVService` sets `usePort=true`). NOTE for future work:
  AIInference is exercised only via mocks in unit tests, so this base change isn't runtime-covered —
  it's behavior-preserving by construction, but a smoke test of an AI node after any `WorkerFacade`
  edit is wise.
- In port mode the worker's `self.onmessage` is left unset after the handshake, so opencv's stray
  `self` setImmediate messages are simply dropped (correct — they must not reach the facade).

### RESOLVED (v1.2.14)
- User confirmed CV nodes paint in their browser. `DEBUG` flipped to `false` (logs gated, one flip to
  re-enable) and the facade's diagnostic `console.info`s removed in v1.2.14.

---

## 2026-06-26 — v1.2.10: self-host opencv.js (CV worker was never loading)

Decisive runtime evidence from latch.design (v1.2.9): the console showed `[OpenCV] spawning
worker` and then NOTHING from the worker — no `[OpenCV worker] importScripts`, no ready, and the CV
nodes sat on "NO TEXTURE" with no error (the 60 s timeout lives inside `ensureLoaded`, which never
ran). Meanwhile the module AI worker logged `[AI Worker] Ready` and detection painted. So the
worker spawned but its `importScripts('https://docs.opencv.org/4.9.0/opencv.js')` never produced a
ready runtime — consistent with the long-standing note that the docs.opencv.org CDN is "too slow"
to finish loading (a synchronous 10 MB cross-origin `importScripts` that stalls).

Fix:
- **Vendored opencv.js same-origin**: `public/vendor/opencv/4.9.0/opencv.js` (the exact 4.9.0 build,
  verified to initialize). Worker now `importScripts('/vendor/opencv/4.9.0/opencv.js')` — fast,
  Netlify-served, no cross-origin/COEP variable. (Kept the worker CLASSIC so `importScripts` works
  and emscripten still detects the worker environment; a module worker would have needed fetch+eval
  and broken opencv's `ENVIRONMENT_IS_WORKER` detection.)
- **Boot + message diagnostics**: a top-level `[OpenCV worker] booted (classic)` log (if absent →
  the classic worker itself isn't executing, a deeper worker-load issue → switch to a module worker)
  and a per-message log. `DEBUG` still on.
- Also: OpenCV **op failures now surface on the node** (`_error`), and `sourceToImageData` skips a
  video-backed texture until `readyState >= 2` (no black warmup frame); a not-ready supported source
  no longer flashes a misleading "Unsupported source" error.
- Gates green (typecheck / lint / test:unit 1494 / build:web; vendor file copied to dist).
- **TODO once confirmed painting**: flip `DEBUG` off; consider trimming the vendored build.

---

## 2026-06-26 — v1.2.9: OpenCV worker init hardening + diagnostics

Follow-up to v1.2.8 (OpenCV → Web Worker). Reported: CV nodes no longer freeze the page but
never paint. Investigation: opencv.js 4.9.0 is the **Promise-returning MODULARIZE build**
(verified by loading it in Node — `factory()` yields a thenable that resolves to a runtime with
`cv.Mat`); the app is **COEP credentialless** (vite + netlify.toml + coi-serviceworker), under
which the worker's cross-origin `importScripts` is allowed. So neither the build type nor COEP is
an obvious blocker — the failure is browser-/worker-only and wasn't observable from here.

Shipped to make the failure self-diagnosing rather than silent:
- **Hardened worker init** (`opencv.worker.ts`): pre-sets `Module.onRuntimeInitialized` AND handles
  the Promise return AND an already-ready check (idempotent `finalize`), plus a **60 s timeout** so
  a stuck init rejects with a clear message instead of leaving the node on "loading" forever.
- **Load failures surface ON the node** (`OpenCVService.getLoadError()` → executor sets `_error`
  "OpenCV failed to load: …"), and the facade no longer re-posts `load` (no 10 MB re-download
  storm) on failure.
- **Lifecycle logging** (`DEBUG = true` in `opencv.worker.ts`): spawn → importScripts → cv typeof/
  thenable → runtime ready → first process (with input pixel sample to detect a black source) →
  first result. **TODO: flip `DEBUG` off once the in-browser paint path is confirmed.**
- Open question the trace answers: does the runtime become ready in the worker (init hang?), does a
  process run, and is the source frame non-black? Where the `[OpenCV ...]` logs stop = root cause.
- Gates green (typecheck / lint / test:unit 1494 / build:web); worker still classic + importScripts.

---

## 2026-06-26 — v1.2.7: detection stop/restart fix + OpenCV freeze fix

Two user-reported bugs. Shipped as v1.2.7.

### Detection nodes dead after stop→restart — FIXED ✓ (high confidence)
`disposeAllAINodes()` (on stop) flags every AI node disposed so in-flight detect/transcribe
promises don't write into the just-cleared cache. But the only thing that CLEARS that flag —
`gcAIState` — runs only when nodes are REMOVED from the graph, not on a plain restart. So after
stop→start on the same graph, detection/STT/depth nodes stayed flagged disposed and their async
results were silently dropped until a page refresh. Fix: `resetAINodeDisposal()` (clears the set),
called from `ExecutionEngine.start()`. Confirmed by the code path.

### OpenCV nodes freeze the page — STILL OPEN; root cause confirmed, real fix = Web Worker
User report: any OpenCV node makes the page **freeze/unresponsive immediately** (not OOM, not a
specific node). v1.2.7 pinned the loader off the floating `docs.opencv.org/4.x` alias (it had
silently jumped to a ~11 MB **4.13.0** build) to **4.9.0**, and added a ≤1280px CV resolution cap.
**The user confirmed v1.2.7 did NOT fix the freeze** → it is **not version-specific**: the freeze
is inherent to loading/initializing a **~10 MB opencv.js on the MAIN thread** (parsing 10 MB of JS
+ instantiating the WASM blocks the UI thread; any cv node triggers it). Confirmed: opencv.js never
finishes initializing in a headless sandbox either. Ruled out by audit: per-frame Mat leak (freed
in `finally`), capped error array, GPU-texture leaks. WebGPU is N/A (opencv.js is CPU/WASM).

**REAL FIX (open task): move OpenCV into a Web Worker.** Load opencv.js + run all cv ops in a
worker (off main thread), mirroring the existing AI worker (`ai.worker.ts` + `AIInference.ts` +
the `runLiveDetection` deferred fire-and-cache executor pattern). Texture I/O stays on main.
Full plan: **`docs/plans/OPENCV_WORKER_MIGRATION_2026-06-26.md`**. Kept in place going in: the
4.9.0 pin + the `CV_MAX_DIM=1280` cap in `sourceToImageData` (both still useful).

#### IMPLEMENTED (worker migration) — needs a real-browser confirm ✓ pending
- **`services/visual/opencv.worker.ts`** (new): CLASSIC worker (spawned without `{type:'module'}`
  so `importScripts('https://docs.opencv.org/4.9.0/opencv.js')` works). Lazy-loads opencv.js on the
  worker thread (no main-thread freeze), runs all 9 ops, copies each result Mat out as RGBA bytes
  (`matToRGBA`, no OffscreenCanvas/imshow needed), and transfers the buffer back. Every transient
  Mat freed in `finally`; per-node persistent Mats — optical-flow `prevGray`, MOG2 subtractor —
  live worker-side keyed by nodeId, freed on `dispose`/`disposeAll`.
- **`services/visual/OpenCVService.ts`** (reworked): worker facade — promise-per-request keyed by
  id, `isReady()/isLoading()/load()` (resolves on the worker's `ready` msg), `process(nodeId, op,
  params, imageData)` (copies pixels into a fresh transferable so upstream ImageData isn't
  detached, transfers both ways), `dispose(nodeId)`/`disposeAll()`. Old `getCV()` removed.
- **`engine/executors/opencv.ts`** (rewritten): shared `runCvNode()` deferred runner — throttle by
  `interval`, one in-flight op per node, serve last texture + cached scalar outputs every frame,
  update when the async result lands (guarded by `isOpenCVNodeDisposed`). `sourceToImageData` + the
  `CV_MAX_DIM=1280` cap + texture create/update stay on main. `disposeOpenCVNode`/`gcOpenCVState`/
  `disposeAllOpenCVNodes` now also free the worker's per-node Mats; `resetOpenCVNodeDisposal()` is
  wired into `ExecutionEngine.start()` (stop→restart safety, same as the AI fix above).
- Gates green: typecheck / lint / `test:unit` (1494 pass; `opencv.test.ts` rewritten to the worker
  facade) / build (emits a separate classic `opencv.worker-*.js` chunk). **Still TODO: confirm in a
  real browser** (`npm run dev`, webcam → cv-canny → main-output) that the page no longer freezes
  and the cv output renders/updates — opencv.js doesn't load in headless sandboxes. Also re-check
  cv-optical-flow + cv-background-subtraction (stateful) and stop→restart.

#### FOLLOW-UP — architecture audit + shared worker facade (same session)
A 3-agent deep audit (node authoring / worker threading / monolith+docs) found the backbone sound
(flat executor map, real async model, ~100% dispose/gc discipline) with two real gaps: (1) built-in
nodes are split across `registry/<cat>` + `executors/<cat>` and NOT authored as isolated units like
`CustomNodeLoader`'s `definition.json`+`executor.js` packages; (2) the worker facades were ~70%
duplicated boilerplate (the OpenCV migration above had cloned `AIInference`).
- **`services/worker/WorkerFacade.ts`** (new): shared main↔worker RPC base — promise-per-request by
  numeric id, pending map, optional per-request timeout, progress forwarding, transferables, and
  reject-all on crash/terminate. Subclass provides only `createWorker()` + `handleMessage()`.
- **`OpenCVService` + `AIInference`** now `extend WorkerFacade`. AIInference kept its public API and
  all ~15 `sendToWorker(...)` call sites (now a thin wrapper over `request()`); removed its private
  pending-map/id/timeout/onerror plumbing. OpenCVService gained a 30 s per-op timeout (a hung op now
  self-recovers next frame instead of sticking "pending"; `load` stays untimed — it downloads 10 MB).
- **ESLint guard** (`.eslintrc.cjs` override): `opencv.worker.ts` may not use ES `import`/`export`
  (would flip Vite to a module worker and silently break `importScripts`). Verified active on that
  file only.
- NOT done (deferred, low-value/high-churn): converging built-ins onto the custom-node package
  layout; splitting `executors/index.ts`'s inline executors; a `docs/executor-authoring.md` guide;
  refreshing the stale `docs/architecture/ARCHITECTURE.md`. Worker `terminate()` deliberately NOT
  added to `disposeAll()` — that runs on every engine stop, and tearing down the worker there would
  force a 10 MB opencv re-init each restart (the AI worker is a warm page-lifetime singleton too).
- Gates green after refactor: typecheck / lint / `test:unit` (1494) / build (worker types unchanged:
  opencv classic + `importScripts`, ai module).

---

## 2026-06-25 — v1.2.6: detection annotation UI + resizable, hi-dpi Main Output

User asked to make the detection overlay annotations "so much better", raise the view
resolution, make Main Output arbitrarily resizable, and give each detected class a distinct
color. Web-researched Ultralytics + Roboflow `supervision` annotator source for the specifics.
Branch `detection-ui-polish`, 2 commits, gates green, shipped as v1.2.6.

- **Annotation rendering** (`registry/ai/utils/mediapipe-drawing.ts` `drawBoundingBox`): line
  width `max(round((W+H)/2*0.003),2)` and font `max(round(0.0175*(W+H)),12)` scale to image
  resolution; rounded corners; optional `corners` (L-brackets) and `filled` styles; the label
  tag flips to inside-top when it would clip the top edge and clamps to the left/right edges;
  label text color chosen by YIQ luminance (`lum>0.6 ? black : white`) so it's readable on any
  box color.
- **Per-class colors** (`ai.ts`): boxes use the Ultralytics 20-color palette, indexed by COCO
  class (stable per class, hash fallback) — `person` always the same color, every class distinct.
  New **Box Style** (outline/corners/filled) and **Box Colors** (per-class / uniform) controls on
  both detection nodes; **Line Width 0 = auto**. HUD is a rounded pill with a status dot.
- **Main Output** (`MainOutputNode.vue`): drag-to-resize corner handle (zoom-aware, persisted via
  `flowsStore.updateNodeData`, min 160×90 / max 1280×720), reset-to-input-aspect button, replacing
  the old binary expand toggle. Preview canvas + inline `TexturePreview` thumbnails now size the
  backing buffer to display×devicePixelRatio (capped 2) → crisp instead of a tiny upscaled buffer.

**Verified (Playwright + real WebGL):** rendered a multi-class annotation scene to PNG and
eyeballed it — distinct per-class colors, readable labels on every color, the top-edge label
flipping inside, corners/filled styles. Drove the Main Output resize handle: node grew 320×180 →
640×400 (zoom-aware delta correct). App boots 0 console errors; gates green (typecheck, lint,
test:unit 1493, build). **Lesson applied:** verify a texture *effect/overlay* by reading back
rendered pixels / screenshotting, not just "returns a texture" (see [[latch-video-texture-black]]).

---

## 2026-06-25 — v1.2.5: fix shader effects rendering BLACK for webcam/video sources

**User-reported:** the new image-fx nodes "don't paint" — they (and the older blur /
color-correction / displacement / transform-2d effects) rendered **black** when fed a
**webcam/video** source. Branch `imagefx-video-fix`, 2 commits, gates green, shipped as v1.2.5.

**Root cause:** these GPU effects sample their input as a texture (`iChannel0` / `u_texture`).
The Webcam node's `texture` output is a **video-backed THREE.Texture** (`createTexture(video)`),
and Three can't upload a video-backed texture through the offscreen `ThreeShaderRenderer` — it
samples BLACK. This is the **same** video-texture issue as v1.2.1, which only fixed the
`renderToCanvas` *read* path, not the *sampler* path. (My initial browser "verification" missed
it: I compiled+rendered the shaders WITHOUT binding iChannel0, so a blank result still looked
"OK". Driving the real executor with a captureStream-backed `<video>` reproduced the black.)

**Fix:** `resolveEffectSource(nodeId, renderer, input)` detects a video source (raw `<video>` or
a video-backed THREE.Texture), draws its live frame to a per-node 2D canvas, and samples a
**canvas-backed** texture instead — the same video→canvas trick the detection/OpenCV nodes use.
Canvas / render-target / image sources are unchanged. The per-node conversion canvas+texture is
freed in disposeVisualNode / gcVisualState / disposeAllVisualNodes. Applied to the 8 image-fx
nodes AND blur / color-correction / displacement / transform-2d.

**Verified (Playwright + real WebGL):** a captureStream `<video>` → each of glitch / blur /
color-correction / displacement / transform-2d now paints the source (was 0,0,0); canvas /
render-target / chained sources still paint (no regression). Gates green (typecheck, test:unit
1493, lint, build).

**Lesson for next time:** to verify a texture *effect* actually paints, bind a real source and
read back the OUTPUT pixels — "compiles + returns a non-null texture" is NOT proof it paints.

---

## 2026-06-25 — v1.2.4: 18 new nodes from the NODE_LIBRARY_REVIEW backlog

Built out the highest-value web-testable nodes from `docs/NODE_LIBRARY_REVIEW_2026-06-18.md`
(the curated 53-node backlog; the old MASTER/MODERNIZATION "deferred" lists are essentially
done). Node count **220 → 238**. Branch `nodes-visual-fx`, 6 single-purpose commits, all gates
green (typecheck, lint, test:unit **1493**, build), merged to `main` and shipped as **v1.2.4**.

- **Visual VJ FX (8):** `image-fx-{glitch,rgb-shift,pixelate,kaleidoscope,scanlines,posterize,
  dither,chroma-key}` — discrete one-effect shader nodes wrapping `ShaderPresets` via a shared
  `runImageFx` (visual.ts). Compiled material is cached under the nodeId, so the existing
  visual gc/dispose frees it (no new cleanup). 4 reuse existing presets; scanlines/posterize/
  dither/chroma-key are new GLSL presets (also added to the Shader-node dropdown).
- **AI (2):** `text-to-speech` (Web Speech API, main-thread, offline) and `depth-estimation`
  (Depth-Anything via a new `estimateDepth` worker task + AIInference facade; depth-texture
  output, grayscale or colorized).
- **Audio (3):** `audio-compressor` (with reduction meter), `audio-distortion`, `audio-bitcrusher`
  — Tone.js effects on the gain/filter template (generic audioNodes map = auto-cleanup).
- **Signal/timing (5):** `slew-limiter`, `derivative`, `integral`, `tween-to-target` (new
  `signal.ts`, gc wired into ExecutionEngine like spring) + `tap-tempo`. **+7 unit tests.**

### Custom-UI audit (requested) — CLEAN
All 26 existing custom node-UI components are imported into `registry/components.ts` AND mapped
to a key that matches a real node id (verified all 26); `CUSTOM_NODE_TYPE_IDS` derives from the
same map, so the flows store can't drift. All 18 new nodes correctly use `BaseNode` (texture/
number/audio outputs — no bespoke UI). `components/nodes/_archived/` holds 8 stale duplicate
UIs that are not imported anywhere (dead code; safe to delete).

### Verification (Playwright + headless WebGL against the dev server)
- ✓ All 8 image-fx shaders **compile + render** in real WebGL (the 4 new GLSL included).
- ✓ All 18 nodes register in the running app (238 total); **0 boot console errors**.
- ✓ Signal/timing covered by unit tests.
- ⚠️ `depth-estimation` is wired correctly (reached the worker, no error) but the model didn't
  finish downloading within the headless 5-min budget (fresh context = cold cache) — same
  download-on-first-use behavior as the other transformers.js models. **Verify live.**

### Deferred (harder tail of the selected families — NOT built)
`audio-granular` (buffer/grain player), `audio-recorder` (MediaRecorder + Blob/URL lifecycle),
`mouse-pointer` + `device-motion` (need a DOM/sensor input service with listener cleanup),
`timeline-keyframe` (keyframe data model + custom timeline UI). Plus the rest of the
NODE_LIBRARY_REVIEW Tier B/C/D (DMX/Art-Net/NDI/Spout/Syphon installation outputs, etc.).

---

## 2026-06-25 — v1.2.1 + v1.2.2 + v1.2.3 SHIPPED to prod (YOLOv10 + HUD + leak fix)

**Supersedes the "UNCOMMITTED" note in the 2026-06-24 entry — that work is now committed,
version-bumped to 1.2.1, and DEPLOYED.**

### `yolo-session-cleanup` — DEPLOYED as v1.2.3 ✓
Post-deploy audit of the detection-upgrades code found a WASM-heap leak: the worker's
`yoloSessions` map (one onnxruntime-web `InferenceSession` per model URL, ~29–102 MB each) was
never `.release()`d — `handleDispose`/`handleUnload`/`handleClearCache` only cleared the
transformers `pipelines` map (pre-existing since v1.2.1's `887d843`). Now released on dispose,
clearCache, and unload (keyed by model URL). Also corrected the `wasmPaths` comment:
onnxruntime-web is a **transitive** dep via `@huggingface/transformers` (not pinned in
package.json) — re-sync the pinned version with `npm ls onnxruntime-web` after a transformers
bump. Audit otherwise clean: YOLOv10 decode, HUD, and the wasmPaths pin all verified correct.

### v1.2.1 — DEPLOYED to production ✓
Committed the 2026-06-24 vision fixes in 4 clean commits, removed the temp `__latch` debug
hook, bumped `package.json` to **1.2.1**, merged to `main` (`8c77a71`), pushed. CI green
(lint/test 1482/build + Deploy Web); gh-pages at 8c77a71; **latch.design and
latch-flow.netlify.app both 200**. No git tag pushed (a `v*` tag triggers the Electron
desktop Release workflow — not wanted). Live now: the renderToCanvas video fix (vision nodes
no longer black), MOG2 hardening, detection aspect-ratio fix, YOLO ONNX wasmPaths fix, and
D-FINE-S / RT-DETRv2 model options on the live detection node.

### `detection-upgrades` — DEPLOYED as v1.2.2 ✓
Maintainer verified the YOLO node + HUD on localhost:5173; merged `detection-upgrades` → `main`
(`--no-ff`), bumped `package.json` to **1.2.2**, pushed (CI/Netlify auto-deploy). No git tag
(a `v*` tag triggers the Electron desktop Release — not wanted). All gates green at deploy
(typecheck, lint 0-err, test:unit 1486, build).
- **YOLOv10 (NMS-free) for the YOLO node** (`1ac7dd4`): YOLOv10's one-to-one head outputs
  `[1,300,6]` = `[x1,y1,x2,y2,score,classId]` (xyxy in letterboxed 640-space, score 0–1,
  class explicit) → decode is threshold + un-letterbox, no NMS. `handleYoloInfer` branches on
  output shape (`isYolov10Output` → `parseYolov10Output`, else the v8/v9 argmax+NMS path).
  **Format confirmed empirically** — ran `onnx-community/yolov10s` on bus.jpg → exact ground
  truth `{bus:1, person:4}`. **Default model changed to YOLOv10-S (~29 MB)** from GELAN-C
  (~102 MB); YOLOv10-M + YOLOv9 kept. +4 unit tests (14 yolo tests).
- **Detection HUD + per-class colors** (`879bce8`): a status bar (count · top label · last
  inference latency ms) burned into the annotated frame (shows on the node preview AND the
  main output); per-class box colors seeded by the Box Color control; HUD gated on Show
  Labels. This is the "annotate on the preview screen" ask.

### #3 GitHub Pages — RESOLVED: do NOT enable
Enabling it would publish a **broken site**: the build uses absolute root paths (`/assets/…`,
`/coi-serviceworker.min.js`) with no CNAME, so on a `github.io/latch/` project page everything
404s (white screen; the COI service worker the app needs for `crossOriginIsolated` wouldn't
load either). Netlify serves at root, which is why it works. Leave Pages off — Netlify
(latch.design) is canonical. (Would need a `base:'/latch/'` build or its own custom domain.)

### Verification status
- **Verified:** renderToCanvas video fix (user-confirmed + repro); YOLOv10 format (empirical,
  ground-truth); all decode logic (unit tests); gates.
- **NOT yet confirmed in a real browser by the maintainer:** the YOLO node end-to-end
  (wasmPaths + YOLOv10 + worker), the HUD/per-class colors visually, and the D-FINE-S /
  RT-DETRv2 transformers.js models. The YOLOv10 harness used the same ort version + CDN
  wasmPaths + model + letterbox the app uses, so confidence is high.

### Next / backlog
- Test `detection-upgrades` on localhost (YOLO node + HUD), then deploy it (branch → main →
  CI/Netlify), same flow as v1.2.1.
- **WebGPU EP: deliberately deferred** — research found it ~2× SLOWER than WASM for detection
  in onnxruntime-web (GPU↔CPU readback overhead, ORT #18584). Revisit only with a real
  in-app benchmark.
- `ai.worker.ts` `ort.env.wasm.wasmPaths` pins the nightly `onnxruntime-web@1.26.0-dev…`
  version string — keep in sync with package.json on any dep bump.

---

## 2026-06-24 — Vision display fix (the headline bug), detection upgrades, v1.2.0 signed release

Long session. Shipped the **signed/notarized macOS v1.2.0 release** (open item #1, was blocked on
Apple), then chased and **fixed the real reason the vision nodes rendered black**, plus several
detection-node improvements. **All v1.2.1 code changes are UNCOMMITTED on branch
`v1.2.1-mog2-hardening`.** Gates green: typecheck, lint (0 err), `test:unit` (1482), build.

### #1 macOS signed release — DONE ✓
Maintainer settled the Apple agreement; re-ran the failed v1.2.0 Release workflow
(`gh run rerun 28075087766`). Both macOS jobs cleared notarize this time (proof: `✔ Finalizing
package` took 3.5–5 min each = the Apple round-trip; the step that 403'd before). Result: **9 clean
CI-named signed assets**, the **5 stale manually-uploaded unsigned assets deleted**, and the
**release body rewritten** (dropped the "unsigned/right-click→Open" caveat, added macOS Intel, fixed
asset names). Published, Latest, not draft.

### THE BUG: vision nodes render black — ROOT CAUSE FOUND & FIXED ✓ (user-confirmed)
Symptom: webcam→output painted, but webcam→**any canvas node** (snapshot / OpenCV / detection)→output
was **black**, with a `glTexStorage2D(0×0)` + `glCopySubTextureCHROMIUM: destination level must be
defined` + `glGenerateMipmap` console flood. This path was NEVER pixel-verified before v1.2.0 (only
executor wiring was — the "in-app paint proof" used a shader source, not a webcam).
- **Root cause (reproduced with the REAL renderer code via Playwright + fake webcam):**
  `ThreeShaderRenderer.renderToCanvas()` returns **fully black for a video-backed THREE.Texture** —
  Three can't upload an `HTMLVideoElement` source through this offscreen renderer (canvas sources
  work, video doesn't; `videoTexCenter` read `[0,0,0]` vs a `drawImage(video)` control `[74,255,20]`).
  snapshot/detection/OpenCV all read the webcam *as a texture* via `renderToCanvas` /
  `threeTextureToImageData` → black frame → black output. webcam→output only worked because the Main
  Output / TexturePreview components `drawImage(video)` directly.
- **Fix** (`ThreeShaderRenderer.ts`): `renderToCanvas` now draws video sources straight to the 2D
  target. Reproduced black → green. **User confirmed it works.**
- **Debugging note for next time:** I first shipped a *different* (real but secondary) resize-corruption
  fix and it did NOT help — `glCopySubTextureCHROMIUM: Offset overflows` (resize) ≠ the user's
  `destination level must be defined` (0×0) case. The video-texture-black is the confirmed root cause.
  Isolated repros are in the session scratchpad (`videotex.mjs`, `repro.mjs`).

### Other fixes (all on the branch, gates green)
- **MOG2 hardening (orig. item #2):** moved `new cv.BackgroundSubtractorMOG2(...)` inside the
  try/catch so a build lacking the `video` module degrades to a blank mask + `_error` instead of
  throwing the executor. **+1 unit test** (11 opencv tests). MOG2 still not runtime-confirmed (opencv
  CDN throttle persists — re-attempted, WASM didn't init in headless within 90s; environmental).
- **`updateTexture` resize hardening** (`ThreeShaderRenderer.ts`): tracks uploaded dims on
  `texture.userData`, disposes+reallocs on a size change (the emulator's documented `Offset overflows`
  flood). Verified by repro. **Separate from the headline bug** — candidate for its own commit.
- **Aspect-ratio fix** (`ai.ts` `threeTextureToImageData`): was squishing every source to a square
  512×512 (distorting a 640×480 webcam, misaligning boxes). Now honors `videoWidth`/`videoHeight`.
  ⚠️ typechecks, low-risk, NOT runtime-verified.
- **YOLO node WASM 404 fix** (`ai.worker.ts`): the raw `import 'onnxruntime-web'` is a SEPARATE ORT
  instance from the one transformers.js bundles (old comment claimed otherwise), so its `wasmPaths`
  were unset → it fetched `.wasm` and got the HTML index page (`<!DO…` = the "magic word
  3c 21 44 4f" abort). Set `ort.env.wasm.wasmPaths` to the version-matched jsdelivr build (CDN
  verified serving 200; loads under credentialless COEP). ⚠️ **applied, NOT yet user-confirmed.**
  ⚠️ Version string pinned to nightly `onnxruntime-web@1.26.0-dev...` — KEEP IN SYNC with package.json.
- **Larger detection models** (`object-detection-live.ts`): added **D-FINE-S**
  (`onnx-community/dfine_s_coco-ONNX`, ~41 MB) and **RT-DETRv2 R18** (`onnx-community/rtdetr_v2_r18vd-ONNX`,
  ~81 MB) — both NMS-free transformer detectors that run through the existing generic transformers.js
  `detectObjects` pipeline (no new post-processing). ⚠️ NOT verified in-app.

### Model research (delegated, verified) — for the "bigger realtime models" ask
- **WebGPU is NOT a free win for detection** — a DETR ran ~14s WebGPU vs ~8s WASM (ORT #18584;
  post-processing forces GPU↔CPU readbacks). Did NOT switch backends.
- **Top YOLO-node upgrade: `onnx-community/yolov10s`** — 29 MB (fp16 14.6, int8 7.6), **NMS-free**
  `[1,300,6]` output that's *simpler* to decode than the current NMS path. Needs a small new decode
  branch in `yolo.ts`/worker. Not yet implemented — proposed next step A.
- int8 = WASM size lever; fp16 = WebGPU speed lever (different levers).

### Open / next (await user)
- **A)** Implement YOLOv10s (NMS-free `[1,300,6]`) for the YOLO node.
- **B)** Dedicated detection HUD preview (count/FPS/top-label, per-class colors) — the "annotate on
  the preview screen" ask. NOTE: the detection node already burns boxes into its output texture and
  the node preview shows it, so this is polish, not a gap.
- **Commit** the v1.2.1 branch once the user confirms the YOLO/model/aspect changes in-browser.
- **#3 GitHub Pages:** deploy works (CI pushes gh-pages on every main push, confirmed); 404s only
  because **Pages is not enabled in repo settings** (`gh api .../pages` → 404). Netlify (latch.design)
  is canonical. Enabling is a one-time settings toggle — maintainer's call.
- **#5:** merged `modernization` branch deleted (local + origin).

### ⚠️ PRE-COMMIT TODO
- **Remove the TEMP `window.__latch` debug hook in `main.ts`** (DEV-only block, added to drive the
  headless repro). Must be stripped before committing.

---

## 2026-06-23 (verify + extend) — in-app paint proof, MOG2 node, throttle fix

Closed the last verification gap, extended the OpenCV set, and hardened the shared
detection loop. **12 vision nodes** now; gates green (typecheck, eslint 0-error,
`test:unit` 1480, build). Branch `modernization`. Commits `6cb4a3c`, `43e1ef7`.

### In-app full-graph paint — PROVEN (the last end-to-end gap)
Drove `shader(plasma) → snapshot(continuous) → main-output` in the running dev server via
a temporary dev-only `window.__latch` hook (reverted after — not committed): real engine,
146 frames, **snapshot output = 512×512 texture with real plasma pixels** (centerRGB
`[89,252,42]`, ~all samples non-zero) and **main-output received it** (`_input_texture`
set). Confirms the createTexture(canvas)→THREE.Texture→mainOutput→PixiJS path empirically
for every texture-output node (all share it). (cv-grayscale-in-app hit the opencv CDN
throttle — environmental; opencv load + cvtColor were already standalone-proven.)

### Extended — `cv-background-subtraction` (MOG2)
Persistent `BackgroundSubtractorMOG2` per node → foreground-mask texture + foreground pixel
ratio. The subtractor lives in the WASM heap and is `.delete()`d in
`disposeOpenCVNode`/`gcOpenCVState` — **unit-tested** (mirrors the optical-flow `prevGray`
discipline). OpenCV node count: 8 → **9**.
- **Audit fix:** the subtractor was created once, so the `history`/`varThreshold`/
  `detectShadows` controls were dead after frame 1. Now rebuilds (freeing the old) when the
  params change — **unit-tested**.
- **Caveat:** MOG2 itself isn't runtime-verified (the opencv.js CDN throttled every smoke
  attempt today). It uses the documented opencv.js API (`new cv.BackgroundSubtractorMOG2`),
  lives in the same `video` module as the proven optical-flow path, and degrades gracefully
  (try/catch → blank mask) if absent.

### Fixed — `runLiveDetection` throttle startup eagerness (`43e1ef7`)
The shared loop read `lastFrame` with a `0` default and gated on `!lastFrame`, so a stored
frame 0 read as "never ran" and re-fired detection every frame at startup (guarded from
pile-up by `pendingOperations`, but wasteful). Now uses a `-1` sentinel. Found by the new
**runLiveDetection tests** (throttle + cache + topLabel) covering both Tier A and Tier B.

### State
Vision total: **12 nodes** (snapshot, object-detection-live, object-detection-yolo, 9× cv-*).
**23 vision unit tests** (10 opencv + 10 yolo + 3 live-detection). Bumped to **v1.2.0**;
merged to `main` (PR #2) and released the Electron build.

---

## 2026-06-23 (Tier B) — YOLOv8/v9 ONNX detection node (onnxruntime-web)

Built the Tier B node the entry below deferred. Raw YOLO detection via
**onnxruntime-web in the worker**, browser-proven end-to-end. Gates green
(typecheck, eslint 0-error, `test:unit` 1476, build); **+10 unit tests**.
Branch `modernization`, **not pushed**. Commit `446b19a`.

### Shipped — `object-detection-yolo` (ai)
- **`services/ai/yolo.ts`** — pure, layout-robust post-processing: `parseYoloOutput`
  (decodes `[1,84,8400]` *or* transposed `[1,8400,84]`; cxcywh→xyxy; undoes letterbox
  scale/pad → original coords; per-class conf filter), `nms` (per-class greedy, agnostic=
  false), `iou`, `COCO_LABELS`. **10 unit tests** (`tests/unit/services/yolo.test.ts`).
- **`ai.worker.ts`** — `import * as ort from 'onnxruntime-web'` (the same singleton
  transformers already configures at import, so wasm just works); lazy `InferenceSession`
  per model URL (cached, failed loads not cached); `OffscreenCanvas` letterbox → CHW
  float32 `[1,3,640,640]`; runs, then `parseYoloOutput`+`nms` with `numClasses=80`.
  Branches in `handleInfer` on `method==='detectYolo'` before the pipeline lookup.
- **`AIInference.detectYolo(image, modelUrl, threshold, iou)`** — same return shape as
  `detectObjects`; 5-min worker timeout (first call downloads the model).
- **Node + executor** — `object-detection-yolo` reuses the live-overlay loop, which I
  **refactored into a shared `runLiveDetection(ctx, detect, opts)`** so Tier A
  (`object-detection-live`) and Tier B share one code path (the only diff is the `detect`
  fn + controls). Default model **gelan-c** (`Xenova/yolov9-onnx`, ~102 MB, CORS-ok);
  `modelUrl` is an editable select so users can point at a lighter `yolov8n.onnx`.

### Verified
- **Definitive real-image proof** (Chrome via Playwright, stable ort 1.20.1 from jsdelivr):
  ran the actual `gelan-c.onnx` on the classic `bus.jpg` (810×1080) with yolo.ts's exact
  parse+NMS inlined → **`{ bus: 1, person: 4 }`**, the exact ground truth, scores 0.81–0.95,
  boxes landing on the subjects in image-pixel coords. This empirically settles the three
  things the format-only smoke left open: **scores are sigmoid'd (0–1, not logits)**,
  **output dtype is Float32Array**, and **letterbox + `(coord−pad)/scale` decode is correct**.
  Output confirmed `[1,84,8400]` (input `images`, output `output0`); used the identical ort
  API the worker uses (`InferenceSession.create`/`Tensor`/`run`/`inputNames`/`outputNames`/`dims`).
- **Build bundles ort into the worker** (webworker chunk) — no Vite/worker errors.
- Why YOLOv9/GELAN not YOLOv8: the clean COCO `yolov8n` ONNX repos are gone (401);
  `Xenova/yolov9-onnx` is public + CORS + the model behind Xenova's in-browser demo, and
  YOLOv9's detection head output is byte-format-identical to YOLOv8 — same pre/post.

### Open / not done
- The shared **`runLiveDetection`** loop (refactored out of the Tier A executor; now used by
  both detection nodes) has no direct unit test — it's a faithful extraction (typecheck +
  build + 1476 tests green, and the YOLO detect path is real-image-proven through it), but a
  throttle/cache test would lock the shared infra. Low risk; good next target.
- gelan-c is ~102 MB — heavy first load; surfaced in the node's Loading output + info.

---

## 2026-06-23 — Vision node families shipped (snapshot, live detection, OpenCV.js)

Implemented the three families planned in the entry below, per
`docs/plans/VISION_NODES_PLAN_2026-06-22.md`. **10 new nodes + one new service.** Gates green
throughout (typecheck, eslint 0-error, `test:unit`, production `build`); 8 new unit tests.
Branch `modernization`, **not pushed**.

### Shipped
- **`snapshot`** (visual, `b495ada`) — latch/hold a still from any texture feed on rising-edge
  `trigger` or `continuous`; `mirror`; outputs held texture + imageData + dims + `captured`
  pulse. gc via the existing `gcVisualState`/`disposeAllVisualNodes`.
- **`object-detection-live`** (ai, `e98ac6f`) — continuous YOLOS/DETR detection on a live feed
  with an **annotated-texture** output (boxes/labels drawn over the frame via
  `mediapipe-drawing.drawBoundingBox`). Reuses `convertToImageData` + `aiInference.detectObjects`;
  frame-skip throttle + `pendingOperations` guard + `getCached`. Dedicated `liveDetectState` map so
  the THREE.Texture is disposed in `gcAIState`/`disposeAllAINodes` (the generic nodeCache GC would
  drop the key without disposing the texture).
- **OpenCV.js** (`0e5d35e`, `ed223da`, `5651c8c`) — new `services/visual/OpenCVService.ts` (lazy CDN
  load, `load()/isReady()/isLoading()/getCV()`), new `engine/executors/opencv.ts`, new
  `registry/opencv/`. **8 nodes:** `cv-grayscale`, `cv-canny`, `cv-threshold` (fixed/Otsu/adaptive),
  `cv-blur` (gaussian/median), `cv-morphology`, `cv-contours` (+contour data), `cv-corners`
  (Shi-Tomasi), `cv-optical-flow` (Farneback, HSV viz, +mean-motion). New category wired into
  `builtinExecutors`, `allNodes`, and `ExecutionEngine` gc + teardown. Filed under category `visual`
  (left the `NodeCategory` union untouched). **Every `cv.Mat` `.delete()`d** in the op `finally` and
  in `disposeOpenCVNode`/`gcOpenCVState` — including the persistent optical-flow `prevGray`.

### Bugs found & fixed (build + 5 adversarial audit passes)
- **median-blur kernel throw** (`5651c8c`): `cv.medianBlur` asserts `ksize > 1`; a kernel of 1 from
  the slider threw → silent blank. Floored median at 3 (Gaussian is valid at 1). **Unit-tested.**
- **live-detection stale `loading`** (`023de06`): computed before the async kickoff → reported
  `false` on the triggering frame. Recompute at output time.
- **opencv.js thenable stray error** (`594fe61`): the docs.opencv.org `cv` global is an Emscripten
  thenable whose `.then()` isn't chainable, so `cvObj.then(...).catch(...)` threw an uncaught error
  on the happy path. Wrap with `Promise.resolve`. **Found by the real-browser test below.**
- **optical-flow resize wedge** (`71f5b9c`): Farneback needs both frames the same size; a mid-stream
  resolution change threw every frame and (since `prevGray` only updates on success) stayed blank
  forever. Now reseeds `prevGray` on size mismatch. **Unit-tested.**

### Verified
- **Real-browser proof** (Chrome via Playwright, page served with the app's `COOP:same-origin` +
  `COEP:credentialless`): `crossOriginIsolated` true, the cross-origin no-cors `opencv.js` `<script>`
  loads under it, WASM instantiates, and `cvtColor(RGBA→GRAY)` of pure red → **76** (=0.299×255).
  Confirms the novel CDN→WASM→Mat pipeline end-to-end. (One-off; not committed — hits a live CDN.)
- **Rendering path code-confirmed:** every new node outputs `createTexture(canvas)` → a THREE.Texture
  wrapping a real-pixel 2D canvas; `mainOutputExecutor` passes it through as `_input_texture` to the
  PixiJS display — **byte-identical to the shipping `webcam-snapshot`**. Outputs stay on the
  ThreeShaderRenderer context (display in Main Output/shaders; blank in 3D nodes — the documented
  3-context gotcha).
- **8 unit tests** (`tests/unit/executors/opencv.test.ts`, real invocation, cv + renderer mocked):
  median floor, transient-Mat frees, optical-flow `prevGray` retain→free-on-dispose, resize reseed,
  frame throttle.

### CDN decision (documented inline in OpenCVService)
`https://docs.opencv.org/4.x/opencv.js` — the **moving `4.x` alias is intentional**: docs.opencv.org
keeps only the newest 4.x build (4.10/4.11/4.12 all 404), so pinning a version is a time-bomb. Mirrors
the app's `@mediapipe/tasks-vision@latest` convention. Single-file build with the WASM embedded base64
(no sibling `opencv_js.wasm` — it 404s), so only the no-cors `<script>` is cross-origin → loads fine
under credentialless COEP. Don't "fix" it to a pinned version.

### Open / not done (by choice)
- **Live full-graph paint** (color/shader → cv/snapshot → main-output actually painting): not run.
  Path is code-confirmed identical to the shipping `webcam-snapshot` and the OpenCV half is
  browser-proven, so residual risk is low; a full e2e rig (dev store-hook + headless WebGL + PixiJS
  readback) wasn't judged worth it. Easy to add later — `flows` store exposes `addNode`/`addEdge`.
- **Tier B (YOLOv8-ONNX)** — deferred per the plan's gate ("only if YOLOS/DETR insufficient"; no
  evidence it is). Needs onnxruntime-web direct + letterbox + NMS + a hosted `.onnx`.
- **`object-detection-live`** not exercised against a live model (transformers.js download); logic
  mirrors the shipping `object-detection` node.

### State
Node count **+10 → 218** (prior entry: 208). Working tree clean, **nothing pushed**. Gates green:
typecheck, eslint (0 errors), `test:unit` (1466 pass), production `build`. Commits `b495ada`,
`e98ac6f`, `0e5d35e`, `023de06`, `ed223da`, `5651c8c`, `00b25aa`, `594fe61`, `71f5b9c`.

---

## 2026-06-22 (late) — Emulator + effects fully working; persistence data-loss fixed; vision nodes planned

User-confirmed: **"it all finally works."** Everything below shipped to `main` and is live
(GitHub Pages + Netlify). Gates green each deploy (typecheck, lint, 1458 unit tests, build).

### Emulator + texture pipeline — RESOLVED (closes the saga in the entry below)
- **Effect nodes were throwing on missing built-in uniforms (`fae1e2d`).** `render()`/`renderToScreen`
  in `ThreeShaderRenderer` set `uniforms.iTime.value`/`iResolution`/`iChannel0…` unconditionally, but
  `compileEffectShader` only creates the uniforms an effect declares (`u_texture`, …). `undefined.value`
  threw a TypeError every frame (swallowed by the engine) → **every effect node** (color-correction,
  blur, blend, displacement) rendered blank for **every** input. This — not the cross-context theory —
  was the real cause of "emulator texture won't work in other nodes." Fixed by guarding each built-in
  uniform. (Two prior misfires on this: a `needsUpdate` fix that sat *after* the throw, and the
  cross-context analysis. Reading it to the actual TypeError cracked it.)
- **Effect resolution preserved (`5b802d4`).** `render()` now defaults its output size to the input
  texture's resolution (from `u_texture.image`, which also carries size for render-target inputs) so a
  non-square source (emulator 958×684) isn't squished into 512². Generative shaders keep 512².
- **Emulator capture (`4096012`) + texture realloc on resize (`9629507`).** Blit the WebGL canvas
  through an intermediate 2D canvas (a WebGL canvas is an unreliable cross-context texture source);
  recreate the THREE texture when the frame size changes (killed the `glCopySubTexture` flood).
- **Control-tab freeze (`fd89420`).** KeepAlive deactivates the editor on the Control tab → detaches the
  emulator canvas → EmulatorJS stops painting. EmulatorNode now renders into a managed host that parks
  off-screen-but-attached to `<body>` on deactivate (keeps painting) and docks back on activate, pinning
  the host+canvas size so it can't resize. User-confirmed working.

### Persistence — silent data-loss fixed (`b2c73f1`, `bfa80cc`)
Imported flows now persist to IndexedDB; the Save button writes to the DB (was: clear dirty + download
only, which also suppressed autosave); a `beforeunload` guard warns on web (no-op in Electron so it
can't block quit); node-drag marks dirty; `markFlowSaved(flowId)` clears the saved flow not the active
one; `saveAllFlows` preserves each non-active flow's stored connections. See AUDIT_2026-06-19.md pass 2.

### Next up — new vision node families (planned this session)
User wants: (1) a **generic snapshot node** (capture a still from any video/texture feed on trigger),
(2) **AI-on-live-video** (object detection — YOLOS/DETR via Transformers.js, optional YOLOv8-ONNX),
(3) **OpenCV.js** image-processing nodes. Full plan + a ready-to-paste kickoff prompt in
**`docs/plans/VISION_NODES_PLAN_2026-06-22.md`**. Key facts grounding it: there's already a
webcam-specific `webcam-snapshot` (no generic equivalent), a Transformers.js `object-detection` node
(YOLOS already a registered model) and a MediaPipe `mediapipe-object` node (both output data only, no
annotated texture), `onnxruntime-web` is present transitively via transformers, OpenCV is net-new
(CDN lazy-load like MediaPipe; Mats MUST be `.delete()`d via the gc/dispose path).

---

## 2026-06-22 — Wire-preservation, public-readiness, emulator texture saga; all shipped to main

Branch `modernization`, fast-forwarded to `main` and **deployed** (GitHub Pages + Netlify) several
times this session. All green each deploy: typecheck, lint, **1456 unit tests**, build.

### Shipped (on `main`)
- **Copy/paste/duplicate/snippet now preserve wires.** New tested flows-store actions
  `serializeSelection` (capture a selection + only its internal edges) + `insertSubgraph` (clone
  with fresh ids, remap internal edges). Fixes the headline "wires lost on paste/snippet" bug.
- **Public-readiness:** added `LICENSE` (MIT) + `CONTRIBUTING.md`, refreshed stale docs (node count
  133+/196 → 208, `dev:electron` command, test counts), untracked `.DS_Store`, moved the stray
  design-system mockup into `docs/`.
- **Test hardening:** strengthened `insertSubgraph`/subflow/heal/duplicate assertions, added the
  connect-throttle test + Electron-bridge global checks in `code.test.ts`; added `@vitest/coverage-v8`
  (the `test:coverage` script had no provider). flows.ts coverage 38%→81%. Mutation-tested the new
  guards (both caught).
- **Debug console** now renders each log as its own card (type badge + timestamp + body), not a flat
  stream.
- **Emulator → texture** (multi-step saga, see below).

### Emulator saga (resolved for the editor; two items still open)
1. **Capture fix (shipped):** the executor blits the emulator's WebGL canvas into an intermediate 2D
   canvas, then textures from that — a WebGL canvas is an unreliable cross-context texture source.
   Fixed the editor freeze.
2. **Control-tab reparenting attempt (shipped then REVERTED):** parking the emulator host off-screen
   on view switch resized the canvas and caused a `glCopySubTextureCHROMIUM: Offset overflows texture
   dimensions` flood that corrupted the texture for *all* consumers. Reverted.
3. **Texture-size fix (shipped, current):** recreate the THREE texture whenever the frame size changes
   (`emulation.ts`) instead of uploading a larger canvas into stale storage. Killed the flood.

**Still OPEN (post-audit 2026-06-22):**
- **Cross-context texture (HIGH, NEW):** there are THREE live WebGL contexts — `ThreeShaderRenderer`
  (shaders + previews + emulator), `ThreeRenderer` (all 3D nodes), `UnifiedRenderer` (unused). A
  `THREE.Texture` uploaded in one context can't be sampled in another, so the emulator's texture (and
  any canvas/video THREE.Texture) is blank when fed to **3D nodes**. This is the real cause of "not
  working as texture in other nodes." Fix: in `3d.ts:convertToThreeTexture`, rebuild a
  Canvas/VideoTexture in the 3D context from `inputTexture.image` instead of returning the foreign
  texture (same pattern its raw-element branches already use). Same-context consumers (shaders, Main
  Output) work fine once the size flood is gone.
- **Control tab blank:** KeepAlive keeps `EditorView` mounted but *deactivates* it (detaches DOM), so
  the emulator canvas stops painting on the Control tab. The reparenting fix was wrong; the sound
  approach (app-root host, or only-on-the-canvas keep-rendered) needs local testing before deploy.

### TOP PRIORITY — persistence / silent data loss (2026-06-22 pass 2, see AUDIT re-audit pass 2)
The most severe open items: users can silently lose saved work on the public build.
- **Imported flows are never written to IndexedDB** → gone on reload (`importFlows` mutates store only;
  autosave watches only the active flow's dirty).
- **The "Save" button doesn't persist to the DB** (`AppHeader.saveProject` clears dirty + downloads a
  file, never calls `saveFlow`; clearing dirty also suppresses autosave).
- **No `beforeunload` guard** + 2s debounced autosave → recent edits lost on reload/crash.
- **Node drag never marks dirty** → layout reverts on reload.
- Plus: full `NodeDefinition` baked into every persisted node (bloat), no schema migration, no quota/
  eviction handling (can evict ALL saved flows), autosave can clear dirty on the wrong flow.
These rank ABOVE the texture bugs below — they lose real user work today.

### Other NEW audit findings (2026-06-22) — see AUDIT_2026-06-19.md re-audit section
- **`multiple: true` input ports drop all but the last edge** (HIGH, `ExecutionEngine.ts` `getNodeInputs`):
  Scene-3D / Group-3D expect an array but get one value, so only one wired object/light renders.
- MED/LOW: per-frame metrics serialization + reactivity bump; `renderToCanvas` per-frame canvas/array
  allocations on the scaled-readback path; FPS counter can latch to Infinity on a 0-delta frame.
- Correction: audit #10 (asset blob URL revoke) is already mitigated in `AssetStorage.deleteAsset`;
  only the orphan-node-ref half stands.

---

## 2026-06-19 — Audit fixes landed + re-audit (verification pass)

Branch: `modernization`. Committed & pushed (no PR). All green: typecheck clean, eslint clean,
**1420 unit tests pass (11 todo)**, build succeeds.

### Landed this cycle (4 commits)
- Tier 1 security: Electron IPC hardened (`setWindowOpenHandler` + `shell:openExternal` http(s)-only,
  asset/custom-node file handlers `..`-contained), Function/Expression code global-shadowing preamble
  + honest relabel (+ `code.test.ts`).
- Tier 2 robustness: per-frame connect-storm throttle (mqtt/ws/http), `ConnectionManager.disconnect`
  unwedge, `AIInference` worker-crash rejects pending, `deleteFlow` frees undo/redo history (+ tests).
- Deliberately **not** done (would degrade core LAN/arbitrary-connection use): SSRF host-allowlist /
  strict CSP.

### Re-audit (5 parallel passes) — see `AUDIT_2026-06-19.md` "Re-audit / verification pass"
- Verified the 6 fixes: #7/#8/#9 solid. **3 corrections** to "done" claims: `shell:openPath`/
  `showItemInFolder` left unguarded (but unbridged → latent, not live); `customNodes/compiler.ts`
  user-code path has no preamble (undocumented trust asymmetry); `lastConnectAttempt` keys never gc'd.
- **New HIGH:** `exposeControl` never persists to localStorage (`ui.ts:457`); Oscilloscope/Equalizer
  leak their Tone analyser node (only `disconnect`, never `dispose`); BLE legacy node double device-picker.
- **New MED:** `controlPanelLayout` orphaned on node delete; clasp captureStream/`<video>` + sendClient
  double-connect leaks; per-frame `DataTexture` alloc on raw-WebGLTexture→Shader path (#11 priority);
  shadow-map + GLTF-map disposal gaps (shared-texture risk on material maps); RT-pool no eviction.
- **Reassessed:** #14 MediaPipe stream = non-issue (webcam node stops its own stream); #15 STT
  AudioBufferService already torn down via `disconnect()`.
- Fix order for the follow-up pass is documented at the end of `AUDIT_2026-06-19.md`. **No code fixes
  this pass — audit/doc/commit/push only.**

---

## 2026-06-19 — Node-library review + discoverability/UX + first nodes

Branch: `modernization`. All work committed (single-purpose commits, no AI attribution).
Driven by `docs/NODE_LIBRARY_REVIEW_2026-06-18.md` — its implementation-status block tracks
each item; this is the narrative summary.

### Landed
- **Correctness — duplicate node ids fixed.** `counter` (data+code) and `sample-hold`
  (logic+code) collided in the id-keyed registry Map, and the winning *definition* and
  winning *executor* were crossed — leaving both nodes effectively broken. Kept one coherent
  def+executor pair each (`counter`→code, `sample-hold`→logic/utility), deleted the dead
  twins, added a DEV duplicate-id warning in `useNodesStore.register()`, and a
  `registry-integrity` test.
- **Leak — subflow contexts.** `clearAllSubflowContexts()` was called nowhere; added
  `gcSubflowState()` + wired both into `ExecutionEngine` (per-node GC + `stop()`).
- **Discoverability.** Search already matched name+description+tags but most VJ-facing nodes
  had no tags. Added creative-coding vocabulary across the library — tagged-node coverage
  **70 → 148 of 205** (echo/noise/glitch/feedback/tempo/donut/whisper… now resolve; the
  Shader presets are searchable). Added **tag filter-chips** to the Node Explorer and a
  **port-type colour legend**; rendered **per-category icons** (single-source
  `utils/categoryIcons.ts`) in the palette + explorer; hid empty categories; clarified the
  Control Panel empty state.
- **Brand — purple = AI only.** Repointed stray category purples (debug→slate,
  messaging→cyan, subflows→lime) and non-AI accent purples (EQ/parametric-eq→cyan, synth
  section→blue, xy-pad→pink). The `string` *data-type* port colour is intentionally left
  violet (separate colour axis) — open decision if it should change too.
- **New nodes (Tier-A from §2), all stateless + unit-tested:**
  - **Noise** (`math/noise`) — 3D simplex + fBm; value(-1..1)/normalized(0..1); X/Y/Z +
    frequency/octaves/seed.
  - **Color Ramp** (`visual/color-ramp`) — value→colour; 7 colormaps + custom 2-stop;
    `[r,g,b,a]` output matching the Color node.
  - **Euclidean Rhythm** (`timing/euclidean`) — Bjorklund pattern (E(3,8) tresillo,
    E(5,8) cinquillo); stateless, driven by a `step` index; gate/value/pattern outputs.
  - **Easing** (`math/easing`) — shapes a 0–1 value through 20 easing curves (quad/cubic/
    sine/expo/back/elastic/bounce); stateless; composes with any 0–1 signal.
  - **Spring** (`math/spring`) — damped-oscillator physics toward a target (tension/
    friction/mass); value/velocity/atRest. First new *stateful* node this cycle —
    gc/dispose wired into ExecutionEngine + a gc regression test. A pre-flight audit
    confirmed every executor's cleanup is wired into the engine (no leaks).
- **Node body previews for the 5 new nodes** (`components/preview/{ColorRamp,Easing,
  Euclidean,Noise,Spring}Preview.vue`): a real user picked a palette/curve/rhythm blind —
  these draw a live gradient bar / easing curve / rhythm dots / noise wave / spring response
  in the node body, reusing the *exact* executor logic (PALETTES/EASINGS/bjorklund/fbmNoise)
  so the preview always matches output. Wired via a `NODE_PREVIEWS` map in BaseNode that
  forces the node non-compact (like `hasTextureOutput`) — **no `components.ts` custom-node
  entry needed** (these stay plain BaseNode nodes), which sidesteps the easy-to-miss
  registration step. NB for future rich-UI nodes: a dedicated custom component DOES require
  adding it to `registry/components.ts` `nodeTypes` (the single source `CUSTOM_NODE_TYPE_IDS`
  the flows store reads) or it silently falls back to BaseNode.
- **Testing pass.** Added tests for the subflow GC, the `register()` guard, `categoryIcons`
  exhaustiveness, the explorer tag-filter store, Color Ramp preset↔palette sync, plus full
  coverage for Noise / Color Ramp / Euclidean.

### Fixed (per-frame storms, carried from AUDIT_2026-06-16 — priority #2)
- **imageLoader asset-fail storm** (`visual.ts`): a missing assetId re-fired `getAssetUrl`
  every frame because the not-found/catch paths never latched `state.loadedUrl`. Fixed
  (a Trigger still forces a retry).
- **webcam-snapshot `getUserMedia` re-prompt loop** (`visual.ts`): after a denial it
  retried every frame. Added a `failed` latch, cleared when the device/resolution changes.
- **http-request flood** (`http.ts`): a held-true `trigger` fired a fetch every frame
  (level-trigger, in-flight flag never read). Now fires on the rising edge only + gates on
  the in-flight `:loading` flag. **Unit-tested** (existing http suite extended to 20 tests).
- **`BleAdapter` notification-listener leak** (HIGH): the handler added as
  `characteristicvaluechanged` differed from the closure stored in `notificationHandlers`,
  so it could never be removed and stacked (retaining `this`) on every reconnect. Now stores
  and removes the same handler (via a `detachNotificationListeners` helper used by
  unsubscribe/doDisconnect/dispose) and drops the prior listener on re-subscribe.
  **Unit-tested** (`BleAdapter.test.ts`, 5 cases).
- A connectivity audit precisely scoped the remaining async-robustness items (all still
  open, no GPU needed): the **mqtt/ws/http/BLE connect backoff** (no per-attempt throttle —
  ~60 connects/s while failing), **`ConnectionManager.disconnect` error-masking** → wedged
  toggle, and the shared-`autoReconnect` **clasp** mutation. Good next targets.
- A deep audit of the visual/texture subsystem confirmed all executor gc is wired and that
  a **feedback-buffer node is feasible** following the `getOrCreateRenderTarget` pattern,
  but it needs live GPU verification (not unit-testable) and the subsystem still has open
  MED texture-ownership leaks (`createTextureFromWebGL`, `disposeObject` maps,
  `TextureBridge.gc`) — see AUDIT_2026-06-16.
- **Emulator unusable after flow stop** (`engine/executors/emulation.ts`): the node
  component registers once on mount (kept alive across views), but `disposeAllEmulationNodes()`
  did `emulators.clear()` on every flow-stop — orphaning the registration so the node was dead
  with no re-registration path. Fixed: tear down the running emulator + free its texture/audio
  on stop, but **keep the registrations** (cleaned per-node by unmount/gc instead).

### Open — emulator (needs live debugging; not statically resolvable / not headless-testable)
- **Emulator → Main Output only updates one frame (on view switch); editor preview frozen at
  first frame.** Traced the whole path — it looks correct: the executor runs every frame (not
  in `PURE_NODE_TYPES`), calls `updateTexture` (sets `needsUpdate`, `texture.image` = the live
  EmulatorJS canvas), and both Main Output surfaces (editor `MainOutputNode` `drawImage`; the
  Control-tab widget `renderToCanvas`) run their own rAF loops. So the freeze is a runtime/
  WebGL behavior, not the plumbing. Prime suspects to check live: (a) the EmulatorJS canvas not
  compositing/advancing while the editor is `display:none` on the Control tab (WebGL-hidden
  throttle); (b) whether the emulator's OWN node canvas in the editor is visibly live while
  Play is running — if yes, the issue is texture capture timing; if no, EmulatorJS is paused.
  `patchForCapture` already forces `preserveDrawingBuffer:true`.

### State
Node count **208** (was 205 pre-dedupe; 203 after the dedupe, +5 for Noise/Color
Ramp/Euclidean/Easing/Spring). Verified green:
`typecheck`, `eslint`, full `test:unit`, and the production `build`. Working tree clean
(only `.DS_Store`). Nothing pushed.

### Open / next
- **`docs/AUDIT_2026-06-19.md`** — fresh whole-codebase audit (6 parallel passes). Headline:
  the Tier-1 **security** cluster (user-code "sandbox" isn't one; flow-import → one-click RCE
  on Play; `setWindowOpenHandler`/IPC path-traversal; no CSP/SSRF guard) — all carried/open.
  Then the **per-frame connect storm** (mqtt/ws/http/BLE), `ConnectionManager.disconnect`
  masking, `AIInference` worker `onerror` not rejecting pending, history/asset memory leaks,
  and the GPU texture-ownership leaks. See that doc for the prioritized fix order.
- **Tier-A WebGL nodes** (the signature visual gaps — need render-pipeline integration, not
  drop-in): **feedback buffer** (highest VJ value — trails/echo/zoom), text→texture, discrete
  image-FX, particles.
- **Control Panel allow-list ↔ `exposedControls`** (review Part 4.2): the hardcoded
  `controlNodeTypes`/`monitorNodeTypes` arrays mean custom control nodes never surface.
- **Decision:** recolour the `string` data-type port colour off violet, or keep it.
- **Carried (from `AUDIT_2026-06-16.md`):** the `with(ctx)` non-sandbox + flow-import trust
  prompt + `setWindowOpenHandler` allow-list (security); per-frame storms; lazy executor
  registration; split the `executors/index.ts` + `ai.ts` god-files.
</content>
