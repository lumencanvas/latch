# LATCH — Architecture Deep Dive

**Document Version**: 2.0
**Last Updated**: 2026-07-12 (post-Phase-6 co-location)

> Naming note: the product is **LATCH** (Live Art Tool for Creative Humans). "CLASP" is only the
> first-party realtime-connectivity protocol (`@clasp-to/core`), one node category — not the app.

---

## Overview

LATCH is a node-based creative-coding environment — Vue 3 + TypeScript + Vite, packaged for web and
desktop (Electron Forge). This document describes the *current* module structure, the execution
model, and the extensibility architecture as it stands after **Phase 6 (per-node co-location)**:
241 built-in nodes across ~19 categories, each a self-contained `registry/<cat>/<id>/node.ts`.

Key libraries: Vue Flow (node editor), Pinia (state), Three.js (3D/shaders), Tone.js + Meyda
(audio), Transformers.js + ONNX Runtime + MediaPipe (in-browser ML), Dexie (IndexedDB, DB name
`latch`), `@clasp-to/core` (realtime connectivity).

---

## Layered structure & the acyclic rule

```
src/renderer/
├── registry/            # Node DEFINITIONS (ports/controls/metadata) + the auto-discovery glob
│   ├── <category>/<id>/node.ts   # a co-located node: defineNode({ definition, executor, … })
│   ├── <category>/<id>/XNode.vue  # optional bespoke SFC (component escape hatch)
│   ├── nodeRegistry.ts   # import.meta.glob('./**/node.ts', { eager, import:'default' }) → the registry
│   ├── allNodes.ts       # legacy category barrels (now all empty) ++ colocatedDefinitions
│   ├── components.ts      # derives Vue Flow nodeTypes + CUSTOM_NODE_TYPE_IDS from `component`
│   ├── nodeTypeIds.ts     # leaf that breaks the flows→components→registry cycle (see below)
│   └── types.ts
├── engine/              # Node BEHAVIOR + the execution engine
│   ├── ExecutionEngine.ts # the per-frame rAF graph executor (topo sort, coercion, lifecycle drain)
│   ├── defineNode.ts      # the NodeSpec contract + `models` derivation
│   ├── nodeState.ts       # defineNodeState / defineLifecycle (self-registering cleanup)
│   ├── trigger.ts         # canonical TRIGGER value + rising-edge helper
│   ├── connection.ts
│   └── executors/         # index.ts (barrel + builtin assembly), components.ts (nodeTypes), clasp.ts
│   │                      # (store-coupled shared module), visual.ts/ai.ts (re-export shims), + standalone
│   │                      # files (websocket/mqtt/http/subflow/opencv…). Category behavior now lives in
│   │                      # registry/<cat>/shared.ts + each node.ts (Workstream B).
├── services/            # audio · visual · ai · connections · clasp · ble · emulation · messaging
│   │                      # security · input · assets · worker · database.ts · fileFormat.ts
├── stores/              # Pinia: flows · nodes · runtime · ui · history · connections · assets · node-explorer
├── components/          # Vue UI: nodes/BaseNode.vue, controls/NodeView.vue, editor, layout, panels
├── composables/         # useExecutionEngine (wires executors + lifecycles into the engine), …
├── views/  router/  assets/  utils/  data/
```

**The acyclic rule (the spine of the design):** the **engine never imports the registry, stores, or
services**. It receives its executor map and lifecycle hooks *by injection*
(`composables/useExecutionEngine.ts`), so `engine/ExecutionEngine.ts` depends only on types. This
keeps the dependency graph acyclic and HMR fan-out bounded. The one place this tension surfaces is
the eager glob + Vue components — handled by the `nodeTypeIds` leaf (below) and enforced by the
`node-import-hygiene` guard test.

Concern separation: **definition** (`registry/`) is deliberately co-located with **behavior** — since
Workstream B, each `node.ts` *defines* its executor inline via `defineNode(...)`, with any state/helpers
shared across a category in `registry/<cat>/shared.ts` (locality of behavior for node authoring) — while the
**engine** that runs them stays a separate, injected layer. (The `clasp` category is the one documented
exception: its store-coupled executors stay in `engine/executors/clasp.ts` and its node.ts lazy-import them.)

---

## 1. Node registry — auto-discovery by glob (no central edits)

Since Phase 6, adding or editing a built-in node means touching **one folder**. There is no central
registration list.

