# LATCH Polish & Architecture Plan — 2026-06-28

Companion to `docs/AUDIT_2026-06-28.md`.

> **Sequencing is owned by `docs/plans/ROADMAP_2026-06-28.md`** (canonical Phases
> 0–9). The `P0–P4` labels below are a design grouping, NOT the execution order —
> defer to the ROADMAP.
>
> **Stream 1 (modularization) is superseded by
> `docs/plans/EXTENSIBILITY_ARCHITECTURE_2026-06-28.md`** for the architecture: the
> `NodeSpec` interface in §2.1 and the `defineNode` examples in §2.5 below show an
> EARLIER, smaller shape — use EXTENSIBILITY §3 as the authoritative interface
> (it adds `version`/`migrate`/`ui`/`requires`/`connections`/`models`). §2 here is
> kept for the migration narrative + folder shapes only. EXTENSIBILITY is also
> authoritative for the abstractions (`defineNodeState`, trigger/coercion helpers),
> node-data versioning, and the foolproofing risk register.

This is the *how* for five work streams the maintainer requested:

1. **Node/executor modularization** — de-monolith executors into self-contained,
   co-located node modules with an auto-registry.
2. **Canvas interaction** — a tool toolbar (pointer/hand/zoom), marquee
   selection, and pan/zoom gestures across mouse/trackpad/touch.
3. **Snippets tab + preview thumbnails** — a dedicated Snippets tab in the Node
   Explorer with auto-generated flow previews + a reusable `flowToPreview()`.
4. **Audit-driven fixes** — the verified P0/P1 correctness, modulation, texture,
   control-system, lifecycle, and AI-observability items.
5. **Subflow rebuild** — the large P0 from the audit (scoped here, executed last).

All work is test-driven; every phase must leave `npm run typecheck`,
`npm run lint`, and `npm run test:unit` green. Per CLAUDE.md: no commits without
explicit ask; branch off `main`.

---

## 0. Audit verification (done 2026-06-28)

An adversarial re-verification pass confirmed **17 of 20** spot-checked findings
against current code. Corrections folded into the audit doc:

- **Control min/max drop affects 127 controls, not 92** (worse than reported).
  `BaseNode.vue:666` (number branch) binds only `:step`; the slider branch
  (`:606-608`) is fine.
- **`power` Log** is log base `exponent` (default 2, no label hint) — not a
  hardcoded base-2; the real bug is the `isNaN`→0 guard letting `±Infinity`
  through (`index.ts:381`).
- **Shader `iChannel` black-frame trap is narrower:** canvas/`<video>` elements
  *are* converted (`visual.ts:618-622`); only a raw *video-backed
  `THREE.Texture`* passes unchanged (`:611-612`). Still a real trap, smaller
  surface.
- **`bindable`** is round-tripped by the custom-node validator
  (`validator.ts:112-113`) but drives no UI/runtime — effectively inert for
  binding, as claimed.
- Oscilloscope/equalizer **do** `.disconnect()` but never `.dispose()` the Tone
  analyser — leak confirmed (audit wording was already correct).

Everything else (subflows dead, coercion lie, multi-edge last-writer-wins,
`required`/`multiple` inert, render-3d depth cross-context, displacement
unguarded, image-fx/audio/3D missing modulation ports, latch/sample-hold level
vs edge, random per-frame, gain linear-vs-dB, lfo no phase/sync, blur `passes`
dead, clasp captureStream not stopped, undo skips param edits) — **CONFIRMED**.

---

## 1. Recommended sequencing (cross-stream)

The streams are mostly independent and can be parallelized, but there's one
high-leverage ordering insight: **the modularization (Stream 1) makes the
per-node audit fixes (Stream 4) dramatically cleaner** — adding an input port or
fixing an executor becomes a one-folder edit instead of touching 4–6 files. So:

