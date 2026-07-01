# Declarative `ui` schema + one `NodeView` interpreter — design proposal (2026-07-01)

Phase 3, bullet 2. **Design-first: no code lands until this is approved.** Grounds and *updates*
`EXTENSIBILITY_ARCHITECTURE_2026-06-28.md` §9 against what Phase-3 bullet 1 already shipped, then scopes
a staged, test-driven build. Honesty note up front: §9's "~29 bespoke SFCs become ~10-line JSON" is
**optimistic** — only a subset of node UIs are pure widget-wiring; the rest legitimately keep the code
escape hatch (that's the §0.5 #1 mandate, not a failure).

## 1. What bullet 1 already did (so bullet 2 is smaller than §9 assumed)

§9 was written when there were *two divergent control switches* and *two visibility mechanisms*. Those
are gone:
- **One control renderer** already exists: `components/controls/ControlRenderer.vue` renders the 6
  primitive widgets (slider/toggle/select/number/text/color) with `context: 'canvas' | 'panel'`, and the
  `number` `:min/:max` bug §9 called out is already fixed there.
- **One visibility evaluator** already exists: `evaluateWhen(when, values)` in `composables/
  useControlHelpers.ts`, honored by BaseNode, PropertiesPanel, and ProtocolFormFields via the canonical
  `when: Record<key, value | { in: [...] }>` on `ControlDefinition`.

So `NodeView` is **not** a from-scratch switch replacement. It is a **row/layout interpreter** that sits
on top: it evaluates the existing `when`, delegates primitive widgets to the existing `<ControlRenderer>`,
dispatches *rich* widgets through a closed registry, and reads runtime values for readouts. That
materially de-risks the build.

## 2. Current state (grounded)

- **28 bespoke node SFCs** in `registry/components.ts`, keyed by `nodeType`, resolved via
  `resolveVueFlowType` (`stores/flows.ts:13`) into the Vue Flow node `type`. They **do not wrap BaseNode**
  — each owns its whole shell (header, Handles/ports, body, some with resize). They read `props.data` and
  write `flowsStore.updateNodeData(id, …)`.
- **8 reusable widgets** (`components/controls/`), three binding classes:
  | Class | Widgets | Contract |
  |---|---|---|
  | **Simple 2-way** | RotaryKnob (`number`), AssetPickerControl (`string\|null`), + the 6 primitives | `:model-value` + `@update:model-value` (one control id) |
  | **Aggregate** | EQEditor (`{bands:[{freq,gain,q}×3]}`), EnvelopeEditor (`{a,d,s,r}`), WaveformEditor (`{samples[]}`) | one structured value ↔ **many flat** `node.data` fields (e.g. EQ = `freq1..q3`) |
  | **Event / dual-state** | PianoKeyboard (`@note-on/@note-off` → writes gate/note/velocity), GamepadDisplay (`displayState` + `interactiveState`) | not a single 2-way bind |
- **Validator** `services/customNodes/validator.ts` — strict allowlist; controls limited to 7 types
  (`VALID_CONTROL_TYPES`); unknown fields stripped; `trust` stripped (origin-assigned). No `ui`/`component`.
- **Runtime values** for readouts: `runtimeStore.getNodeMetrics(id).outputValues` (populated by
  `ExecutionEngine.updateNodeMetrics`). **Textures** live separately in `ExecutionEngine.getAllNodeOutputs()`
  (`nodeOutputs`), not in metrics — relevant to `image`/scope widgets.
- Confirmed absent: `NodeView`, `UISchema`, `validateUISchema`, and any `ui`/`component` field on
  `NodeDefinition`.

## 3. The `ui` schema

```ts
interface UISchema { rows: UIRow[]; surfaces?: Surface[] }        // default surfaces: both
type Surface = 'node' | 'panel'
interface UIRow { label?: string; when?: WhenSchema; widgets: UIWidget[] }
interface UIWidget {
  type: WidgetType                       // CLOSED enum — never a component path or code
  bind: string                           // a control id (2-way) or output-port id (readout)
  source?: 'control' | 'output'          // default 'control'
  label?: string
  when?: WhenSchema                       // same evaluator as everything else
  props?: Record<string, string | number | boolean | Array<string | number>>  // whitelisted per type; no fns/objects
}
```

Added to `NodeDefinition` (and the co-located `defineNode`):
```ts
ui?: UISchema            // declarative custom UI (preferred)
component?: Component     // bespoke SFC escape hatch (formalizes today's components.ts entry)
```

## 4. `when` operator extension (reconcile with §9)

Current `WhenCondition = unknown | { in: unknown[] }`. §9 wants `eq/ne/gt/lt/in`. Extend
**backward-compatibly** — a bare value stays equality; operator objects add the rest:
```ts
type WhenCondition =
  | unknown                                            // bare value → strict equality (unchanged)
  | { in: unknown[] }                                  // membership (unchanged)
  | { ne: unknown } | { gt: number } | { lt: number } // new operators
```
`evaluateWhen` gains three branches. All existing `when`/legacy usages are unaffected (they use bare
values or `{in}`). Existing evaluator + wiring tests stay green; new operator cases get their own tests.

## 5. Closed widget registry

A private `Record<WidgetType, WidgetEntry>` inside the interpreter — **never** author-supplied:

| `type` | Renders | Binding |
|---|---|---|
| `slider` `number` `toggle` `select` `text` `color` | **delegates to `<ControlRenderer>`** (reuse, incl. the min/max fix + contexts) | simple 2-way |
| `knob` | RotaryKnob | simple 2-way |
| `asset` | AssetPickerControl | simple 2-way |
| `connection` | ConnectionSelect | simple 2-way |
| `readout` | text/number formatter | `source:'output'`, read-only |
| `xy` | XYPad *(new small widget; archived one exists)* | 2 fields (x,y) — first *aggregate* |
| `eq` `env` `wave` | EQEditor / EnvelopeEditor / WaveformEditor | **aggregate** (see §6) |
| `piano` `gamepad` | PianoKeyboard / GamepadDisplay | **event/dual-state** (see §6) |
| `curve` `gradient` `image` `button` | new/none yet | deferred |

## 6. The binding model — the crux (and where honesty matters)

Three tiers, delivered in order of increasing difficulty:

- **Tier A — simple 2-way & readout.** `bind` = one control id (or output id for `readout`). NodeView reads
  the control value, renders the widget, writes back via the host's update path. Covers all primitives +
  knob + asset + connection + readout. **This is increment 1.**
- **Tier B — aggregate.** A widget whose one structured value maps to *many* flat `node.data` fields (EQ,
  envelope, wave). The value↔fields adapter is **widget-specific code that lives in the closed registry**
  (trusted, not author-supplied). Two sub-options, to decide:
  - **B1 (no data migration):** registry adapter maps `EQData ↔ {freq1..q3}` (mirrors today's computed
    getter/setter). Keeps every node's saved data schema — zero `.latch` migration. Adapter spec is
    per-widget code.
  - **B2 (structured control):** introduce an `object`/`json` control type; the node stores one `eq` field;
    the executor reads the structured field. Cleaner schema but needs a per-node **data migration** (§10 of
    EXTENSIBILITY) and executor edits. Higher blast radius.
  - **Recommendation: B1** — behavior-preserving, no migration, matches the repo's byte-faithful discipline.
- **Tier C — event/imperative (piano, gamepad, emulator screen, mediapipe video, function code editor).**
  These aren't widget-wiring; they capture input / render live surfaces. They **stay `component?`** — this is
  the escape hatch working as designed, not a gap.

**Honest scope of what becomes declarative:** of the 28 bespoke SFCs, roughly **~10–14** are pure
widget-wiring and can become `ui` JSON (knob, xy-pad, textbox, the debug readouts monitor/graph/oscilloscope/
equalizer, main-output, parametric-eq, envelope-visual, wavetable via Tier B). The **mediapipe ×7, emulator,
function, keyboard, gamepad-visual, synth, step-sequencer, dispatch** keep `component?`. We should state this
number in the docs rather than repeat §9's "~29 → JSON".

## 7. `NodeView` interpreter + the fallback

`components/controls/NodeView.vue`, props `{ nodeId, definition, values, surface }`:
- Filters `rows`/`widgets` by `surface` and `evaluateWhen(when, values)`.
- For each widget, looks up the closed registry entry and renders it; primitives route through
  `<ControlRenderer :context="surface === 'node' ? 'canvas' : 'panel'">` (reusing everything from bullet 1);
  `readout` reads `runtimeStore` metrics (textures via `getAllNodeOutputs`).
- Emits `update(controlId, value)` (or the aggregate adapter's fan-out) so the host keeps its own write +
  undo path (BaseNode → `flowsStore.updateNodeData`; PropertiesPanel → recorded `updateNodeData`).

**Resolution + fallback (opt-in per node, zero disruption):**
```
node has component?  → render that SFC (escape hatch)         [today's 28, unchanged]
else node has ui?    → render <NodeView>                       [migrated nodes]
else                 → BaseNode auto-layout (current default)  [the other ~180 nodes, untouched]
```
`resolveVueFlowType` keeps working; `component?` on the definition simply *formalizes* the `components.ts`
entry (which can be generated from `component?` to keep one source of truth).

## 8. The declarative↔code boundary (§0.5 #1 — make it visible up front)

Document, next to the `ui?`/`component?` fields, **when to reach for code**:
> Use `ui` when your node is *wiring built-in widgets to controls/outputs*. Reach for `component?` when the
> node **captures raw input** (keyboard/MIDI/gamepad), **renders a live surface** (video, canvas, code
> editor, emulator), needs **bespoke geometry/resize**, or a widget that isn't in the closed registry. There
> is no partial-declarative cliff: a node is one or the other, chosen once, both first-class.

## 9. `validateUISchema` (custom-node safety)

Extend `services/customNodes/validator.ts`: for a custom node's `ui`, assert `widget.type` ∈ the closed
enum; `bind` resolves to a **declared** control (or output) id; `props` keys whitelisted **per widget type**
with primitive/string-array values only (reject functions/objects); `when` is a valid `WhenSchema`. Custom
nodes may use **Tier-A widgets only** (no aggregate adapters, no `component?`) — so **no code ever crosses
the boundary**, closing path-D without reopening the code-node sandbox concern. Built-in nodes may use all
tiers because their `ui` is trusted (`core`).

## 10. Staged, test-driven build (each increment green + snapshot-parity gated)

1. **Schema + operators + validator types.** Add `UISchema`/`UIWidget`, `ui?`/`component?` to
   `NodeDefinition`; extend `WhenCondition` + `evaluateWhen` (ne/gt/lt) with unit tests + mutation-verify.
   No renderer yet. *(Independently green; nothing consumes `ui`.)*
2. **`NodeView` — Tier A only.** Interpreter + closed registry for primitives (via ControlRenderer) + knob +
   asset + connection + readout. BaseNode/PropertiesPanel render `<NodeView>` **iff** `definition.ui` present,
   else unchanged. **Gate:** migrate ONE simple node (e.g. `knob`) to `ui`; a snapshot/behavior test asserts
   node+panel parity vs its bespoke SFC; mutation-verify a widget/bind break reds it.
3. **`validateUISchema`** + enable custom-node `ui` (Tier A). Validator tests (reject bad type/bind/props).
4. **Tier B (aggregate, option B1).** Registry adapters for eq/env/wave; migrate parametric-eq etc.;
   parity-gated. Add `xy`.
5. **`component?` formalization.** Make `components.ts` derive from `component?` (single source); the 14
   escape-hatch nodes declare it. No behavior change (guard test: registry set unchanged).
6. **New control types** (`curve`/`gradient`) as they gain a real consumer — *bullet 3 territory*, deferred.

Each step follows the repo discipline: TDD, mutation-verify, typecheck + lint + `test:unit` + build + smoke,
individually revertible, no AI attribution.

## 11. Risks / open questions (need a decision before increment 2)

- **Q1 — aggregate binding B1 vs B2?** Recommendation **B1** (no migration). Confirm.
- **Q2 — `component?` = actual `Component` import on the definition, or a string key resolved via a registry?**
  A real import co-locates best but pulls SFCs into the definition module graph. Recommendation: real
  `component?` on `defineNode`, `components.ts` becomes a generated index.
- **Q3 — snapshot-parity harness:** DOM snapshot of a migrated node vs its old SFC is brittle (canvas
  widgets). Propose behavioral parity (bind reads/writes the right `node.data` keys; `when` toggles) instead
  of pixel snapshots — consistent with how bullet 1 was verified.
- **Q4 — scope of first migration:** just `knob` for increment 2, or a small set (knob, textbox, a readout)?
  Recommendation: `knob` alone to prove the interpreter, then a batch.
- **Non-goal:** this proposal does **not** cover bullet 3 (new control types, drag-to-scrub, control ARIA)
  beyond leaving registry slots; that's a separate track.

## 12. Recommendation

Approve increments **1–3** (schema + Tier-A interpreter + custom-node validation) as the first buildable
slice — it delivers the declarative path for the simple-widget majority-of-effort nodes, reuses all of
bullet 1, changes zero existing node behavior (opt-in), and is fully test-gated. Tiers B/C and the
`component?` formalization follow once Q1–Q4 are settled.