```ts
// registry/nodeRegistry.ts
const modules = import.meta.glob<NodeSpec>('./**/node.ts', { eager: true, import: 'default' })
// Fails LOUDLY at import (CI-caught) on a missing default export or a duplicate id.
export const nodeSpecs, colocatedNodeIds, colocatedDefinitions, colocatedExecutors, COLOCATED_PURE_NODE_TYPES
```

- **`allNodes.ts`** merges the (now-empty) legacy category barrels with `colocatedDefinitions`
  (dedup: co-located wins) → the flat definition list the palette/stores read.
- **`engine/executors/index.ts`** exposes `builtinExecutors = { ...colocatedExecutors,
  ...subflowExecutors }` — the glob plus the ONE dynamically-instantiated `subflow` instance node
  (no `NodeDefinition`, so not glob-discovered).
- **`registry/components.ts`** derives the Vue Flow `nodeTypes` map and the `CUSTOM_NODE_TYPE_IDS`
  set from the definitions that carry a `component`.

See [NODE_SPEC.md](./NODE_SPEC.md) for the `defineNode` / `NodeDefinition` contract and the guard
tests (count-equality, import-hygiene, integrity, public-exports, custom-node-components).

### The `nodeTypeIds` cycle-breaker

The eager glob loads every `node.ts` at boot, and a bespoke-component `node.ts` imports its `.vue`,
which imports `@/stores/flows`. Historically `flows` imported `CUSTOM_NODE_TYPE_IDS` from
`components.ts`, closing the load-time cycle `flows → components → allNodes → nodeRegistry (mid-glob)`.
The fix: a leaf `registry/nodeTypeIds.ts` (imports **nothing**) — `allNodes.ts` pushes the
component-id set into it (`setCustomNodeTypeIds`), and `flows.ts` reads `isCustomNodeTypeId` — severing
the sole `stores → registry` edge. `components.ts` still owns `CUSTOM_NODE_TYPE_IDS`/`nodeTypes` for
UI + the public contract.

---

## 2. Execution engine — per-frame push loop with injected behavior

`engine/ExecutionEngine.ts` runs a **per-frame requestAnimationFrame loop**: topological order,
propagate outputs → inputs, coerce each value to the target port's declared type at the boundary,
call each node's executor `(ctx) => Map`. A "dirty mode" skips `pure` nodes whose inputs are
unchanged (the seed of demand-driven recompute).

```ts
interface ExecutionContext {          // built per node, per frame
  nodeId; inputs; controls; definition; deltaTime; totalTime; frameCount
  num/bool/str/trig/level(...)         // typed, coercing, NaN-guarded accessors
}
type NodeExecutorFn = (ctx) => Map<string, unknown> | Promise<Map<string, unknown>>
```

