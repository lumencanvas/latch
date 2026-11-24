# Subflow Runtime — Design Note (2026-11-23)

Status: **design only, not implemented.** This note is the precise delta between the
existing rebuild spec (`docs/plans/SUBFLOW_REBUILD_SPEC_2026-06-28.md`, still the
source of truth for the architecture) and the code as it stands today, plus the
invariants that later work (the import trust prompt, `defineNodeState` keying)
added. Read the spec first; this note tells you exactly what to touch.

## 1. Verified current state (working tree, 2026-11-23)

| Defect | Where | Evidence |
|---|---|---|
| Instance never executes | `engine/executors/subflow.ts:139` (`_getSubflow`), `:152` (`_executeNode`) | Both are read from `ctx.controls`. The engine builds the control map only from definition defaults + `node.data` (`ExecutionEngine.ts` ~`:458-480`), so neither is ever present. The executor returns `_error: 'Subflow resolver not available'` every frame; the internal topo sort below it is dead code. |
| Instance has no definition / ports | `stores/flows.ts` `createSubflowFromSelection` (~`:1044`) writes `{ nodeType: 'subflow', subflowId }` with `type: 'custom'` | `registry/subflows/` defines only `subflow-input` / `subflow-output`; `registry/subflows/index.ts` exports `[]`. BaseNode finds no definition and no `_dynamicInputs/_dynamicOutputs`, so the instance renders with **no handles** while the store creates edges to handles that don't exist. |
| Boundary side-channel | `subflow.ts` `subflowContexts` / `getSubflowContext` | `subflow-input` reads `input:<portId>` and `subflow-output` writes `output:<portId>` into a per-instance Map keyed by `_subflowInstanceId`, which is also never injected by the engine. |
| Engine hand-wiring | `ExecutionEngine.ts:15,319,979` | `gcSubflowState` / `clearAllSubflowContexts` are the last hand-wired lifecycle calls. |

Nothing in the store-level graph surgery (create-from-selection, add/remove ports,
unpack, Ctrl+G/E/Shift+G) is broken; it is only the runtime and the instance UI.

## 2. Decision (unchanged from the spec): inline expansion

Do **not** repair the synchronous mini-engine inside `subflowExecutor`. Expand each
instance into its internal nodes in `ExecutionEngine.updateGraph` (graph-change
time, never per frame), with instance-qualified ids `${instanceId}/${internalId}`,
and run the flat graph through the normal async topo loop. That single move gives
async/fire-and-latch nodes, `deltaTime`/`totalTime`, dirty-mode, per-instance state
isolation and GC (qualified ids land in `validNodeIds`).

## 3. Invariants added since the spec (must hold)

1. **State-key separators.** Qualified ids contain `/`. Every `defineNodeState`
   `keyToNodeId` must map a key back to the **full** qualified id:
   - `engine/trigger.ts:35` splits on `::` — safe.
   - `engine/executors/code.ts:33` and `executors/http.ts:20` split on `:` — safe
     (`/` is untouched), but this means **`:` must never be used** as the instance
     separator.
   - Audio/visual GC use suffix-strip / prefix-ownership on `_` (see the nanoid
     underscore fix, 04e2cd0) — safe for `/`, and must not be "simplified" to a split.
   Add a test that runs every collected lifecycle's `gc(validIds)` with a qualified
   id present and asserts its entries survive.
2. **No code may split a node id on `/`.** The only `split('/')` hits today are on
   MQTT topics and CLASP addresses (`mqtt.ts:162-163`, `clasp.ts:855,988`), not ids.
   Pin with a grep-style test.
3. **Import trust prompt covers subflows.** `services/security/flowTrust.ts`
   `summarizeFlowTrust` scans every document in an import (main flows *and*
   `kind: 'subflow'` docs), and `disableCodeNodes` stamps `_codeDisabled` on code
   nodes in every imported flow. Expansion must copy internal `node.data` verbatim
   so `_codeDisabled` reaches the expanded Function/Expression node — never rebuild
   internal data from definition defaults only.
4. **Expanded nodes are not user-visible.** Runtime metrics / `lastError` for
   `I/n` ids must be folded back onto the visible instance through the reverse map
   (spec §3.1 invariant 2); the instance's `_dynamic*` writeback targets the
   unexpanded node.

## 4. Concrete implementation checklist (Phase 1 + 2 of the spec)

1. `engine/expandGraph.ts` (new, pure): `expandGraph(nodes, edges, getFlow, path=[])`
   → `{ nodes, edges, reverse: Map<qualifiedId, instanceId> }`.
   - Recursion guard: `path.includes(subflowId)` or `path.length > 8` → emit the
     instance as an error placeholder (`_error: 'Recursive subflow'`).
   - Boundary rewrite: external edge `src → I:portId` becomes
     `src → I/<port.nodeId>:value`, where `port.nodeId` is the `subflow-input` node
     from `flow.subflowInputs`; internal `I/<outNode>` with port `portId` feeds the
     external edge `I:portId → dst`.
2. `subflow-input` / `subflow-output` executors become pass-through:
   input: `value = ctx.inputs.get('value') ?? ctx.controls.get('defaultValue')`;
   output: forward its `value` input as `value`. Delete `subflowContexts`,
   `getSubflowContext`, `gcSubflowState`, `clearAllSubflowContexts` and the
   `_getSubflow` / `_executeNode` channel, and the two hand-wired engine calls.
3. `ExecutionEngine.updateGraph`: call `expandGraph` before the topo sort, using
   `useFlowsStore().getFlowById` (or the existing flows getter). Idempotent; must
   compose with the golden harness `idPrefix` (`tests/unit/engine/golden/flowHarness.ts`).
4. `registry/subflows/instance/node.ts`: a real `subflow` definition (no static
   ports; its executor is a no-op because expansion replaces it). On create/load,
   write `_dynamicInputs/_dynamicOutputs` from the referenced flow's
   `subflowInputs/subflowOutputs` with their real types.
5. Back-compat: saved instances already carry `subflowId`; recompute `_dynamic*`
   on load; flows referencing a missing subflow load as an error placeholder.

## 5. Tests to write first (golden, engine-level)

- One instance computes `in → add(+1) → out` correctly through real edges.
- Two instances of a subflow containing `smooth` / `lfo` have **independent**
  state (`smoothState` has entries for both `I1/n` and `I2/n`).
- An async (deferred) node inside an instance resolves.
- Deleting an instance → every `defineNodeState` store drops its `I/*` keys;
  `stop()` disposes all.
- Self-referential subflow → error placeholder, no stack overflow.
- An imported file whose subflow contains a Function node, opened with "code
  disabled", runs that node disabled after expansion (`CODE_DISABLED_MESSAGE` on its
  error output).
