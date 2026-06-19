# LATCH — Session Handoff Log

Running log of work sessions, newest first. Each entry: what changed, current state,
and what's open. Detailed analysis lives in the dated docs under `docs/` (esp.
`NODE_LIBRARY_REVIEW_2026-06-18.md` and `AUDIT_2026-06-16.md`).

---

## 2026-06-19 — Audit fixes landed + re-audit (verification pass)

Branch: `modernization`. Committed & pushed (no PR). All green: typecheck clean, eslint clean,
**1420 unit tests pass (11 todo)**, build succeeds.

### Landed this cycle (4 commits)
- Tier 1 security: Electron IPC hardened (`setWindowOpenHandler` + `shell:openExternal` http(s)-only,
  asset/custom-node file handlers `..`-contained), Function/Expression code global-shadowing preamble
  + honest relabel (+ `code.test.ts`).
- Tier 2 robustness: per-frame connect-storm throttle (mqtt/ws/http), `ConnectionManager.disconnect`
  unwedge, `AIInference` worker-crash rejects pending, `deleteFlow` frees undo/redo history (+ tests).
- Deliberately **not** done (would degrade core LAN/arbitrary-connection use): SSRF host-allowlist /
  strict CSP.

### Re-audit (5 parallel passes) — see `AUDIT_2026-06-19.md` "Re-audit / verification pass"
- Verified the 6 fixes: #7/#8/#9 solid. **3 corrections** to "done" claims: `shell:openPath`/
  `showItemInFolder` left unguarded (but unbridged → latent, not live); `customNodes/compiler.ts`
  user-code path has no preamble (undocumented trust asymmetry); `lastConnectAttempt` keys never gc'd.
- **New HIGH:** `exposeControl` never persists to localStorage (`ui.ts:457`); Oscilloscope/Equalizer
  leak their Tone analyser node (only `disconnect`, never `dispose`); BLE legacy node double device-picker.
- **New MED:** `controlPanelLayout` orphaned on node delete; clasp captureStream/`<video>` + sendClient
  double-connect leaks; per-frame `DataTexture` alloc on raw-WebGLTexture→Shader path (#11 priority);
  shadow-map + GLTF-map disposal gaps (shared-texture risk on material maps); RT-pool no eviction.
- **Reassessed:** #14 MediaPipe stream = non-issue (webcam node stops its own stream); #15 STT
  AudioBufferService already torn down via `disconnect()`.
- Fix order for the follow-up pass is documented at the end of `AUDIT_2026-06-19.md`. **No code fixes
  this pass — audit/doc/commit/push only.**

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
- **Node body previews for the 5 new nodes** (`components/preview/{ColorRamp,Easing,
  Euclidean,Noise,Spring}Preview.vue`): a real user picked a palette/curve/rhythm blind —
  these draw a live gradient bar / easing curve / rhythm dots / noise wave / spring response
  in the node body, reusing the *exact* executor logic (PALETTES/EASINGS/bjorklund/fbmNoise)
  so the preview always matches output. Wired via a `NODE_PREVIEWS` map in BaseNode that
  forces the node non-compact (like `hasTextureOutput`) — **no `components.ts` custom-node
  entry needed** (these stay plain BaseNode nodes), which sidesteps the easy-to-miss
  registration step. NB for future rich-UI nodes: a dedicated custom component DOES require
  adding it to `registry/components.ts` `nodeTypes` (the single source `CUSTOM_NODE_TYPE_IDS`
  the flows store reads) or it silently falls back to BaseNode.
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
- **`BleAdapter` notification-listener leak** (HIGH): the handler added as
  `characteristicvaluechanged` differed from the closure stored in `notificationHandlers`,
  so it could never be removed and stacked (retaining `this`) on every reconnect. Now stores
  and removes the same handler (via a `detachNotificationListeners` helper used by
  unsubscribe/doDisconnect/dispose) and drops the prior listener on re-subscribe.
  **Unit-tested** (`BleAdapter.test.ts`, 5 cases).
- A connectivity audit precisely scoped the remaining async-robustness items (all still
  open, no GPU needed): the **mqtt/ws/http/BLE connect backoff** (no per-attempt throttle —
  ~60 connects/s while failing), **`ConnectionManager.disconnect` error-masking** → wedged
  toggle, and the shared-`autoReconnect` **clasp** mutation. Good next targets.
- A deep audit of the visual/texture subsystem confirmed all executor gc is wired and that
  a **feedback-buffer node is feasible** following the `getOrCreateRenderTarget` pattern,
  but it needs live GPU verification (not unit-testable) and the subsystem still has open
  MED texture-ownership leaks (`createTextureFromWebGL`, `disposeObject` maps,
  `TextureBridge.gc`) — see AUDIT_2026-06-16.
- **Emulator unusable after flow stop** (`engine/executors/emulation.ts`): the node
  component registers once on mount (kept alive across views), but `disposeAllEmulationNodes()`
  did `emulators.clear()` on every flow-stop — orphaning the registration so the node was dead
  with no re-registration path. Fixed: tear down the running emulator + free its texture/audio
  on stop, but **keep the registrations** (cleaned per-node by unmount/gc instead).

### Open — emulator (needs live debugging; not statically resolvable / not headless-testable)
- **Emulator → Main Output only updates one frame (on view switch); editor preview frozen at
  first frame.** Traced the whole path — it looks correct: the executor runs every frame (not
  in `PURE_NODE_TYPES`), calls `updateTexture` (sets `needsUpdate`, `texture.image` = the live
  EmulatorJS canvas), and both Main Output surfaces (editor `MainOutputNode` `drawImage`; the
  Control-tab widget `renderToCanvas`) run their own rAF loops. So the freeze is a runtime/
  WebGL behavior, not the plumbing. Prime suspects to check live: (a) the EmulatorJS canvas not
  compositing/advancing while the editor is `display:none` on the Control tab (WebGL-hidden
  throttle); (b) whether the emulator's OWN node canvas in the editor is visibly live while
  Play is running — if yes, the issue is texture capture timing; if no, EmulatorJS is paused.
  `patchForCapture` already forces `preserveDrawingBuffer:true`.

### State
Node count **208** (was 205 pre-dedupe; 203 after the dedupe, +5 for Noise/Color
Ramp/Euclidean/Easing/Spring). Verified green:
`typecheck`, `eslint`, full `test:unit`, and the production `build`. Working tree clean
(only `.DS_Store`). Nothing pushed.

### Open / next
- **`docs/AUDIT_2026-06-19.md`** — fresh whole-codebase audit (6 parallel passes). Headline:
  the Tier-1 **security** cluster (user-code "sandbox" isn't one; flow-import → one-click RCE
  on Play; `setWindowOpenHandler`/IPC path-traversal; no CSP/SSRF guard) — all carried/open.
  Then the **per-frame connect storm** (mqtt/ws/http/BLE), `ConnectionManager.disconnect`
  masking, `AIInference` worker `onerror` not rejecting pending, history/asset memory leaks,
  and the GPU texture-ownership leaks. See that doc for the prioritized fix order.
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