| Phase | Contents | Why here |
|------|----------|----------|
| **P0 — Quick wins** | The low-risk, high-value audit fixes that don't depend on any refactor (control min/max, boundary coercion, texture traps, edge-trigger fixes, AI error outputs, per-node error badge, Tone-analyser dispose, undo-for-params) | Immediate user-visible polish + correctness; ships value before the refactor lands |
| **P1 — Modularization scaffolding** | NodeSpec interface, `import.meta.glob` registry, generic lifecycle loops, split `index.ts` by category, kill the hardcoded gc/dispose lists (Stream 1 steps 0–4) | Unlocks clean per-node work; eliminates the leak class structurally |
| **P2 — Features (parallel)** | Canvas toolbar/marquee/gestures (Stream 2) + Snippets tab/preview (Stream 3). Independent of each other and of P1 | Standalone features; can be built by separate sessions concurrently |
| **P3 — Per-node co-location + remaining audit fixes** | Move nodes into `registry/<cat>/<node>/` folders (Stream 1 step 5), folding in the modulation-port additions + functionality gaps as each node is touched | Refactor + feature work share the same edits; do them together |
| **P4 — Subflow rebuild** | Execute subflows through the real engine; instance ports; reuse model (Stream 5) | Largest effort; benefits from the modular engine landing first |

P0 and P2 can start immediately and in parallel. P1 should land before P3.
P4 is gated on P1.

---

## 2. Stream 1 — Node/executor modularization

**Problem.** `engine/executors/index.ts` is 1622 lines mixing inputs/timing/
math/logic/debug/RAG/WebLLM executors; a single node's
definition/executor/state/cleanup/component/pure-flag are spread across 4–6
files; and lifecycle cleanup is wired by hand in **23 imports + 23 gc calls +
23 disposeAll calls** in `ExecutionEngine.ts` — the exact "forgot to wire gc"
leak class CLAUDE.md warns about. **Decisive finding:** an audit found **zero
shared module-level state across executors** (every state Map is 1:1 with its
executor), so per-node isolation is safe.

### 2.1 The `NodeSpec` interface + `defineNode()` helper (`engine/defineNode.ts`, new)

**Naming.** Avoid `NodeModule` (collides with Node.js/CommonJS "modules") and
`NodePackage` (collides with the existing `CustomNodePackage`,
`CustomNodeLoader.ts:6`). The authored unit is declared with a **`defineNode()`**
helper — a verb, like Vue's `defineComponent`, so there's no overloaded noun in
day-to-day use — and the internal type is **`NodeSpec`** (the static, declarative
spec of a node, distinct from `NodeDefinition` which is just its ports/controls
metadata). This also unifies built-ins and custom nodes: `CustomNodeLoader`
already builds `{definition, executor}` at runtime — that's a `NodeSpec` too.

```ts
export interface NodeLifecycle {
  gc?(validNodeIds: Set<string>): void   // per-node removal (updateGraph)
  disposeAll?(): void                     // full teardown (stop)
  endFrame?(): void                       // per-frame hook (e.g. messaging)
  onStart?(): void                        // un-dispose on restart (AI/OpenCV)
}
export interface NodeSpec {
  readonly definition: NodeDefinition     // single source of truth for the id
  readonly executor: NodeExecutorFn
  readonly component?: Component           // falls back to BaseNode
  readonly lifecycle?: NodeLifecycle
  readonly pure?: boolean                  // dirty-mode skip eligibility
  readonly deferred?: boolean              // fire-and-latch async
}

// The authoring helper — identity at runtime, but gives inference + a stable
// surface to evolve (e.g. dev-time validation, HMR hooks) without touching call sites.
export function defineNode(spec: NodeSpec): NodeSpec { return spec }
```

The `pure`/`deferred` flags move from the engine's central allowlists onto the
spec — eliminating two drift surfaces. See §2.5 for the per-node folder shapes.

### 2.2 Auto-registry (`registry/nodeRegistry.ts`, new)

> **Foolproofing caveat (verified):** `./**/node.ts` matches **zero files in the
> current tree** (nodes are `<name>.ts` + category barrels today). The collector is
> inert until Step 1/Step 5 author `node.ts` files. Add a **count-equality guard
> test from the first commit** (`Object.keys(nodeSpecs).length === legacy
> allNodes.length`) so an empty/partial glob fails CI instead of shipping a
> zero-node app, plus a dup-id throw and a default-export lint. `nodeRegistry.ts`
> must live under `src/renderer/` (for `vite/client` types + the relative glob).
> Full risk register: `EXTENSIBILITY_ARCHITECTURE_2026-06-28.md` §6.

