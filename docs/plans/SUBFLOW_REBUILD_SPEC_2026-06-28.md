# Subflow Rebuild — Spec (2026-06-28)

Detailed design for fixing the subflow/subgraph system, the single biggest gap
in `docs/AUDIT_2026-06-28.md` (§A). Companion to
`docs/plans/POLISH_AND_ARCHITECTURE_PLAN_2026-06-28.md` (this is its Stream 5).
**Gated on ROADMAP Phase 1** (the modular engine + `defineNodeState` lifecycle) —
this is "Phase 7" in `ROADMAP_2026-06-28.md`. The rebuild leans on
the generic lifecycle hooks and per-node-spec model.

This is a rebuild, not a patch. The store-level graph surgery (create / edit /
unpack) already works and is tested; the **runtime execution and instance UI
were never wired**, so we design those from scratch and reuse the working parts.

---

## 1. Why it's broken today (verified)

| # | Defect | Evidence |
|---|--------|----------|
| 1 | Subflows never execute — `_executeNode`/`_getSubflow` are read from the control map but **never injected** anywhere | `executors/subflow.ts:138,151`; `ExecutionEngine.ts:355-375` builds controls only from defaults + `node.data` |
| 2 | The `subflow` instance node has **no registry definition** → renders with **zero ports**; edges target handles that don't exist | no `id:'subflow'` in registry; `BaseNode.vue:80-127` resolves ports from definition/`_dynamic*`; `flows.ts:824,841,854` |
| 3 | Internal node state not instance-namespaced → multiple instances would **collide** (oscillator phase, timers, audio nodes) | `subflow.ts:214` runs internal nodes by their own fixed id |
| 4 | A separate **synchronous** mini-engine → async (AI/HTTP), per-frame timing, dirty/deferred all bypassed | `subflow.ts:166-225` vs the async `ExecutionEngine.executeNode` (`:337,414`) |
| 5 | Internal executor state has **no GC/dispose** path | `gcSubflowState` clears only the context map (`subflow.ts:46-52`) |
| 6 | Entering a subflow **strands** you — no tab, no breadcrumb | `EditorView.vue:617` `setActiveFlow`; `FlowTabs.vue:11` filters subflows out |
| 7 | **No reuse** — one-in-place only; subflows never appear in the palette; nesting impossible; no recursion guard | `flows.ts` create path; no palette wiring |

The working, tested parts to keep: `createSubflowFromSelection`,
`addSubflowInput`/`addSubflowOutput`, unpack, port data model
(`flows.ts:554-868`), and the keybinds (Ctrl+G/E/Shift+G, `EditorView.vue`).

---

## 2. Goals (graded against the 12-point checklist, AUDIT §H.2)

| # | Capability | Target |
|---|-----------|--------|
| 1 | Typed IO ports auto-derived | ✅ from `subflow-input`/`subflow-output` nodes |
| 2 | Custom parameters on the instance | ⏳ P3 (after core) |
| 3 | Multiple instances, independent params + state | ✅ via instance-namespaced ids |
| 4 | Master/clone propagation (edit once → all update) | ✅ instances reference one definition by `subflowId` |
| 5 | Nesting through the real engine | ✅ recursive inline expansion |
| 6 | Edit-in-place + breadcrumb navigation | ✅ |
| 7 | Collapse + expand | ✅ already works (keep) |
| 8 | Per-subgraph presets | ⏳ later (ties to Stream 4 presets) |
| 9 | Publish/reuse as library node (palette) | ✅ |
| 10 | Recursion handling (guard) | ✅ depth + visited-id guard |
| 11 | Async/audio/WebGL inside subgraph | ✅ free from inlining |
| 12 | Cross-level scope rules | ✅ defined (state keyed by full instance path) |

---

## 3. Core architecture — inline expansion (the key decision)

**Reject** the current approach (a synchronous mini-engine invoked from a single
executor). **Adopt** *graph flattening*: when the engine builds its execution
plan, expand each `subflow` instance into its internal nodes inline, with every
internal node id rewritten to an **instance-qualified id**.

