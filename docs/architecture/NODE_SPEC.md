# LATCH — Node Specification

**Document Version**: 2.0
**Last Updated**: 2026-07-12 (post-Phase-6 co-location)

> Naming note: the product is **LATCH**. "CLASP" is only the first-party realtime-connectivity
> protocol/service (`@clasp-to/core`), surfaced as the `clasp` node category — not the app.

---

## Overview

Nodes are LATCH's fundamental building blocks — operations that transform, generate, or consume
data on a per-frame execution graph. Since **Phase 6 (co-location)**, every built-in node is a
**single self-contained module** at `src/renderer/registry/<category>/<id>/node.ts` that pairs the
node's *definition* (ports/controls/metadata) with its *executor* (runtime behavior) via
`defineNode(...)`, and is **auto-discovered by a glob** — there is no central registration file to
edit. All 241 built-in nodes follow this shape.

---

## The `defineNode` contract

A node module's default export is a `NodeSpec` built with `defineNode`:

```ts
// src/renderer/registry/math/add/node.ts
import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'add',
  name: 'Add',
  version: '1.0.0',
  category: 'math',
  description: 'Add two numbers',
  icon: 'plus',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'number', label: 'A' },
    { id: 'b', type: 'number', label: 'B' },
  ],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [],
  info: { overview: 'Adds two numbers.', pairsWith: ['subtract', 'multiply'] },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = ctx.num('a', 0)
  const b = ctx.num('b', 0)
  return new Map([['result', a + b]])
}

export default defineNode({ definition, executor, pure: true })
```

### `NodeSpec` fields (`src/renderer/engine/defineNode.ts`)

```ts
interface NodeSpec {
  readonly definition: NodeDefinition          // ports / controls / metadata
  readonly executor: NodeExecutorFn            // runtime behavior
  readonly version?: number                     // node-data schema version (default 1); drives migrate()
  readonly migrate?: (data, from: number) => data   // upgrade saved control data
  readonly pure?: boolean                       // no side-effects/state → safe to skip in dirty mode
  readonly deferred?: boolean                   // fire-and-latch async (don't block the frame)
  readonly component?: Component                // bespoke-SFC UI escape hatch (else BaseNode / `ui`)
  readonly requires?: NodeRequirement[]         // hardware/runtime capabilities (serial/webgpu/mic…)
  readonly connections?: NodeConnectionRequirement[]  // connection protocols the node needs
  readonly models?: ModelRequirement[]          // AI model/task needs → derives a model select + std outputs
}
```

`defineNode` is a **frozen public contract** (POLICIES §2): fields are additive-only within a major
version — never repurposed or removed; retirement goes through a deprecation cycle with a node-data
`migrate()`. Built-in and custom (user) nodes converge on this one contract.

---

## `NodeDefinition` schema

Declared in `src/renderer/stores/nodes.ts`.

```ts
interface NodeDefinition {
  // Identity
  id: string                     // unique, kebab-case, OPAQUE (never .split() on it)
  name: string
  version: string                // semantic version string (distinct from NodeSpec.version)
  // Classification
  category: NodeCategory
  description: string
  tags?: string[]                // search tags
  // Visual
  icon: string                   // lucide icon name
  color?: string                 // override category color
  // Platform
  platforms: Platform[]          // ('web' | 'electron')[]
  webFallback?: string           // alternative node id when unavailable on web
  // Ports & controls
  inputs: PortDefinition[]
  outputs: PortDefinition[]
  controls: ControlDefinition[]
  // UI (choose at most one; else BaseNode auto-layout)
  ui?: UISchema                  // declarative custom UI (preferred) — see below
  component?: Component          // bespoke SFC escape hatch (markRaw); single source of truth for routing
  // Info tab
  info?: { overview: string; tips?: string[]; pairsWith?: string[] }
}

type NodeCategory =
  | 'debug' | 'inputs' | 'outputs' | 'timing' | 'math' | 'logic' | 'audio' | 'video'
  | 'visual' | 'shaders' | 'data' | 'ai' | 'code' | '3d' | 'connectivity' | 'clasp'
  | 'subflows' | 'string' | 'messaging' | 'custom'

type Platform = 'web' | 'electron'
```

### Ports

```ts
interface PortDefinition {
  id: string                     // unique within the node
  type: DataType
  label: string
  description?: string
  required?: boolean             // must be connected (default false)
  multiple?: boolean             // allow multiple connections (default false)
  default?: unknown              // value when unconnected
}

type DataType =
  | 'trigger' | 'number' | 'string' | 'boolean'
  | 'audio' | 'video' | 'texture' | 'data' | 'array' | 'any'
  // 3D types
  | 'scene3d' | 'object3d' | 'geometry3d' | 'material3d' | 'camera3d' | 'light3d' | 'transform3d'
```

Connection legality is decided by the type matrix in `src/renderer/utils/connections.ts`.

### Controls