```ts
const found = import.meta.glob<{ default: NodeSpec }>('./**/node.ts',
  { eager: true, import: 'default' })
export const nodeSpecs: Record<string, NodeSpec> = {/* keyed by definition.id, throw on dup */}
export const allNodes        = Object.values(nodeSpecs).map(m => m.definition)
export const builtinExecutors= Object.fromEntries(Object.values(nodeSpecs).map(m => [m.definition.id, m.executor]))
export const nodeTypes       = /* glob-derived custom components, else BaseNode */
export const PURE_NODE_TYPES = new Set(Object.values(nodeSpecs).filter(m => m.pure).map(m => m.definition.id))
export const DEFERRED_NODE_TYPES = new Set(...)
export const lifecycles      = Object.values(nodeSpecs).map(m => m.lifecycle).filter(Boolean)
```

**The key win — generic lifecycle iteration in the engine.** Replace the 23
imports + two hardcoded call sites with:
```ts
// updateGraph GC site (was ExecutionEngine.ts:205-227):
for (const l of this.lifecycles) l.gc?.(validNodeIds)
// stop() site (was :842-864):
for (const l of this.lifecycles) l.disposeAll?.()
// frame end (was endMessagingFrame, :534):
for (const l of this.lifecycles) l.endFrame?.()
// start() (was resetAINodeDisposal/resetOpenCVNodeDisposal, :717-720):
for (const l of this.lifecycles) l.onStart?.()
```
`useExecutionEngine.ts` (the single registration site, `:19-23`) feeds the
collected lifecycles + deferred set. Keep the engine import-free of the registry
(pass lifecycles in via `registerLifecycles`) to avoid a circular dep.

After this, **adding a node = creating one folder with a `node.ts`.** No edits
to `ExecutionEngine.ts`, `executors/index.ts`, `registry/index.ts`, or
`components.ts`. A spec's `gc` is collected the moment the folder exists — the
leak class is structurally gone.

### 2.3 Migration (6 always-green steps)

Tests import executors by name from `@/engine/executors/{index,<category>}`
(`vitest.config.ts:11` includes only `tests/unit/**`). **Hard constraint: those
import paths + named exports keep resolving** — use barrel re-exports until a
test is intentionally moved.

- **Step 0 — scaffolding, no behavior change.** Add `NodeSpec.ts`,
  `registry/nodeRegistry.ts` (collector), and the 4 generic loops *alongside* the old
  hardcoded lists (old still authoritative). Green. Commit.
- **Step 1 — flip projections.** Source `builtinExecutors`/`allNodes`/
  `nodeTypes` from `nodeRegistry.ts`, where each `node.ts` is initially a thin
  adapter wrapping existing imports (no code moved). Add a guard test asserting
  node-id count == today. Green. Commit.
- **Step 2 — split `index.ts` by category.** Move inline inputs/timing/math/
  logic/debug/RAG/WebLLM executors (+ their 1:1 state Maps) into category files;
  keep `index.ts` a barrel re-exporting every current name. Removes the six
  `./executors/index` lifecycle imports in `ExecutionEngine.ts:7-18`. Green per
  category. Commit.
- **Step 3 — generic lifecycle becomes authoritative; delete hardcoded lists.**
  Remove the 23 imports (`:5-41`) and the two call sites (`:205-227`, `:842-864`)
  + the per-frame/on-start hooks. Add a leak test: create+delete one node of each
  stateful type in dirty mode, assert each state Map empties. **Milestone: kills
  the leak class.** Commit.
- **Step 4 — spec-derive `PURE_NODE_TYPES`/`deferred`.** Tag the pure specs
  `pure:true`; replace the hardcoded set (`:82-88`) with the collector's. Guard
  test: derived set == the **literal 24-id set** (it is 24 today, not 28 — assert
  exact set equality, not size; a stateful node wrongly marked pure = frozen
  node). Commit.
