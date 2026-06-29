# LATCH Extensibility & Developer-Experience Architecture — 2026-06-28

The deepened, breakage-proof design for making LATCH **easy to develop for** while
keeping its end-user experience and visual language intact. It supersedes and
hardens Stream 1 of `POLISH_AND_ARCHITECTURE_PLAN_2026-06-28.md`, and adds the two
subsystems that doc didn't cover (connection protocols, AI models), the declarative
custom-UI mechanism, the reusable abstractions, and node-data versioning.

Companion docs: `POLISH_AND_ARCHITECTURE_PLAN_2026-06-28.md` (the five work streams),
`SUBFLOW_REBUILD_SPEC_2026-06-28.md` (subgraph rebuild), `../AUDIT_2026-06-28.md`
(findings this addresses), and `../strategy/` (the *why* — competitor pains,
personas, differentiation, and the adversarial self-audit that produced the
mandatory amendments in §0.5 below).

## Research-driven amendments (READ FIRST — MANDATORY, from `../strategy/02` & `../strategy/06`)

> Unnumbered preface (sits intentionally ahead of §0 to be read first). Sequencing
> for these is owned by `ROADMAP_2026-06-28.md`; the file-format and security
> mechanisms now have dedicated specs (`FILE_FORMAT_SPEC_2026-06-28.md`,
> `SECURITY_MODEL_2026-06-28.md`); CI + deprecation policy live in
> `POLICIES_2026-06-28.md`.

Sourced research into custom-node ecosystems (incl. two verified security incidents)
adds these **10** non-negotiables to the design below. They are gates, not footnotes:

1. **Declarative `ui` MUST have a first-class code/component escape hatch, with the
   declarative↔code boundary visible *before* a dev commits** (n8n's declarative→
   programmatic cliff is the loudest DX failure found). `component?` stays first-class
   next to `ui?` (§9); document *when* to reach for it.
2. **Register-once protocols/models MUST be capability-scoped + user-approved, with a
   provenance/trust tier** (the 2026 n8n supply-chain attack exfiltrated *decrypted*
   credentials via nodes with no isolation). The web sandbox stops `fs`/`exec` but
   **not `fetch`-to-attacker** — never blanket-hand a credential to any node. (§7, §8)
3. **`defineModel` MUST version-resolve (not last-writer-wins) and lazy-load** (else
   it recreates ComfyUI's collision hell + Unreal's eager-load bloat). (§8)
