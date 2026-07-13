# Contributing a Node

> How to author a node, a nodeset, or a whole category in LATCH.

Since **Phase 6 (co-location)**, a node is **one self-contained folder** —
`src/renderer/registry/<category>/<id>/node.ts` — that pairs the node's
*definition* (ports/controls/metadata) with its *executor* (runtime behavior) via
`defineNode(...)`, and is **auto-discovered by a glob**. There is no central
registration file, no separate executor file, and no barrel to edit. Drop the
folder in and it appears.

The exhaustive schema reference is
[`docs/architecture/NODE_SPEC.md`](../architecture/NODE_SPEC.md) (v2.0) — this
guide is the practical, task-oriented companion.

## Table of contents

- [Quick start (60 seconds)](#quick-start-60-seconds)
- [What a node is](#what-a-node-is)
- [The definition](#the-definition)
- [The executor](#the-executor)
- [Stateful nodes](#stateful-nodes)
- [Custom UI: `ui` schema vs `component`](#custom-ui-ui-schema-vs-component)
- [Testing your node](#testing-your-node)
- [Versioning & migration](#versioning--migration)
- [Nodesets — one file, many nodes](#nodesets--one-file-many-nodes)
- [Drop-in categories](#drop-in-categories)
- [Declarable subsystems: `models` & `connections`](#declarable-subsystems-models--connections)
- [Rules & guards](#rules--guards)
- [Custom (user) nodes](#custom-user-nodes)

---

## Quick start (60 seconds)

Scaffold, edit, test — that's the whole loop.

```bash
# 1. Scaffold a co-located node.ts + node.test.ts from a template
npm run new-node -- math lerp --name "Lerp"

#    → src/renderer/registry/math/lerp/node.ts
#    → src/renderer/registry/math/lerp/node.test.ts
```

```ts
// 2. Edit registry/math/lerp/node.ts — declare ports + write the executor
import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'lerp',
  name: 'Lerp',
  version: '1.0.0',
  category: 'math',
  description: 'Linear interpolation between two values',
  icon: 'git-merge',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'number', label: 'A' },
    { id: 'b', type: 'number', label: 'B' },
    { id: 't', type: 'number', label: 'T' },
  ],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [
    { id: 't', type: 'slider', label: 'T', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
  ],
}

const executor = (ctx: ExecutionContext) => {
  const a = ctx.num('a', 0)
  const b = ctx.num('b', 1)
  const t = ctx.num('t', 0.5)
  return new Map<string, unknown>([['result', a + (b - a) * t]])
}

export default defineNode({ definition, executor, pure: true })
```

```bash
# 3. Run the co-located test + the guard suite
npm run test:unit
```

That's it — no barrel imports, no executor-file edits, no registration. The glob
discovers your folder; the palette shows the node on next `npm run dev`.

Scaffold flags:

| Command | Emits |
|---------|-------|
| `npm run new-node -- <cat> <id>` | `node.ts` + `node.test.ts` |
| `… --name "Nice Name"` | sets the display name (defaults to Title Case of the id) |
| `… --component` | also emits `<Pascal>Node.vue` and wires `component:` (bespoke SFC) |
| `… --stateful` | emits a `defineNodeState` store scaffold |
| `npm run new-node -- <cat> <family> --set a b c` | one `nodes.ts` registering the whole family |
| `npm run new-category -- <id> [--label] [--icon LucideName] [--color "#abc"]` | `category.ts` + a starter node |

The scaffold fails loudly if an id already exists (mirroring the registry's dup-id
guard) and only emits code that uses the public authoring surface.

---

## What a node is

A node's default export is a `NodeSpec`, built with `defineNode`:

```ts
interface NodeSpec {
  readonly definition: NodeDefinition          // ports / controls / metadata
  readonly executor: NodeExecutorFn            // runtime behavior
  readonly version?: number                     // node-data schema version (default 1); drives migrate()
  readonly migrate?: (data, from: number) => data
  readonly pure?: boolean                       // no side-effects/state → skippable in dirty mode
  readonly deferred?: boolean                   // fire-and-latch async (don't block the frame)
  readonly component?: Component                // bespoke-SFC UI escape hatch (else BaseNode / `ui`)
  readonly requires?: NodeRequirement[]         // hardware/runtime capabilities (serial/webgpu/mic…)
  readonly connections?: NodeConnectionRequirement[]  // connection protocols the node needs
  readonly models?: ModelRequirement[]          // AI model/task needs → derives a model select + std outputs
}
```

`defineNode` is a **frozen public contract**: fields are additive-only within a
major version — never repurposed or removed. Built-in and custom (user) nodes
converge on this one shape.

The folder layout:

```
src/renderer/registry/<category>/<id>/
├── node.ts            # export default defineNode({ definition, executor, … })
├── node.test.ts       # co-located isolated test (optional but encouraged)
└── <Pascal>Node.vue   # only if the node uses a bespoke `component`
```

---

## The definition

The `NodeDefinition` (declared in `src/renderer/stores/nodes.ts`) describes the
node's identity, ports, and controls. The most-used fields:

```ts
const definition: NodeDefinition = {
  id: 'my-node',                 // unique, kebab-case, OPAQUE (never .split() on it)
  name: 'My Node',
  version: '1.0.0',              // semver STRING (distinct from NodeSpec.version)
  category: 'math',              // a registered category id
  description: 'What it does',
  icon: 'box',                   // a lucide icon name (https://lucide.dev/icons)
  platforms: ['web', 'electron'],
  inputs: [ /* PortDefinition[] */ ],
  outputs: [ /* PortDefinition[] */ ],
  controls: [ /* ControlDefinition[] */ ],
  info: { overview: 'One-liner shown on the Info tab.', tips: [], pairsWith: [] },
}
```

**Ports** (`PortDefinition`): `{ id, type, label, description?, required?, multiple?, default? }`.
Data types: `trigger · number · string · boolean · audio · video · texture ·
data · array · any`, plus the 3D set (`scene3d · object3d · geometry3d ·
material3d · camera3d · light3d · transform3d`). Connection legality is decided by
the type matrix in `src/renderer/utils/connections.ts`.

**Controls** (`ControlDefinition`): `{ id, type, label, default?, exposable?,
bindable?, when?, props? }`. Give every control a sensible `default`. Control
types include `number · slider · select · toggle · text · color · code`, with
type-specific `props` (`min`/`max`/`step`, `options`, `language`, …). Conditional
visibility uses the `when` schema (keys are sibling control ids; the control shows
only when EVERY entry matches).

**Input-over-control precedence:** when an input port and a control share an id, a
connected input overrides the control value. The `ctx.num/bool/str` accessors
implement this for you (see below) — don't hand-roll it.

See [NODE_SPEC.md](../architecture/NODE_SPEC.md) for the complete field-by-field
schema.

---

## The executor

Executors are **functional**, not class-based. Each receives an `ExecutionContext`
and returns a `Map<string, unknown>` of output-port-id → value (sync or async):

```ts
type NodeExecutorFn = (ctx: ExecutionContext) => Map<string, unknown> | Promise<Map<string, unknown>>
```

Read inputs and controls through the **typed, coercing, NaN/±Infinity-guarded**
accessors — prefer them over raw `ctx.inputs.get()` / `ctx.controls.get()`:

| Accessor | Returns |
|----------|---------|
| `ctx.num(id, fallback?)` | number — `input ?? control ?? fallback`, coerced |
| `ctx.bool(id, fallback?)` | boolean |
| `ctx.str(id, fallback?)` | string |
| `ctx.trig(id)` | boolean — rising-edge (state auto-GC'd) |
| `ctx.level(id)` | boolean — level test (accepts legacy `true` / `1` / `>0`) |

Also on `ctx`: `nodeId`, `definition`, `deltaTime`, `totalTime`, `frameCount`, and
the raw `inputs`/`controls` Maps.

Trigger-emitting nodes should output the canonical fired value `TRIGGER` (`= 1`,
from `@/engine/trigger`).

```ts
const executor = (ctx: ExecutionContext) => {
  const freq = ctx.num('frequency', 440)
  const on = ctx.bool('enabled', true)
  return new Map<string, unknown>([['out', on ? freq : 0]])
}
```

---

## Stateful nodes

Per-node state goes in a `defineNodeState` store. It **self-registers its
gc/dispose** into the engine's generic lifecycle loop — so a stateful node touches
only its own module, and the "forgotten cleanup = leak" bug class is structurally
impossible.

```ts
import { defineNodeState } from '@/engine/nodeState'

// Keyed by node id; auto-GC'd for dead nodes, disposed on stop().
export const smoothState = defineNodeState<number>({ label: 'smooth' })

const executor = (ctx: ExecutionContext) => {
  const target = ctx.num('value', 0)
  const factor = ctx.num('factor', 0.1)
  const prev = smoothState.get(ctx.nodeId) ?? target
  const next = prev + (target - prev) * Math.min(1, factor * ctx.deltaTime * 60)
  smoothState.set(ctx.nodeId, next)
  return new Map<string, unknown>([['result', next]])
}
```

For heavy resources (Tone nodes, sockets, workers) pass a `dispose(state, nodeId)`
callback to `defineNodeState` — the engine calls it on stop and on GC. A stateful
node is **not pure**, so omit `pure: true`.

---

## Custom UI: `ui` schema vs `component`

A node with neither `ui` nor `component` renders with **BaseNode**'s auto-layout
(ports + declarative controls) — the default, and the right choice for the vast
majority of nodes.

For custom UI, prefer the **declarative `ui` schema**, interpreted by the single
`<NodeView>` renderer on both the canvas and the properties panel:

```ts
ui: {
  rows: [
    { widgets: [{ type: 'xy', bind: '', props: { fields: ['normalizedX', 'normalizedY'] } }] },
    { widgets: [{ type: 'readout', bind: 'rawX', source: 'output', label: 'X' }] },
    { label: 'Range', widgets: [{ type: 'number', bind: 'minX', label: 'X Min' }] },
  ],
}
```

A widget binds to a control id (2-way) or, with `source: 'output'`, an output-port
id (read-only readout). **Widget types `NodeView` currently dispatches:**

- primitives: `slider` · `number` · `toggle` · `select` · `text` · `color`
- rich: `knob` · `xy` · `eq` · `env` · `wave` · `readout` · `asset` · `connection`

> `piano`, `gamepad`, `curve`, `gradient`, `image`, and `button` are reserved enum
> slots with **no renderer yet** — a node needing one must use the `component`
> escape hatch below (adding the widget is a separate framework task).

The **`component` escape hatch** (`component: markRaw(MyNode)` on the definition,
or `--component` from the scaffold) is for nodes that capture raw input
(keyboard/MIDI/gamepad), render a live surface (video/canvas/scope/code
editor/emulator), or need bespoke geometry. It is the single source of truth for
custom rendering: `registry/components.ts` derives both the Vue Flow `nodeTypes`
map and the `CUSTOM_NODE_TYPE_IDS` set from the definitions that carry `component`.

---

## Testing your node

Co-locate a `node.test.ts` next to `node.ts`. The
[`tests/helpers/testNode.ts`](../../tests/helpers/testNode.ts) helper runs your
executor with a **faithful** `ExecutionContext` (built by the engine's own
`createExecutionContext`, so `ctx.num/bool/str/trig/level` coerce exactly as at
runtime) — no engine, no graph, just the one node.

```ts
// src/renderer/registry/math/smooth/node.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import smoothSpec from './node'
import { runNode, runFrames, resetNodeState } from '../../../../../tests/helpers/testNode'

beforeEach(resetNodeState) // only needed for a stateful node

describe('smooth', () => {
  it('initializes to the first target', async () => {
    const out = await runNode(smoothSpec, { inputs: { value: 0 }, controls: { factor: 0.3 } })
    expect(out.get('result')).toBe(0)
  })

  it('eases toward a changed target instead of jumping to it', async () => {
    const [, second] = await runFrames(smoothSpec, [
      { inputs: { value: 0 }, controls: { factor: 0.3 } },
      { inputs: { value: 1 }, controls: { factor: 0.3 } },
    ])
    const r = second.get('result') as number
    expect(r).toBeGreaterThan(0)
    expect(r).toBeLessThan(1)
  })
})
```

Helper API:

- `runNode(spec, { inputs?, controls?, nodeId?, deltaTime?, totalTime?, frameCount? })` → the output `Map`.
- `runFrames(spec, frames[], nodeId?)` → drive a stateful node across frames with a persistent `nodeId`.
- `resetNodeState()` → drain every `defineNodeState` store (put in a `beforeEach` for stateful nodes).

Vitest discovers co-located tests via the `src/renderer/registry/**` include, so
`npm run test:unit` runs them alongside the guard suite.

---

## Versioning & migration

`NodeSpec.version` is the **node-data schema version** (an integer, default 1) —
distinct from the human-facing `definition.version` string. Saved `.latch` flows
record the version each node was created with. On load, the flows store runs
`spec.migrate(data, fromVersion)` for any node whose saved data is behind the
current `spec.version`, before instantiating — so a control-set change **degrades
gracefully, never shatters**.

Bump `version` and write `migrate()` **before** any change to the control schema
(renamed/removed/retyped control). Node ids are stable and opaque forever (never
renamed); a missing node type loads as a graceful placeholder rather than dropping.

---

## Nodesets — one file, many nodes

When a family of nodes is near-identical (a parametric set, or a cohesive unit),
register them all from one `nodes.ts` (plural) with `defineNodes([...])` instead of
N near-identical folders:

```ts
// src/renderer/registry/logic/checks/nodes.ts
import { defineNodes } from '@/engine/defineNode'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

const makeCheck = (id: string, label: string, test: (v: unknown) => boolean) => ({
  definition: {
    id, name: label, version: '1.0.0', category: 'logic',
    description: `${label} check`, icon: 'check', platforms: ['web', 'electron'] as const,
    inputs: [{ id: 'value', type: 'any', label: 'Value' }],
    outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
    controls: [],
  },
  executor: (ctx: ExecutionContext) =>
    new Map<string, unknown>([['result', test(ctx.inputs.get('value'))]]),
})

export default defineNodes([
  makeCheck('is-null', 'Is Null', (v) => v == null),
  makeCheck('is-empty', 'Is Empty', (v) => v === '' || (Array.isArray(v) && v.length === 0)),
])
```

The glob discovers `node.ts` **and** `nodes.ts`; the collector flattens the array
and applies the dup-id / count / pure-set guards **per spec**. Scaffold it with
`npm run new-node -- logic checks --set is-null is-empty`.

---

## Drop-in categories

Adding a whole category is a folder drop — **zero edits to `stores/nodes.ts`**. Drop
a `registry/<cat>/category.ts` that exports `defineCategory({...})`; the
`categoryRegistry` glob discovers it and merges its presentation metadata into
`categoryMeta` at assembly (a one-way registry→stores push).

```ts
// src/renderer/registry/sensors/category.ts
import { defineCategory } from '@/engine/defineCategory'
import { Radio } from 'lucide-vue-next'

export default defineCategory({
  id: 'sensors',
  label: 'Sensors',
  icon: Radio,        // pass a lucide COMPONENT to render it in the palette;
  color: '#A855F7',   // a string is accepted as inert metadata (renders the neutral fallback icon)
})
```

Then any `registry/sensors/<id>/node.ts` with `category: 'sensors'` joins it.
`NodeDefinition.category` is a `LiteralUnion<KnownNodeCategory>` — built-in ids
autocomplete, and a new registered id is accepted. Scaffold the whole thing (a
`category.ts` + a starter node) with `npm run new-category -- sensors --icon Radio`.

Built-in category ids win over drop-ins, so a drop-in never silently overrides a
seeded category.

---

## Declarable subsystems: `models` & `connections`

Heavy subsystems are figured out once and usable by **any** node — declaratively.

**AI models.** Declare `models: [{ task }]` and the framework supplies a populated
`model` select control **plus** the standardized `loading` / `progress` / `done` /
`error` outputs — no per-node shim:

```ts
export default defineNode({
  definition,                              // your own inputs/outputs/controls
  executor,                                // call runModelInference() inside
  models: [{ task: 'object-detection' }],  // → model select + std outputs, populated
})
```

The AI catalog resolver is injected globally at registry assembly, so a plain
`models:` declaration works from any node (built-in or hand-authored), not just the
AI category. Inference is driven by `services/ai/AIInference.ts`
(`runModelInference()` — load → fire-and-latch → error-latch).

**Connections.** Declare `connections: [{ protocol }]` and the framework supplies a
`connection` picker control and `ctx.connection<Adapter>()` (auto-connect, shared
throttle):

```ts
export default defineNode({
  definition,
  executor,                               // uses await ctx.connection<MqttAdapter>()
  connections: [{ protocol: 'mqtt' }],
})
```

Both are the declarative twin of a fully bespoke path — you can always ignore them
and wire a subsystem by hand.

---

## Rules & guards

A handful of invariants keep the eager-discovery model safe. CI enforces them —
`npm run test:unit` must stay green.

- **No store/registry/engine value-imports in `node.ts`.** A `node.ts` (or
  `nodes.ts` / `category.ts`) may not value-import a Pinia store, the registry, or
  an `ExecutionEngine` value — that would close a load-time cycle in the eager glob
  and crash boot. Use `import type` (erased), or lazy `import()` the executor module
  at call time (the pattern the clasp nodes use). Guarded by
  `node-import-hygiene.test.ts`.
- **Ids are opaque.** Never `.split()` a node id; never rename one.
- **Every node needs a default export** (`defineNode(...)` or `defineNodes([...])`);
  ids must be unique. Guarded by `nodeRegistry.test.ts` (count-equality + dup-id).
- **Don't block the frame.** Mark heavy async work `deferred`; offload to a worker.
- **Don't leak.** Give `defineNodeState` a `dispose` for Tone/sockets/workers.
- **Don't hand-edit a central registry list** — there isn't one; the glob discovers
  your folder.

Other guards you may trip: `registry-integrity.test.ts` (executor outputs match the
def's ports), `custom-node-components.test.ts` (`component` derivation),
`public-exports.test.ts` (the governed `@/engine/executors` surface).

---

## Custom (user) nodes

A distributable **user** node and a built-in node are the *same shape* — both are a
`defineNode` `NodeSpec` (definition + executor, optionally `ui`/`models`/
`connections`), differing only in delivery (a built-in ships in the folder tree; a
user node loads through the sandboxed loader). Learning to author one teaches both.

---

## Related documents

- [NODE_SPEC.md](../architecture/NODE_SPEC.md) — the complete schema reference (v2.0)
- [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) — how the engine, registry, and stores fit together
- [Node reference catalog](./README.md) — every built-in node, by category