### 3.1 Instance-qualified ids
For instance `I` containing internal node `n`, the runtime id is `` `${I}/${n}` ``
(slash-joined to support nesting: `inst1/inst2/osc`). This single rule delivers:
- **State isolation** — executor state Maps key by the qualified id, so two
  instances of one subflow never collide (defect #3).
- **GC/dispose for free** — qualified ids become real entries in the engine's
  `validNodeIds`, so the generic lifecycle sweep from Stream 1 (`gc`/`disposeAll`
  iterating all specs) cleans them like any node (defect #5). No special
  `gcSubflowState` needed.
- **Async/timing/dirty for free** — expanded nodes are ordinary nodes in the main
  async topo loop, so they get `deltaTime`/`totalTime`, fire-and-latch, and
  pure-skip exactly like top-level nodes (defects #1, #4).

> **Foolproofing invariants (verified):** (1) Node ids must stay **opaque** — no
> code may `.split('/')` a node id (verified none does today; mqtt/clasp split `/`
> only on topic/address *strings*, `mqtt.ts:186`, `clasp.ts:777,910`), so the
> `I/n` join is safe. Encode this as a test. (2) A **mandatory** `instanceId →
> internalId` reverse map in Phase 1 (not "kept"): runtime metrics and `lastError`
> are keyed by the flat `I/n` ids the editor never renders
> (`only-render-visible-elements`, `EditorView.vue:703`), and `_dynamic*` writeback
> targets the *unexpanded* instance node (`ExecutionEngine.ts:460-475`) — both need
> the reverse map to surface on the visible instance. (3) `expandGraph` must run
> **only on graph change** (in `updateGraph`, not per frame) and be **idempotent**,
> and must **compose with** the golden harness `idPrefix` (`flowHarness.ts:33`)
> rather than double-prefixing. Add golden tests for all three.

### 3.2 Expansion algorithm (build-time, per graph change)
Add an `expandGraph(nodes, edges, getSubflow, depth=0)` pass that runs when the
active flow changes (not per frame), producing a *flat* execution graph the
engine already knows how to run:

```
for each node:
  if node.type !== 'subflow': emit as-is
  else:
    def = getSubflow(node.data.subflowId); if !def: emit error node; continue
    if depth > MAX_DEPTH or node.data.subflowId in visitedPath: emit error node; continue   // recursion guard
    expanded = expandGraph(def.nodes, def.edges, getSubflow, depth+1, visitedPath + subflowId)
    prefix every expanded node id with `${node.id}/`
    // boundary rewrite:
    //   external edge → instance input port  ==> edge to the internal subflow-input node carrying that portId
    //   internal subflow-output node         ==> external edge from the instance output port
    rewire edges across the boundary using def.subflowInputs/subflowOutputs portId mapping
```

`subflow-input`/`subflow-output` nodes become **pure pass-through** internal
nodes (their executor just forwards the boundary value) — no more context-map
side channel (`subflow.ts` `getSubflowContext` is deleted). Boundary wiring is
done by the expander rewriting edges, so values flow through normal edges.

The engine runs the flat graph unchanged. The editor still shows the *unexpanded*
graph (the instance node); only the execution plan is flat. Keep an
`instanceId → internalNodeId` map so runtime values/errors can be surfaced back
on the instance node (and inside the editor when the user steps in).

### 3.3 Where it hooks in
`ExecutionEngine.updateGraph` already rebuilds derived structures on graph
change. Insert `expandGraph` there (behind the existing topo-sort), so the
per-frame loop sees only flat nodes. `_getSubflow` resolves to
`useFlowsStore().getFlowById`; **no per-executor injection** (deletes the fragile
control-map channel, defect #1).

---

## 4. The `subflow` instance node

### 4.1 Definition (new built-in, authored via `defineNode`)
`registry/subflows/instance/node.ts` — a real `NodeSpec` whose **executor is
never actually run** (the expander replaces it), but whose definition drives the
instance's rendering. Its ports are **dynamic**, derived from the referenced
flow's `subflowInputs`/`subflowOutputs`:
- On creation/refresh, the instance writes `_dynamicInputs`/`_dynamicOutputs`
  (already engine-supported, `ExecutionEngine.ts:460-475`) carrying each boundary
  port's `id`, `type` (real type, not hardcoded `'any'`), and `label`.
- `BaseNode` then renders typed handles (fixes defect #2 and the
  `connections.ts` type-checking that was inert).

### 4.2 Keeping instance ports in sync with the definition (clone behavior)
When a subflow definition's ports change (a `subflow-input` added/renamed), every
instance must update its dynamic ports — this is the "master/clone" behavior
(checklist #4). Implement via a `flows` store watcher: on subflow
input/output mutation, bump a `portsRevision` on the definition; instances
recompute `_dynamic*` from it. Edges to removed ports are pruned (warn, don't
silently drop — surface in the Debug panel).

---

## 5. Navigation (defect #6)

- **Breadcrumb bar** above the canvas: `Main / mySubflow / innerSubflow`, each
  segment clickable. Driven by an `editStack: FlowId[]` in the flows store
  (push on enter, pop on breadcrumb click).
- **Enter:** double-click an instance (or Ctrl+E) pushes the subflow's `FlowId`
  onto `editStack` and `setActiveFlow(subflowId)`.
- **Exit:** breadcrumb, an "Exit subflow" button, or Esc pops the stack.
- `FlowTabs.vue:11` still filters subflows out of the *tab bar* (correct — they
  aren't top-level documents); the breadcrumb is the in-place nav. Optionally show
  a non-closable "editing subflow" pill in the tab strip while `editStack` is
  non-empty.
- **Testing a subflow in isolation:** when a subflow is the active flow, feed its
  `subflow-input` nodes their `defaultValue` (already the fallback) so the graph
  runs standalone for authoring.

---

## 6. Reuse / instancing (defect #7)

- Surface subflows in the **node palette / explorer** under a "Subflows" section
  (they already have `category:'subflows'`, `icon`, per `flows.ts:109-110`).
  Dropping one creates a `subflow` instance node with a **fresh instance id** and
  `data.subflowId` pointing at the definition.
- Multiple drops = multiple independent instances (independent state via §3.1).
- **Snippet/preview synergy:** reuse the Stream 3 `flowToPreview()` to show a
  thumbnail of each subflow in the palette and on the collapsed instance node.

---

## 7. Recursion & edge cases

- **Recursion guard:** `MAX_DEPTH` (e.g. 16) + a `visitedPath` set of
  `subflowId`s in `expandGraph`; a self/cyclic reference emits an error node
  (surfaced on the instance) instead of stack-overflowing.
- **Missing definition:** expander emits a visible error node + sets the
  instance's `lastError` (Stream 4 per-node error badge shows it).
- **Empty subflow:** expands to nothing; instance outputs are `undefined`
  (graceful).
- **Boundary dedup bug (existing):** `createSubflowFromSelection` dedupes input
  ports by `target:targetHandle` (`flows.ts:760-763`), collapsing two external
  sources into one and dropping a connection — fix to keep distinct ports.
- **Type inference:** infer boundary port types from the connected edges instead
  of hardcoding `'any'` (`flows.ts:764,788`).

---

## 8. Data model changes

- `FlowState` keeps `subflowInputs`/`subflowOutputs` (`flows.ts:18-23`); add
  `portsRevision: number`.
- Instance node `data`: `{ nodeType:'subflow', subflowId, instanceId }` (+ future
  `paramOverrides` for checklist #2).
- Delete: `subflowContexts`, `getSubflowContext`, `gcSubflowState`,
  `clearAllSubflowContexts`, the `_executeNode`/`_getSubflow` control channel, and
  the synchronous topo-sort in `executors/subflow.ts` (replaced by `expandGraph`).
- Back-compat: existing saved flows containing `subflow` instance nodes (from the
  current create path) load fine — they already carry `subflowId`; on load,
  recompute `_dynamic*` ports and assign an `instanceId` if absent.

---

## 9. Phasing

1. **Expander core** — `expandGraph` + instance-qualified ids + boundary rewrite;
   `subflow-input`/`output` become pass-through. Golden tests: single subflow
   executes; two instances have isolated state; async node inside works; animated
   node advances. (Engine-only; no UI yet.)
2. **Instance node + dynamic typed ports** — real definition, `_dynamic*` from the
   referenced flow; BaseNode renders typed handles; type-checked boundary edges.
3. **Navigation** — breadcrumb + editStack + enter/exit.
4. **Reuse** — palette section + multi-instance drop + preview thumbnails.
5. **Recursion guard + edge-case fixes** (boundary dedup, type inference, error
   surfacing).
6. **P3** — custom parameters on the instance; per-subgraph presets.

Each phase keeps `typecheck`/`lint`/`test:unit` green. Phase 1 is the unlock and
the riskiest; land it behind golden tests before any UI work.

---

## 10. Test plan (none of this exists today)

- **Execution:** single subflow produces correct output; nested (2–3 deep);
  N instances of one subflow with a stateful internal node (oscillator) prove
  **independent phase**; async (HTTP/AI) internal node resolves; animated internal
  node advances with `deltaTime`.
- **Lifecycle:** delete an instance → all `${instanceId}/*` state Maps empty
  (reuses the Stream 1 leak test harness); stop() disposes all.
- **Ports:** add/rename/remove a `subflow-input` → all instances' ports update;
  edges to removed ports pruned with a surfaced warning.
- **Guards:** self-referential subflow → error node, no overflow; missing
  definition → error node.
- **Back-compat:** a saved flow with an old-style instance loads + runs.