Executors are **functional** (not class-based `BaseNodeExecutor` — that older design was never built
this way). `deferred: true` nodes are fire-and-latch (don't block the frame). The engine surfaces a
read-side `error` latch on the node badge.

Wiring happens once, by injection:

```ts
// composables/useExecutionEngine.ts
for (const [type, executor] of Object.entries(builtinExecutors)) engine.registerExecutor(type, executor)
engine.registerLifecycles(collectedLifecycles())   // the generic cleanup loop
```

---

## 3. Lifecycle & state — `defineNodeState`

Per-node state lives in `defineNodeState` stores that **self-register** their gc/dispose into a
module-level lifecycle list (`engine/nodeState.ts`). The engine drains it generically:

```ts
for (const l of this.lifecycles) l.gc(validNodeIds)   // on graph update
for (const l of this.lifecycles) l.disposeAll()       // on stop()
for (const l of this.lifecycles) l.endFrame?.() / l.onStart?.()
```

This replaced ~23×3 hand-wired call sites in the engine and made the "forgotten cleanup = resource
leak" bug class structurally impossible — a stateful node touches only its own module. The engine
stores the collected array *by reference*, so late (eager-glob) registrations are still seen, and it
never imports `nodeState.ts` (acyclic). `defineLifecycle` covers non-per-node cleanup (service
singletons, message-bus flush). Guarded by `engine-leak.test.ts` + `executor-gc.test.ts`.

---

## 4. Register-once subsystems (protocols · models · connections)

Shared dependencies are **register-once declarations referenced by name**, each auto-discovered like
nodes:

- **Connection protocols** — `services/connections/`: a `ConnectionManager` data-driven registry;
  protocols (MQTT/WebSocket/HTTP/BLE/Serial/MIDI/OSC) are declarations, resolved via
  `ctx.connection<Adapter>()`. Security-hardened: capability-scoped, user-approved access with a
  trust tier (`services/security/`) — the broker holds the secret, the node gets a scoped handle
  (see SECURITY_MODEL).
- **AI models** — `services/ai/`: `defineModel` specs feed a model registry; a node's `models`
  declaration auto-appends standardized `loading/progress/done/error` outputs + a populated `model`
  select, and a shared `runModelInference` runs the fire-and-latch pattern (transformers.js / WebLLM
  / MediaPipe families behind a uniform adapter; workers under `services/worker` + `services/ai`).

---

## 5. State management (Pinia stores)

- **`flows`** — the active graph (nodes/edges), node-type resolution (`isCustomNodeTypeId` via the
  leaf), persistence/rehydration, undo integration.
- **`nodes`** — the definition registry surface + search; the `NodeDefinition`/`UISchema`/`WidgetType`
  types live here.
- **`runtime`** — execution status, per-node metrics/fps, error surfacing.
- **`ui`**, **`history`** (undo/redo), **`connections`**, **`assets`**, **`node-explorer`**.

Perf discipline (EXTENSIBILITY amendment 6): selection/hover state is CSS-driven, not Pinia; cosmetic
edits (move/rename/recolor) are decoupled from execution.

---

## 6. Custom UI rendering

Three tiers, chosen per node (see NODE_SPEC.md §Custom UI):

1. **BaseNode auto-layout** — default (ports + declarative controls), no `ui`/`component`.
2. **Declarative `ui` schema** — rendered by one `<NodeView>` interpreter on canvas + panel; a closed
   widget enum (live: `slider/number/toggle/select/text/color` + `knob/xy/eq/env/wave/readout/asset/
   connection`; reserved-not-yet-rendered: `piano/gamepad/curve/gradient/image/button`).
3. **`component` escape hatch** — `markRaw(MyNode)` on the definition, for raw-input capture, live
   canvas/video/scope surfaces, code editors, or the emulator. `components.ts` derives routing from it.

Connections render with data-type-styled lines (color/width/dash per `DataType`) with active-flow
animation.

---

## 7. Persistence & file format

Flows persist to IndexedDB (Dexie, DB `latch`, `services/database.ts`) and export to the documented
`.latch` v2 format (`services/fileFormat.ts`; FILE_FORMAT_SPEC). The format is the strategic
centerpiece: stable opaque node ids, deterministic key order, **positions/colors separated from
logic** (diff-friendly), export + import validation, and node-data `version`/`migrate` so old saves
degrade gracefully (missing node type → placeholder, never a drop). Assets live in
`services/assets` + the `assets` store.

---

## 8. Platform abstraction

`utils/platform.ts` + `services/*` abstract web vs Electron capabilities (serial/BLE/MIDI/OSC/native
audio/filesystem/GPU). A node declares abstract needs via `requires: NodeRequirement[]`; the palette
disables an unavailable node and services preflight (mic permission, model download) without bespoke
per-node code. `webFallback` names an alternate id when a node can't run on web.

---

## Performance guidelines

- **Render:** only-render-visible-elements on the canvas; CSS transforms for node position; CSS-driven
  selection/hover; decouple cosmetic edits from execution; profile at 500+ nodes (Vue Flow inherits
  React Flow's re-render tendencies).
- **Execution:** `pure` + dirty-mode skip unchanged nodes; mark heavy async work `deferred`; offload
  to workers (`services/worker`, ai/opencv workers); pool audio buffers / reuse textures.
- **Memory:** `defineNodeState` with a `dispose` for every Tone node / socket / worker / texture;
  bounded undo history; lazy-load large assets/models.

---

## Security

- **Electron:** `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, preload bridge.
- **Register-once subsystems:** capability-scoped + user-approved + trust-tiered — never a blanket
  credential handoff (the web sandbox stops `fs`/`exec` but not `fetch`-to-attacker). See
  SECURITY_MODEL.
- **Code/function nodes:** run sandboxed with timeout/limits.

---

## Related documents

- [Node Specification](./NODE_SPEC.md)
- [Extensibility Architecture](../plans/EXTENSIBILITY_ARCHITECTURE_2026-06-28.md) — design + foolproofing risk register
- [Roadmap](../plans/ROADMAP_2026-06-28.md) · [Policies](../plans/POLICIES_2026-06-28.md)
- [File Format Spec](../plans/FILE_FORMAT_SPEC_2026-06-28.md) · [Security Model](../plans/SECURITY_MODEL_2026-06-28.md)
- [Declarative UI / NodeView design](../plans/DECLARATIVE_UI_NODEVIEW_DESIGN_2026-07-01.md)
- `../HANDOFF.md` — running session log (Phase 6 co-location: later-71 → later-85)
