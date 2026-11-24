# LATCH — Ultracode Audit Addendum (2026-07-23)

Follow-up to `AUDIT_2026-07-23.md`. After the initial 5-stream audit, an **ultracode** pass ran a
**121-agent, adversarially-verified** sweep: 14 deep finders (per-category node-correctness across all
251 nodes + deep-dives on subflow runtime, security, the 3 GPU renderers, AI lifecycle,
persistence/file-format, and an adversarial re-verification of the first pass's own fixes), each fresh
finding **refuted-or-confirmed by two independent skeptic lenses** (majority rules), plus a completeness
critic. It returned **41 confirmed findings + 1 critic finding** — many NEW, including two storm sites
and one bug in the first pass's *own* new bellows code. **Security came back clean (0 findings).**

Gates after this pass: typecheck **0** · lint **0 err** · `test:unit` **2645 pass** (2634 → 2645) ·
build **0** · browser boot-smoke **0 console errors**.

---

## FIXED THIS PASS (landed, gated green — 21)

### Per-frame "storm" bugs the first sweep missed (event actions firing ~60×/s)
| Fix | File | Gate now |
|-----|------|----------|
| **synth** — held trigger created a new `Tone.Synth` + `triggerAttack` every frame (unbounded voice churn) | `registry/audio/synth/node.ts` | `ctx.trig('trigger')` (matches bellows/poly-voice) |
| **midi-output** — held trigger sent Note On + leaked a Note-Off `setTimeout` every frame | `registry/connectivity/midi-output/node.ts` | `risingEdge` |
| **osc** — sent an OSC packet every frame while a value was present (no trigger port) | `registry/connectivity/osc/node.ts` | send-on-change |
| **legacy ble** — wrote the characteristic + re-ran GATT discovery every frame | `registry/connectivity/ble/node.ts` | send-on-change (payload signature) |
| **serial** — opened a writer + wrote the port every frame | `registry/connectivity/serial/node.ts` | send-on-change |
| **texture-to-data** — held Capture forced a full GPU readback every frame | `registry/visual/shared.ts` | rising-edge (prevTrigger rides the cache entry) |
| **timer** — held `reset` re-zeroed elapsed every frame AND blocked start | `engine/executors/timing.ts` | rising-edge (self-contained `prevReset`) |

### Audio
| Fix | File |
|-----|------|
| **reverb** regenerated its impulse response (OfflineContext render) every frame — `decay`/`preDelay` are setters that call `generate()`. Now change-guarded (~120 IR renders/s → only on change). | `registry/audio/reverb/node.ts` |
| **svf-filter** leaked a stale `prevInput→drive` connection on every input change while drive stayed on (disconnected from the filters, which was a no-op). | `registry/audio/svf-filter/node.ts` |
| **bellows `applyConfig`** (a bug in this session's OWN Part-1 code): manual→preset→manual on the same engine left the preset's param values stuck on the live voice. Now force a full param re-push when leaving preset mode. | `registry/audio/bellows-instrument/bellowsManager.ts` (+ test) |

### Correctness (math / logic / data / string / visual / AI)
| Fix | File |
|-----|------|
| **smoothstep** divide-by-zero when `edge0 === edge1` → NaN. Guarded (hard step). | `registry/math/smoothstep/node.ts` |
| **divide** / **wrap** propagated NaN from a non-finite operand. Finite-guarded. | `registry/math/{divide,wrap}/node.ts` |
| **select** filtered out unconnected slots, collapsing gaps so Index no longer mapped to labeled ports A/B/C/D. Now indexes the fixed 4-slot array. | `registry/logic/select/node.ts` |
| **object-set / setByPath** — `__proto__`/`constructor`/`prototype` path segments corrupted the prototype chain (prototype-pollution). Now rejected. | `registry/data/pathHelpers.ts` |
| **string-match** — capture groups + `fullMatch` were garbage with the `g` flag (String.match drops groups when global). Strip `g` for the single-match extraction. | `registry/string/string-match/node.ts` |
| **image-loader** never reloaded when switching between two assets (guard checked "any asset loaded", not identity). Now identity-gated. | `registry/visual/image-loader/node.ts` |
| **color-correction** Hue was a no-op for integer degrees (shader wants turns 0..1). Now `÷360`. | `registry/visual/color-correction/node.ts` |
| **speech-recognition** wrote to node cache/state after disposal (missing `isNodeDisposed` guard on the async transcribe). | `registry/ai/speech-recognition/node.ts` |

### Timing + persistence
| Fix | File |
|-----|------|
| **metronome** `running` toggle was inert after the first frame (read only at init). Now reconciled every frame with edge memory. | `engine/executors/timing.ts` (+ test) |
| **undo/redo silent data-loss** (critic finding) — `undo()`/`redo()` mutated the graph without marking the flow dirty, so a reverted state was not persisted and was lost on reload. Now set `dirty`. | `composables/useFlowHistory.ts` |

### Tests added (regression pins)
`tests/unit/executors/audit-ultracode-fixes.test.ts` (smoothstep/divide/wrap guards, select mapping,
string-match g-flag, `setByPath` prototype-pollution) · bellows preset→manual restore
(`bellowsManager.test.ts`) · metronome running-toggle (`timing.test.ts`) · euclidean output is now a
mutation-safe copy (hardened from the earlier freeze; finding #41).

---

## INVESTIGATED — NOT A BUG (false positive)

- **code/template `{{key}}` for a disconnected input** (finding #30). The audit claimed it contradicts a
  "documented empty-string behavior", but code/template's info documents no such thing and the existing
  test **explicitly pins passthrough** ("leaves an unknown placeholder untouched (not blank)"). The
  audit conflated it with the separate `string-template` node. Left as-is by design.

---

## DEFERRED — needs live GPU / maintainer decision / hardware

### GPU / renderers (real, but not headless-verifiable — need a live canvas)
- **Shadow-casting light nodes recreate the light + leak its GPU shadow map every frame**
  (`registry/3d/{directional,spot,point,ambient}-light-3d/node.ts`). Cache like the primitives do.
- **Spot Light target controls have no effect** — `light.target` is never added to the scene
  (`services/visual/ThreeRenderer.ts` createSpotLight + `scene-3d`).
- **Camera aspect hardcoded to 1:1** (`defaultSize` 512²), never matches render-3d's width/height →
  non-square output distorts (`ThreeRenderer.ts` getOrCreateCamera/updateCamera).
- **Group 3D disposes the shared material of its source objects** on input change (`group-3d/node.ts`).
- **Render-target leaks on size change** — both `ThreeShaderRenderer.getOrCreateRenderTarget` and
  `ThreeRenderer.getOrCreateRenderTarget` keep a target per (nodeId,size); resizing a node's output
  (width/height sliders, Include-Depth toggle) orphans the old target without disposing. Evict
  other-size targets for the node before creating the new one.
- **Per-frame synchronous `readRenderTargetPixels` + JS row-flip** on the preview/main-output display
  path (`ThreeShaderRenderer.renderToCanvas`, TexturePreview/MainOutputNode). Prefer the TextureBridge
  shared-context sprite path. (Suspected.)

### Architecture / needs maintainer sign-off
- **Subflow is fully broken at runtime — exact root cause found:** the subflow executor's resolver
  hooks (`_getSubflow`/`_executeNode`) are **never injected**, so `subflow.ts` is dead and emits
  `_error` every frame. Fix requires wiring the injection in `ExecutionEngine.executeNode` (when
  `nodeType === 'subflow'`, inject `_getSubflow`, `_subflowInstanceId`, and an `_executeNode` shim that
  runs the inner graph). This is the long-standing "subflows never execute / instance has no ports" bug
  (memory `latch-subflows-broken`) — a substantial, architecture-touching change that needs runtime
  verification and a maintainer's eyes. **Highest-value deferred item.**
- **Per-node data migration is unwired end-to-end** — `flows.ts` resolver hardcodes `{version:1}` and
  drops each node's `migrate()`. Surface the manifest version/migrate through the registry.

### Persistence / lower severity
- **IndexedDB autosave persists the full embedded node `definition` blob** (the file path strips it) —
  storage bloat + staleness (`usePersistence.ts`). Strip non-control keys before persisting.
- **Edges to a removed port of a KNOWN node aren't dropped** (`flows.ts` — `hasPort` checker never
  passed). Suspected; keep placeholder wires intact.

### Nodes — lower severity / design
- **midi-input** channel filter frozen at first-connect (closure captures channel); changing Channel has
  no effect. Fix: read the channel live in the handler.
- **metronome** `beat` fires per sub-beat while `beatNum` advances per beat (subdivision desync) —
  design ambiguity; decide the contract. (Suspected.)
- **array-sort** `auto` mode uses a non-transitive comparator for mixed-type arrays. (Suspected.)
- **blur** `passes` control is defined + documented but never used; **displacement** `rgb` channel option
  silently maps to `rg`; **string-replace** declares `_error` as a public port (convention is
  internal-only). Cosmetic — honor or remove.