4. **Versioning MUST be migration functions + stable node-type IDs + graceful
   missing-node placeholders** (degrade, never shatter — not n8n-style pin-forever).
   Stable type-IDs are forever (Blender's lesson). (§10)
5. **`defineNode` is a frozen public contract — deprecation cycles, never removals,
   from v1** (Rete v1→v2 and ComfyUI V3 stranded their communities).
6. **Big-graph perf discipline:** selection/hover in CSS, NOT Pinia; decouple cosmetic
   edits (move/rename/recolor) from execution; profile at 500+ nodes before claiming
   scale (Vue Flow inherits React Flow's re-render storms).
7. **Ship node testing (isolated, no upstream re-fire) + inline "which folder failed
   and why" + a `latch new-node` scaffolding CLI + API-versioned docs.**
8. **The save format is a Phase-A deliverable** (durability is LATCH's strategic
   centerpiece): documented spec, stable IDs, deterministic key order, **positions/
   colors separated from logic**, guaranteed export + import validation. This also
   unblocks git-diffing and future multiplayer.
9. **Accessibility is in-scope:** keyboard-operable wiring (WCAG 2.5.7/2.1.1),
   non-color port-type cues (1.4.1), ARIA names for nodes/edges, modal focus traps.
   (Real plan home: ROADMAP Phase 4.)
10. **Earn, don't claim, stability:** atomic crash-safe autosave, recoverable JSON,
    kiosk/restart mode, and soak tests *before* any "runs for months" messaging.
    (Real plan home: ROADMAP Phase 8.)

**Status:** design verified against current code + this repo's real build/test
config + research into 8 comparable systems (n8n, Node-RED, ComfyUI, Rete.js v2,
Litegraph, Blender, Cables, Unreal). Every claim carries `file:line`. Five parallel
investigations + an adversarial foolproofing pass back this. No code written yet.

---

## 0. The one-sentence goal

Adding a built-in node, a custom node, a connection protocol, an AI model, or a
custom node UI should each be **one declarative unit in one location** —
auto-discovered, with cleanup that cannot be forgotten — and must **never break an
existing saved flow**.

Today none of those are true: a node is smeared across 4–6 files; cleanup is
hand-wired in 23×3 call sites in `ExecutionEngine.ts`; protocols drift (BLE adapter
exists but is unregistered; Serial/MIDI configs exist with no adapter); AI models
live in three different catalogs in three formats; custom UI requires a bespoke
`.vue` + a central registry edit; and there is **no node-data versioning**, so any
schema change silently breaks old `.latch` files.

---

## 1. Design principles (distilled from research)

Patterns adopted from comparable systems, each mapped to a LATCH mechanism:

| Principle | Proven by | LATCH mechanism |
|-----------|-----------|-----------------|
| One declarative unit, auto-discovered by directory presence | ComfyUI `custom_nodes/` scan, Godot `addons/` | `import.meta.glob` over `node.ts` / `protocol.ts` / `*.model.ts` |
| Shared dependencies are **register-once declarations referenced by name** | n8n credentials, Node-RED config nodes | `defineProtocol()` + connection picker; `defineModel()` + model select |
| Central asset registry feeds dropdowns; nodes never hardcode paths | ComfyUI `folder_paths`, Unreal Asset Registry | `defineModel()` registry → auto-populated `model` select |
| Declarative typed-property UI for the 90%, co-located code escape hatch for the 10% | n8n properties, Blender `layout.prop`, ComfyUI `INPUT_TYPES`+`WEB_DIRECTORY`, Rete presets | `ui` schema + `NodeView` interpreter; `component?` escape hatch |
| Rich conditional visibility (multi-key, value-array, operators) | n8n `displayOptions` | unified `when` clause (replaces `visibleWhen`/`showWhen`) |
| **Node-data versioning + migration** | n8n `VersionedNodeType`, Blender `do_versions` | `version` + `migrate()` on `defineNode` (§10) |
| Symmetric register/teardown; mandatory cleanup | Blender `register`/`unregister`, Node-RED `on('close')` | `defineNodeState()` self-registers gc/disposeAll (§4) |
| Typed sockets as the connection-legality source | Rete sockets | existing `DataType` ports + `utils/connections.ts` matrix |

**Anti-patterns explicitly avoided:** free-form HTML/JS as the *only* custom-UI
path (Node-RED — unsafe for user nodes, unmigratable); string node-key with no
version (Litegraph/old ComfyUI — blocks migration); manual per-node
`registerNodeType` calls (Litegraph/Rete — brittle); secrets/model paths embedded
in node data (breaks sharing + serialization safety).

---

## 2. The four authoring surfaces — "register once, in one place"

| To add… | Today (files touched) | After (one unit) | Mechanism |
|---------|----------------------|------------------|-----------|
| **Built-in node** | def + `registry/<cat>/index.ts` (×3) + executor + `executors/index.ts` + `PURE_NODE_TYPES` + maybe `components.ts` = **5–7** | `registry/<cat>/<node>/node.ts` | `defineNode` + glob (§3, §6) |
| **Custom (user) node** | `definition.json` + `executor.js` (BaseNode only; no custom UI) | same folder + optional `ui` JSON | `CustomNodeLoader` → `NodeSpec` (§3, §9) |
| **Connection protocol** | `types.ts` (×2) + adapter + `adapters/index.ts` + `index.ts` (×3) + `ProtocolSelector` icon = **6–9** | `services/connections/protocols/<name>/protocol.ts` | `defineProtocol` + glob (§7) |
| **AI model** | `AIInference.ts` + `textGenFormat.ts` + each node's hand-typed options = **2–4 (drift-prone)** | `services/ai/models/<id>.model.ts` | `defineModel` + glob (§8) |
| **Per-node state/cleanup** | module Map + `gc*` + `disposeAll*` + 3 edits in `ExecutionEngine.ts` | `defineNodeState()` call in the executor | auto-registered lifecycle (§4) |
| **Custom node UI** | bespoke `.vue` + `components.ts` entry | `ui` schema field | `NodeView` interpreter (§9) |

The unifying idea: **declaration lives next to implementation; discovery is
automatic; the engine/UI derive everything else.** No central edits, no "running
around."

---

## 3. `defineNode` — the unified node manifest

```ts
// engine/defineNode.ts (new) — identity at runtime; gives inference + a stable surface
export function defineNode(spec: NodeSpec): NodeSpec { return spec }

export interface NodeSpec {
  readonly definition: NodeDefinition          // ports/controls/metadata (stores/nodes.ts:83)
  readonly executor: NodeExecutorFn            // ExecutionEngine.ts:116
  readonly version?: number                     // node-data schema version (§10); default 1
  readonly migrate?: (data: Record<string,unknown>, from: number) => Record<string,unknown>
  readonly ui?: UISchema                        // declarative custom UI (§9) — preferred
  readonly component?: Component                // bespoke SFC escape hatch; else BaseNode
  readonly pure?: boolean                       // dirty-mode skip — replaces PURE_NODE_TYPES
  readonly deferred?: boolean                   // fire-and-latch — replaces setDeferredNodeTypes
  readonly requires?: NodeRequirement[]         // platform/hardware caps (serial/webgpu/mic)
  readonly connections?: NodeConnectionRequirement[]  // protocol needs (§7)
  readonly models?: ModelRequirement[]          // AI model/task needs (§8)
  readonly lifecycle?: NodeLifecycle            // ESCAPE HATCH only — unneeded with defineNodeState (§4)
}
```

**Naming (settled):** `defineNode()` + `NodeSpec`, *not* `NodeModule` (collides with
Node.js) or `NodePackage` (collides with the existing `CustomNodePackage`,
`CustomNodeLoader.ts:6`). Custom nodes already build `{definition, executor}` at
runtime — that's a `NodeSpec` too, so built-in and custom converge on one contract.

Why each field is orthogonal: `definition`+`executor` are the core; `pure`/`deferred`
move off the engine's two central allowlists (`ExecutionEngine.ts:82`, `:660`),
killing two drift surfaces; `requires`/`connections`/`models` are declarative
capability metadata so the palette can disable an unavailable node and services can
preflight (mic permission, model download) without bespoke code; `ui` xor
`component` selects the custom-UI path; `version`/`migrate` protect saved flows;
`lifecycle` is a rarely-needed escape hatch because state cleanup is automatic (§4).

Folder shapes (the four authoring paths in full detail) are in
`POLISH_AND_ARCHITECTURE_PLAN_2026-06-28.md` §2.5.

---

## 4. `defineNodeState` — auto-registered lifecycle (the biggest DX win)

**The problem, measured.** 23 state-map groups each repeat: a module `Map<nodeId,
State>`, a `gc<X>State(validIds)`, a `disposeAll<X>State()` — then hand-wired into
`ExecutionEngine.ts` as **23 imports (`:5-41`) + 23 gc calls (`:205-227`) + 23
disposeAll calls (`:842-864`)**, plus the off-pattern `endMessagingFrame()` (`:534`)
and `resetAINodeDisposal()`/`resetOpenCVNodeDisposal()` (`:717-720`). `audio.ts`
alone bundles 8 maps under one 90-line `gcAudioState` (`:811`) + 60-line
`disposeAllAudioNodes` (`:67`). Forgetting any one line = a silent leak — the exact
recurring bug class in CLAUDE.md.

**The fix.** A factory that creates the Map **and self-registers its cleanup** into
a central registry the engine drains generically:

```ts
// engine/nodeState.ts (new)
export function defineNodeState<T>(opts?: {
  dispose?(state: T, nodeId: string): void   // tear down one entry (Tone nodes, sockets, workers)
  onStart?(store): void                       // replaces resetAINodeDisposal/resetOpenCVNodeDisposal
  endFrame?(store): void                      // replaces endMessagingFrame
  keyToNodeId?(key: string): string           // for suffixed keys (audio `${id}_meter`, audio.ts:814)
  label?: string
}): NodeStateStore<T>   // { get, getOrCreate, set, delete(=dispose entry), all }

export function collectedLifecycles(): readonly LifecycleHooks[]  // engine reads this once
```

The engine's 23×3 wiring collapses to **four generic loops**, composing with the
verified current call sites:

```ts
for (const l of this.lifecycles) l.gc(validNodeIds)   // updateGraph (was :205-227)
for (const l of this.lifecycles) l.disposeAll()       // stop()      (was :842-864)
for (const l of this.lifecycles) l.endFrame?.()       // frame end   (was :534)
for (const l of this.lifecycles) l.onStart?.()        // start()     (was :717-720)
```

fed once next to the existing executor registration (`useExecutionEngine.ts:19-23`):
`engine.registerLifecycles(collectedLifecycles())`. **The engine never imports
`nodeState.ts`** (it only stores the passed array) — preserving the no-circular-dep
rule.

**Consequence:** a stateful node touches *only its own folder*; the leak class
becomes structurally impossible; and the `lifecycle` field on `NodeSpec` is
unnecessary for ~all nodes (it stays only for a genuine global singleton). This
**also closes the custom-node leak gap**: a user executor that imports
`defineNodeState` gets the same auto-cleanup with zero engine edits. Migration is
mechanical and behavior-identical — `spring.ts`'s `springState`+`gcSpringState`+
`disposeAllSpringState` (`spring.ts:16,62,69`) becomes one `defineNodeState` call
and the two engine call sites for it are deleted.

---

## 5. Reusable executor helpers (kill copy-paste, fix audit bugs)

### 5.1 Canonical trigger + rising-edge (`engine/trigger.ts`, new)
Today trigger handling has three variants: inline level-tests duplicated at
`utility.ts:312-313,293,360`, `audio.ts:1504`, `spring.ts:37`, `signal.ts:32`; real
edge detection via `lastHigh` at `signal.ts:143`/`index.ts:78`; and trigger *values*
that are sometimes `true` (`index.ts:90`), sometimes `1` (`utility.ts:38,166`),
sometimes a timestamp (`index.ts:107`).

```ts
export const TRIGGER = 1 as const                  // the one canonical fired value
export function isHigh(v: unknown): boolean         // level: accepts legacy true|1|>0
export function risingEdge(nodeId, key, value): boolean   // edge, state via its own defineNodeState
```

`risingEdge` itself uses a `defineNodeState`, so edge state is GC'd automatically.
This directly fixes the audit's **level-vs-edge correctness bug** in `latch`/
`sample-hold` (they become `risingEdge(ctx.nodeId,'set',…)`), and standardizes every
trigger-emitting node to output `TRIGGER`.

### 5.2 Boundary coercion + typed accessors
`getNodeInputs` (`ExecutionEngine.ts:315-332`) copies upstream values verbatim — the
"coercion lie" (a `boolean` into a `number` port arrives `true`, `true+0=1`/NaN).
Fix once at the boundary (coerce to the *target* port's declared `type`) and expose
ergonomic typed reads on `ExecutionContext` (`:103`):

```ts
ctx.num('frequency', 440)   // input ?? control ?? default, coerced, NaN/±Infinity-guarded
ctx.bool(id, d) · ctx.str(id, d) · ctx.trig(id) /* = risingEdge */ · ctx.level(id) /* = isHigh */
```

`audio.ts:137-142`'s five `(… as number) ?? (… as number) ?? 440` chains become
`ctx.num('frequency', 440)`. Additive — raw `ctx.inputs.get()` keeps working, so
migration is incremental and never breaks a test.

---

## 6. Auto-registry (glob) — hardened against the foolproofing pass

```ts
// registry/nodeRegistry.ts (MUST live under src/renderer for vite/client types + relative glob)
const found = import.meta.glob<{ default: NodeSpec }>('./**/node.ts',
  { eager: true, import: 'default' })
export const nodeSpecs   = /* keyed by definition.id; THROW on duplicate id */
export const allNodes    = Object.values(nodeSpecs).map(s => s.definition)
export const builtinExecutors = Object.fromEntries(/* id → executor */)
export const nodeTypes   = /* id → markRaw(component) for specs with component/ui */
export const CUSTOM_NODE_TYPE_IDS = /* derived set — see risk #12 */
export const PURE_NODE_TYPES = new Set(/* specs with pure:true */)
```

`import.meta.glob` is **verified to work in all three contexts** (web vite,
electron-vite renderer, vitest) — same Vite transform; `vite/client` types are
present (`src/renderer/vite-env.d.ts:1`). A live vitest probe confirmed eager +
`import:'default'`. **Eager is net-neutral**: the registry is *already* eager-imported
at app boot (`EditorView.vue:72` → `initializeNodeRegistry()`), and `executors/
index.ts` already top-level-imports Tone/Three/transformers/ONNX, and tests already
import those heavy executors under happy-dom and pass. Keep `eager:true` (defer
lazy-loading to a separate effort).

### Risk register (severity-ordered; full evidence in the foolproofing investigation)

| # | Risk | Sev | Mitigation |
|---|------|-----|-----------|
| 1 | **Glob `./**/node.ts` matches ZERO files today** — current tree is `<name>.ts` + category barrels, not `node.ts` folders. Collector is inert until co-location authors `node.ts`. | CRIT | Author `node.ts` adapters in Step 1; add a **count-equality guard test from the first commit** (`Object.keys(nodeSpecs).length === legacy allNodes.length`) so an empty/partial glob fails CI, never ships a zero-node app. |
| 2 | `import:'default'` **silently drops** a `node.ts` with a named (not default) export — no compile error. | HIGH | Count-guard (above) + a test scanning `registry/**/node.ts` for a default export; codemod emits `export default defineNode(...)`. |
| 3 | A guard test importing `nodeRegistry.ts` would be the **first test to eager-import every custom `.vue`** under happy-dom (executor tests never import SFCs). | MED | Guard test asserts against a **metadata-only projection** (definition+executor), not components. If any SFC isn't import-safe under happy-dom, `vi.mock` it in `tests/setup.ts` (today it mocks only Worker + matchMedia). |
| 4 | **Test import contract**: barrel `@/engine/executors` + many named per-category exports must keep resolving (e.g. `executor-gc.test.ts:16-26`, `builtinExecutors` in `flowHarness.ts:20`, `CUSTOM_NODE_TYPE_IDS` in `flows.test.ts:5`). | HIGH | Barrel re-exports through Steps 2–4; maintain a **must-not-break export list** (in the foolproofing report) as a CI check. Don't widen `vitest.config.ts:11` to `src/**` until co-located tests exist. |
| 5 | `CUSTOM_NODE_TYPE_IDS` is a **live contract** for the flows store (`flows.ts:4,12,152`); deleting `components.ts` breaks it. | HIGH | `nodeRegistry.ts` re-exports `nodeTypes` AND `CUSTOM_NODE_TYPE_IDS`; repoint `flows.ts` + `flows.test.ts` in the same commit. |
| 6 | **Dup-id throw vs historically-deduped ids** — `counter`/`sample-hold` are served by a chosen category executor (`registry-integrity.test.ts:8-29`). | HIGH | Pre-co-location audit: each id in exactly ONE `node.ts` with the winning def+executor paired. `registry-integrity.test.ts` becomes the proof. |
| 7 | **PURE set is 24 ids today, not 28** (`ExecutionEngine.ts:82-88`). A wrong-pure stateful node = frozen node. | MED | Guard asserts **exact set equality** (not size); new pure nodes update flag + expected set in one commit. |
| 8 | `_`-prefixed registry folders (`_synth`,`_knob`,`_function`,`_wavetable`,`_envelope-visual`,`_parametric-eq`) are **live** (referenced in `components.ts:14-35`) and **not skipped** by glob. | MED | Rename to normal node folders during co-location. (`components/nodes/_archived` is outside `registry/**` — safe.) |
| 9 | **Custom-node double-registration / lifecycle collision** — `CustomNodeLoader` registers at runtime (`:145,148`); could overwrite a built-in id, and its cleanup isn't in the generic lifecycle list. | MED | Build the lifecycle list from glob specs only; append custom lifecycles via a separate `registerLifecycles` call; id-collision guard on custom register. |
| 10 | **HMR**: `nodeRegistry.ts` becomes a hub imported by `EditorView.vue` → editing one `node.ts` may full-reload. | MED | Keep the engine registry-import-free (lifecycles via `registerLifecycles`) to minimize invalidation; verify in `npm run dev` before the 238-file move; acceptable if full-reload. |
| 11 | `nodeRegistry.ts` placed under `src/engine` would lose `vite/client` types + break the relative glob. | LOW | Keep it under `src/renderer/registry/`. |

**Coexistence invariant:** at no migration step are both the legacy
(`registry/index.ts`+`components.ts`+executor barrels) and the new collector
*authoritative* for the same concern — barrels/adapters re-export until each consumer
is intentionally moved.

---

## 7. Connection protocols — `defineProtocol` (the n8n/Node-RED model)

`ConnectionManager` is **already a generic data-driven registry** (protocols are
data: `ConnectionManager.ts:58,212`); the per-protocol `xConnectionType` object
already bundles metadata + declarative `configControls` + `defaultConfig` +
`createAdapter` (e.g. `MqttAdapter.ts:228-379`), rendered by a generic
`ProtocolFormFields.vue`. The pain is purely that this object is wired up in **3
other places** and the icon lives in a central map. Proof the drift is real: **BLE
has an adapter but is never registered; Serial/MIDI have config types with no
adapter** (`types.ts:110-122` vs `adapters/`).

**Design.** `defineProtocol()` makes the existing `ConnectionTypeDefinition` the
single authored unit, co-located and glob-collected:

```ts
// services/connections/protocols/<name>/protocol.ts
export default defineProtocol<MqttConfig>({
  id:'mqtt', name:'MQTT', iconComponent: Radio, platforms:['web','electron'],
  configControls:[…], defaultConfig:{…}, createAdapter:(c)=>new MqttAdapterImpl(c),
})
// + adapter.ts (the class), config.ts (the config interface) — one folder
```

`services/connections/protocolRegistry.ts` globs `./protocols/**/protocol.ts`;
`registerBuiltInTypes()` (`index.ts:79-93`) collapses to a loop. `ProtocolSelector`'s
hardcoded `iconMap` (`:16-27`) is replaced by `spec.iconComponent`.

**Node declares a connection in one place** (its `defineNode` manifest, via the
existing `type:'connection'` control with `props.protocol`) — drop the redundant
second path (`NodeDefinition.connections[]` dual-read in `BaseNode.vue:172-183`).
**Executors stop hand-rolling lookup** via a new context helper:

```ts
ctx.connection<MqttAdapterImpl>()   // resolves id from control/input, auto-connects (shared throttle)
```

implemented once where the context is built (`ExecutionEngine.ts:378`), replacing
the ~50-line `getMqttAdapter`/`ensureConnected`/`lastConnectAttempt` block copied in
`mqtt.ts:28-74` (and ws/http). **CLASP is exempt** — it keeps its `ClaspConnection`
layer (`clasp.ts:69-114`); `ctx.connection()` is purely additive.

Net: adding a protocol **6–9 edits → 1 folder**; the BLE/Serial/MIDI drift becomes
structurally impossible. The `ConnectionConfig` union (`types.ts:182-190`) becomes a
derived re-export. Persistence is unchanged (saved connections store
`protocol:string`+config, load via `registerType`/`createAdapter`).

---

## 8. AI models — `defineModel` + auto loading/error outputs (the ComfyUI model)

Today there are **three catalogs in three formats in three files**: `AI_MODELS`
array (`AIInference.ts:77`), `WEBLLM_MODELS` inside a node file (`registry/ai/
llm.ts:10`), hardcoded MediaPipe URLs (`MediaPipeService.ts:329`). Models are
referenced ad hoc; only 4 nodes expose a (hand-typed, drift-prone) `model` select;
and — confirming the audit — **`_error` is set by AI executors but read NOWHERE**
in engine/runtime/BaseNode (only `string/replace.ts:18` declares a real `_error`
port). Adding a model = 2–4 drift-prone files; a model-backed node = 6–9.

**Design.** `defineModel()` + a glob registry (`services/ai/models/<id>.model.ts`,
one tiny metadata file per model — never statically importing the heavy runtime),
with the three families behind a uniform `ModelAdapter` so the manager + lookup
don't branch:

```ts
export default defineModel({
  id:'onnx-community/whisper-base.en', name:'Whisper Base', family:'transformers',
  task:'automatic-speech-recognition', size:'~145 MB', license:'apache-2.0',
  supportsWebGPU:true, load:{ promptFormat:'completion' },
})
```

`AI_MODELS`/`WEBLLM_MODELS`/MediaPipe URLs become **derived** from `modelSpecs`
(keeping their shapes so `AIModelManagerModal.vue` needs no edits initially). The
`textGenFormat.ts` chat-vs-completion contract moves onto `spec.load.promptFormat`
(required for text-gen specs at the type level), and its existing test asserts that.

**A node declares its model need in one place** and **auto-gets standardized
outputs**:

```ts
defineNode({ …, models:[{ task:'object-detection', selectable:true }], executor:… })
```

A `defineNode` post-process auto-augments the definition: appends `loading:boolean`,
`progress:number`, `done:trigger`, `error:string` outputs (if absent) and an
auto-populated `model` select (from `modelsByTask[task]`). A shared
`runModelInference()` helper runs the fire-and-latch pattern and **latches the error
into the real `error` output** — fixing the audit's missing-error-output gap **for
every AI node at once**, and feeding the per-node error badge (audit §G) from a
uniform output instead of the dead `_error`.

Net: adding a model **2–4 files → 1 file**; a model-backed node **6–9 → 1 folder**
(a new worker `case` is only needed for a genuinely new task/method). Worker contract
(`ai.worker.ts` `{type,task,model,method,args}`, `${task}:${model}` keying) and
persistent cache (`modelStorage.ts`) are untouched.

---

## 9. Declarative custom-UI schema — `ui` + one `NodeView` interpreter

Today: two divergent control switches (BaseNode 6 types at `:598-694` — the `number`
branch drops `:min`/`:max`, the 127-control bug; PropertiesPanel 10 types at
`:626-752`), **29 bespoke `.vue` node components** (`components.ts:12-37`) that mostly
exist to wire one of **7 reusable control widgets** (`RotaryKnob`, `EQEditor`,
`EnvelopeEditor`, `WaveformEditor`, `PianoKeyboard`, `GamepadDisplay`,
`AssetPickerControl`) to controls, and **two conditional-visibility mechanisms**
(`visibleWhen` on the node `stores/nodes.ts:70` vs `props.showWhen` in the panel
`PropertiesPanel.vue:337-348`).

**Design.** A code-free `ui` schema rendered by ONE interpreter on both surfaces:

```ts
interface UISchema { rows: UIRow[]; surfaces?: ('node'|'panel')[] }
interface UIRow { label?: string; when?: WhenClause; widgets: UIWidget[] }
interface UIWidget {
  type: WidgetType          // CLOSED registry — never a component path or code
  bind: string              // control id (2-way) or output port id (readout)
  source?: 'control'|'output'
  label?: string; when?: WhenClause
  props?: Record<string, string|number|boolean|string[]>   // whitelisted per type; no functions
}
type WhenClause =
  | Record<string,unknown>                                  // AND of equalities (showWhen-compatible)
  | { control:string; op:'eq'|'ne'|'gt'|'lt'|'in'; value:unknown }   // operator form (new)
```

**Widget registry** (closed `Record<WidgetType, Component>`, private to the
interpreter): `slider`/`number`(*with min/max — fixes the bug*)/`toggle`/`select`/
`color`/`text` (native), `knob`→RotaryKnob, `xy`→XYPad, `env`→EnvelopeEditor,
`eq`→EQEditor, `wave`→WaveformEditor, `piano`→PianoKeyboard, `asset`→AssetPicker,
`connection`→ConnectionSelect, plus `readout`/`button`/`image`/`curve`/`gradient`.

**One interpreter** `NodeView.vue`: `BaseNode` renders `<NodeView surface="node">`
instead of its inline switch; `PropertiesPanel` renders `<NodeView surface="panel">`
instead of its switch + `shouldShowControl`. Both evaluate the **same** `when`,
ending the two-mechanism divergence and adding operators. Live output values come
from `runtimeStore` metrics (`ExecutionEngine.ts:422`) so `readout`/`eq`/`image`
reflect runtime. **Fallback:** no `ui` and no `component` → BaseNode's existing
auto-layout, so unmigrated nodes are untouched (migration is opt-in per node).

**Safety for custom user nodes:** `validateUISchema()` extends the existing
`services/customNodes/validator.ts` (whitelist at `:14`): `widget.type` ∈ the closed
enum; `bind` resolves to a declared control/port; `props` keys whitelisted per widget
and values primitive/string-array only (functions/objects rejected); `when` must be
one of the two allowed forms. The interpreter maps validated keys to built-in
components — **no code ever crosses the boundary**, closing path-D (custom-node
custom UI) without reopening the code-node sandbox concern.

Net: ~29 bespoke SFCs become ~10-line JSON; one control switch; one visibility
mechanism with operators; the `:min/:max` bug fixed in the widget map; user nodes get
safe custom layouts.

---

## 10. Node-data versioning & migration (REQUIRED for non-breaking)

LATCH has **no node-data migration today** — so the moment co-location or the
schema refactor changes any node's control set, old saved `.latch` flows
(`usePersistence`, exported JSON, the bundled `public/sample-flow.json`) load with
stale/missing fields. Research flagged this as the #1 way this whole effort could
silently degrade.

**Design** (n8n `VersionedNodeType` + Blender `do_versions`): every `defineNode`
carries a numeric `version` (default 1); saved node data records the version it was
created with; on load, the flows store runs `spec.migrate(data, fromVersion)` for any
node whose saved version < current, before instantiating. Provide a tiny
`migrate` helper for the common cases (rename control, add control with default,
split/merge). Add a guard test that loads `public/sample-flow.json` + a fixture of
older-version nodes and asserts they upgrade cleanly. This must land **before** the
first schema-changing co-location commit.

---

## 11. Master migration order (always green; guard tests are the gates)

Each step ends with `npm run typecheck` + `npm run lint` + `npm run test:unit`
green (CLAUDE.md). Commit per step/category. Branch off `main`.

**Phase A — foundations (no behavior change, unlock everything):**
1. Add `defineNode`/`NodeSpec`, `defineNodeState`+`collectedLifecycles`,
   `engine/trigger.ts`, the `ctx` typed accessors, and `registry/nodeRegistry.ts`
   (glob) — all *alongside* existing code. Add the **count-equality + dup-id +
   default-export guard tests** (they fail loudly on an empty glob). Wire the four
   generic lifecycle loops to run *in addition to* the old hardcoded ones
   (identical behavior).
2. **Node-data versioning** (§10) — `version`/`migrate` plumbing + sample-flow
   upgrade test. Land before any schema change.

**Phase B — split the monolith (mechanical, low risk):**
3. Split `executors/index.ts` by category into `executors/<cat>.ts`, keeping
   `index.ts` a barrel re-exporting every current name (preserve the must-not-break
   export list). Move each 1:1 state Map with its executor.
4. Convert state to `defineNodeState`; delete the 23 imports + 23 gc + 23 disposeAll
   in `ExecutionEngine.ts`; the generic loops become authoritative. **Gate:** a
   per-type leak test (create+delete in dirty mode → state Map empties).
5. Derive `PURE_NODE_TYPES` from `pure:true`. **Gate:** derived set == the literal
   24-id set, exact equality.

**Phase C — register-once subsystems (parallelizable):**
6. `defineProtocol` + `protocolRegistry` + `ctx.connection()`; convert mqtt/ws/http
   executors; fix the BLE/Serial/MIDI drift as one folder each. **Gate:** protocol
   count guard; subscribe/unsubscribe leak test.
7. `defineModel` + `modelRegistry` + uniform `ModelAdapter` + `runModelInference`;
   AI_MODELS/WEBLLM_MODELS/MediaPipe derived; auto loading/progress/error outputs;
   wire the per-node error badge. **Gate:** derived `AI_MODELS` deep-equals today's;
   prompt-format contract test.

**Phase D — declarative UI:**
8. `ui` schema + `NodeView` interpreter + unified `when`; migrate the inline
   switches to render `NodeView`; fix the `:min/:max` number-control bug in the
   widget map. **Gate:** snapshot parity for a migrated node on node + panel.
9. `validateUISchema` for custom nodes; enable custom-node `ui`.

**Phase E — full per-node co-location (the long tail; maintainer chose "all ~238"):**
10. Codemod that, per executor, emits `registry/<cat>/<node>/node.ts` (defineNode +
    `defineNodeState` for state) and moves the test; rename `_`-prefixed folders;
    resolve `counter`/`sample-hold` to one folder each. Category = one commit, glob
    count-guard green each time. End state: `executors/index.ts` and
    `components.ts` deleted (jobs are glob-derived); migrate ~29 bespoke SFCs to `ui`
    schemas where possible. Widen `vitest.config.ts:11` to include co-located tests.

**Subflow rebuild** (`SUBFLOW_REBUILD_SPEC_2026-06-28.md`) is gated on Phase B and
folds into this model (its `expandGraph` ids interplay is hardened there).

---

## 12. Invariants that keep it foolproof

- **Glob count-equality guard from commit 1** — a missing/empty glob fails CI, never
  ships a zero-node app.
- **Dup-id throw** — each id in exactly one `node.ts` (audit `counter`/`sample-hold`
  first).
- **Default-export lint** — no silently-dropped specs.
- **Must-not-break export list as a CI check** — the barrel contract holds through
  Phases B–E.
- **Exact-set guards** for `PURE_NODE_TYPES` (24) and the derived `AI_MODELS`.
- **Metadata-only guard tests** — never the first to eager-import SFCs under
  happy-dom.
- **Node ids are opaque** — no `.split('/')` on ids anywhere (verified none today),
  so subflow `I/n` ids stay safe.
- **Engine imports only types** — never the registry/state/protocol/model modules
  (lifecycles/executors passed in), so no circular deps and HMR fan-out is bounded.
- **`version`/`migrate` before any schema change** — saved flows never break.
- **Additive helpers** — `ctx.num`/`risingEdge`/`NodeView`-fallback all coexist with
  current code, so every step is independently revertible and green.

---

## 13. Decisions

**Settled:** `defineNode`/`NodeSpec` naming · full per-node co-location of all ~238 ·
subflow specced separately · custom-UI via declarative `ui` schema (path D, no
arbitrary code) · keep `eager:true` (defer lazy-loading) · node-data versioning
adopted now.

**Open (for the maintainer):**
1. Tool-store location (composable vs `stores/ui.ts`) — POLISH §8.
2. Snippet `tags` field — POLISH §8.
3. Where to START implementing: Phase A foundations (recommended — unlocks
   everything and ships the leak-class fix), vs a visible feature (toolbar/snippets)
   first.
4. How aggressively to migrate the ~29 bespoke SFCs to `ui` schemas (all, or only
   the simple ones, leaving canvas-heavy ones like oscilloscope as `component`).