```ts
interface ControlDefinition {
  id: string
  type: string                   // 'number' | 'slider' | 'select' | 'toggle' | 'text' | 'color' | 'code' | …
  label: string
  description?: string
  default?: unknown
  exposable?: boolean            // may appear in the control panel
  bindable?: boolean             // may be overridden by a same-id input port
  when?: WhenSchema              // unified conditional visibility (preferred)
  visibleWhen?: { controlId; value }   // @deprecated single-key form
  props?: Record<string, unknown>      // type-specific (min/max/step/options/language/…)
}
```

**Conditional visibility** uses the unified `when` schema — keys are sibling control ids; the control
shows only when EVERY entry matches (AND). Operators: bare value (equality), `{ in: [...] }`,
`{ ne }`, `{ gt }`, `{ lt }`.

---

## Executor contract

Executors are **functional**, not class-based. Each receives an `ExecutionContext` and returns a
`Map<string, unknown>` of output-port-id → value (sync or async).

```ts
// src/renderer/engine/ExecutionEngine.ts
interface ExecutionContext {
  nodeId: string
  inputs: Map<string, unknown>       // values from connected input ports (coerced to the target port type)
  controls: Map<string, unknown>     // inline control values
  definition: NodeDefinition
  deltaTime: number
  totalTime: number
  frameCount: number
  // Typed, coercing, NaN/±Infinity-guarded accessors (prefer these over raw .get()):
  num(id: string, fallback?: number): number   // input ?? control ?? fallback, coerced
  bool(id: string, fallback?: boolean): boolean
  str(id: string, fallback?: string): string
  trig(id: string): boolean          // rising-edge (state auto-GC'd via defineNodeState)
  level(id: string): boolean         // level test (accepts legacy true | 1 | >0)
}

type NodeExecutorFn = (ctx: ExecutionContext) => Map<string, unknown> | Promise<Map<string, unknown>>
```

**Input-over-control precedence** is handled at the boundary: a connected input port overrides the
same-id inline control. The `ctx.num/bool/str` accessors implement `input ?? control ?? fallback`
and coerce to the target port's declared type — prefer them over hand-rolled
`(ctx.inputs.get(id) as number) ?? (ctx.controls.get(id) as number) ?? 0` chains.

Trigger-emitting nodes should output the canonical fired value `TRIGGER` (`= 1`, from
`@/engine/trigger`); trigger inputs are read with `ctx.trig(id)` (rising-edge) or `ctx.level(id)`.

---

## Per-node state — `defineNodeState`

Stateful nodes keep per-node state in a `defineNodeState` store, which **self-registers its
gc/dispose** into the engine's generic lifecycle loop — so a stateful node touches only its own
module and the "forgotten cleanup = leak" class is structurally impossible.

```ts
// src/renderer/engine/nodeState.ts
import { defineNodeState } from '@/engine/nodeState'

const smoothState = defineNodeState<number>({ label: 'smooth' /*, dispose?, onStart?, endFrame?, keyToNodeId? */ })

const executor: NodeExecutorFn = (ctx) => {
  const prev = smoothState.get(ctx.nodeId) ?? target
  const next = prev + (target - prev) * factor
  smoothState.set(ctx.nodeId, next)          // gc'd automatically for dead nodes; disposed on stop()
  return new Map([['result', next]])
}
```

The engine drains all collected lifecycles generically (`gc(validIds)` on graph update,
`disposeAll()` on stop, `endFrame()`/`onStart()` as needed) — it never imports `nodeState.ts`, only
receives the collected hooks, keeping the graph acyclic. For heavy resources (Tone nodes, sockets,
workers) pass a `dispose(state, nodeId)` callback. Non-per-node cleanup uses `defineLifecycle`.

---

## Custom UI: `ui` schema (preferred) vs `component` (escape hatch)

A node with neither `ui` nor `component` renders with **BaseNode**'s auto-layout (the default —
ports + declarative controls). For custom UI, prefer the **declarative `ui` schema**, rendered by
the single `<NodeView>` interpreter on both the node canvas and the properties panel:

```ts
ui: {
  rows: [
    { widgets: [{ type: 'xy', bind: '', props: { fields: ['normalizedX', 'normalizedY'] } }] },
    { widgets: [{ type: 'readout', bind: 'rawX', source: 'output', label: 'X' }] },
    { label: 'Range', widgets: [{ type: 'number', bind: 'minX', label: 'X Min' }] },
  ],
}
```

A widget binds to a control id (2-way) or, with `source: 'output'`, an output-port id (read-only
readout). The `type` is a **closed enum** (never a component path or code). **Widget types NodeView
currently dispatches:**

- primitives: `slider` · `number` · `toggle` · `select` · `text` · `color`
- rich: `knob` · `xy` · `eq` · `env` · `wave` · `readout` · `asset` · `connection`

`piano`, `gamepad`, `curve`, `gradient`, `image`, `button` are **reserved enum slots with no
renderer yet** — a node needing one must use the `component` escape hatch.

