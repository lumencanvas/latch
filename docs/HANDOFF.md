# LATCH — Session Handoff Log

Running log of work sessions, newest first. Each entry: what changed, current state,
and what's open. Detailed analysis lives in the dated docs under `docs/` (esp.
`NODE_LIBRARY_REVIEW_2026-06-18.md` and `AUDIT_2026-06-16.md`).

---

## 2026-06-19 — Node-library review + discoverability/UX + first nodes

Branch: `modernization`. All work committed (single-purpose commits, no AI attribution).
Driven by `docs/NODE_LIBRARY_REVIEW_2026-06-18.md` — its implementation-status block tracks
each item; this is the narrative summary.

### Landed
- **Correctness — duplicate node ids fixed.** `counter` (data+code) and `sample-hold`
  (logic+code) collided in the id-keyed registry Map, and the winning *definition* and
  winning *executor* were crossed — leaving both nodes effectively broken. Kept one coherent
  def+executor pair each (`counter`→code, `sample-hold`→logic/utility), deleted the dead
  twins, added a DEV duplicate-id warning in `useNodesStore.register()`, and a
  `registry-integrity` test.
- **Leak — subflow contexts.** `clearAllSubflowContexts()` was called nowhere; added
  `gcSubflowState()` + wired both into `ExecutionEngine` (per-node GC + `stop()`).
- **Discoverability.** Search already matched name+description+tags but most VJ-facing nodes
  had no tags. Added creative-coding vocabulary across the library — tagged-node coverage
  **70 → 148 of 205** (echo/noise/glitch/feedback/tempo/donut/whisper… now resolve; the
  Shader presets are searchable). Added **tag filter-chips** to the Node Explorer and a
  **port-type colour legend**; rendered **per-category icons** (single-source
  `utils/categoryIcons.ts`) in the palette + explorer; hid empty categories; clarified the
  Control Panel empty state.
- **Brand — purple = AI only.** Repointed stray category purples (debug→slate,
  messaging→cyan, subflows→lime) and non-AI accent purples (EQ/parametric-eq→cyan, synth
  section→blue, xy-pad→pink). The `string` *data-type* port colour is intentionally left
  violet (separate colour axis) — open decision if it should change too.
- **New nodes (Tier-A from §2), all stateless + unit-tested:**
  - **Noise** (`math/noise`) — 3D simplex + fBm; value(-1..1)/normalized(0..1); X/Y/Z +
    frequency/octaves/seed.
  - **Color Ramp** (`visual/color-ramp`) — value→colour; 7 colormaps + custom 2-stop;
    `[r,g,b,a]` output matching the Color node.
  - **Euclidean Rhythm** (`timing/euclidean`) — Bjorklund pattern (E(3,8) tresillo,
    E(5,8) cinquillo); stateless, driven by a `step` index; gate/value/pattern outputs.
  - **Easing** (`math/easing`) — shapes a 0–1 value through 20 easing curves (quad/cubic/
    sine/expo/back/elastic/bounce); stateless; composes with any 0–1 signal.
  - **Spring** (`math/spring`) — damped-oscillator physics toward a target (tension/
    friction/mass); value/velocity/atRest. First new *stateful* node this cycle —
    gc/dispose wired into ExecutionEngine + a gc regression test. A pre-flight audit
    confirmed every executor's cleanup is wired into the engine (no leaks).
- **Testing pass.** Added tests for the subflow GC, the `register()` guard, `categoryIcons`
  exhaustiveness, the explorer tag-filter store, Color Ramp preset↔palette sync, plus full
  coverage for Noise / Color Ramp / Euclidean.

### Fixed (per-frame storms, carried from AUDIT_2026-06-16 — priority #2)
- **imageLoader asset-fail storm** (`visual.ts`): a missing assetId re-fired `getAssetUrl`
  every frame because the not-found/catch paths never latched `state.loadedUrl`. Fixed
  (a Trigger still forces a retry).
- **webcam-snapshot `getUserMedia` re-prompt loop** (`visual.ts`): after a denial it
  retried every frame. Added a `failed` latch, cleared when the device/resolution changes.
- **http-request flood** (`http.ts`): a held-true `trigger` fired a fetch every frame
  (level-trigger, in-flight flag never read). Now fires on the rising edge only + gates on
  the in-flight `:loading` flag. **Unit-tested** (existing http suite extended to 20 tests).
- A connectivity audit precisely scoped the remaining async-robustness items (all still
  open, no GPU needed): the **mqtt/ws/http/BLE connect backoff** (no per-attempt throttle —
  ~60 connects/s while failing), **`ConnectionManager.disconnect` error-masking** → wedged
  toggle, the shared-`autoReconnect` **clasp** mutation, and the **`BleAdapter`**
  notification-listener leak. Good next targets.
- A deep audit of the visual/texture subsystem confirmed all executor gc is wired and that
  a **feedback-buffer node is feasible** following the `getOrCreateRenderTarget` pattern,
  but it needs live GPU verification (not unit-testable) and the subsystem still has open
  MED texture-ownership leaks (`createTextureFromWebGL`, `disposeObject` maps,
  `TextureBridge.gc`) — see AUDIT_2026-06-16.

### State
Node count **208** (was 205 pre-dedupe; 203 after the dedupe, +5 for Noise/Color
Ramp/Euclidean/Easing/Spring). Verified green:
`typecheck`, `eslint`, full `test:unit`, and the production `build`. Working tree clean
(only `.DS_Store`). Nothing pushed.

### Open / next
- **Tier-A WebGL nodes** (the signature visual gaps — need render-pipeline integration, not
  drop-in): **feedback buffer** (highest VJ value — trails/echo/zoom), text→texture, discrete
  image-FX, particles.
- **Control Panel allow-list ↔ `exposedControls`** (review Part 4.2): the hardcoded
  `controlNodeTypes`/`monitorNodeTypes` arrays mean custom control nodes never surface.
- **Decision:** recolour the `string` data-type port colour off violet, or keep it.
- **Carried (from `AUDIT_2026-06-16.md`):** the `with(ctx)` non-sandbox + flow-import trust
  prompt + `setWindowOpenHandler` allow-list (security); per-frame storms; lazy executor
  registration; split the `executors/index.ts` + `ai.ts` god-files.
</content>
