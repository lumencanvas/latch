# LATCH File Format Spec — `.latch` v2 (2026-06-28)

The durable, diff-friendly, documented save format. Called the "strategic
centerpiece" by `../strategy/05`/`06` and the gate for git-diffing, refactor-safety,
and multiplayer — and previously unspecified. **Phase 0 deliverable** (`ROADMAP`).

## Why this exists (the pains it kills)

Every competitor's format is a binary/opaque blob (`.toe`/`.maxpat`/`.vl`/`.hip`/
`.dfx`) that can't be git-diffed or merged (`strategy/01` §F#1 — the most universal
cross-tool pain). LATCH is already JSON, but **a JSON blob that reorders keys,
embeds editor positions inline, and carries no version migrates as badly as binary.**
This spec makes the format: (1) **diff-friendly** (stable IDs, deterministic
ordering, layout separated from logic), (2) **survivable** (documented, versioned,
exportable, self-hostable — the durability promise), (3) **multiplayer-ready**
(stable IDs are the precondition).

## Current format (v1.0 — verified, to migrate FROM)

`stores/flows.ts` `exportFlow` emits `{ version: '1.0', ...flow }`; nodes are Vue
Flow nodes where **logic, layout, and (sometimes) the full node `definition` are all
mixed into `node.data`** (`data.nodeType` + control values + label + possibly an
embedded `definition`), and the Vue Flow `type` is `'custom'` or a component id
(`resolveVueFlowType`). Edges: `{id, source, sourceHandle, target, targetHandle}`.
Import validation is shallow (only checks `flows` is an array — AUDIT §G). Problems:
positions live next to logic (diff churn on every drag); the embedded `definition`
bloats files and goes stale; no per-node version; IDs not guaranteed stable/portable.

## v2 schema (target)

A document is split into three sections so **logic diffs are isolated from layout
diffs**:

```jsonc
{
  "format": "latch-flow",
  "formatVersion": 2,
  "app": { "createdWith": "1.3.0", "savedWith": "1.3.0" },   // informational
  "flow": {
    "id": "flow_<stable>",
    "name": "My Flow",
    "kind": "main" | "subflow",
    // LOGIC — the only part that affects execution; diff-reviewed in PRs
    "nodes": [
      {
        "id": "n_<stable>",        // stable, opaque, never reused, never split on
        "type": "add",             // = nodeType (the registry id; NOT the Vue Flow type)
        "version": 1,              // the node's defineNode.version when saved
        "controls": { "a": 1, "b": 2 }   // ONLY control values; deterministic key order
      }
    ],
    "edges": [
      { "id": "e_<stable>", "from": "n_a:result", "to": "n_b:input" }  // "node:port"
    ],
    // For subflows only:
    "ports": { "inputs": [...], "outputs": [...] }
  },
  // LAYOUT — editor-only; never affects execution; can live in a sidecar
  "layout": {
    "nodes": { "n_<id>": { "x": 120, "y": 40, "w": 160, "h": 96, "color": null } },
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  }
}
```

A multi-flow export wraps these: `{ format, formatVersion, exportedFlows: [<doc>...] }`
(replaces the current `exportFlows` `version:'1.0.0'` envelope).

### Rules (what makes it diff-friendly)
1. **No embedded `definition`** — resolve from the registry by `type` at load. (Strip
   on save; this alone shrinks files and removes the staleness class.)
2. **Stable opaque IDs** — generated once, never reused after delete, **never split on
   any delimiter** (subflow runtime uses `instanceId/internalId`, so `/` must stay
   meaningful — see SUBFLOW spec invariant; IDs themselves contain no `/`).
3. **Deterministic serialization** — keys sorted (a canonical key order: `id, type,
   version, controls`; control keys sorted); arrays ordered by id. Two saves of an
   unchanged flow are **byte-identical** (kills positional/ordering diff churn).
4. **Layout separated from logic** — moving/recoloring a node touches only `layout`,
   never `flow.nodes`. A logic PR diff shows real changes only. (`layout` may be a
   separate file `*.layout.json` for teams who want logic-only review.)
5. **Edges as `"node:port"` strings** — compact, readable, stable; replaces the
   four-field `{source,sourceHandle,target,targetHandle}`.
6. **Per-node + per-document `version`** — drives migration (below).

## Migration (v1.0 → v2, and forward)

- On load, detect `formatVersion` (absent ⇒ legacy v1.0). A `migrateDocument(doc,
  from)` converts v1.0 → v2: split `node.data` into `controls` (drop `label`/
  `definition`/`nodeType` → `type`), move `position` → `layout`, convert edges to
  `node:port`, stamp `formatVersion:2` + per-node `version` (default 1).
- Per-node migration uses each node's `defineNode.migrate(data, fromVersion)` when its
  saved `version` < current (EXTENSIBILITY §10).
- **Graceful missing-node placeholder:** a `type` not in the registry loads as a
  placeholder node that **preserves `controls` + edges** and renders a clear
  "unknown node: X" state — the graph degrades, never shatters (the ComfyUI lesson).
- **Forward compatibility:** unknown future top-level keys are preserved on
  round-trip (don't drop what you don't understand); a higher `formatVersion` than the
  app supports loads read-only with a warning.

## Import validation (replaces the shallow check)

`validateDocument(doc)`: assert `format === "latch-flow"`; `formatVersion` ≤ supported;
each node has `{id, type}` with unique ids; each edge endpoint resolves to a real
node:port (drop danglers with a surfaced warning, don't fail the whole import);
`controls` is a plain object of primitives/arrays (no functions); deep-clone on
import (no shared references). Surface a structured report (imported / migrated /
dropped / unknown-node counts), not a silent best-effort.

## Round-trip & diff tests (Phase 0 gates)

- **Byte-identical round-trip:** load → save of an unchanged flow produces identical
  bytes (proves determinism).
- **Logic/layout isolation:** moving a node changes only `layout` bytes.
- **Legacy upgrade:** `public/sample-flow.json` (v1.0) + an old-version-node fixture
  load, migrate, and re-save as valid v2.
- **Missing-node:** a flow referencing an unregistered type loads as a placeholder
  with data + wires intact.
- **Visual semantic diff (later, Phase 4+):** a built-in node-aware diff view
  (added/removed/changed nodes & edges) atop the clean serialization.

## Implementation notes

- Verify the exact current shape against `stores/flows.ts` (`exportFlow` line ~503,
  `serializeSelection` ~434, `importFlows` ~1029) before writing the migrator.
- Keep `version: '1.0'` readable indefinitely (legacy path); write only v2.
- The stable-ID scheme + `node:port` edges are the **precondition for multiplayer**
  (Phase 9) — get them right now even though multiplayer ships later.