The **`component` escape hatch** (`component: markRaw(MyNode)` on the definition) is for nodes that
capture raw input (keyboard/MIDI/gamepad), render a live surface (video/canvas/scope/code
editor/emulator), or need bespoke geometry. It is the **single source of truth** for custom
rendering: `registry/components.ts` derives both the Vue Flow `nodeTypes` map and the
`CUSTOM_NODE_TYPE_IDS` set from the definitions that carry `component`.

---

## Node-data versioning & migration

Saved `.latch` flows store the node-data schema version each node was created with. On load, the
flows store runs `spec.migrate(data, fromVersion)` for any node whose saved version is behind the
current `spec.version`, before instantiating — so a control-set change **degrades gracefully, never
shatters**. Node ids are stable and opaque forever (never renamed, never `.split()`); a missing node
type loads as a graceful placeholder rather than dropping the node.

---

## Registration & auto-discovery (the glob)

There is **no central registration edit**. `src/renderer/registry/nodeRegistry.ts` eagerly globs
every `node.ts` and assembles the registry, failing loudly at import (CI-caught) on a missing
default export or a duplicate id:

```ts
const modules = import.meta.glob<NodeSpec>('./**/node.ts', { eager: true, import: 'default' })
// → nodeSpecs, colocatedDefinitions, colocatedExecutors, COLOCATED_PURE_NODE_TYPES
```

`src/renderer/engine/executors/index.ts` then exposes `builtinExecutors = { ...colocatedExecutors,
...subflowExecutors }` — the glob plus the one dynamically-instantiated `subflow` instance node
(which has no `NodeDefinition`, so it isn't glob-discovered). The `pure` set is derived from
`pure: true`; a `models` declaration auto-appends standardized `loading/progress/done/error` outputs
plus a populated `model` select.

**Adding a built-in node** = drop one folder `registry/<cat>/<id>/node.ts` (+ an optional `.vue` if
using `component`). Nothing else. CI guard tests enforce the invariants:

- `nodeRegistry.test.ts` — count-equality (`colocatedNodeIds.length === allNodes.length`), no dup ids, default-export present, pure ⊆ colocated.
- `node-import-hygiene.test.ts` — no `node.ts` may value-import a store/registry/ExecutionEngine-value (would close the eager-glob load-time cycle; use `import type` or a lazy dynamic import).
- `registry-integrity.test.ts` — the historically dual-id `counter`/`sample-hold` are each served by the executor whose outputs match their def.
- `custom-node-components.test.ts` — `nodeTypes`/`CUSTOM_NODE_TYPE_IDS` derive correctly from `component`.
- `public-exports.test.ts` (+ `tests/contracts/public-exports.ts`) — the governed `@/engine/executors` export surface still resolves.

---

## Example: a stateful node with a rich definition

```ts
// src/renderer/registry/math/smooth/node.ts
import { defineNode } from '@/engine/defineNode'
import { defineNodeState } from '@/engine/nodeState'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'smooth', name: 'Smooth', version: '1.0.0', category: 'math',
  description: 'Smooth value changes over time', icon: 'trending-up',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value' }],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [{ id: 'factor', type: 'slider', label: 'Factor', default: 0.1, props: { min: 0.01, max: 1, step: 0.01 } }],
}

export const smoothState = defineNodeState<number>({ label: 'smooth' })

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const target = ctx.num('value', 0)
  const factor = ctx.num('factor', 0.1)
  const prev = smoothState.get(ctx.nodeId) ?? target
  const next = prev + (target - prev) * Math.min(1, factor * ctx.deltaTime * 60)
  smoothState.set(ctx.nodeId, next)
  return new Map([['result', next]])
}

export default defineNode({ definition, executor })   // stateful ⇒ not pure
```

---

## Best practices

**DO** — self-contain the node in its folder; give every control a sensible default; use
`ctx.num/bool/str/trig` (typed + coerced) over raw `.get()`; put per-node state in `defineNodeState`
(auto-cleanup); prefer the declarative `ui` schema, reserving `component` for genuinely bespoke
surfaces; document with `info.overview`/`tips`/`pairsWith`; bump `version` + write `migrate()` before
any control-schema change.

**DON'T** — value-import a store / the registry / an ExecutionEngine value into a `node.ts`
(closes the eager-glob cycle — `import type`, or lazy `import()` the executor module, like the clasp
nodes); block the frame (mark heavy async work `deferred`, offload to a worker); leak resources
(always give `defineNodeState` a `dispose` for Tone/sockets/workers); `.split()` a node id (ids are
opaque); hand-edit a central registry list (there isn't one — the glob discovers your folder).

---

## Related documents

- [Architecture](./ARCHITECTURE.md)
- [Extensibility Architecture](../plans/EXTENSIBILITY_ARCHITECTURE_2026-06-28.md) — the design + risk register
- [Declarative UI / NodeView design](../plans/DECLARATIVE_UI_NODEVIEW_DESIGN_2026-07-01.md)
- [File Format Spec](../plans/FILE_FORMAT_SPEC_2026-06-28.md) · [Security Model](../plans/SECURITY_MODEL_2026-06-28.md) · [Policies](../plans/POLICIES_2026-06-28.md)