- **Step 5 — full per-node co-location (maintainer decision: do ALL ~238).**
  Move every node into `registry/<cat>/<node>/` (see §2.5), category by category,
  ordered by risk: leaf pure nodes (`add`) → stateful (`synth`) → async
  (`object-detection`). Category barrel keeps re-exporting until each co-located
  test moves (then widen `vitest.config.ts:11` include to `src/**`). Batch by
  category = one revertible commit per category. End state:
  `registry/components.ts` and `engine/executors/index.ts` are deleted (their
  jobs are now glob-derived); `engine/executors/<cat>.ts` files are emptied as
  their executors move into node folders. This is a long mechanical tail — script
  the boilerplate (a codemod that, per executor, generates the `node.ts` + moves
  the state Map) to keep it fast and consistent.

### 2.4 Risks
- **Chunking/heavy executors:** keep `eager:true` (preserves today's startup).
  Lazy-loading AI/visual/3D/opencv (Transformers/ONNX/MediaPipe/Three/OpenCV) is
  a *separate* follow-up — it makes executors async-resolved and interacts with
  the deferred/await path, so don't bundle it into the refactor. Add
  `manualChunks` when lazy-loading lands.
- **Circular deps:** `defineNode.ts`/`nodeRegistry.ts` import *types* from
  `ExecutionEngine.ts`; engine never imports the registry. The cross-category
  `getThreeShaderRenderer` is a *service* singleton (`@/services/visual/…`),
  unaffected — keep modules pointing at the service, not each other.
- **Custom (user) nodes** register via `CustomNodeLoader` → `registerExecutor`,
  orthogonal to `builtinExecutors`; unaffected.

### 2.5 File structure for adding nodes (the four authoring paths)

One glob (`registry/**/node.ts`) collects every built-in. Each node folder owns
everything about that node. Four cases:

**(A) Built-in, BaseNode (no custom UI)** — the common case (most of the ~238).
Tiny pure nodes can be a single file:
```
src/renderer/registry/math/add/
  node.ts        # export default defineNode({ definition, executor, pure: true })
```
```ts
// node.ts
import { defineNode } from '@/engine/defineNode'
export default defineNode({
  definition: { id: 'add', name: 'Add', category: 'math',
    inputs: [{ id:'a', type:'number', label:'A' }, { id:'b', type:'number', label:'B' }],
    outputs: [{ id:'result', type:'number', label:'Result' }],
    controls: [], version: '1.0.0', icon: 'plus', platforms: ['web','electron'],
    info: { overview: '…' } },
  executor: (ctx) => new Map([['result',
    ((ctx.inputs.get('a') as number) ?? 0) + ((ctx.inputs.get('b') as number) ?? 0)]]),
  pure: true,
})
```
When a node grows, split without changing the glob contract:
```
registry/math/remap/
  definition.ts   # export const definition: NodeDefinition
  executor.ts     # export const executor: NodeExecutorFn
  node.ts         # defineNode({ definition, executor, pure: true })
  remap.test.ts   # co-located unit test
```

**(B) Built-in WITH custom UI** — e.g. synth. The custom Vue component lives in
the folder and is referenced by the spec (no more hand-editing
`registry/components.ts`):
```
registry/audio/synth/
  definition.ts
  executor.ts     # synthExecutor + module-level synthState Map + gc + disposeAll  ← all here, co-located
  Synth.vue       # custom node body
  node.ts
```
```ts
// node.ts
import { markRaw } from 'vue'
import { defineNode } from '@/engine/defineNode'
import { definition } from './definition'
import { executor, gcSynth, disposeAllSynth } from './executor'
import Synth from './Synth.vue'
export default defineNode({
  definition, executor,
  component: markRaw(Synth),
  lifecycle: { gc: gcSynth, disposeAll: disposeAllSynth },
})
```
The auto-registry projects `component` into `nodeTypes` and `lifecycle` into the
engine's hook list — so the gc/dispose can never be "forgotten."

**(C) Custom (user) node, BaseNode** — unchanged from today, file-based in the
repo-root `custom-nodes/` dir (Electron) or via `loadFromCode` (web). The
`CustomNodeLoader` reads + validates + compiles and builds the same `NodeSpec`
shape at runtime:
```
custom-nodes/my-cool-node/
  definition.json   # NodeDefinition — validated by services/customNodes/validator.ts
  executor.js       # export default (ctx) => { … } — compiled by compiler.ts
  README.md         # optional
```
Convergence task: have `CustomNodeLoader.loadNode` produce a `NodeSpec` via the
same `defineNode` shape so built-in and custom share one registration contract
(and, later, the same lifecycle handling — see the gap below).

**(D) Custom (user) node WITH custom UI** — *not supported today* (user nodes
can't ship a Vue SFC; the component map is built-in-only, by design — arbitrary
user Vue/JS would reopen the code-node sandbox concern). Recommended design: add
an optional **declarative UI schema** to the definition — a list of rows binding
known widget types (`slider`, `xy`, `knob`, `readout`, `button`, `image`) to
controls/ports — rendered by a single generic `CustomNodeView.vue` interpreter.
This gives user nodes real custom layouts with **zero arbitrary code**. Richer
needs → contribute as a built-in (path B). (This is a P3 feature; flagged as an
open decision in §8.)

**Lifecycle gap to close for custom nodes:** built-in specs get auto-collected
`gc`/`disposeAll`; custom executors currently only get `unregisterExecutor` with
no state cleanup. Extend `defineNode`/the custom contract so a custom executor
may export a `lifecycle`, registered alongside built-ins — closing the same leak
class for user nodes.

---

## 3. Stream 2 — Canvas toolbar + marquee + gestures

**Current state** (`EditorView.vue:684-709`, verified vs `@vue-flow/core`
1.48.2): only `selection-key-code=null`, `multi-selection-key-code=null`,
`delete-key-code='Delete'`, `connection-mode=Loose`, snap props are set;
everything else is on defaults. Net effect: **left-drag always pans, there is no
way to marquee-select**, and plain wheel/trackpad scroll zooms (the classic
"scroll zoomed instead of panning" problem). Note: **`selectionOnDrag` does NOT
exist in Vue Flow 1.48.2** — the equivalent is `selectionKeyCode:true` +
`panOnDrag:false`. `panActivationKeyCode:'Space'` (spacebar-hold pan) is already
built in.

### 3.1 Tool model — 2 persistent tools, zoom-as-gesture
`select` and `pan` are the only sticky tools (Figma/tldraw/Miro convention; a
persistent click-to-zoom tool steals clicks from node interaction). Zoom = pinch
/ ctrl+wheel / toolbar +/- buttons / `Z`,`Shift+Z` / double-click.

New `composables/useCanvasTool.ts`: `activeTool: 'select'|'pan'`,
`tempPan` (space-hold/middle-mouse), `effectiveTool`, and a computed
`interactionProps` bundle bound on `<VueFlow v-bind="interactionProps">`.

| Prop | `select` | `pan` |
|------|----------|-------|
| `panOnDrag` | `false` | `true` |
| `selectionKeyCode` | `true` | `false` |
| `selectionMode` | `Partial` | — |
| `multiSelectionKeyCode` | `'Shift'` | `'Shift'` |
| `panActivationKeyCode` | `'Space'` | `'Space'` |
| `nodesDraggable` | `true` | `false` |
| `panOnScroll` | `true` | `true` |
| `zoomOnScroll` | `false` | `false` |
| `zoomOnPinch` / `zoomOnDoubleClick` | `true` | `true` |

`panOnScroll:true` + `zoomOnScroll:false` makes plain scroll/trackpad **pan**,
and Vue Flow auto-routes **Ctrl/⌘+wheel → zoom**. Add `touch-action:none` to
`.vue-flow__pane` so the browser doesn't hijack pinch/scroll on touch.

### 3.2 Gestures matrix (all tools)
| Gesture | Mouse | Trackpad | Touch |
|---------|-------|----------|-------|
| Pan | middle-drag; Space+drag; hand tool | two-finger scroll | one-finger (pan tool) / two-finger |
| Zoom | Ctrl/⌘+wheel; +/- ; Z ; dbl-click | pinch; Ctrl/⌘+wheel | pinch |
| Marquee | left-drag (select) | left-drag | drag (select tool) |
| Add to selection | Shift+click/drag | same | — |
| Temp hand | hold Space | hold Space | — |

Middle-mouse pan in the select tool: can't combine `panOnDrag:false` with a
button array, so add a pane `pointerdown` listener that flips `tempPan` on
middle-button (mirror of spacebar), cleared on up/blur/`pointercancel`.

### 3.3 Toolbar (`components/controls/CanvasToolbar.vue`, new)
Floating `<Panel position="top-left">` inside `<VueFlow>` (keeps clear of the
bottom-right Controls/MiniMap). lucide icons (already a dep): `MousePointer2`
(select, V), `Hand` (pan, H), `ZoomIn`/`ZoomOut`, a clickable zoom-% readout
(reset to 100%), `Maximize`/fit-view, with reserved slots for future
frame/comment tools. Style square (`--radius-none`) + `--shadow-subtle` to match
existing chrome; active tool highlighted; cursor reflects tool. **Complement**
(don't replace) the existing `<Controls>`/`<MiniMap>`.

### 3.4 Files & risks
- **New:** `composables/useCanvasTool.ts`, `components/controls/CanvasToolbar.vue`.
- **Edit:** `EditorView.vue` — bind `interactionProps`, remove the static
  `selection-key-code`/`multi-selection-key-code` nulls, add V/H/Z + Space
  keydown/keyup (guarded by the existing input-focus check `:302-304`; no
  conflict — existing binds are all modifier-based), middle-mouse listeners,
  mount the toolbar, default `pan` on `isMobile`.
- **Selection plumbing untouched:** marquee updates Vue Flow selection →
  existing `watch(getSelectedNodes)` (`:249`) → `uiStore.selectedNodes`, which
  copy/paste/duplicate/subflow already read. ✔
- **Risks:** `panOnScroll` flips wheel-zoom→pan globally (intended, standard);
  `selectionMode:Partial` may select more than Full did (Full was unused);
  re-enabling Shift selection — verify `onNodeClick`'s shift special-case
  (`:273`) still behaves; on touch, default mobile to `pan` so one-finger pan
  survives; bump `paneClickDistance`/`nodeDragThreshold` slightly for touch
  comfort; verify scrollable node bodies (Emulator/code) still scroll under
  `touch-action:none` (they already use `.nopan`/`.nodrag`).

---

## 4. Stream 3 — Snippets tab + flow preview generator

**Current state:** the graduation-cap header button (`AppHeader.vue:327` →
`uiStore.openNodeExplorer`) opens `NodeExplorerModal.vue` (198 lines, **no tab
system**). Snippets render **at the bottom** of `NodeExplorer.vue:207-223`
(`.snippets-section`, hidden during search) as `FlowSnippet.vue` cards with **no
preview**. Data: `data/flow-snippets.ts` — 6 snippets, type
`{id,name,description,category,relatedNodes,nodes:[{id,type,position,data}],
edges:[{id,source,sourceHandle,target,targetHandle}]}` (no `tags`). Insert path:
`NodeExplorerModal.handleInsertSnippet` (`:33-56`) → `flowsStore.insertSubgraph`
(`flows.ts:386`). Category color source of truth: `categoryMeta` (`nodes.ts:214`).

### 4.1 Snippets tab
Introduce a modal-level tab bar (`Nodes` | `Snippets`); `Nodes` keeps
`<NodeExplorer>` unchanged, `Snippets` renders a new `<SnippetsTab>`:
```
NodeExplorerModal.vue  (tab bar + activeTab, reset to 'nodes' on open)
└─ SnippetsTab.vue      search/filter + grid
   └─ SnippetCard.vue   FlowPreview thumbnail + name/desc/chips + Insert
      └─ FlowPreview.vue
```
Insert wiring reuses `handleInsertSnippet` as-is. **Remove** the bottom
`.snippets-section` from `NodeExplorer.vue` (snippets now have a home). Search via
the existing `fuzzySearch` util over name/description/relatedNodes (+ optional
new `tags`).

### 4.2 Preview generator (`utils/flowPreview.ts`, new) — **SVG**, pure + store-free
```ts
flowToPreviewModel(flow, opts?, resolveColor): FlowPreviewModel  // pure, unit-testable, no DOM/Vue
flowToSvgString(flow, opts?): string
flowToDataUrl(flow, opts?): string   // data:image/svg+xml — for caching / <img> / OG images
```
SVG over canvas: crisp at any DPI, themeable via CSS vars/`currentColor`, and
serializable to a data-URL (canvas only gives the latter). `FlowPreview.vue` is a
thin wrapper computing `flowToPreviewModel` and rendering `<rect>`+`<path>`.
- **Color** via an injected `ColorResolver` (so the helper stays store-free):
  in-app default maps `nodesStore.getDefinition(type)?.category` →
  `categoryMeta[cat].color`, fallback `#6B7280`.
- **Layout:** bbox over node positions expanded by approx node box (120×56),
  scale-to-fit with clamp ≤1 (never upscale), center. Degenerate single/empty
  handled.
- **Edges:** handle pixel coords aren't in JSON, but snippets lay out
  left→right, so draw source-right-center → target-left-center cubic beziers
  (`M x1 y1 C x1+dx y1, x2-dx y2, x2 y2`); optional vertical fan-out for parallel
  wires; neutral color by default (type-color optional).
- **Theme:** component path uses CSS vars; data-URL path bakes `opts.theme` hex.

### 4.3 Caching & reuse
Runtime, on-demand, **memoized in an in-memory `Map` keyed by snippet id (+
theme)** — snippet JSON is immutable per session, geometry is cheap, Dexie is
overkill. Do **not** precompute data-URLs into `flow-snippets.ts` (bloats the
bundle, can't theme, goes stale). The helper takes the generic
`{nodes:[{id,type,position}],edges:[{source,target}]}` shape — identical to
`serializeSelection` output and live `activeFlow` — so it later powers
**saved-flow/subflow/flow-tab thumbnails** for free.

### 4.4 Files
- **New:** `utils/flowPreview.ts`, `utils/__tests__/flowPreview.spec.ts`,
  `components/node-explorer/{FlowPreview,SnippetsTab,SnippetCard}.vue`.
- **Edit:** `NodeExplorerModal.vue` (tab bar + activeTab), `NodeExplorer.vue`
  (remove bottom snippets section), `flow-snippets.ts` (optional `tags?:string[]`).

---

## 5. Stream 4 — Audit-driven fixes (folded across phases)

Grouped by where they land. Items marked **(P0)** go in Phase P0 (no refactor
dependency); modulation-port and functionality items ride along with Stream 1
Step 5 per-node co-location (Phase P3).

**Correctness / quick wins (Phase P0):**
- Bind `:min`/`:max` on the `number` branch (`BaseNode.vue:666`) + add
  `props.units`/`props.precision` rendering (127 controls). (§B)
- Boundary coercion in `getNodeInputs` (`ExecutionEngine.ts:315-332`) to the
  target port's declared type — kills the `boolean+0`/NaN class. (§D)
- Texture traps: reuse `resolveEffectSource` in the Shader `iChannel` path
  (`visual.ts:611-612`) and the `displacement` input (`:1282`); make `render-3d`
  depth canvas-backed (copy `emulation.ts:88-110` blit). (§D)
- Edge-trigger `latch`/`sample-hold` (`utility.ts:288-323`); `random`
  sample-on-trigger (`index.ts:284-298`); finite-guard `power`
  (`index.ts:381`). (§E)
- `error` output on every AI node, wired from the existing catch branches; add a
  per-node error badge on BaseNode from `runtime.ts` `lastError`. (§E/§G)
- Tone-analyser `.dispose()` in oscilloscope/equalizer; clasp video-receive
  `captureStream`/`<video>` stop. (§F)
- Wrap `updateNodeData` param edits in undo history, debounced per control.
  (§G)
- Single-input replacement honoring `multiple` in `addEdge` (`flows.ts:325-356`).
  (§D)

**Modulation ports + functionality (Phase P3, with co-location):**
- Add input ports to image-fx-* params (generate from the uniform list like
  `shader.ts:14-16`); audio wet/feedback/Q/ratio/sidechain; 3D material/light
  color/emissive. (§C)
- New primitives: `atan2`, two-input `min`/`max`, `phasor`/`ramp`, `edge`
  (rising/falling/both), LFO `phase`+`reset`; feedback visual node; wire
  `blur.passes`. (§E)
- Unify gain/volume units; convert bare-number audio controls to ranged sliders.
  (§E)
- Inline `connection` picker on the node body; regenerate `connectivity.md`.
  (§E)

**Control-system structural (Phase P2/P3):**
- Extract one `<ControlRenderer>`; unify `visibleWhen`/`showWhen`; make custom
  controls first-class (`type:'knob'|'xy'|'envelope'|…`); add `xy`/`range`/
  `curve`/`gradient` control types; universal drag-to-scrub numeric field. (§B)

---

## 6. Stream 5 — Subflow rebuild (Phase P4, gated on Stream 1)

The audit's biggest single item (§A): subflows are inert at runtime. Rebuild,
don't patch:
1. **Execute through the real engine.** Inline a subflow instance's internal
   nodes into the main async topo loop with **instance-namespaced ids**
   (`${instanceId}::${internalId}`) — this single move fixes execution, async,
   per-frame timing, state isolation across instances, GC (via the new generic
   lifecycle), and dirty-mode in one stroke. (Depends on Stream 1's engine being
   modular.)
2. **Real `subflow` instance definition** emitting dynamic typed ports
   (`_dynamicInputs/_dynamicOutputs` is already engine-supported,
   `ExecutionEngine.ts:460-475`).
3. **Navigation:** breadcrumb / synthetic tab so entering a subflow isn't a
   dead end (`FlowTabs.vue:11` filters subflows out today).
4. **Reuse:** surface subflows in the palette so they can be instanced multiple
   times; add a recursion depth guard; (P3) TD-style custom params on the
   instance.

Grade against the 12-point subgraph checklist in `AUDIT_2026-06-28.md` §H.2.
**Maintainer decision: specced separately** — full design in
`docs/plans/SUBFLOW_REBUILD_SPEC_2026-06-28.md`.

---

## 7. Testing strategy

- **Stream 1:** registry guard tests (node-id count, pure-set equality, dup
  detection — the collector throws on dup ids); a per-type leak test
  (create+delete in dirty mode → state Map empties) as the acceptance gate for
  Step 3.
- **Stream 2:** unit-test the `interactionProps` computed (tool → prop bundle);
  manual/browser verification of marquee, space-pan, trackpad pan, pinch on
  mouse+trackpad+touch viewports (Playwright at 390px + desktop).
- **Stream 3:** unit tests for `flowToPreviewModel` (bbox/scale/edge-path/
  degenerate/empty/single-node); snapshot the SVG string for the 6 snippets.
- **Stream 4:** TDD per fix (the audit cites exact expected behavior); golden-
  flow snapshots stay byte-identical where the fix is to a non-pure node.
- **Stream 5:** golden subflow execution tests (single + nested + multi-instance
  state isolation), which don't exist today.

---

## 8. Decisions

**Settled (maintainer, 2026-06-28):**
- **Naming** — use `defineNode()` + `NodeSpec` (NOT `NodeModule`). See §2.1.
- **Modularization scope** — **full per-node co-location of all ~238 nodes**
  (Stream 1 Step 5 runs to completion; script the boilerplate).
- **Subflow rebuild** — **specced separately** in
  `SUBFLOW_REBUILD_SPEC_2026-06-28.md`.

**Still open:**
1. **Tool store location** — standalone `useCanvasTool` composable (cohesive,
   recommended) vs folding into `stores/ui.ts` (devtools).
2. **Keep `<Controls>` zoom buttons** once the toolbar has them, or remove the
   duplication? Recommend keep first pass, remove later.
3. **Snippet `tags`** — add the optional field now for richer filtering, or ship
   with name/relatedNodes search only? Low cost either way.
4. **Custom-UI for user nodes (path D)** — adopt the declarative UI-schema
   approach (recommended, no arbitrary code) vs leave user nodes BaseNode-only
   and require custom-UI nodes to be contributed as built-ins. P3 either way.
5. **Where to start implementing** — quick wins, modularization scaffolding, or a
   feature (toolbar/snippets) first. (Pending.)
