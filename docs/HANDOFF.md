# LATCH — Session Handoff Log

Running log of work sessions, newest first. Each entry: what changed, current state,
and what's open. Detailed analysis lives in the dated docs under `docs/` (esp.
`NODE_LIBRARY_REVIEW_2026-06-18.md` and `AUDIT_2026-06-16.md`).

---

## 2026-06-30 (later 15) — Phase 2 committed + step A (auto AI loading/error outputs) A1+A2-core

**Committed the whole Phase-2 changeset** (was dirty across sessions 10–14) as a dependency-ordered
5-commit split on `phase0-file-format`, then built the first two slices of step A. All commits authored
Moheeb Zara, no AI attribution.

**Phase-2 commits (5):** `c03a850` protocol+ConnectionHandle scaffold (defineProtocol/protocolRegistry +
no-secret handle + `ctx.connection()`) · `be45ad5` co-locate built-ins into the glob registry (index.ts →
`colocatedProtocolTypes`, set-equality gate) · `c518efc` mqtt on handle · `fd7c945` ws+http on handle
(shared throttle now in `engine/connection.ts`; http keeps its no-connection fetch fallback) · `3dbd413`
inert `defineModel` scaffold + the two decision memos + this handoff.

**Step A — design pass first** (multi-agent workflow mapped 4 surfaces). Load-bearing finding: `defineNode`
was identity and **no AI node flows through it** (all are plain `NodeDefinition` in `allNodes`), and `_error`
is set in ~25 ai.ts sites but read nowhere — the badge only reflected *thrown* errors. So A splits into a
runtime latch (A1) + declarative derivation (A2). Maintainer chose **A1 first, public wireable `error` port**.

- **A1 `5ea7fe6` — soft-error badge latch.** `ExecutionEngine.executeNode` now latches
  `outputs.get('error') ?? outputs.get('_error')` into `lastError` via `updateNodeMetrics({softError})`
  (runtime.ts). Public `error` wins over legacy `_error`; does NOT push to `errors[]` or inflate
  `errorCount` (steady-state status, not a crash); clears on the next clean frame. Lights up every existing
  `_error` writer across **all** executor families with zero per-executor change. +5 tests
  (`ExecutionEngine.test.ts`), mutation-verified (hand-edit, not checkout), browser smoke boot→Play→Stop 0
  errors.
- **A2-core `8df2900` — `defineNode` model derivation.** A spec declaring `models` gets the canonical
  `loading`/`progress`/`done`/`error` outputs + a `model` select appended (dedup by id, idempotent,
  order-stable). Strict no-op without `models` → non-AI library byte-identical; **inert** (no node sets
  `models` yet). +5 tests, mutation-verified, build ok. Select options populate from the model registry later.

**Verification.** typecheck clean · lint 0 err · `test:unit` **1698 → 1708** (+10) · build ok · A1 smoked.

**▶ NEXT — step A continuation (A2 migrations), maintainer-gated.** Build `runModelInference()` (the shared
inference preamble: model resolution + loading/progress/done/error latching, per
`MODEL_REGISTRY_IMPL` design §3) then migrate the ~12 ai.ts executors one green, smoked commit at a time.
**Open design fork (Q3):** transient states ("Connecting to audio source…", ai.ts:880,2317) → route to
`loading`+status, NOT `error` (recommended). Each migration also surfaces the currently-swallowed inference
`catch` blocks as real `error`. The model-derive (MODEL_REGISTRY 5 decisions) and connection-security 2–6
remain separately sign-off-gated.

---

## 2026-06-30 (later 14) — Phase 2: `defineModel` + `modelRegistry` scaffold (step 7 foundation)

Pivoted to step 7 (Phase C, parallel to step 6 which is at a natural stopping point — its leftovers are
maintainer-sensitive/hardware-bound/Phase-E). Built the **additive, inert** model-registry scaffold,
mirroring the 6a protocol scaffold exactly. **NOT committed.**

**What landed:**
- **`services/ai/defineModel.ts`** — `ModelSpec` (`id`/`name`/`family:'transformers'|'webllm'|'mediapipe'`/
  `task`/`size`/`license?`/`supportsWebGPU?`/`load?.promptFormat?`) + `defineModel` identity fn. Frozen
  public contract; metadata-only (never imports the heavy runtime).
- **`services/ai/modelRegistry.ts`** — globs `models/**/*.model.ts` (eager, default-export, dup-id +
  missing-default + structural throws). Files are free-slug-named (model ids contain `/`); keyed by
  `spec.id`. Exports `modelSpecs`/`colocatedModelIds`/`colocatedModelSpecs`. **Inert** (zero files) — the
  three catalogs stay authoritative.
- **`tests/unit/services/ai/modelRegistry.test.ts`** (5) — count guard + no-orphans vs the live catalogs
  union (`AI_MODELS` defaults+alternates ∪ `WEBLLM_MODELS`), valid-family/task structural check, and the
  **prompt-format contract** (every co-located `text-generation` spec declares `load.promptFormat`).
  Mutation-verified (4 cases via a temp `models/` dir, removed with `rm` — not `git checkout`): orphan id →
  count/orphan red; text-gen missing `promptFormat` → contract red; duplicate id → dup throw; valid → green.
- **`defineModel.ts` + `defineNode.ts`** — added `ModelRequirement` (`{task, selectable?}`) and the
  `NodeSpec.models?: ModelRequirement[]` field (the §3 declarative-capability surface a node uses to declare
  a model need — the analogue of `connections?`). Additive/inert (the auto `model` select + load/error
  outputs derive from it later); `defineNode.test.ts` +1 (preserves connections + models). Type-only import,
  no cycle (`defineModel.ts` imports nothing).

**Verification.** typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit` **1692 → 1698** (+6,
+1 file) · build ok. Additive/inert → no runtime path touched, no smoke needed (as with 6a).

**▶ NEXT (sign-off-gated derive — `docs/plans/MODEL_REGISTRY_IMPL_2026-06-30.md`).** The per-model→per-task
rollup has real forks (task-wrapper metadata location, default/order reproduction for the deep-equal gate,
MediaPipe's weak fit, whether the auto loading/error-output `defineNode` work lands here or separately,
first-PR scope). Surfaced for maintainer decision before deriving `AI_MODELS`/`WEBLLM_MODELS`. The
higher-value half — auto `loading/progress/done/error` outputs + `runModelInference` latching the real error
(fixing the dead-`_error` for every AI node) — is independent of the catalog derive.

---

## 2026-06-30 (later 13) — Phase 2: ws + http migrated to `ctx.connection()` (6b complete for the three protocols)

Applied the proven mqtt pattern to WebSocket + HTTP (the approved typed-handle design; no new sign-off
needed). **NOT committed.**

**What landed:**
- **`ConnectionHandle.ts`** — added `createWebSocketHandle` (forwards `send`/`onMessage`) and
  `createHttpHandle` (forwards `request`/`executeTemplate`, signatures matched to `HttpAdapterImpl`); wired
  both into `createConnectionHandle`'s switch. This closes the latent footgun where ws/http fell through to
  the capability-less base handle. `baseUrl`/auth-headers/url/token never reachable.
- **`executors/websocket.ts`** — migrated to `ctx.connection<WebSocketHandle>({ protocol:'websocket' })`;
  deleted `getWebSocketAdapter`/`ensureConnected`/local throttle/`useConnectionsStore`+adapter imports. The
  `nodeListeners` store (dispose = unsubscribe) is unchanged — ws has no topic-level sub, so no `releaseTopic`.
- **`executors/http.ts`** — connection path migrated to `ctx.connection<HttpHandle>({ protocol:'http' })`;
  deleted the same helper block. **The no-connection direct-`fetch` fallback (`executeDirectRequest`) + the
  rising-edge/in-flight gating + `httpCache` are untouched.**
- The auto-connect throttle now lives once in `engine/connection.ts`, shared across mqtt/ws/http.

**Tests.** `ConnectionHandle.test.ts` +2 (ws: send/onMessage forward, config/token hidden; http:
request/executeTemplate forward, auth headers hidden). `websocket-throttle.test.ts` rebuilt to route through
`createExecutionContext` so it validates the *relocated* shared throttle via the real `ctx.connection` (3
cases: ≤once/2s while down, stops when connected, rewire releases old listener once — all preserved).
`http.test.ts` unchanged behavior (its cases only hit the direct-fetch/no-connection paths, so
`ctx.connection` is never reached; added a `connection: () => null` stub for shape safety).

**Verification.** typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit` **1690 → 1692** (+2) ·
build ok · **smoke** boot→Play→Stop **0 real errors**, 5 protocols register, canvas identical.

**▶ NEXT.** The three persistent/request protocols are now on `ctx.connection()`. Remaining Phase-2
connection work: deferred SECURITY_MODEL steps 2–6 (capability-declaration enforcement, trust-tier tagging
beyond the handle, Community approval + CSP `connect-src`); adapter physical co-location into
`protocols/<name>/`; BLE/Serial/MIDI drift fix (register + add adapters). Or pivot to step 7 (`defineModel`).

---

## 2026-06-30 (later 12) — Phase 2: `ctx.connection()` + no-secret `ConnectionHandle` — mqtt slice (6b)

Maintainer signed off the impl memo (`docs/plans/CONNECTION_HANDLE_IMPL_2026-06-29.md`): **typed
per-protocol handles**, **HTTP gets a handle too**, **mqtt-first**. Built the mqtt slice. **NOT committed.**

**What landed:**
- **`services/connections/ConnectionHandle.ts`** — `ConnectionHandle` base (protocol/status/onStatusChange)
  + `MqttHandle`/`WebSocketHandle`/`HttpHandle` interfaces; `createConnectionHandle(adapter)` returns the
  protocol's no-secret wrapper (mqtt concrete; ws/http fall back to base until their executors migrate). The
  adapter is closed over, never returned; **no `config`/url/token/adapter reachable**.
- **`engine/connection.ts`** — `resolveConnectionHandle(read, opts)`: the one shared connection lookup
  (replaces the ~50-line `getXAdapter`/`ensureConnected` block the three executors each copied). Resolves the
  id from control/input (default `connectionId`), optional protocol assert, **shared auto-connect throttle**
  (2s), WeakMap handle cache. Synchronous + fire-and-forget connect (the old awaited connect could block a
  frame; this no longer does — executors already serve last-value until `status==='connected'`).
- **`ExecutionEngine.ts`** — added `ctx.connection<T>(opts?)` to `ExecutionContext` (+ `'connection'` to the
  `ExecutionContextData` Omit) wired in `createExecutionContext`. The engine already imports Pinia stores, so
  the connection-store dependency is consistent (no purity regression).
- **`executors/mqtt.ts`** — migrated to `ctx.connection<MqttHandle>({ protocol:'mqtt' })`; deleted
  `getMqttAdapter`/`ensureConnected`/the local throttle. Sub entry gains `releaseTopic` (captured
  `handle.unsubscribe(topic)` closure) so teardown needs no live ctx; rewire/clear/gc semantics preserved
  verbatim (`set()` doesn't dispose the overwritten entry — verified in `nodeState.ts`). **CLASP/ws/http
  untouched.**

**Tests.** New `ConnectionHandle.test.ts` (3): no-secret invariant (no config/credentials/adapter reachable,
JSON has no secret), curated-op forwarding, live status getter. `mqtt-teardown.test.ts` rebuilt to route
through `createExecutionContext` (exercises `ctx.connection` end-to-end against the mocked store) + a
`nodeSubscriptions.size===0`-after-gc leak assertion. **Both gates mutation-verified** (leaking `config`
through the handle → no-secret red; dropping `releaseTopic` from dispose → clear/gc teardown red).

> Process note: a `git checkout` during mutation-verify reverted the *tracked* `mqtt.ts` to HEAD (wiped the
> migration) and couldn't touch the *untracked* `ConnectionHandle.ts` (left the mutation in). Both repaired +
> re-verified. Lesson: never `git checkout` files with uncommitted work to undo a mutation — edit it back.

**Verification.** typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit` **1687 → 1690** (+3,
+1 file) · build ok · **smoke** boot→Play→Stop **0 real errors**, 5 protocols register, canvas identical.

**▶ NEXT.** ws + http migrate to `WebSocketHandle`/`HttpHandle` against this proven pattern (http keeps its
no-connection `fetch` fallback). Then the deferred SECURITY_MODEL steps 2–6 (capability enforcement, Community
approval + CSP), adapter physical co-location, BLE/Serial/MIDI drift fix.

---

## 2026-06-29 (later 11) — Phase 2 START: `defineProtocol` scaffold (6a) + glob-authoritative registration (6b registration half)

Branch **`phase0-file-format`** (maintainer chose to continue here, not merge→`main`+rebranch — recorded
for the eventual merge). Began Phase 2 (register-once subsystems) with the **additive, zero-behavior-change**
protocol-registry scaffold (EXTENSIBILITY §7, ROADMAP step 6a), mirroring exactly how Phase 0 added
`defineNode`/`nodeRegistry`. Read the real `ConnectionTypeDefinition` (`types.ts:203-224`) +
`mqttConnectionType` shape (`MqttAdapter.ts:228-379`) + `registerBuiltInTypes()` (`index.ts:79-93`) FIRST so
the type matches. **NOT committed.**

**What landed (3 new files, additive — nothing imports them yet, so production behavior is unchanged):**
- **`services/connections/defineProtocol.ts`** — identity function that brands the existing
  `ConnectionTypeDefinition` as the single authored unit (the `defineNode` analogue for protocols).
  Generic over `TConfig extends BaseConnectionConfig`. Frozen-public-contract doc (POLICIES §2); notes the
  capability/trust-tier metadata (SECURITY_MODEL) arrives in a later, sign-off-gated step.
- **`services/connections/protocolRegistry.ts`** — globs `./protocols/<name>/protocol.ts`
  (eager, `import:'default'`), dup-id throw + missing-default throw at module load. Exports `protocolSpecs`,
  `colocatedProtocolIds`, `colocatedProtocolTypes` (the array `registerBuiltInTypes()` will loop over in 6b).
  Mirrors `registry/nodeRegistry.ts` line-for-line. **Inert today** — zero `protocol.ts` files exist, so the
  hand-wired `registerBuiltInTypes()` list stays authoritative.
- **`tests/unit/services/connections/protocolRegistry.test.ts`** — the protocol-count gate (5 cases),
  mirroring `nodeRegistry.test.ts`: dup-id/missing-default (meaningful immediately, run at load), no-orphans
  vs the built-in id set (derived live from the 5 `*ConnectionType` objects, can't drift), and the count
  guard `≤` built-in count with a `TODO(6b)` to tighten to `toBe` once protocols are co-located.

**Gate mutation-verified (4 cases, dir created+removed under `protocols/`):** (A) a valid
`protocols/mqtt/protocol.ts` re-exporting `mqttConnectionType` → collects, count+orphan pass (proves the glob
is live, not vacuous); (B) orphan id → no-orphans case red; (C) named-only export → missing-default throw with
actionable message; (D) two folders, same id → dup throw with actionable message. `protocols/` dir deleted
after; tree is exactly the 3 new files.

**Then — step 6b registration conversion (the security-INDEPENDENT half; "audit and proceed").** Made the
glob authoritative so the scaffold is no longer inert:
- **5 new `protocols/<name>/protocol.ts`** (clasp/websocket/mqtt/osc/http) — each a thin unit re-declaring the
  existing `*ConnectionType` through `defineProtocol`, importing from `adapters/<Name>Adapter.ts`. The adapter
  class + config stay put (physical co-location into the folder deferred to the Phase-E move). CLASP is
  co-located for *registration* (it stays exempt from the future `ctx.connection()` helper).
- **`connections/index.ts` `registerBuiltInTypes()`** now loops over `colocatedProtocolTypes` from the glob
  instead of 5 hardcoded `registerType` calls (dropped the second `*ConnectionType` import block; the public
  barrel re-export block is untouched). One folder = one protocol; no edit here.
- **Gate tightened** to set-equality (`new Set(colocatedProtocolIds)` === built-in id set, derived live from
  the 5 `*ConnectionType` objects) + a new integration case asserting the manager actually registers every
  co-located protocol (proves the loop is wired, not just that the glob collects). Mutation-verified: removing
  one `protocol.ts` reds the count gate; restore → green.
- **Contained/low-risk (verified):** the `*ConnectionType` objects are imported ONLY in `connections/index.ts`;
  `ConnectionManager.test.ts` uses the RAW `getConnectionManager` (no built-ins) so it's insulated. Only
  visible change is protocol-picker order (now glob-sorted: clasp/http/mqtt/osc/websocket) — cosmetic.

**Verification (whole entry).** typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit`
**1682 → 1687** (+5, +1 file; net unchanged across the 6b rework — replaced the orphan case with the
registration-wiring case) · build ok. **Smoke (Playwright + system Chrome, boot→Play→Stop):** all 5 protocols
registered at runtime via the glob (`["clasp","http","mqtt","osc","websocket"]`), log "initialized with 5
built-in types", **0 real console errors**, canvas renders identically to baseline. **NOT committed.**

**▶ NEXT — step 6b `ctx.connection()` + the security mechanism (GATED on maintainer sign-off).** Implement the
context helper once at `ExecutionEngine.ts:378` (resolves id from control/input, auto-connects, shared
throttle), replacing the ~50-line `getMqttAdapter`/`ensureConnected` block in `mqtt.ts`/ws/http. **Decision to
settle first (SECURITY_MODEL):** `ctx.connection()` should return a no-secret `ConnectionHandle`
(`send`/`subscribe`/`status`, broker holds the credential), NOT a raw adapter — the kickoff's "returns the
adapter" framing conflicts with SECURITY_MODEL step 1. Confirm that shape (+ trust-tier tagging,
Community-tier CSP `connect-src`) before wiring. Gate: subscribe/unsubscribe leak test. Adapter physical
co-location + BLE/Serial/MIDI drift fix are separate follow-ups once the folder pattern is blessed.

---

## 2026-06-29 (later 10) — Audit checkpoint: Phase 1 verified COMPLETE (no code change)

Stepped back to adversarially audit the `(later 9)` heavy-tier migration + `_`-split fix. **All checks
pass; Phase 1 is complete** (modulo `subflow`, deferred to Phase 7). No code changed this entry.

**Critical check — is the migration genuinely wired, or silently leaking?** A `defineLifecycle`-wrap
removes the explicit engine `disposeAll*` call and relies on the generic loop; a smoke test catches a
*throwing* teardown but NOT a *missing-but-silent* one. Confirmed the production path: `useExecutionEngine.ts:26`
calls `engine.registerLifecycles(collectedLifecycles())` with the **live array by reference**, so every
self-registered lifecycle (incl. visual/3d/connectivity/clasp) is genuinely drained by the engine's
gc/disposeAll/onStart loops. Wired, not leaking. ✓

**Other audit results:**
- **Only `subflow` remains hand-wired** in `ExecutionEngine` (`gcSubflowState` + `clearAllSubflowContexts`);
  every other category is on the generic loop. ✓
- **Audio `_`-split fix — suffix set is COMPLETE.** Full re-grep of every `audioNodes`/`getOrCreateNode`
  key: bare id + exactly `_{input,fft,gain,meter,output}`; the multiline comp/dist/crusher calls use the
  bare id. `audioNodeBaseId`'s regex covers all five. ✓
- **Node ids are 21-char `nanoid()`** (`flows.ts`), fixed-length → `shaderCacheKeyOwned`'s `${id}_` prefix
  match is unambiguous; and the fix degrades gracefully (worst case a rare false-keep, never the old
  false-DELETE of live state). ✓
- **Both GC helpers mutation-verified** — reverting either to the old `split('_')[0]` reds the regression
  test (audio: 3 cases; visual: 3 cases, incl. the bare-id-with-underscore case the old code also broke). ✓

**State:** typecheck clean · lint 0 err · `test:unit` 1682 + 11 todo · build ok · tree clean. **Phase 1
DONE; next is Phase 2** (register-once subsystems — `defineProtocol`/`defineModel`/connection security).
See `docs/handoff/NEXT_SESSION_KICKOFF.md` for the Phase-2 entry.

---

## 2026-06-29 (later 9) — Heavy-tier migration FINISHED (22/23) + `_`-split GC bug fixed

Branch **`phase0-file-format`** (continuing). Completed the leak-class kill: the 4 remaining heavy
categories converted, and the latent `_`-split GC bug fixed. **Phase 1 is now ~95% — only `subflow`
(deferred to Phase 7) is still engine-hand-wired.** Three commits, each verified + in-app smoke'd.

**(1) `780e46b` — visual/3d/connectivity/clasp → `defineLifecycle`** (the last 4 hand-wired categories).
Each self-registers its UNCHANGED `gc`/`disposeAll` (behavior-identical wrap, no marker/onStart needed —
none have asymmetric teardown). `ExecutionEngine` now hand-wires **only `subflow`** (+ node-metrics)
alongside the generic gc/disposeAll loops; removed 4 imports + 4 gc calls + 4 disposeAll calls + the stale
comment block. `engine-leak.test`'s self-registration guard now asserts all **8** heavy-tier labels.
State-group migration: **18/23 → 22/23.**

**(2) `04e2cd0` — fix GC disposing LIVE audio/visual state for underscore node ids**
(the [[latch-nanoid-underscore-split]] latent bug, now RESOLVED). `gcAudioState`/`gcVisualState` derived
the owning id via `key.split('_')[0]`, but ~26% of nanoid ids contain `_` → live node truncated → its
Tone graph / compiled shader material disposed on ANY unrelated node removal (self-healed next frame, but
glitched). Fix: `audioNodeBaseId()` strips the complete known suffix set (meter/gain/input/fft/output);
`shaderCacheKeyOwned()` keeps a key when a valid id owns it (exact or `${id}_` prefix, mirroring
`disposeVisualNode`). New regression test (7 cases, mutation-verified). Other gc maps keyed on the bare id
— unaffected.

**Verification.** typecheck clean · lint 0 err (49 pre-existing warns) · `test:unit` **1675 → 1682**
(+7 regression) · build ok. In-app smoke (Playwright + system Chrome, boot→Play→4s→Stop): **0 real console
errors** after both the conversions and the GC fix; screenshot confirms 3D/scope/EQ/webcam/output render
identically to the pre-change baseline. Smoke recipe + reusable `smoke.mjs`: [[latch-smoke-test-harness]].

**Phase-1 status now:** de-monolith split DONE · all 4 CI gates DONE (incl. export gate) · heavy-tier
migration **22/23** (only `subflow` deferred) · `_`-split bug RESOLVED. **Remaining for Phase 1 close-out:**
`subflow` migration is intentionally deferred to its Phase-7 rebuild — so Phase 1 is effectively complete
pending that decision. A *later* refinement pass could convert the `defineLifecycle`-wrapped categories
into per-map `defineNodeState` stores for intra-category leak-safety (touches teardown; wants in-app
worker/GPU verification) — optional, not blocking.

---

## 2026-06-29 (later 8) — De-monolith split FINISHED (`executors/index.ts` 1482 → 241 lines)

Branch **`phase0-file-format`** (continuing). Completed Phase-1 deliverable (4): the remaining inline
groups in `executors/index.ts` are extracted into their own category files; `index.ts` is now a thin
**barrel + registry** (241 lines: preamble imports, the documented re-exports, the `builtinExecutors`
map). Guarded by the `(later 7)` export gate the whole way. Tests: typecheck clean · lint 0 err (49
pre-existing warns) · `test:unit` **1675** (unchanged — no test lost; the gate + math/timing/console/leak
tests all pass against the new structure, proving the barrel contract survived) · build ok.

**What landed (NOT committed):** 7 new files, all **verbatim slices** of the inline code (no logic change),
each with its own imports:
- `input.ts` (constant/trigger/textbox/slider/knob/xy-pad/keyboard/time/lfo)
- `math.ts` (arithmetic + advanced: add…modulo, lerp…wrap; `smoothState`)
- `logic.ts` (compare/and/or/not/gate/select/switch; `gateLastValue`)
- `timing.ts` (start/interval/delay/timer/metronome/step-sequencer + their state stores)
- `debug.ts` (monitor/oscilloscope/graph/equalizer/console; Tone analysers + `disposeAnalyzer`)
- `rag.ts` (retrieve/vector-memory; `VectorStore`/`cosineSimilarity`)
- `webllm.ts` (llm; `webLLMService` + its `defineLifecycle` cleanup)

`index.ts` now: drops the 7 imports that were only used by the moved code (Tone, `defineNodeState`/
`defineLifecycle`, `cosineSimilarity`/`VectorStore`, `webLLMService`, `DEFAULT_WEBLLM_MODEL`, and the
value-side `ExecutionContext`); imports the executors the registry references from the new files;
`export *`s each group so the public barrel keeps exposing their executors + state stores. `builtinExecutors`
is unchanged (still references every executor by name; the already-extracted categories still spread in).

**Why one commit:** the slices are behavior-identical and the split is revertible as a unit (revert →
monolith). Pattern mirrors the 24 categories extracted earlier. `defineNodeState`/`defineLifecycle`
registrations still fire at barrel load (same timing as before — they were always module-level).

**Phase-1 status now:** de-monolith split **DONE**; export gate **DONE**; leak gate / pure-set gate DONE.
Remaining Phase-1 work: the **4 heavy state-group conversions** (visual/3d/connectivity/clasp via
`defineLifecycle`-wrap, smoke-verified) + the latent `_`-split fix (fold into visual + patch audio).
`subflow` stays deferred to Phase 7.

---

## 2026-06-29 (later 7) — Must-not-break export-list gate BUILT (closes the headline Phase-1 gap)

Branch **`phase0-file-format`** (continuing). Built the CI gate the `(later 6)` audit flagged as the
clearest skipped Phase-1 deliverable (POLICIES §1 "Must-not-break export list"). **No production source
changed** — fixture + test only. Tests: typecheck clean · lint 0 err (49 pre-existing warns) ·
`test:unit` **1616 → 1675** (+59 cases, +1 file) · build unaffected (tests excluded from the build graph).

**What landed (NOT committed):**
- **`tests/contracts/public-exports.ts`** — the checked-in fixture POLICIES §1 names verbatim. A pure-data
  `PUBLIC_EXPORT_CONTRACT: ExportContract[]` mapping each public module → the named exports that must
  resolve. Scope = the genuine **governed** contract surface (NOT every executor): (1) the
  `@/engine/executors` barrel surface the split must keep re-exporting — `builtinExecutors`, the 14
  "external use" cleanup utils, the moved groups' state stores + debug/RAG/LLM executors; (2) **every name
  PRODUCTION `src/` code imports from a per-category path** — `emulation`
  (registerEmulatorNode/unregisterEmulator/getEmulatorLoader, via EmulatorNode.vue), `clasp`
  (disposeAllClaspConnections/gcClaspState, via ExecutionEngine), `easing`(EASINGS), `noise`(fbmNoise),
  `euclidean`(bjorklund), `color-ramp`(PALETTES/sampleStops) — the preview components + engine; (3) the
  leak-gate store paths (`spring`/`signal`/`gamepad`); (4) `CUSTOM_NODE_TYPE_IDS`. Deliberately excluded
  (documented in the header): individual math/logic/timing executors that only flow through
  `builtinExecutors` (owned by the registry-count gate; their by-name barrel imports are self-guarding via
  math/timing tests), and test-only deep imports into stable per-category files (self-guarding).
- **AUDIT (this session) found + closed a completeness hole:** the first cut pinned only `spring`/`signal`/
  `gamepad` among per-category paths. A clean re-grep of all `from '@/engine/executors/<cat>'` imports
  surfaced **6 production `src/` consumers** (the previews + EmulatorNode + ExecutionEngine's clasp
  cleanup) that were unprotected — the true external surface, where a refactor could drop an export with
  its consumer and no in-repo test would notice. Added them as tier (2). Per-category loader path then
  re-mutation-verified (corrupted `EASINGS` name → that case red).
- **`tests/unit/contracts/public-exports.test.ts`** — the gate (under `tests/unit/**` so `test:unit`/CI
  actually runs it; the fixture stays at the POLICIES path `tests/contracts/`). Asserts every contract
  name resolves; a coverage check that fixture-modules === loader-modules; and a `builtinExecutors`
  non-empty-record-of-functions sanity. Uses static `import()` literals (so Vite resolves `@/` aliases)
  + a 30s timeout on the import-bearing cases (the barrel pulls Tone+three on first load).
- **Mutation-verified:** temporarily dropping the `gcEmulationState`/`disposeAllEmulationNodes`
  re-exports from `index.ts` turned the gate red with an actionable message ("...no longer resolves...
  update tests/contracts/public-exports.ts"); restored via `git checkout`. The gate genuinely catches
  the de-monolith-split breakage it exists to guard.

**Deviations recorded (defensible):** (1) POLICIES §1 writes the id-list module as `@/registry`, but
`CUSTOM_NODE_TYPE_IDS` actually lives at / is consumed from `@/registry/components` (the `@/registry`
barrel doesn't re-export it) — fixture pins the real path; noted in the fixture header. (2) Fixture path
(`tests/contracts/`) vs test path (`tests/unit/contracts/`) split is forced by the vitest include glob
(`tests/unit/**`); without it the gate would never run in CI.

**Phase-1 CI-gate compliance now:** registry count-equality ✓, format round-trip ✓, per-type leak ✓,
exact-pure-set ✓, **must-not-break export list ✓ (NEW)**, a11y lint — Phase 4. The `(later 6)` "✗ not
built" line is now closed.

**▶ NEXT (unchanged priority order, now that the guardrail exists):** (A) the 4 heavy conversions
(visual/3d/connectivity/clasp via `defineLifecycle`-wrap, one per green commit, smoke-verified; fold the
`_`-split fix into visual + patch audio) and (C) finish the de-monolith split of `index.ts` — the new
gate will catch a dropped re-export during (C). Commit only when asked.

---

## 2026-06-29 (later 6) — Deep audit + plan-adherence checkpoint (no code change)

Stepped back to audit the whole Phase-1 migration against `ROADMAP_2026-06-28.md` + `POLICIES`.
**Verdict: following the plan well on the headline goal (kill the leak class, test-driven, gates in
CI, no AI attribution), but Phase 1 is NOT complete — ~70%, with three real gaps.** A progress overlay
was added to the top of the ROADMAP.

**Where we are (overall ROADMAP Phase 0–9):** Phase 0 DONE. Phase 1 in progress (~70%). Phases 2–9 not
started. 54 commits on `phase0-file-format`, never below test baseline (1595→1616).

**Phase 1 — four deliverables, status:**
1. **State-group migration → generic lifecycle loop: 18/23 done.** Remaining 4 heavy (visual, 3d,
   connectivity, clasp) + subflow (deferred to Phase 7). Engine gc/disposeAll loops now hold only those.
2. **Per-type leak gate: DONE** (`engine-leak.test.ts`, in CI, mutation-verified). ✓
3. **Exact-pure-set gate: DONE** (`pure-node-types.test.ts`, pins 24); derive-from-`pure:true` correctly
   deferred to Phase-6 co-location. ✓
4. **De-monolith split of `executors/index.ts`: PARTIAL** — 24 category files extracted, but `index.ts`
   is still **~1482 lines** (input/timing/debug/math/logic/RAG/WebLLM + the `builtinExecutors` registry).

**GAPS found this audit (the honest "what's left in Phase 1"):**
- **Must-not-break export-list gate is NOT built.** POLICIES §1 specifies a checked-in fixture
  `tests/contracts/public-exports.ts`; the `tests/contracts/` dir does not exist. This is a Phase-1+ CI
  gate we skipped. Build it before/with the remaining de-monolith split (the split is exactly what could
  silently break a public export).
- **De-monolith split unfinished** (index.ts still monolithic for ~7 groups + the registry map).
- **4 heavy conversions remain** (visual, 3d, connectivity, clasp) — all `defineLifecycle`-wrap +
  run→stop smoke. subflow stays deferred to Phase 7.
- **Latent `_`-split bug** in gcAudioState/gcVisualState (see `(later 5)` + the
  [[latch-nanoid-underscore-split]] memory) — pre-existing, not from the migration; fold the fix into
  the `visual` conversion + patch `audio`.

**Plan-adherence notes / deviations (all defensible, recorded so they're not silent):**
- **`defineLifecycle`-wrap vs `defineNodeState` for the heavy tier.** The ROADMAP says "convert to
  `defineNodeState`"; for ordering-sensitive (audio Tone-sequence) / marker (opencv/ai disposedNodes) /
  asymmetric (emulation keep-on-stop) teardown, a blind store restructure risks real bugs, so we wrapped
  the unchanged functions via `defineLifecycle` (the documented escape hatch). This removes the
  hand-wiring (the leak-class kill) but leaves the *intra-category* leak risk (a future added map without
  gc) — a known tradeoff; a later pass can refine wrapped categories into stores with in-app verification.
- **Split deferred until after conversion** — deliberate: converted/wrapped categories move between files
  cleanly; engine-wired ones don't.

**CI-gate compliance (POLICIES §1):** registry count-equality ✓, format round-trip ✓ (golden), per-type
leak ✓ (new), exact-pure-set ✓ (new), **must-not-break export list ✗ (not built)**, a11y lint — Phase 4.

---

## 2026-06-29 (later 5) — `audio` → `defineLifecycle` + first in-app smoke verification

Branch **`phase0-file-format`** (continuing). **18/23 converted; 4 heavy + `subflow`(deferred) remain**
(visual, 3d, connectivity, clasp). Also: confirmed an **in-app browser smoke harness** works and used it
to verify this conversion end-to-end — see the [[latch-smoke-test-harness]] memory.

**`audio` via `defineLifecycle` (not `defineNodeState`):** audio has 8 per-node maps, but
`disposeAllAudioNodes` encodes a specific **Tone teardown sequence** (audioNodes first, then synth
voices / players / filters) and `audioNodes` uses **suffixed keys** (`${id}_meter`, gc'd via
`key.split('_')[0]`). Splitting into 8 independent stores could reorder disposal and break Tone graphs —
a subtle audio bug a smoke test can't catch (can't hear output). So wrap the unchanged
`gcAudioState`/`disposeAllAudioNodes` via `defineLifecycle`. Removed the 3 engine wirings; gc loop +
`stop()` now hold **4 heavy** + `subflow` (+ metrics). `engine-leak.test.ts`'s self-registration guard
now covers `audio` too. Tests: typecheck/lint/`test:unit` 1616 + build all green.

**Smoke harness PROVEN (the verification gap is closed).** Playwright + system Chrome (`channel:'chrome'`)
drive `npm run dev`. The first-visit Starter Flow (19 nodes, incl. Synth/Parametric-EQ/EQ/Audio-Output)
loads, then **Play → wait → Stop** exercises every converted category's runtime AND `stop()`'s
`disposeAll` loop. Result for the committed conversions AND this audio change: **0 real console errors**
through boot→run→stop (after filtering headless-Chrome webcam-permission noise + a benign MediaPipe
`INFO`). So the unit tests prove teardown FIRES; the smoke proves the conversion doesn't BREAK the app
(incl. the cleanup path). Recipe + noise filters: [[latch-smoke-test-harness]].

**Pattern now settled for the heavy tier:** `defineLifecycle`-wrap (keep the existing gc/disposeAll,
behavior-identical, smoke-verified) is the SAFE conversion for categories with ordering-sensitive /
asymmetric / marker teardown (emulation, opencv, ai, audio — all done). `defineNodeState` (restructure
into self-cleaning stores) is reserved for independent-per-node state (the sockets). The remaining 4
(visual/3d/connectivity/clasp) are WebGL/media/MIDI-BLE — `defineLifecycle`-wrap each, smoke-verify
run→stop (3d/visual also screenshot the render). A later pass can refine wrapped categories into stores.

---

## 2026-06-29 (later 4) — `opencv` + `ai` → `defineLifecycle` (the marker categories, done safely)

Branch **`phase0-file-format`** (continuing). Applied the `(later 3)` insight: the two marker-based heavy
categories I'd earlier flagged "unsafe to convert blind" are in fact **safe via `defineLifecycle`**,
because that mode changes ZERO cleanup logic — it only moves WHERE the existing functions are invoked
(explicit engine calls → generic loop, same timing). **17/23 converted; 5 heavy + `subflow`(deferred)
remain** (audio, visual, 3d, connectivity, clasp).

**Why `defineLifecycle` (not `defineNodeState`):** both have a `disposedNodes` marker Set that is
**asymmetric** — `gc`/`disposeAll` ADD to it (so a late worker/model result for a torn-down node is
dropped), and ONLY `onStart` (engine start) CLEARS it (stop→restart guard). A store's uniform
`disposeAll`-clears-the-map can't express that. So each self-registers its UNCHANGED `gc`/`disposeAll` +
`onStart: reset` functions.

**Landed (all green — typecheck clean · lint 0 err · `test:unit` 1615→**1616** · `build` ok). NOT committed:**
- **`executors/ai.ts`** + **`executors/opencv.ts`**: added `defineLifecycle({ label, gc, disposeAll,
  onStart: reset })` at the bottom of each. All cleanup logic (incl. the marker Sets + worker teardown)
  is **byte-for-byte unchanged**.
- **`ExecutionEngine.ts`**: removed **8** wirings — 2 imports, `gcAIState`/`gcOpenCVState` (gc loop),
  `disposeAllAINodes`/`disposeAllOpenCVNodes` (`stop()`), and the **explicit** `resetAINodeDisposal()`/
  `resetOpenCVNodeDisposal()` calls in `start()` (now run via the generic `onStart` loop, which executes
  in the same spot — before `runtimeStore.start()` and the rAF loop; resets just clear independent Sets,
  so order-independent). gc loop + `stop()` disposeAll now hold **5 heavy** + `subflow` (+ metrics).
- **Tests**: `engine-leak.test.ts` gets a marker self-registration guard (opencv/ai/emulation register
  `gc`/`disposeAll`, opencv/ai also `onStart`). Existing `opencv.test.ts` + `ai-stt.test.ts` stay green
  (behavior unchanged) — they prove the wrapped functions still work; the engine-drains-lifecycle
  mechanism is proven by `ExecutionEngine.test.ts`'s lifecycle spy.

**Safe to do blind:** like emulation, zero logic/timing change — a pure registration-mechanism refactor.
(A *later* pass could refine opencv/ai's clean sub-maps — `opencvState`, `pendingOperations`, ai's
`nodeCache` etc. — into `defineNodeState` stores for intra-category leak-safety, but that DOES touch
teardown and wants in-app worker/GPU verification.)

**▶ NEXT — only the 5 genuine WebGL/Tone/media restructures remain** (audio, visual, 3d, connectivity,
clasp). These have clean-ish per-node maps but REAL resource teardown (Tone nodes, WebGL textures/geometry,
media streams, MIDI/BLE) — `defineNodeState` with `dispose` callbacks is the right tool, but the resource
release needs **in-app verification** (`dev:electron`). `clasp` has a websocket-shaped `nodeSubscriptions`
unsubscribe map (`clasp.ts:63`) that's partially socket-style; `connectivity` has MIDI/BLE unsubscribe
paths. `audio`/`visual`/`3d` are the big Tone/WebGL ones — recommend doing each WITH the maintainer
driving verification before its commit.

---

## 2026-06-29 (later 3) — `emulation` → `defineLifecycle` (the asymmetric-cleanup pattern)

Branch **`phase0-file-format`** (continuing). Third heavy category off the engine's hand-wired list, via
a DIFFERENT (and important) technique. **15/23 converted; 7 heavy + `subflow`(deferred) remain** (audio,
visual, ai, opencv, clasp, connectivity, 3d).

**Why `defineLifecycle`, not `defineNodeState`:** emulation's cleanup is **asymmetric** — `gc`/node-removal
tears down resources, removes the parked host, AND drops the registration; `disposeAll`/flow-stop tears
down resources but **KEEPS** the registration (node components register once on mount and must survive
stop→restart — clearing the map once orphaned them, a documented past bug). `defineNodeState`'s
`disposeAll()` *always* clears the map, so forcing emulation into a store would reintroduce that bug.
`defineLifecycle` (the documented escape hatch) lets the plain `emulators` Map + its **unchanged**
`gcEmulationState`/`disposeAllEmulationNodes` self-register into the engine's generic loop.

**Landed (all green — typecheck clean · lint 0 err · `test:unit` 1612→**1615** · `build` ok). NOT committed:**
- **`executors/emulation.ts`**: added `defineLifecycle({ label: 'emulation', gc, disposeAll })` at the
  bottom. Cleanup logic (`cleanupEntry` + the two functions) is **byte-for-byte unchanged**.
- **`ExecutionEngine.ts`**: removed the 3 emulation wirings (import + `gcEmulationState` in the gc loop +
  `disposeAllEmulationNodes` in `stop()`). Hand-wired set: **7 heavy** + `gcSubflowState` + `gcNodeMetrics`.
- **`tests/unit/executors/emulation-lifecycle.test.ts`** (new, +3 — emulation's FIRST tests): self-
  registration guard (`collectedLifecycles()` has label `emulation`), gc drops the registration, and the
  **asymmetry regression guard** — `disposeAll` tears down resources but KEEPS the registration (this
  test fails if anyone later "tidies" emulation into a `defineNodeState` store). Uses a mock loader; an
  un-booted entry has no texture/audio, so no WebGL/Tone is touched.

**Why this is safe to do blind (no in-app verification needed):** unlike websocket/mqtt this changed ZERO
cleanup logic and ZERO invocation timing — the generic loop runs `gc`/`disposeAll` in the *same*
updateGraph/`stop()` spots the explicit calls did, and emulation's teardown is order-independent of other
categories. It is a pure registration-mechanism refactor.

**KEY INSIGHT for the remaining heavy tier — two valid conversion modes:**
1. **`defineNodeState` (ideal for clean nodeId-keyed maps):** restructure state into self-cleaning stores
   with `dispose` callbacks. Eliminates *intra-category* leak risk too, but requires understanding +
   restructuring the teardown (what websocket/mqtt got). Riskier; real resource release often needs in-app.
2. **`defineLifecycle` (correct for asymmetric / marker / global state):** keep the existing map(s) +
   `gc`/`disposeAll`/`onStart` functions UNCHANGED, just self-register. Behavior-identical, safe blind.
   **This means `opencv` and `ai` (the marker categories I earlier flagged "unsafe blind") CAN be done
   safely THIS way** — `defineLifecycle({ gc, disposeAll, onStart: resetOpenCVNodeDisposal })` wrapping
   their existing functions removes the hand-wiring with zero behavior change (the `disposedNodes` marker
   Set + worker logic stay exactly as-is). A *later* pass can refine their clean sub-maps (opencvState,
   pendingOperations) into stores once someone can verify worker teardown in-app. The genuinely
   restructure-needing ones are `audio` (Tone, 8 maps), `visual`/`3d` (WebGL), `clasp` (media),
   `connectivity` (MIDI/BLE/serial) — those want defineNodeState + in-app verification.

---

## 2026-06-29 (later 2) — First heavy-tier conversions: `websocket` + `mqtt` → `defineNodeState`

Branch **`phase0-file-format`** (continuing). Picked the **lowest-semantic-risk** heavy categories to
break the seal on the heavy tier. Audited `opencv` (marker Set + worker-result ordering — NOT safe
blind) and `3d` (11 maps + renderer coupling — gnarly) and rejected both; chose the **socket protocols**
(`websocket`, then `mqtt`) because their only real resource is a subscription **`unsubscribe` closure** —
the cleanup is a function call, so it is *meaningfully* verifiable headless (unlike GPU/WASM, which a
mock can only stub). **14/23 groups now converted; 8 heavy + `subflow`(deferred) remain** (audio, visual,
ai, opencv, clasp, connectivity, 3d, emulation).

**`mqtt` (this session, same pattern + one real subtlety):** `mqttState` + `nodeSubscriptions` are now
exported `defineNodeState` stores; `nodeSubscriptions` dispose = **full teardown** (`sub.unsubscribe()`
+ error-safe `getMqttAdapter(sub.connectionId)?.unsubscribe(sub.topic)`), matching the old
`disposeMqttNode`. **The subtlety vs websocket:** mqtt has THREE release paths with DIFFERENT teardown —
(1) *rewire to a new topic* releases only the message listener (NOT `adapter.unsubscribe`), so that path
keeps a manual `existingSub.unsubscribe()` + relies on `.set()` overwrite (NOT `.delete()`, which would
run the full dispose); (2) *topic cleared* and (3) *node removal* are full teardown → both route through
`.delete()`/the dispose callback. A new **`tests/unit/executors/mqtt-teardown.test.ts`** (mqtt's first
behavioral coverage) pins all three paths; `nodeSubscriptions` also gets a dedicated engine-gc teardown
test in `engine-leak.test.ts`, and `mqttState` joined `CONVERTED_STORES`. Minor consistency gain: the
topic-cleared path now `adapter.unsubscribe`s using the subscription's OWN connection (via dispose),
matching node-removal — the old inline code used the current frame's adapter (latent edge-case bug).
Engine wiring removed (import + `gcMqttState` + `disposeAllMqttNodes`); helpers kept store-backed.

**`websocket` (earlier this session):**

**Landed (all green — typecheck clean · lint 0 err / 49 pre-existing `any` · `test:unit` 1606→**1612**
pass +11 todo · `build` ok). NOT committed:**
- **`executors/websocket.ts`**: `wsState` + `nodeListeners` are now **exported `defineNodeState`** stores.
  `nodeListeners` carries `dispose: (l) => l.unsubscribe()` — **moving the real teardown into the store**,
  so engine gc / `stop()` / a rewire `.delete()` all release the adapter listener. **Rewire double-fire
  fix:** the connection-change path used to `unsubscribe()` *and* `nodeListeners.delete()`; now `.delete()`
  disposes (unsubscribes), so the manual unsubscribe was removed (else it would fire twice). `lastConnectAttempt`
  stays a plain Map (keyed by **connectionId, not nodeId** — doesn't fit `defineNodeState`'s model, and
  the original never gc'd it; behavior preserved). `disposeWebSocketNode`/`disposeAllWebSocketNodes`/
  `gcWebSocketState` kept as **store-backed** test/compat helpers (the index barrel re-exports + 2 test
  files import them) — the engine no longer calls them.
- **`ExecutionEngine.ts`**: removed the 3 websocket wirings (import, `gcWebSocketState` in the updateGraph
  gc loop, `disposeAllWebSocketNodes` in `stop()`). Same timing/guard as before — cleanup now flows
  through the generic lifecycle loops. (After both socket conversions the updateGraph gc loop hand-wires
  **8** heavy categories + `gcSubflowState` + `gcNodeMetrics`; `stop()`'s disposeAll loop matches.)
- **Tests**: `wsState` added to `engine-leak.test.ts`'s `CONVERTED_STORES` ({}-seeded size check);
  `nodeListeners` gets a **dedicated real-teardown test** (seed two listeners with `vi.fn()` unsubs,
  remove one via `updateGraph` → its unsub fires once, the live one's doesn't; `stop()` releases the
  rest). A **rewire regression test** added to `websocket-throttle.test.ts` (old listener released
  exactly once on connection change). `engine-leak.test.ts` is now +8 tests.

**Verification status:** the websocket executor's leak fix is **fully covered headless** — the executor's
sole responsibility is calling `unsubscribe` at the right moments, which the tests prove; the adapter's
unsubscribe correctness is the adapter's own contract. A 60-second in-app sanity check (add a WebSocket
node, delete it, confirm no console error / dangling listener in `dev:electron`) is still recommended
before commit, but the GPU/WASM "mocks insufficient" caveat does **not** bite here.

**▶ NEXT (the easy socket wins are now DONE):** only the genuinely gnarly heavy categories remain —
`audio` (Tone, 8 maps), `visual` (WebGL), `3d` (11 maps + renderer), `opencv` (worker + marker Set —
plan in the entry below), `ai` (workers + `resetAINodeDisposal` marker), `clasp` (media; note clasp has
its OWN `nodeSubscriptions` unsubscribe map at `clasp.ts:63` — a websocket-shaped sub-conversion is
possible there), `connectivity` (MIDI/BLE/serial), `emulation` (EmulatorJS WebGL). These need **real
in-app verification** (`dev:electron`) — mocks are necessary but not sufficient. Recommend doing each
WITH the maintainer driving verification before its commit. `connectivity` is large but its MIDI/BLE
unsubscribe paths may yield a partial socket-style win; `audio`/`visual`/`3d` are the big WebGL/Tone
teardowns.

---

## 2026-06-29 (later) — Engine-level leak-test GATE + `PURE_NODE_TYPES` GATE landed (audited)

Branch **`phase0-file-format`** (continuing). Two roadmap Phase-1 gates landed and an `ultrathink`
self-audit hardened them. The **"per-type create+delete leak test"** gate is now in place — the missing
half of the leak-class kill. Per-category unit tests (`executor-gc.test.ts`) already pin each store's
`gc`/`disposeAll` *in isolation* (calling `store.gc(...)` directly); the new gate proves the **engine
itself** drains them through its generic `for (const l of this.lifecycles) …` loops.

**AUDIT (this session, all findings actioned):**
- **The gate has teeth (mutation-verified):** commenting out the engine's `for (const l of this.lifecycles)
  l.gc(validNodeIds)` line turns exactly the 4 gc-dependent leak tests + the new `ExecutionEngine` gc
  spy test RED, while the `stop()`/disposeAll and canvas-mock tests correctly stay green (they don't
  depend on that loop). A leak test that can't fail is worthless — this one provably can.
- **Reconciled a stale NOTE:** `ExecutionEngine.test.ts:550` carried a NOTE that the gc-on-removal path
  was deliberately left untested because the legacy gc path touched `canvas.getContext` ("Phase 1's
  per-type leak tests will add a canvas mock"). That promise is now fulfilled, so the NOTE was rewritten
  and a now-unblocked **`drains gc on updateGraph node removal`** spy test added there (asserts the loop
  fires with the correct empty `validNodeIds`).
- **Closed the compound-key gap:** all 28 *exported* converted stores use identity keys, so the
  `keyToNodeId` gc path wasn't exercised end-to-end through the engine (only at the `defineNodeState`
  unit level, `nodeState.test.ts:67`). Added a `keyToNodeId` probe to `engine-leak.test.ts` (suffixed
  `keep:a`/`drop:a` keys, prove only the removed node's entries drop). `code`/`http` are the real
  compound-key stores but non-exported; the probe covers the mechanism the engine drains them with.
- **`PURE_NODE_TYPES` discrepancy was already RESOLVED — the handoff's "19" was STALE.** The live set
  (`ExecutionEngine.ts:67`, not `:84` — that ref drifted too) is **24 ids** and already matches the docs.
  Counted directly; no purity re-audit needed (the set is the verified source of truth from 2026-06-14).
- **Found + closed a store with ZERO gc coverage (2nd audit pass):** `engine/trigger.ts`'s `edgeState`
  (the `risingEdge` store) is a *converted* `defineNodeState` store but **non-exported** and uses a
  **unique** `keyToNodeId` (`indexOf('::')` slicer — every other store splits on a single `:`), so
  neither `trigger.test.ts` (no gc tests), `nodeState.test.ts` (`_` splitter), nor the `:`-split probe
  exercised it. A regression in that slicer would silently leak edge state on node deletion — the exact
  Phase-1 leak class. Closed with a **behavioral** integration test in `engine-leak.test.ts`: drive the
  exported `risingEdge()` to seed `keep::trigger`/`drop::trigger`, remove `drop` via `updateGraph`, and
  assert `drop` re-fires (state gc'd) while `keep` stays latched (selectivity — also catches a broken
  splitter, which would wrongly drop `keep`'s state). `code`/`http`'s non-exported stores use the
  `:`-splitter the probe already represents.
- **Hardened `beforeEach`:** now resets **every** registered lifecycle via
  `collectedLifecycles().forEach((l) => l.disposeAll())` (was only the 28 exported stores), so the
  non-exported `edgeState`/code/http stores and any probe can't bleed state across cases.
- **`opencv` heavy-tier conversion investigated (NOT done — needs in-app verify).** Concrete groundwork
  for whoever picks it up: state is `opencvState` (Map, per-node canvas+texture) + `pendingOperations`
  (Map, in-flight throttle guard) + **`disposedNodes` (Set, a late-worker-result guard that must
  GROW on dispose and be cleared ONLY on engine start)** + module singletons `scratchCanvas`/
  `imageDataCanvas` + the worker side (`openCVService.dispose(id)`/`.disposeAll()`). Plan:
  `opencvState` → `defineNodeState` with `dispose(state, id)` doing `texture.dispose()` +
  canvas 0×0 + `openCVService.dispose(id)` + `pendingOperations.delete(id)` + **`disposedNodes.add(id)`**
  (the marker MUST be set inside dispose, and `disposedNodes` must NOT itself be a gc'd store or markers
  vanish for removed nodes); `pendingOperations` can stay a Map cleaned in that `dispose`; the
  `resetOpenCVNodeDisposal` (clear `disposedNodes`) + `openCVService.disposeAll()` + canvas-singleton
  nulling go in a `defineLifecycle({ onStart, disposeAll })`. **Why it's not safe headless:** mocks can
  verify the wiring but not that the real WASM Mats free or that the late-result drop timing holds —
  exactly the subtle marker/ordering semantics. Verify optical-flow + MOG2 nodes in `dev:electron`
  (add/remove/re-add; stop→restart) before committing.

**Landed (all green — typecheck clean · lint 0 err / 49 pre-existing `any` · `test:unit` 1595→**1606**
pass +11 todo · `build` ok). NOT committed (awaiting maintainer go-ahead):**
- **`tests/unit/engine/engine-leak.test.ts`** (new, +7 tests). Wires `engine.registerLifecycles(
  collectedLifecycles())` exactly as production, seeds all **28 exported converted stores** (the 12
  categories' `defineNodeState` stores), then asserts: (a) `updateGraph` **removal** empties every store
  via the engine gc loop (no direct `store.gc()` call); (b) a keep/drop graph drops only the removed
  node; (c) `stop()` empties every store; (d) a **freshly-registered** `defineNodeState` (created after
  the engine started) is drained AND its `dispose(state)` callback fires — the live-array guarantee that
  a custom/user executor inherits auto-cleanup for free; (e) a **`keyToNodeId` compound-key probe**
  (engine resolves the owning node id from suffixed keys); (f) the non-exported `::`-keyed `edgeState`
  (`risingEdge`) is gc'd end-to-end; (g) the canvas mock sanity check. Seed value is `{}` (analyser
  `dispose` reads `s.waveform`/`s.fft` null-safely, so it disposes cleanly).
- **`tests/unit/engine/ExecutionEngine.test.ts`**: rewrote the stale lifecycle-gc NOTE and added the
  now-unblocked **`drains gc on updateGraph node removal`** spy test (h.gc called once with empty set).
- **`tests/unit/engine/pure-node-types.test.ts`** (new, +3 tests — the `PURE_NODE_TYPES` Phase-1 gate).
  Pins the set to **exactly the canonical 24-id literal** (independent second witness; order-independent
  equality; no dup), asserts the known-impure nodes (`gate`/`smooth`/`random`/`counter`/`metronome`/
  `timer`) stay **excluded** (the only dangerous direction — a wrong *addition* can freeze a node in
  dirty mode), and pins `COLOCATED_PURE_NODE_TYPES ⊆ PURE_NODE_TYPES` — the **Phase-6 derivation
  bridge** (vacuously true today: **0 co-located `node.ts` files** exist, so the `pure:true`-derived set
  is empty; it becomes a real check the moment Phase 6 co-locates a pure node). Full *replacement* of the
  hand-maintained literal by the derived set waits on Phase-6 co-location; adding `pure` to the 24 legacy
  `NodeDefinition`s now would be throwaway work Phase 6 redoes, so it was deliberately NOT done.
- **`tests/setup.ts`**: added a safe `HTMLCanvasElement.getContext` mock (Proxy-based no-op **2D**
  context; `getImageData`/`createImageData` return correctly-shaped buffers; **WebGL → null** so guarded
  branches take their fallback). **Safe by construction:** happy-dom leaves `getContext` *undefined*
  (it throws), and the whole suite was green, so **no existing test reached a real `getContext` call** —
  the mock can only unblock new headless coverage, never change current behavior. Verified: all 89 test
  files still pass.
- **`executors/visual.ts` `gcVisualState`** (small production fix): the Three renderer was fetched
  **eagerly** at the top (`getThreeShaderRenderer()`), so removing *any* node — even a non-visual one —
  spun up a WebGL context (throws headless; wasted work in prod). Now fetched **lazily**, only inside the
  `nodeTextures` loop right before `disposeNode`. Behavior-identical (memoized singleton, already built
  by GC time in prod); makes `gcVisualState` a true no-op when no visual textures need disposing. This
  was the *actual* blocker for the engine-removal test — the canvas mock alone is insufficient because
  Three needs a real WebGL context.

**▶ NEXT ACTION:** the **heavy/in-app tier** conversion is now the only remaining Phase-1 item
(audio/visual/ai/opencv/clasp/connectivity/mqtt/websocket/3d/emulation — `subflow` deferred to Phase 7).
Each has **real resource teardown** (Tone/WebGL/workers/sockets/media): move it into a `dispose(state)`
callback (or `defineLifecycle` for service/global side effects), then **VERIFY IN-APP** (`npm run dev` /
`dev:electron`) — mock-based unit tests are necessary but NOT sufficient here. One category per green
commit. As each heavy group migrates to `defineNodeState`, **add its store(s) to
`engine-leak.test.ts`'s `CONVERTED_STORES` list** (the regression gate) and remove its hand-wired
`gc*`/`disposeAll*` line from `ExecutionEngine.ts`. The canvas mock (`tests/setup.ts`) + the now-lazy
`gcVisualState` renderer fetch mean a fuller engine-removal test that seeds **visual** state is also
unblocked. (`PURE_NODE_TYPES` is DONE — gate landed; full derive-from-`pure:true` replacement is a
Phase-6 co-location follow-up.)

---

## 2026-06-29 — Phase 1 in progress: `defineNodeState` migration (kill the leak class)

Branch **`phase0-file-format`** (continuing). Phase 0's autonomous work is complete (see entry
below); **Phase 1** (de-monolith + convert ~23 hand-wired state groups to `defineNodeState` so the
engine's generic lifecycle loop is authoritative and the leak class is structurally impossible) is
**~12/23 done** — every group convertible/verifiable **headless** is migrated; only the heavy/in-app
tier remains.

**▶ NEXT ACTION:** convert the **heavy/in-app tier** (audio, visual, ai, opencv, clasp, connectivity,
mqtt, websocket, 3d, emulation — `subflow` deferred to Phase 7). Each has **real resource teardown**
(Tone/WebGL/workers/sockets/media): move it into a `dispose(state)` callback (or `defineLifecycle` for
service/global side effects), then **VERIFY IN-APP** (`npm run dev` / `dev:electron`) that audio/video/
connections actually tear down — green unit tests with mocks are necessary but NOT sufficient here.
One category per green commit. Alternatively, lower-risk headless wins still open: (a) the
**engine-level per-type leak-test gate** (roadmap) — add a `canvas.getContext` mock to `tests/setup.ts`,
then an `updateGraph` add→remove→assert-store-empty test (per-category UNIT gc tests exist via
`store.gc`, but the engine-integration leak test is still TODO and is the actual roadmap gate);
(b) **`PURE_NODE_TYPES`** derivation — still the hardcoded **19-id** set (`ExecutionEngine.ts:~84`),
docs say "24"; reconcile before deriving from `pure:true`.

**Current state (audited 2026-06-29, all green):** `typecheck` clean · `lint` 0 errors (49 pre-existing
`any` warnings) · `test:unit` **1595 pass** (+11 todo) · `build` ok. 43 commits on the branch, tree
clean, no AI attribution. Engine `updateGraph` gc loop + `stop()` disposeAll loop verified to hold
**exactly** the 11 heavy groups + `gcNodeMetrics`; every converted group flows through
`for (const l of this.lifecycles) …`. Earlier audit invariants confirmed: generic gc runs in the same
`if (hasRemovedNodes)` guard as the removed hand-wiring; generic `disposeAll` is unconditional in
`stop()`; the `endFrame` loop replaced the bespoke `endMessagingFrame` call site; production
registration via `useExecutionEngine.onMounted` (live-array reference, so order-independent); Vue 3.5
computed value-equality means the error badge's `nodeMetricsVersion` dep causes no per-frame re-render.

**Foundation landed:** `defineNodeState`'s store now exposes **`gc(validNodeIds)` + `disposeAll()`**
directly (`engine/nodeState.ts`); the auto-registered lifecycle hook delegates to them. So a converted
category needs **no bespoke `gcXState`/`disposeAllXState`** — production cleanup runs via the generic
loop (already wired: `ExecutionEngine` `registerLifecycles(collectedLifecycles())` from
`useExecutionEngine.ts:26`, draining gc/disposeAll/onStart/endFrame), and tests drive cleanup through
the store.

**Canonical conversion recipe (per category):**
1. In the category file: `export const xState = defineNodeState<T>({ label, dispose? })` (replace
   `new Map()`). The store's `.get/.set/.has/.delete` match `Map`, so executor bodies usually don't
   change; `Map.clear()`→`.disposeAll()`, `Map.keys()`-gc loop → delete the whole hand-rolled `gc` fn.
2. Delete the `gcXState`/`disposeAllXState` functions.
3. `ExecutionEngine.ts`: remove the category's import + its line in the `updateGraph` gc loop (~:324)
   + its line in the `stop()` disposeAll loop (~:972).
4. `executors/index.ts`: remove any re-export of those functions (e.g. gamepad had one).
5. Tests: import the store; replace `disposeAllXState()` with `xState.disposeAll()` (or a tiny local
   `const disposeAllXState = () => xState.disposeAll()` to avoid churning many call sites; for
   multi-store categories like signal, the helper clears each store).

**Converted so far (12) — entire NON-HEAVY tier + `http`:** `spring`, `signal` (signalState+tapState),
`gamepad`, `utility` (6 stores), `code` (compound `nodeId:…` keys via `keyToNodeId`), the
`executors/index.ts`-internal groups `RAG`/`input`/`timing` (incl. `startFiredNodes` **Set** →
`defineNodeState<true>` presence store)/`debug` (analysers via per-entry `dispose` callback — no
double-dispose since rewire mutates in place)/`WebLLM`, `messaging`, and `http` (pure response cache,
compound keys — the one connection-group executor with no real teardown; `disposeHttpNode`/etc. kept as
store-backed test helpers). Each its own commit.

**AUDIT NOTE (2026-06-29, perf — not a bug, not yet fixed):** `createExecutionContext`
(`ExecutionEngine.ts`) allocates 6 closures (read + num/bool/str/trig/level) **per node per frame** in
`executeNode`, and the accessors have **zero consumers yet**. Negligible vs the Maps `executeNode`
already allocates each frame, so not worth fixing in isolation — but when profiling 500+ nodes / when
executors start using `ctx.num`, switch to a **class-based context** (prototype methods allocated once).

**New infra: `defineLifecycle(hook)` in `nodeState.ts`** — registers a lifecycle NOT backed by a
`defineNodeState` map, for cleanup that is a *side effect* rather than per-node state (gc/disposeAll
default to no-ops). Used by `WebLLM` (`webLLMService.gc`/`stopActive`) and `messaging` (channel-keyed
`receiveProcessed` GC + `messageBus.clear` + the end-of-frame change-flag flush, replacing the bespoke
`endMessagingFrame` engine call site — the generic `endFrame` loop now drives it). Pattern for any
remaining group with non-map side effects: convert nodeId-keyed maps to stores, register the rest via
`defineLifecycle`. `messaging` keeps `disposeAllMessagingState`/`gcMessagingState` exported as
test/teardown helpers (reimplemented on the stores) — the engine no longer calls them.

**Engine is much slimmer now:** the `updateGraph` gc loop and `stop()` disposeAll loop only retain the
**heavy/in-app** categories below; everything else flows through `for (const l of this.lifecycles) …`.

**⚠️ LESSON (cost me a red full-run): before deleting a `disposeXState`/`gcXState`, grep ALL of
`tests/` for it — not just the test file you know about.** `input`'s removal broke `smooth.test.ts`
(imported `disposeAllInputState`) which I hadn't checked; per-file tests pass but the full
`test:unit` caught it. Always run the FULL suite after a conversion, and migrate every importer to a
local `const disposeAllXState = () => store.disposeAll()` helper (keeps call sites unchanged).

**Remaining state groups, by risk tier (do NOT batch blindly):**
- **`messaging` is NOT a simple conversion** (handoff previously mis-said "safe"): its `receiveProcessed`
  is keyed by **channel, not nodeId** (an inner `Map<channel, Map<nodeId, bool>>`), so it doesn't fit
  `defineNodeState`'s nodeId-keyed model; and `disposeAllMessagingState`/`endMessagingFrame` have
  `messageBus` side effects (`messageBus.clear()` / `clearChangeFlag`). Convert `sendPrevValues` +
  `activeReceiveNodes` to stores but keep a bespoke path (or a non-nodeState helper) for
  `receiveProcessed` + the messageBus calls. Has `executor-gc.test.ts` coupling.
  (`WebLLM` + `messaging` are DONE — see above; `defineLifecycle` landed.)
- **ONLY the heavy/in-app tier remains** (real resource teardown — convert by moving teardown into a
  `dispose(state)` callback, then **verify in-app**, one category per green commit): `audio` (Tone),
  `visual` (WebGL/canvas), `ai`, `opencv` (workers + `disposedNodes` marker Set + `onStart` reset →
  `defineNodeState({ onStart })` or a `defineLifecycle`), `clasp` (media), `connectivity` +
  `mqtt`/`websocket` (sockets/MIDI/BLE — unsubscribe/close on dispose; unit-mockable but real teardown
  needs the app), `3d` (Three geometry/material `.dispose()`), `emulation` (EmulatorJS WebGL).
  `subflow` is best left for its **Phase-7 rebuild** (state will be restructured). `code`/`http` are
  done (caches, no real teardown).

**Still pending for the engine-level per-type leak test gate** (roadmap): add a `canvas.getContext`
mock to `tests/setup.ts` first — an engine `updateGraph`-removal test runs the *remaining* hand-wired
`gcVisualState`, which touches canvas (happy-dom lacks it). Per-category unit gc tests (seed via
executor → `store.gc(validIds)` → assert) work without it and are sufficient per-category until then.

**Discrepancy to resolve when deriving `PURE_NODE_TYPES`:** the live set is **19 ids**
(`ExecutionEngine.ts:84`), but ROADMAP/handoff say "24-id". Re-audit before flipping the glob count
guard to strict `===` (Phase 6) or deriving from `pure:true` (`NodeSpec` has the field; `NodeDefinition`
does not yet).

---

## 2026-06-28 — Phase 0 foundations: `.latch` v2 file format + extensibility scaffolding

Executing **`docs/plans/ROADMAP_2026-06-28.md` (canonical)** Phase 0. Branch:
**`phase0-file-format`** (off `main`) — **15 commits, all green, working tree clean** (no AI
attribution). License decision: **MIT confirmed** — already in `LICENSE` + `package.json`; no change
needed. Governance/funding stays maintainer-owned (POLICIES §3), non-blocking.

**▶ NEXT ACTION:** Open/next #1 (number `:min`/`:max`), #2 (per-node error badge), #6 (undo for param
edits), and #7 (**2b** ctx accessors + factory) are **DONE**. Remaining clean autonomous work is thin:
#8 policies fixture needs a public-API-surface decision (maintainer call). #3 (single-input edge
replace) and #5 (texture traps, P0) need **in-app verification**; #4 (`random`) needs a design call.
Next session likely starts **Phase 1** (de-monolith `executors/index.ts` + `defineNodeState`
conversion) — see the §1 add-`canvas.getContext`-mock-to-`tests/setup.ts` prerequisite below.

**Landed this session** (15 commits): planning corpus · `.latch` v2 file format (+ store wiring) ·
engine registry-resolved definitions + boundary input coercion · extensibility scaffold
(`defineNode`/`trigger`/`defineNodeState`/`nodeRegistry`) · `power` finite-guard · import toasts ·
engine lifecycle wiring · edge-triggered `latch`/`sample-hold` · Tone-analyser dispose · clasp
`captureStream` stop · **number control `:min`/`:max` + blur-clamp (first component test)** ·
**per-node error badge** · **undo for param edits (debounced)** · **2b ctx accessors + factory**.
Test count **1517 → 1593**.

**State at end of session:** `typecheck` + `lint` + `test:unit` + `build` (web) all green —
**1593 tests** (was 1517). Committed to `phase0-file-format` (no AI attribution). Every step was kept individually revertible. (One pre-existing flaky timer test,
`adapters.test.ts > connectWithRetry`, occasionally fails in the full run and passes on retry —
unrelated to this work.)

### ⚠️ Critical engine fix (third `ultrathink` audit) — required by the v2 format
`ExecutionEngine.executeNode` read the node definition **only** from `node.data.definition`
(`:340`) and used it to populate control **defaults** (`:358`). The `.latch` v2 format **drops** the
embedded definition, so imported flows (incl. the **first-visit `sample-flow.json`**) would execute
with control defaults missing — masked only where executors have their own `?? default`. Fixed per
FILE_FORMAT_SPEC ("resolve from the registry by type at load"):
`definition = node.data?.definition ?? this.nodesStore.getDefinition(nodeType)` (+ `private nodesStore
= useNodesStore()`). **Conservative** (embedded-first → zero change for existing/autosaved flows that
still carry a definition; registry fallback fixes v2-imported and NodeExplorer-added nodes). No
executor reads `ctx.definition` (verified 0 occurrences), so the undefined-`ctx.definition` case was
already harmless. Tests: registry default reaches the executor when no embedded def; explicit value
still overrides. Golden + dirty-equivalence suites green. **Follow-up (not blocking):** `EditorView.vue:192`
still embeds `definition` at node creation — drop it later so the format is uniformly registry-resolved.

### Sub-task 3 quick-wins — STARTED
- **`power` finite-guard DONE** (AUDIT §E): `powerExecutor` returned `isNaN(result) ? 0 : result`,
  letting `±Infinity` through (`log(0)=-∞`, `0^-1=+∞`, `exp(710)=+∞`). Now `Number.isFinite(result) ?
  result : 0` (`executors/index.ts:381`). Four bug-characterizing tests in `math.test.ts` were
  tightened from "tolerates Infinity" to asserting the guarded `0`.
- **Boundary coercion DONE** (AUDIT §D P0 — the "coercion lie"): `getNodeInputs` copied upstream
  values verbatim, so a boolean into a `number` port arrived as `true` (`true + 0 === 1`; `?? 0` never
  caught it). New exported `coerceToPortType(value, portType)` in `ExecutionEngine.ts` honors the
  connection-matrix coercions (number→{string,boolean}, boolean→{number,string}); `getNodeInputs`
  resolves the target node's definition (registry) once and coerces each value to its port type.
  **Conservative**: only primitive number/boolean/string targets when the runtime type mismatches;
  `any`/trigger/textures/3D/`data`/placeholder ports pass through untouched. Golden + dirty-equivalence
  green (correctly-typed flows unchanged). Pure-fn + engine-integration tests added.
- **Edge-trigger `latch` / `sample-hold` DONE** (AUDIT §E P1): both were level-triggered despite the
  docs — a held-high gate made `sample-hold` a per-frame pass-through. Now use `risingEdge(nodeId, key,
  value)` from `engine/trigger.ts` (sample-hold on `trigger`; latch on `set`/`reset`, reset wins).
  **This is the first real consumer of `risingEdge`** — so `utility.ts` now imports `trigger.ts` at
  boot, registering its `defineNodeState` lifecycle which the engine drains (the §11-step-1 wiring is
  now exercised in production, not just a no-op). Existing tests kept passing (they used clean low→high
  transitions); 3 discriminating edge tests added. Held-value state stays in the legacy `gcUtilityState`
  path; edge state GCs via the new lifecycle loop.
- **Tone-analyser dispose DONE** (AUDIT §F P1): oscilloscope (`Tone.Waveform`) and equalizer
  (`Tone.FFT`) `.disconnect()`'d their analyser but never `.dispose()`'d it, leaking a Web Audio
  `AnalyserNode` on every add/remove/stop/rewire (and the equalizer's no-audio branch dropped the
  reference without disconnecting). One error/null-safe `disposeAnalyzer(node, source)` helper now
  replaces all six discard sites (2 rewire, equalizer no-audio, per-node dispose, 2 disposeAll loops).
  Tested via a partial `vi.mock('tone')` (stub Waveform/FFT) asserting dispose fires at each site.
- **clasp `captureStream` stop DONE** (AUDIT §F P1): `disposeClaspVideoReceiveNode` disposed the
  texture but never stopped the canvas `captureStream` tracks or tore down the `<video>` (clasp.ts:967),
  leaking MediaStream tracks per video-receive remove/stop. New exported `stopVideoElement(video)` helper
  (stop tracks + pause + clear srcObject, error-safe) is called on dispose. Helper unit-tested directly.
- **`random` sample-on-trigger — NOT done** (deferred): needs an optional `trigger` input on the
  definition + reliable "is the trigger wired" detection. `ctx.inputs.has('trigger')` is unreliable
  (depends on whether the upstream emits continuously vs only on fire), so this needs either engine
  support for per-input edge-presence or an explicit mode control — design it deliberately, don't guess.

### Sub-task 1 — `.latch` v2 file format (FILE_FORMAT_SPEC) — COMPLETE
The strategic centerpiece (diff-friendly, durable, versioned). Logic (`flow.nodes` controls) is
separated from layout (positions/size/custom label) so moving a node never churns a logic diff.
- **`src/renderer/services/fileFormat.ts`** (new, pure — no store/registry/IO/random):
  v2 types; `migrateDocument`/`migrateToExport` (legacy v1.0 single + v1.0.0 multi → v2);
  byte-deterministic `serializeDocument`/`serializeExport` (sorted keys, nodes/edges by id,
  `controls` deep-sorted); `validateDocument` (drops dangling edges, PRESERVES unknown-type nodes);
  `endpoint`/`parseEndpoint` (`"node:port"`, `:` delimiter — **never `/`**, so subflow-expanded
  `a/b` ids stay safe); `migrateNode`/`migrateDocumentNodes` (per-node `version`+`migrate`,
  resolver-injected — no-op today, all nodes v1); `looksLikeLatchFile` guard.
- **`src/renderer/stores/flows.ts`**: `exportFlow`/`exportAllFlows` now **write v2 only** (maintainer
  chose v2-only over dual-write); `importFlow`/`importFlows` read v1.0 + v1.0.0 + v2 via one
  `migrateToExport → docToFlowState` path. Unknown types load as **placeholders** (controls + wires
  preserved; dynamic ports derived from surviving edges). `importFlows` returns a structured
  **`ImportReport`** (imported / migrated / unknownNodes / droppedEdges / warnings). **Persistence is
  untouched** — `usePersistence` stores `FlowState` directly in Dexie, independent of the file format.
- **`src/renderer/stores/ui.ts`** + **`components/layout/NotificationToasts.vue`** (new, mounted in
  `App.vue`): minimal toast system (`notify`/`dismissNotification`). `AppHeader.importProject` now
  surfaces the `ImportReport` as a success/warning toast (errors sticky) instead of `console.log`/`alert`.
- Gates (all green, unit-level): byte-identical round-trip, logic/layout isolation, legacy
  `public/sample-flow.json` upgrade, missing-node placeholder. **Integration gate**: the real sample
  flow (19 nodes/18 edges) upgrades through the **full 238-node registry with 0 unknown / 0 dropped**.

### Audit findings fixed (two `ultrathink` self-audits)
- **REGRESSION**: store-export stripped all `_`-prefixed data keys while legacy-migrate kept them →
  silently dropped real persisted state (`_width`/`_height` KeyboardNode sizing;
  `_dynamicInputs/_dynamicControls/_dynamicOutputs`, which regenerate **only while the engine runs**,
  `ExecutionEngine.ts:461`). Both paths now preserve everything except `{nodeType, label, definition,
  _unknownType}`.
- **Placeholder dynamic-port leak**: a placeholder's edge-derived `_dynamic*` must not be persisted
  (would pollute the node with stale handles if its type later loads) — stripped on export for
  `_unknownType` nodes only.
- **Validation hole**: arbitrary JSON imported as an empty "success" flow → `looksLikeLatchFile` guard.
- Defensive `delete data._unknownType` on load; fatal validation errors surfaced as report `warnings`.
- Determinism proof: a round-trip test was order-fragile (`nodes[0]` after id-sort) — fixed to resolve
  by `nodeType`.

### Sub-task 2 — extensibility primitives (additive, alongside existing code)
- **2a DONE** — `engine/defineNode.ts` (`NodeSpec`, frozen-contract identity fn — core fields only;
  `ui`/`models`/`lifecycle` are additive-later per POLICIES §2), `engine/trigger.ts`
  (`TRIGGER`=1/`isHigh`/`risingEdge`), `engine/nodeState.ts` (`defineNodeState` + `collectedLifecycles`
  + lifecycle registry). Unit-tested; **not yet wired into the engine**.
- **2c DONE** — `registry/nodeRegistry.ts` globs `./**/node.ts` (eager, `import:'default'`); throws on
  duplicate id / missing-default at load; exports `nodeSpecs`/`colocatedNodeIds`/`colocatedExecutors`/
  `COLOCATED_PURE_NODE_TYPES`. Glob matches **0 files today** (inert; app still uses the legacy
  registry). Guard tests are **green-from-commit-1**: dup-id + default-export are meaningful now;
  count-equality is `colocated ≤ legacy` with a `TODO(phase6)` to tighten to `===` once every node is
  co-located. NOTE (EXTENSIBILITY §6 risk #3): the guard test must load `@/registry/components`
  **before** `@/registry` — importing `@/registry` re-exports `./components` mid-eval (`index.ts:72`)
  and trips a happy-dom `markRaw(undefined)` circular-init hazard otherwise.
- **2b DONE** — `ctx.num/bool/str/trig/level` on `ExecutionContext`, required, via a new exported
  `createExecutionContext(data)` factory now used at the sole runtime site (`ExecutionEngine.ts:431`).
  Accessors read `input ?? control ?? fallback`: `num` coerces + NaN/±Infinity-guards; `bool`/`str`
  coerce; `trig` = `risingEdge(nodeId, id, value)`; `level` = `isHigh`. **The prior "breaks ~25 test
  helpers" deferral premise was WRONG**: `tsconfig.json` `include` is `src/**` only, so `vue-tsc`
  **does not typecheck `tests/`** — the test helpers' `: ExecutionContext` annotations are esbuild-
  stripped at runtime and never checked (proof: `math.test.ts`'s helper already omits `definition` and
  carries a stale `getInputNode` not in the interface, yet typecheck is green). So making the accessors
  required broke nothing, and **the mass 25-helper refactor is unnecessary churn** — no executor uses
  the accessors yet, so each helper migrates incrementally when its executor adopts `ctx.num` (Phase 1+).
  Shipped instead: a shared, factory-based test helper `tests/unit/_helpers/executionContext.ts`
  (`makeContext`) for new/migrated executor tests, plus `tests/unit/engine/executionContext.test.ts` (7).

### Open / next (remaining Phase-0 work, roughly priority order)
Done already: file format (Sub-task 1), scaffold 2a/2c, **engine lifecycle wiring**, and 5 quick-wins
(power, boundary coercion, edge-trigger latch/sample-hold, Tone dispose, clasp captureStream). Remaining:
1. **number `:min`/`:max` — DONE** (AUDIT §B P0, 127 controls). Both number branches (`BaseNode.vue`
   inline + `PropertiesPanel.vue`) now bind `:min`/`:max` (cast `as number` — a bare `unknown` value is
   omitted at runtime, so unbounded controls stay unbounded). NOTE: a union cast `as number | undefined`
   in a template trips eslint `vue/no-deprecated-filter` — the `|` parses as a Vue-2 filter pipe; use
   `as number`. A shared `clampNumberControl(control, raw)` settles the value to the range **on blur
   only** (not per keystroke, so typing intermediate values isn't broken). **First `@vue/test-utils`
   component test** in the repo: `tests/unit/components/BaseNode.test.ts` (4 tests). GOTCHA captured
   there: import the store/registry chain (`@/stores/flows`) **before** `BaseNode.vue` — if BaseNode is
   the cycle entry point, `registry/components.ts`'s module-scope `markRaw(BaseNode)` runs with BaseNode
   undefined → crash (same circular-init hazard as the nodeRegistry guard test). `units`/`precision`
   display is a P1 follow-on and currently **0 controls define it** — don't build dead UI for it.
2. **per-node error badge — DONE** (AUDIT §G). `BaseNode` reads `runtimeStore.getNodeMetrics(id)
   .lastError` (reactive via `nodeMetricsVersion`) → red `.node-content` border (`--color-error`) + an
   `AlertTriangle` header badge with the message as its `title`. Two **runtime-store behavior fixes**
   were required (no prior runtime-store tests existed): (a) `addError`/`recordNodeError` now create a
   metrics entry if the node failed before ever running (was guarded by `if (metrics)` → first-frame
   failures showed no badge) — extracted into `setNodeError(nodeId, message)`; (b) `updateNodeMetrics`
   now clears `lastError` on success so the badge reflects live state, not a stale failure (errorCount
   and the `errors[]` log stay cumulative, so StatusBar/Debug are unchanged). Tests:
   `tests/unit/stores/runtime.test.ts` (4) + 2 added to `BaseNode.test.ts`.
3. **single-input edge replacement** (AUDIT §D) — in `addEdge` (`flows.ts`), replace the existing edge
   into a non-`multiple` target (registry via `useNodesStore` gives the `multiple` flag). **CAVEAT**:
   `onConnect` also calls Vue Flow's `addEdges()` independently (`EditorView.vue:133`), so a store-side
   replacement risks a store↔VF desync — must keep them in sync and verify in-app, not just unit tests.
4. **`random` sample-on-trigger** (AUDIT §E, `index.ts:284-298`) — needs a `trigger` input + reliable
   wired-detection (engine per-input edge-presence, or a mode control). Design first; don't guess.
5. **texture traps** (AUDIT §D P0) — shader `iChannel` + `displacement` via `resolveEffectSource`
   (`visual.ts:611-612`/`:1282`); make render-3d depth canvas-backed (copy `emulation.ts:88-110` blit).
   Hard to unit-test under happy-dom (WebGL); verify in-app.
6. **undo for param edits — DONE** (AUDIT §G P0). Wired at the **`updateControl` seam** (BaseNode +
   PropertiesPanel) — NOT in `flowsStore.updateNodeData`, which is also hit by engine-driven dynamic-port
   churn (`_dynamicInputs/_dynamicControls/_dynamicOutputs`) and would pollute history. New
   `recordParamEdit(nodeId, desc, mutate)` in `useFlowHistory` coalesces rapid edits (typing/dragging)
   into one debounced (500ms) entry via module-level burst state; a burst commits early when the edit
   target changes, when any structural action snapshots (`beforeAction` now calls `flushParamEdit`), or
   on undo/redo. GOTCHA captured in the test: `FlowSnapshot.timestamp` always differs between burst-start
   and flush, so the no-op/changed diff compares `nodes`/`edges` content only (the legacy `afterAction`
   full-snapshot compare is timestamp-fragile but works because its before/after are ~synchronous).
   Tests: `tests/unit/composables/useFlowHistory.test.ts` (7). **Follow-up (non-blocking):** the
   Code/Shader editor modals call `updateNodeData` directly and are still unrecorded — wrap them in
   `withHistory` (they're discrete saves, not rapid) when convenient.
7. **2b ctx accessors — DONE** (see the "extensibility primitives" section above). Factory + required
   accessors landed; the 25-helper refactor was found unnecessary (tests aren't typechecked) — migrate
   each helper to `makeContext` only when its executor adopts `ctx.num` (Phase 1+).
8. **Sub-task 4 policies** — checked-in `tests/contracts/public-exports.ts` must-not-break fixture
   (activates as a Phase-1+ gate); the `defineNode` deprecation policy is already in POLICIES.
9. **Phase 1+** — convert executors to `defineNodeState` (delete the 23×3 hardcoded gc/disposeAll),
   split `executors/index.ts`, derive `PURE_NODE_TYPES` (24-id exact set), then Phase-6 co-location that
   makes `nodeRegistry` authoritative + flips its count guard to strict `===`. **The per-type leak tests
   here exercise engine node-removal → MUST add a `canvas.getContext` mock to `tests/setup.ts`** first
   (the legacy visual gc touches canvas; happy-dom lacks it — see the lifecycle-wiring test gap).

### Key decisions/invariants for the next session
- Node ids are **opaque, no `/`** (subflow rebuild joins ids with `/`); the format uses `:` for edge
  endpoints. Never `.split('/')` an id.
- `defineNode` is a **frozen contract** — additive optional fields only; retire via deprecation + a
  node-data `migrate()` (POLICIES §2).
- Honor `strategy/05` DON'T-OVERCLAIM (never claim raw GPU/DSP perf, "scales to huge graphs", deep
  hardware interop, GC-free, touch-first authoring). Positioning = open/durable/accessible.

---

## 2026-06-28 — v1.2.14: CONFIRMED working + stripped OpenCV debug logging

User confirmed in their browser: **OpenCV CV nodes paint** (the v1.2.12 worker init + MessageChannel
port fix landed) **and** the **emulator survives going off-screen** (v1.2.13). Both the long
"CV nodes never paint" saga and the emulator off-screen crash are RESOLVED.

Cleanup shipped here:
- `opencv.worker.ts`: `DEBUG` flipped to **false** (lifecycle logs are gated behind it — one flip to
  re-enable the load→ready→process→result trace if CV ever regresses). Removed the unconditional
  top-level boot log.
- `OpenCVService.ts`: removed the two diagnostic `console.info`s (`spawning worker`, `worker reported
  ready`). Real errors (`console.error`, node `_error` output) are unchanged.
- Production CV console is now quiet. Gates green (typecheck / lint / test:unit 1494 / build:web).

No open OpenCV/emulator items remain. (Deferred, unrelated tech debt still in the architecture-audit
notes below: shared `WorkerFacade` is only mock-tested for AIInference; built-in nodes aren't authored
as isolated packages like `CustomNodeLoader`; `executors/index.ts` mixes aggregation + inline executors.)

---

## 2026-06-28 — v1.2.13: emulator survives Vue Flow virtualization (off-screen crash)

User report: the Emulator node crashes (`RuntimeError: Aborted(undefined)` from the libretro core,
then `Cannot read properties of null (reading 'classList')`) when the node is scrolled/zoomed
partially off-screen. Root cause: `EditorView.vue` sets `:only-render-visible-elements="true"`, so
Vue Flow **unmounts** off-screen nodes. `EmulatorNode.vue`'s `onUnmounted` tore the emulator down on
EVERY unmount — `unregisterEmulator()` + `removeChild(host)` — ripping the EmulatorJS WebGL canvas
out of the DOM → context loss → core abort → EmulatorJS error path hits a now-null element. The
existing `onActivated`/`onDeactivated` park/dock only covered KeepAlive tab-switches, not
virtualization. (Not related to the OpenCV/WorkerFacade work — separate subsystem.)

Fix — decouple the emulator's lifetime from the node component's mount:
- **`EmulatorNode.vue` `onUnmounted`**: if the node is still in `flowsStore.activeFlow.nodes`
  (virtualized, just off-screen) → `parkHostOffscreen()` and KEEP it alive; only on real removal
  (node deleted / flow closed) → `unregisterEmulator()` (frees loader/texture/host). `onMounted`
  now RE-ADOPTS a still-running emulator via `getEmulatorLoader(id)` + `loader.getHost()` (re-dock,
  reuse loader, refresh callbacks — preserves the captured texture/audio) instead of booting anew.
- **`emulation.ts`**: new `getEmulatorLoader(nodeId)`; `cleanupEntry` gained a `removeHost` flag so
  `unregisterEmulator`/`gcEmulationState` (node gone) remove the parked host, but `disposeAll`
  (flow stop, component still mounted) does not.
- **`emulatorjs.ts`**: `EmulatorJSLoader.getHost()`.
- Bonus: the emulator now keeps running AND keeps outputting its captured texture while the node is
  virtualized off-screen — matching the expectation that it's an "off-screen canvas". Triggers
  (start/stop/reset inlets) no-op while virtualized (callbacks bound to the unmounted instance) and
  refresh on re-mount — acceptable since the node is off-screen.
- Gates green (typecheck / lint / test:unit 1494 / build:web). **Confirmed working in the user's
  browser** (couldn't headless-repro Vue Flow node virtualization with a live ROM).

---

## 2026-06-27 — v1.2.12: OpenCV worker ACTUALLY works (init + port comms)

Root-caused via a local Playwright repro (the key move — opencv is same-origin now, so it loads
headlessly). Two distinct worker bugs, both fixed; validated end-to-end against the BUILT worker
chunk (load → ready → process → Canny → result, incl. the MOG2/video module):

1. **Init never completed.** opencv.js 4.9.0 is the Promise-returning MODULARIZE build; awaiting that
   Promise (self.cv) HANGS in a dedicated worker because its resolution is deferred through a
   postMessage-based `setImmediate` that never fires (self.postMessage in a worker goes to the
   parent, not back). Fix: the CANONICAL pattern — set `Module.onRuntimeInitialized` BEFORE
   importScripts and read `cv.Mat` off the Module synchronously in that callback. Never touch the
   promise. (`opencv.worker.ts` rewritten to a top-level Module hook + lazy one-time `startLoad` +
   synchronous `handleProcess`.)
2. **Messages were intercepted.** opencv/emscripten installs a capturing `self` 'message' listener
   (its setImmediate emulation), which entangled the facade's `self.postMessage`/`onmessage` traffic
   (responses didn't arrive; the 2nd message wasn't received). Fix: route ALL facade↔worker comms
   over a dedicated **MessageChannel port** — opencv's `self` listeners never see it. Added opt-in
   `usePort` to `WorkerFacade` (port handshake + `_send`/terminate close); `OpenCVService` enables
   it; the worker adopts `event.ports[0]` and replies via `respond()`.

Other: kept the self-hosted `/vendor/opencv/4.9.0/opencv.js` (same-origin importScripts works and
is fast). Gates green (typecheck / lint / test:unit 1494 / build:web). Repro scripts were in scratch
(not committed).

### Post-deploy audit (2026-06-28) — clean
Audited the shipped diff (3 files) for regressions:
- **All 9 cv ops intact** (grayscale/canny/threshold/blur/morphology/contours/corners/optical-flow/
  background-subtraction) and the per-node Mat discipline survived the worker rewrite: `prevGrayByNode`
  /`subtractorByNode` + `disposeNode`/`disposeAllNodes`/`safeDelete`; `handleProcess` frees `scratch`
  + `src` in `finally`; optical-flow `prevGray` retention preserved. `handleProcess` is now fully
  synchronous (no `await`).
- **`WorkerFacade` change is safe for `AIInference`.** `usePort` defaults `false`, so AIInference keeps
  the original `w.onmessage` path; `_send` falls back to `worker.postMessage`; `terminate` skips the
  port. Port mode is strictly opt-in (only `OpenCVService` sets `usePort=true`). NOTE for future work:
  AIInference is exercised only via mocks in unit tests, so this base change isn't runtime-covered —
  it's behavior-preserving by construction, but a smoke test of an AI node after any `WorkerFacade`
  edit is wise.
- In port mode the worker's `self.onmessage` is left unset after the handshake, so opencv's stray
  `self` setImmediate messages are simply dropped (correct — they must not reach the facade).

### RESOLVED (v1.2.14)
- User confirmed CV nodes paint in their browser. `DEBUG` flipped to `false` (logs gated, one flip to
  re-enable) and the facade's diagnostic `console.info`s removed in v1.2.14.

---

## 2026-06-26 — v1.2.10: self-host opencv.js (CV worker was never loading)

Decisive runtime evidence from latch.design (v1.2.9): the console showed `[OpenCV] spawning
worker` and then NOTHING from the worker — no `[OpenCV worker] importScripts`, no ready, and the CV
nodes sat on "NO TEXTURE" with no error (the 60 s timeout lives inside `ensureLoaded`, which never
ran). Meanwhile the module AI worker logged `[AI Worker] Ready` and detection painted. So the
worker spawned but its `importScripts('https://docs.opencv.org/4.9.0/opencv.js')` never produced a
ready runtime — consistent with the long-standing note that the docs.opencv.org CDN is "too slow"
to finish loading (a synchronous 10 MB cross-origin `importScripts` that stalls).

Fix:
- **Vendored opencv.js same-origin**: `public/vendor/opencv/4.9.0/opencv.js` (the exact 4.9.0 build,
  verified to initialize). Worker now `importScripts('/vendor/opencv/4.9.0/opencv.js')` — fast,
  Netlify-served, no cross-origin/COEP variable. (Kept the worker CLASSIC so `importScripts` works
  and emscripten still detects the worker environment; a module worker would have needed fetch+eval
  and broken opencv's `ENVIRONMENT_IS_WORKER` detection.)
- **Boot + message diagnostics**: a top-level `[OpenCV worker] booted (classic)` log (if absent →
  the classic worker itself isn't executing, a deeper worker-load issue → switch to a module worker)
  and a per-message log. `DEBUG` still on.
- Also: OpenCV **op failures now surface on the node** (`_error`), and `sourceToImageData` skips a
  video-backed texture until `readyState >= 2` (no black warmup frame); a not-ready supported source
  no longer flashes a misleading "Unsupported source" error.
- Gates green (typecheck / lint / test:unit 1494 / build:web; vendor file copied to dist).
- **TODO once confirmed painting**: flip `DEBUG` off; consider trimming the vendored build.

---

## 2026-06-26 — v1.2.9: OpenCV worker init hardening + diagnostics

Follow-up to v1.2.8 (OpenCV → Web Worker). Reported: CV nodes no longer freeze the page but
never paint. Investigation: opencv.js 4.9.0 is the **Promise-returning MODULARIZE build**
(verified by loading it in Node — `factory()` yields a thenable that resolves to a runtime with
`cv.Mat`); the app is **COEP credentialless** (vite + netlify.toml + coi-serviceworker), under
which the worker's cross-origin `importScripts` is allowed. So neither the build type nor COEP is
an obvious blocker — the failure is browser-/worker-only and wasn't observable from here.

Shipped to make the failure self-diagnosing rather than silent:
- **Hardened worker init** (`opencv.worker.ts`): pre-sets `Module.onRuntimeInitialized` AND handles
  the Promise return AND an already-ready check (idempotent `finalize`), plus a **60 s timeout** so
  a stuck init rejects with a clear message instead of leaving the node on "loading" forever.
- **Load failures surface ON the node** (`OpenCVService.getLoadError()` → executor sets `_error`
  "OpenCV failed to load: …"), and the facade no longer re-posts `load` (no 10 MB re-download
  storm) on failure.
- **Lifecycle logging** (`DEBUG = true` in `opencv.worker.ts`): spawn → importScripts → cv typeof/
  thenable → runtime ready → first process (with input pixel sample to detect a black source) →
  first result. **TODO: flip `DEBUG` off once the in-browser paint path is confirmed.**
- Open question the trace answers: does the runtime become ready in the worker (init hang?), does a
  process run, and is the source frame non-black? Where the `[OpenCV ...]` logs stop = root cause.
- Gates green (typecheck / lint / test:unit 1494 / build:web); worker still classic + importScripts.

---

## 2026-06-26 — v1.2.7: detection stop/restart fix + OpenCV freeze fix

Two user-reported bugs. Shipped as v1.2.7.

### Detection nodes dead after stop→restart — FIXED ✓ (high confidence)
`disposeAllAINodes()` (on stop) flags every AI node disposed so in-flight detect/transcribe
promises don't write into the just-cleared cache. But the only thing that CLEARS that flag —
`gcAIState` — runs only when nodes are REMOVED from the graph, not on a plain restart. So after
stop→start on the same graph, detection/STT/depth nodes stayed flagged disposed and their async
results were silently dropped until a page refresh. Fix: `resetAINodeDisposal()` (clears the set),
called from `ExecutionEngine.start()`. Confirmed by the code path.

### OpenCV nodes freeze the page — STILL OPEN; root cause confirmed, real fix = Web Worker
User report: any OpenCV node makes the page **freeze/unresponsive immediately** (not OOM, not a
specific node). v1.2.7 pinned the loader off the floating `docs.opencv.org/4.x` alias (it had
silently jumped to a ~11 MB **4.13.0** build) to **4.9.0**, and added a ≤1280px CV resolution cap.
**The user confirmed v1.2.7 did NOT fix the freeze** → it is **not version-specific**: the freeze
is inherent to loading/initializing a **~10 MB opencv.js on the MAIN thread** (parsing 10 MB of JS
+ instantiating the WASM blocks the UI thread; any cv node triggers it). Confirmed: opencv.js never
finishes initializing in a headless sandbox either. Ruled out by audit: per-frame Mat leak (freed
in `finally`), capped error array, GPU-texture leaks. WebGPU is N/A (opencv.js is CPU/WASM).

**REAL FIX (open task): move OpenCV into a Web Worker.** Load opencv.js + run all cv ops in a
worker (off main thread), mirroring the existing AI worker (`ai.worker.ts` + `AIInference.ts` +
the `runLiveDetection` deferred fire-and-cache executor pattern). Texture I/O stays on main.
Full plan: **`docs/plans/OPENCV_WORKER_MIGRATION_2026-06-26.md`**. Kept in place going in: the
4.9.0 pin + the `CV_MAX_DIM=1280` cap in `sourceToImageData` (both still useful).

#### IMPLEMENTED (worker migration) — needs a real-browser confirm ✓ pending
- **`services/visual/opencv.worker.ts`** (new): CLASSIC worker (spawned without `{type:'module'}`
  so `importScripts('https://docs.opencv.org/4.9.0/opencv.js')` works). Lazy-loads opencv.js on the
  worker thread (no main-thread freeze), runs all 9 ops, copies each result Mat out as RGBA bytes
  (`matToRGBA`, no OffscreenCanvas/imshow needed), and transfers the buffer back. Every transient
  Mat freed in `finally`; per-node persistent Mats — optical-flow `prevGray`, MOG2 subtractor —
  live worker-side keyed by nodeId, freed on `dispose`/`disposeAll`.
- **`services/visual/OpenCVService.ts`** (reworked): worker facade — promise-per-request keyed by
  id, `isReady()/isLoading()/load()` (resolves on the worker's `ready` msg), `process(nodeId, op,
  params, imageData)` (copies pixels into a fresh transferable so upstream ImageData isn't
  detached, transfers both ways), `dispose(nodeId)`/`disposeAll()`. Old `getCV()` removed.
- **`engine/executors/opencv.ts`** (rewritten): shared `runCvNode()` deferred runner — throttle by
  `interval`, one in-flight op per node, serve last texture + cached scalar outputs every frame,
  update when the async result lands (guarded by `isOpenCVNodeDisposed`). `sourceToImageData` + the
  `CV_MAX_DIM=1280` cap + texture create/update stay on main. `disposeOpenCVNode`/`gcOpenCVState`/
  `disposeAllOpenCVNodes` now also free the worker's per-node Mats; `resetOpenCVNodeDisposal()` is
  wired into `ExecutionEngine.start()` (stop→restart safety, same as the AI fix above).
- Gates green: typecheck / lint / `test:unit` (1494 pass; `opencv.test.ts` rewritten to the worker
  facade) / build (emits a separate classic `opencv.worker-*.js` chunk). **Still TODO: confirm in a
  real browser** (`npm run dev`, webcam → cv-canny → main-output) that the page no longer freezes
  and the cv output renders/updates — opencv.js doesn't load in headless sandboxes. Also re-check
  cv-optical-flow + cv-background-subtraction (stateful) and stop→restart.

#### FOLLOW-UP — architecture audit + shared worker facade (same session)
A 3-agent deep audit (node authoring / worker threading / monolith+docs) found the backbone sound
(flat executor map, real async model, ~100% dispose/gc discipline) with two real gaps: (1) built-in
nodes are split across `registry/<cat>` + `executors/<cat>` and NOT authored as isolated units like
`CustomNodeLoader`'s `definition.json`+`executor.js` packages; (2) the worker facades were ~70%
duplicated boilerplate (the OpenCV migration above had cloned `AIInference`).
- **`services/worker/WorkerFacade.ts`** (new): shared main↔worker RPC base — promise-per-request by
  numeric id, pending map, optional per-request timeout, progress forwarding, transferables, and
  reject-all on crash/terminate. Subclass provides only `createWorker()` + `handleMessage()`.
- **`OpenCVService` + `AIInference`** now `extend WorkerFacade`. AIInference kept its public API and
  all ~15 `sendToWorker(...)` call sites (now a thin wrapper over `request()`); removed its private
  pending-map/id/timeout/onerror plumbing. OpenCVService gained a 30 s per-op timeout (a hung op now
  self-recovers next frame instead of sticking "pending"; `load` stays untimed — it downloads 10 MB).
- **ESLint guard** (`.eslintrc.cjs` override): `opencv.worker.ts` may not use ES `import`/`export`
  (would flip Vite to a module worker and silently break `importScripts`). Verified active on that
  file only.
- NOT done (deferred, low-value/high-churn): converging built-ins onto the custom-node package
  layout; splitting `executors/index.ts`'s inline executors; a `docs/executor-authoring.md` guide;
  refreshing the stale `docs/architecture/ARCHITECTURE.md`. Worker `terminate()` deliberately NOT
  added to `disposeAll()` — that runs on every engine stop, and tearing down the worker there would
  force a 10 MB opencv re-init each restart (the AI worker is a warm page-lifetime singleton too).
- Gates green after refactor: typecheck / lint / `test:unit` (1494) / build (worker types unchanged:
  opencv classic + `importScripts`, ai module).

---

## 2026-06-25 — v1.2.6: detection annotation UI + resizable, hi-dpi Main Output

User asked to make the detection overlay annotations "so much better", raise the view
resolution, make Main Output arbitrarily resizable, and give each detected class a distinct
color. Web-researched Ultralytics + Roboflow `supervision` annotator source for the specifics.
Branch `detection-ui-polish`, 2 commits, gates green, shipped as v1.2.6.

- **Annotation rendering** (`registry/ai/utils/mediapipe-drawing.ts` `drawBoundingBox`): line
  width `max(round((W+H)/2*0.003),2)` and font `max(round(0.0175*(W+H)),12)` scale to image
  resolution; rounded corners; optional `corners` (L-brackets) and `filled` styles; the label
  tag flips to inside-top when it would clip the top edge and clamps to the left/right edges;
  label text color chosen by YIQ luminance (`lum>0.6 ? black : white`) so it's readable on any
  box color.
- **Per-class colors** (`ai.ts`): boxes use the Ultralytics 20-color palette, indexed by COCO
  class (stable per class, hash fallback) — `person` always the same color, every class distinct.
  New **Box Style** (outline/corners/filled) and **Box Colors** (per-class / uniform) controls on
  both detection nodes; **Line Width 0 = auto**. HUD is a rounded pill with a status dot.
- **Main Output** (`MainOutputNode.vue`): drag-to-resize corner handle (zoom-aware, persisted via
  `flowsStore.updateNodeData`, min 160×90 / max 1280×720), reset-to-input-aspect button, replacing
  the old binary expand toggle. Preview canvas + inline `TexturePreview` thumbnails now size the
  backing buffer to display×devicePixelRatio (capped 2) → crisp instead of a tiny upscaled buffer.

**Verified (Playwright + real WebGL):** rendered a multi-class annotation scene to PNG and
eyeballed it — distinct per-class colors, readable labels on every color, the top-edge label
flipping inside, corners/filled styles. Drove the Main Output resize handle: node grew 320×180 →
640×400 (zoom-aware delta correct). App boots 0 console errors; gates green (typecheck, lint,
test:unit 1493, build). **Lesson applied:** verify a texture *effect/overlay* by reading back
rendered pixels / screenshotting, not just "returns a texture" (see [[latch-video-texture-black]]).

---

## 2026-06-25 — v1.2.5: fix shader effects rendering BLACK for webcam/video sources

**User-reported:** the new image-fx nodes "don't paint" — they (and the older blur /
color-correction / displacement / transform-2d effects) rendered **black** when fed a
**webcam/video** source. Branch `imagefx-video-fix`, 2 commits, gates green, shipped as v1.2.5.

**Root cause:** these GPU effects sample their input as a texture (`iChannel0` / `u_texture`).
The Webcam node's `texture` output is a **video-backed THREE.Texture** (`createTexture(video)`),
and Three can't upload a video-backed texture through the offscreen `ThreeShaderRenderer` — it
samples BLACK. This is the **same** video-texture issue as v1.2.1, which only fixed the
`renderToCanvas` *read* path, not the *sampler* path. (My initial browser "verification" missed
it: I compiled+rendered the shaders WITHOUT binding iChannel0, so a blank result still looked
"OK". Driving the real executor with a captureStream-backed `<video>` reproduced the black.)

**Fix:** `resolveEffectSource(nodeId, renderer, input)` detects a video source (raw `<video>` or
a video-backed THREE.Texture), draws its live frame to a per-node 2D canvas, and samples a
**canvas-backed** texture instead — the same video→canvas trick the detection/OpenCV nodes use.
Canvas / render-target / image sources are unchanged. The per-node conversion canvas+texture is
freed in disposeVisualNode / gcVisualState / disposeAllVisualNodes. Applied to the 8 image-fx
nodes AND blur / color-correction / displacement / transform-2d.

**Verified (Playwright + real WebGL):** a captureStream `<video>` → each of glitch / blur /
color-correction / displacement / transform-2d now paints the source (was 0,0,0); canvas /
render-target / chained sources still paint (no regression). Gates green (typecheck, test:unit
1493, lint, build).

**Lesson for next time:** to verify a texture *effect* actually paints, bind a real source and
read back the OUTPUT pixels — "compiles + returns a non-null texture" is NOT proof it paints.

---

## 2026-06-25 — v1.2.4: 18 new nodes from the NODE_LIBRARY_REVIEW backlog

Built out the highest-value web-testable nodes from `docs/NODE_LIBRARY_REVIEW_2026-06-18.md`
(the curated 53-node backlog; the old MASTER/MODERNIZATION "deferred" lists are essentially
done). Node count **220 → 238**. Branch `nodes-visual-fx`, 6 single-purpose commits, all gates
green (typecheck, lint, test:unit **1493**, build), merged to `main` and shipped as **v1.2.4**.

- **Visual VJ FX (8):** `image-fx-{glitch,rgb-shift,pixelate,kaleidoscope,scanlines,posterize,
  dither,chroma-key}` — discrete one-effect shader nodes wrapping `ShaderPresets` via a shared
  `runImageFx` (visual.ts). Compiled material is cached under the nodeId, so the existing
  visual gc/dispose frees it (no new cleanup). 4 reuse existing presets; scanlines/posterize/
  dither/chroma-key are new GLSL presets (also added to the Shader-node dropdown).
- **AI (2):** `text-to-speech` (Web Speech API, main-thread, offline) and `depth-estimation`
  (Depth-Anything via a new `estimateDepth` worker task + AIInference facade; depth-texture
  output, grayscale or colorized).
- **Audio (3):** `audio-compressor` (with reduction meter), `audio-distortion`, `audio-bitcrusher`
  — Tone.js effects on the gain/filter template (generic audioNodes map = auto-cleanup).
- **Signal/timing (5):** `slew-limiter`, `derivative`, `integral`, `tween-to-target` (new
  `signal.ts`, gc wired into ExecutionEngine like spring) + `tap-tempo`. **+7 unit tests.**

### Custom-UI audit (requested) — CLEAN
All 26 existing custom node-UI components are imported into `registry/components.ts` AND mapped
to a key that matches a real node id (verified all 26); `CUSTOM_NODE_TYPE_IDS` derives from the
same map, so the flows store can't drift. All 18 new nodes correctly use `BaseNode` (texture/
number/audio outputs — no bespoke UI). `components/nodes/_archived/` holds 8 stale duplicate
UIs that are not imported anywhere (dead code; safe to delete).

### Verification (Playwright + headless WebGL against the dev server)
- ✓ All 8 image-fx shaders **compile + render** in real WebGL (the 4 new GLSL included).
- ✓ All 18 nodes register in the running app (238 total); **0 boot console errors**.
- ✓ Signal/timing covered by unit tests.
- ⚠️ `depth-estimation` is wired correctly (reached the worker, no error) but the model didn't
  finish downloading within the headless 5-min budget (fresh context = cold cache) — same
  download-on-first-use behavior as the other transformers.js models. **Verify live.**

### Deferred (harder tail of the selected families — NOT built)
`audio-granular` (buffer/grain player), `audio-recorder` (MediaRecorder + Blob/URL lifecycle),
`mouse-pointer` + `device-motion` (need a DOM/sensor input service with listener cleanup),
`timeline-keyframe` (keyframe data model + custom timeline UI). Plus the rest of the
NODE_LIBRARY_REVIEW Tier B/C/D (DMX/Art-Net/NDI/Spout/Syphon installation outputs, etc.).

---

## 2026-06-25 — v1.2.1 + v1.2.2 + v1.2.3 SHIPPED to prod (YOLOv10 + HUD + leak fix)

**Supersedes the "UNCOMMITTED" note in the 2026-06-24 entry — that work is now committed,
version-bumped to 1.2.1, and DEPLOYED.**

### `yolo-session-cleanup` — DEPLOYED as v1.2.3 ✓
Post-deploy audit of the detection-upgrades code found a WASM-heap leak: the worker's
`yoloSessions` map (one onnxruntime-web `InferenceSession` per model URL, ~29–102 MB each) was
never `.release()`d — `handleDispose`/`handleUnload`/`handleClearCache` only cleared the
transformers `pipelines` map (pre-existing since v1.2.1's `887d843`). Now released on dispose,
clearCache, and unload (keyed by model URL). Also corrected the `wasmPaths` comment:
onnxruntime-web is a **transitive** dep via `@huggingface/transformers` (not pinned in
package.json) — re-sync the pinned version with `npm ls onnxruntime-web` after a transformers
bump. Audit otherwise clean: YOLOv10 decode, HUD, and the wasmPaths pin all verified correct.

### v1.2.1 — DEPLOYED to production ✓
Committed the 2026-06-24 vision fixes in 4 clean commits, removed the temp `__latch` debug
hook, bumped `package.json` to **1.2.1**, merged to `main` (`8c77a71`), pushed. CI green
(lint/test 1482/build + Deploy Web); gh-pages at 8c77a71; **latch.design and
latch-flow.netlify.app both 200**. No git tag pushed (a `v*` tag triggers the Electron
desktop Release workflow — not wanted). Live now: the renderToCanvas video fix (vision nodes
no longer black), MOG2 hardening, detection aspect-ratio fix, YOLO ONNX wasmPaths fix, and
D-FINE-S / RT-DETRv2 model options on the live detection node.

### `detection-upgrades` — DEPLOYED as v1.2.2 ✓
Maintainer verified the YOLO node + HUD on localhost:5173; merged `detection-upgrades` → `main`
(`--no-ff`), bumped `package.json` to **1.2.2**, pushed (CI/Netlify auto-deploy). No git tag
(a `v*` tag triggers the Electron desktop Release — not wanted). All gates green at deploy
(typecheck, lint 0-err, test:unit 1486, build).
- **YOLOv10 (NMS-free) for the YOLO node** (`1ac7dd4`): YOLOv10's one-to-one head outputs
  `[1,300,6]` = `[x1,y1,x2,y2,score,classId]` (xyxy in letterboxed 640-space, score 0–1,
  class explicit) → decode is threshold + un-letterbox, no NMS. `handleYoloInfer` branches on
  output shape (`isYolov10Output` → `parseYolov10Output`, else the v8/v9 argmax+NMS path).
  **Format confirmed empirically** — ran `onnx-community/yolov10s` on bus.jpg → exact ground
  truth `{bus:1, person:4}`. **Default model changed to YOLOv10-S (~29 MB)** from GELAN-C
  (~102 MB); YOLOv10-M + YOLOv9 kept. +4 unit tests (14 yolo tests).
- **Detection HUD + per-class colors** (`879bce8`): a status bar (count · top label · last
  inference latency ms) burned into the annotated frame (shows on the node preview AND the
  main output); per-class box colors seeded by the Box Color control; HUD gated on Show
  Labels. This is the "annotate on the preview screen" ask.

### #3 GitHub Pages — RESOLVED: do NOT enable
Enabling it would publish a **broken site**: the build uses absolute root paths (`/assets/…`,
`/coi-serviceworker.min.js`) with no CNAME, so on a `github.io/latch/` project page everything
404s (white screen; the COI service worker the app needs for `crossOriginIsolated` wouldn't
load either). Netlify serves at root, which is why it works. Leave Pages off — Netlify
(latch.design) is canonical. (Would need a `base:'/latch/'` build or its own custom domain.)

### Verification status
- **Verified:** renderToCanvas video fix (user-confirmed + repro); YOLOv10 format (empirical,
  ground-truth); all decode logic (unit tests); gates.
- **NOT yet confirmed in a real browser by the maintainer:** the YOLO node end-to-end
  (wasmPaths + YOLOv10 + worker), the HUD/per-class colors visually, and the D-FINE-S /
  RT-DETRv2 transformers.js models. The YOLOv10 harness used the same ort version + CDN
  wasmPaths + model + letterbox the app uses, so confidence is high.

### Next / backlog
- Test `detection-upgrades` on localhost (YOLO node + HUD), then deploy it (branch → main →
  CI/Netlify), same flow as v1.2.1.
- **WebGPU EP: deliberately deferred** — research found it ~2× SLOWER than WASM for detection
  in onnxruntime-web (GPU↔CPU readback overhead, ORT #18584). Revisit only with a real
  in-app benchmark.
- `ai.worker.ts` `ort.env.wasm.wasmPaths` pins the nightly `onnxruntime-web@1.26.0-dev…`
  version string — keep in sync with package.json on any dep bump.

---

## 2026-06-24 — Vision display fix (the headline bug), detection upgrades, v1.2.0 signed release

Long session. Shipped the **signed/notarized macOS v1.2.0 release** (open item #1, was blocked on
Apple), then chased and **fixed the real reason the vision nodes rendered black**, plus several
detection-node improvements. **All v1.2.1 code changes are UNCOMMITTED on branch
`v1.2.1-mog2-hardening`.** Gates green: typecheck, lint (0 err), `test:unit` (1482), build.

### #1 macOS signed release — DONE ✓
Maintainer settled the Apple agreement; re-ran the failed v1.2.0 Release workflow
(`gh run rerun 28075087766`). Both macOS jobs cleared notarize this time (proof: `✔ Finalizing
package` took 3.5–5 min each = the Apple round-trip; the step that 403'd before). Result: **9 clean
CI-named signed assets**, the **5 stale manually-uploaded unsigned assets deleted**, and the
**release body rewritten** (dropped the "unsigned/right-click→Open" caveat, added macOS Intel, fixed
asset names). Published, Latest, not draft.

### THE BUG: vision nodes render black — ROOT CAUSE FOUND & FIXED ✓ (user-confirmed)
Symptom: webcam→output painted, but webcam→**any canvas node** (snapshot / OpenCV / detection)→output
was **black**, with a `glTexStorage2D(0×0)` + `glCopySubTextureCHROMIUM: destination level must be
defined` + `glGenerateMipmap` console flood. This path was NEVER pixel-verified before v1.2.0 (only
executor wiring was — the "in-app paint proof" used a shader source, not a webcam).
- **Root cause (reproduced with the REAL renderer code via Playwright + fake webcam):**
  `ThreeShaderRenderer.renderToCanvas()` returns **fully black for a video-backed THREE.Texture** —
  Three can't upload an `HTMLVideoElement` source through this offscreen renderer (canvas sources
  work, video doesn't; `videoTexCenter` read `[0,0,0]` vs a `drawImage(video)` control `[74,255,20]`).
  snapshot/detection/OpenCV all read the webcam *as a texture* via `renderToCanvas` /
  `threeTextureToImageData` → black frame → black output. webcam→output only worked because the Main
  Output / TexturePreview components `drawImage(video)` directly.
- **Fix** (`ThreeShaderRenderer.ts`): `renderToCanvas` now draws video sources straight to the 2D
  target. Reproduced black → green. **User confirmed it works.**
- **Debugging note for next time:** I first shipped a *different* (real but secondary) resize-corruption
  fix and it did NOT help — `glCopySubTextureCHROMIUM: Offset overflows` (resize) ≠ the user's
  `destination level must be defined` (0×0) case. The video-texture-black is the confirmed root cause.
  Isolated repros are in the session scratchpad (`videotex.mjs`, `repro.mjs`).

### Other fixes (all on the branch, gates green)
- **MOG2 hardening (orig. item #2):** moved `new cv.BackgroundSubtractorMOG2(...)` inside the
  try/catch so a build lacking the `video` module degrades to a blank mask + `_error` instead of
  throwing the executor. **+1 unit test** (11 opencv tests). MOG2 still not runtime-confirmed (opencv
  CDN throttle persists — re-attempted, WASM didn't init in headless within 90s; environmental).
- **`updateTexture` resize hardening** (`ThreeShaderRenderer.ts`): tracks uploaded dims on
  `texture.userData`, disposes+reallocs on a size change (the emulator's documented `Offset overflows`
  flood). Verified by repro. **Separate from the headline bug** — candidate for its own commit.
- **Aspect-ratio fix** (`ai.ts` `threeTextureToImageData`): was squishing every source to a square
  512×512 (distorting a 640×480 webcam, misaligning boxes). Now honors `videoWidth`/`videoHeight`.
  ⚠️ typechecks, low-risk, NOT runtime-verified.
- **YOLO node WASM 404 fix** (`ai.worker.ts`): the raw `import 'onnxruntime-web'` is a SEPARATE ORT
  instance from the one transformers.js bundles (old comment claimed otherwise), so its `wasmPaths`
  were unset → it fetched `.wasm` and got the HTML index page (`<!DO…` = the "magic word
  3c 21 44 4f" abort). Set `ort.env.wasm.wasmPaths` to the version-matched jsdelivr build (CDN
  verified serving 200; loads under credentialless COEP). ⚠️ **applied, NOT yet user-confirmed.**
  ⚠️ Version string pinned to nightly `onnxruntime-web@1.26.0-dev...` — KEEP IN SYNC with package.json.
- **Larger detection models** (`object-detection-live.ts`): added **D-FINE-S**
  (`onnx-community/dfine_s_coco-ONNX`, ~41 MB) and **RT-DETRv2 R18** (`onnx-community/rtdetr_v2_r18vd-ONNX`,
  ~81 MB) — both NMS-free transformer detectors that run through the existing generic transformers.js
  `detectObjects` pipeline (no new post-processing). ⚠️ NOT verified in-app.

### Model research (delegated, verified) — for the "bigger realtime models" ask
- **WebGPU is NOT a free win for detection** — a DETR ran ~14s WebGPU vs ~8s WASM (ORT #18584;
  post-processing forces GPU↔CPU readbacks). Did NOT switch backends.
- **Top YOLO-node upgrade: `onnx-community/yolov10s`** — 29 MB (fp16 14.6, int8 7.6), **NMS-free**
  `[1,300,6]` output that's *simpler* to decode than the current NMS path. Needs a small new decode
  branch in `yolo.ts`/worker. Not yet implemented — proposed next step A.
- int8 = WASM size lever; fp16 = WebGPU speed lever (different levers).

### Open / next (await user)
- **A)** Implement YOLOv10s (NMS-free `[1,300,6]`) for the YOLO node.
- **B)** Dedicated detection HUD preview (count/FPS/top-label, per-class colors) — the "annotate on
  the preview screen" ask. NOTE: the detection node already burns boxes into its output texture and
  the node preview shows it, so this is polish, not a gap.
- **Commit** the v1.2.1 branch once the user confirms the YOLO/model/aspect changes in-browser.
- **#3 GitHub Pages:** deploy works (CI pushes gh-pages on every main push, confirmed); 404s only
  because **Pages is not enabled in repo settings** (`gh api .../pages` → 404). Netlify (latch.design)
  is canonical. Enabling is a one-time settings toggle — maintainer's call.
- **#5:** merged `modernization` branch deleted (local + origin).

### ⚠️ PRE-COMMIT TODO
- **Remove the TEMP `window.__latch` debug hook in `main.ts`** (DEV-only block, added to drive the
  headless repro). Must be stripped before committing.

---

## 2026-06-23 (verify + extend) — in-app paint proof, MOG2 node, throttle fix

Closed the last verification gap, extended the OpenCV set, and hardened the shared
detection loop. **12 vision nodes** now; gates green (typecheck, eslint 0-error,
`test:unit` 1480, build). Branch `modernization`. Commits `6cb4a3c`, `43e1ef7`.

### In-app full-graph paint — PROVEN (the last end-to-end gap)
Drove `shader(plasma) → snapshot(continuous) → main-output` in the running dev server via
a temporary dev-only `window.__latch` hook (reverted after — not committed): real engine,
146 frames, **snapshot output = 512×512 texture with real plasma pixels** (centerRGB
`[89,252,42]`, ~all samples non-zero) and **main-output received it** (`_input_texture`
set). Confirms the createTexture(canvas)→THREE.Texture→mainOutput→PixiJS path empirically
for every texture-output node (all share it). (cv-grayscale-in-app hit the opencv CDN
throttle — environmental; opencv load + cvtColor were already standalone-proven.)

### Extended — `cv-background-subtraction` (MOG2)
Persistent `BackgroundSubtractorMOG2` per node → foreground-mask texture + foreground pixel
ratio. The subtractor lives in the WASM heap and is `.delete()`d in
`disposeOpenCVNode`/`gcOpenCVState` — **unit-tested** (mirrors the optical-flow `prevGray`
discipline). OpenCV node count: 8 → **9**.
- **Audit fix:** the subtractor was created once, so the `history`/`varThreshold`/
  `detectShadows` controls were dead after frame 1. Now rebuilds (freeing the old) when the
  params change — **unit-tested**.
- **Caveat:** MOG2 itself isn't runtime-verified (the opencv.js CDN throttled every smoke
  attempt today). It uses the documented opencv.js API (`new cv.BackgroundSubtractorMOG2`),
  lives in the same `video` module as the proven optical-flow path, and degrades gracefully
  (try/catch → blank mask) if absent.

### Fixed — `runLiveDetection` throttle startup eagerness (`43e1ef7`)
The shared loop read `lastFrame` with a `0` default and gated on `!lastFrame`, so a stored
frame 0 read as "never ran" and re-fired detection every frame at startup (guarded from
pile-up by `pendingOperations`, but wasteful). Now uses a `-1` sentinel. Found by the new
**runLiveDetection tests** (throttle + cache + topLabel) covering both Tier A and Tier B.

### State
Vision total: **12 nodes** (snapshot, object-detection-live, object-detection-yolo, 9× cv-*).
**23 vision unit tests** (10 opencv + 10 yolo + 3 live-detection). Bumped to **v1.2.0**;
merged to `main` (PR #2) and released the Electron build.

---

## 2026-06-23 (Tier B) — YOLOv8/v9 ONNX detection node (onnxruntime-web)

Built the Tier B node the entry below deferred. Raw YOLO detection via
**onnxruntime-web in the worker**, browser-proven end-to-end. Gates green
(typecheck, eslint 0-error, `test:unit` 1476, build); **+10 unit tests**.
Branch `modernization`, **not pushed**. Commit `446b19a`.

### Shipped — `object-detection-yolo` (ai)
- **`services/ai/yolo.ts`** — pure, layout-robust post-processing: `parseYoloOutput`
  (decodes `[1,84,8400]` *or* transposed `[1,8400,84]`; cxcywh→xyxy; undoes letterbox
  scale/pad → original coords; per-class conf filter), `nms` (per-class greedy, agnostic=
  false), `iou`, `COCO_LABELS`. **10 unit tests** (`tests/unit/services/yolo.test.ts`).
- **`ai.worker.ts`** — `import * as ort from 'onnxruntime-web'` (the same singleton
  transformers already configures at import, so wasm just works); lazy `InferenceSession`
  per model URL (cached, failed loads not cached); `OffscreenCanvas` letterbox → CHW
  float32 `[1,3,640,640]`; runs, then `parseYoloOutput`+`nms` with `numClasses=80`.
  Branches in `handleInfer` on `method==='detectYolo'` before the pipeline lookup.
- **`AIInference.detectYolo(image, modelUrl, threshold, iou)`** — same return shape as
  `detectObjects`; 5-min worker timeout (first call downloads the model).
- **Node + executor** — `object-detection-yolo` reuses the live-overlay loop, which I
  **refactored into a shared `runLiveDetection(ctx, detect, opts)`** so Tier A
  (`object-detection-live`) and Tier B share one code path (the only diff is the `detect`
  fn + controls). Default model **gelan-c** (`Xenova/yolov9-onnx`, ~102 MB, CORS-ok);
  `modelUrl` is an editable select so users can point at a lighter `yolov8n.onnx`.

### Verified
- **Definitive real-image proof** (Chrome via Playwright, stable ort 1.20.1 from jsdelivr):
  ran the actual `gelan-c.onnx` on the classic `bus.jpg` (810×1080) with yolo.ts's exact
  parse+NMS inlined → **`{ bus: 1, person: 4 }`**, the exact ground truth, scores 0.81–0.95,
  boxes landing on the subjects in image-pixel coords. This empirically settles the three
  things the format-only smoke left open: **scores are sigmoid'd (0–1, not logits)**,
  **output dtype is Float32Array**, and **letterbox + `(coord−pad)/scale` decode is correct**.
  Output confirmed `[1,84,8400]` (input `images`, output `output0`); used the identical ort
  API the worker uses (`InferenceSession.create`/`Tensor`/`run`/`inputNames`/`outputNames`/`dims`).
- **Build bundles ort into the worker** (webworker chunk) — no Vite/worker errors.
- Why YOLOv9/GELAN not YOLOv8: the clean COCO `yolov8n` ONNX repos are gone (401);
  `Xenova/yolov9-onnx` is public + CORS + the model behind Xenova's in-browser demo, and
  YOLOv9's detection head output is byte-format-identical to YOLOv8 — same pre/post.

### Open / not done
- The shared **`runLiveDetection`** loop (refactored out of the Tier A executor; now used by
  both detection nodes) has no direct unit test — it's a faithful extraction (typecheck +
  build + 1476 tests green, and the YOLO detect path is real-image-proven through it), but a
  throttle/cache test would lock the shared infra. Low risk; good next target.
- gelan-c is ~102 MB — heavy first load; surfaced in the node's Loading output + info.

---

## 2026-06-23 — Vision node families shipped (snapshot, live detection, OpenCV.js)

Implemented the three families planned in the entry below, per
`docs/plans/VISION_NODES_PLAN_2026-06-22.md`. **10 new nodes + one new service.** Gates green
throughout (typecheck, eslint 0-error, `test:unit`, production `build`); 8 new unit tests.
Branch `modernization`, **not pushed**.

### Shipped
- **`snapshot`** (visual, `b495ada`) — latch/hold a still from any texture feed on rising-edge
  `trigger` or `continuous`; `mirror`; outputs held texture + imageData + dims + `captured`
  pulse. gc via the existing `gcVisualState`/`disposeAllVisualNodes`.
- **`object-detection-live`** (ai, `e98ac6f`) — continuous YOLOS/DETR detection on a live feed
  with an **annotated-texture** output (boxes/labels drawn over the frame via
  `mediapipe-drawing.drawBoundingBox`). Reuses `convertToImageData` + `aiInference.detectObjects`;
  frame-skip throttle + `pendingOperations` guard + `getCached`. Dedicated `liveDetectState` map so
  the THREE.Texture is disposed in `gcAIState`/`disposeAllAINodes` (the generic nodeCache GC would
  drop the key without disposing the texture).
- **OpenCV.js** (`0e5d35e`, `ed223da`, `5651c8c`) — new `services/visual/OpenCVService.ts` (lazy CDN
  load, `load()/isReady()/isLoading()/getCV()`), new `engine/executors/opencv.ts`, new
  `registry/opencv/`. **8 nodes:** `cv-grayscale`, `cv-canny`, `cv-threshold` (fixed/Otsu/adaptive),
  `cv-blur` (gaussian/median), `cv-morphology`, `cv-contours` (+contour data), `cv-corners`
  (Shi-Tomasi), `cv-optical-flow` (Farneback, HSV viz, +mean-motion). New category wired into
  `builtinExecutors`, `allNodes`, and `ExecutionEngine` gc + teardown. Filed under category `visual`
  (left the `NodeCategory` union untouched). **Every `cv.Mat` `.delete()`d** in the op `finally` and
  in `disposeOpenCVNode`/`gcOpenCVState` — including the persistent optical-flow `prevGray`.

### Bugs found & fixed (build + 5 adversarial audit passes)
- **median-blur kernel throw** (`5651c8c`): `cv.medianBlur` asserts `ksize > 1`; a kernel of 1 from
  the slider threw → silent blank. Floored median at 3 (Gaussian is valid at 1). **Unit-tested.**
- **live-detection stale `loading`** (`023de06`): computed before the async kickoff → reported
  `false` on the triggering frame. Recompute at output time.
- **opencv.js thenable stray error** (`594fe61`): the docs.opencv.org `cv` global is an Emscripten
  thenable whose `.then()` isn't chainable, so `cvObj.then(...).catch(...)` threw an uncaught error
  on the happy path. Wrap with `Promise.resolve`. **Found by the real-browser test below.**
- **optical-flow resize wedge** (`71f5b9c`): Farneback needs both frames the same size; a mid-stream
  resolution change threw every frame and (since `prevGray` only updates on success) stayed blank
  forever. Now reseeds `prevGray` on size mismatch. **Unit-tested.**

### Verified
- **Real-browser proof** (Chrome via Playwright, page served with the app's `COOP:same-origin` +
  `COEP:credentialless`): `crossOriginIsolated` true, the cross-origin no-cors `opencv.js` `<script>`
  loads under it, WASM instantiates, and `cvtColor(RGBA→GRAY)` of pure red → **76** (=0.299×255).
  Confirms the novel CDN→WASM→Mat pipeline end-to-end. (One-off; not committed — hits a live CDN.)
- **Rendering path code-confirmed:** every new node outputs `createTexture(canvas)` → a THREE.Texture
  wrapping a real-pixel 2D canvas; `mainOutputExecutor` passes it through as `_input_texture` to the
  PixiJS display — **byte-identical to the shipping `webcam-snapshot`**. Outputs stay on the
  ThreeShaderRenderer context (display in Main Output/shaders; blank in 3D nodes — the documented
  3-context gotcha).
- **8 unit tests** (`tests/unit/executors/opencv.test.ts`, real invocation, cv + renderer mocked):
  median floor, transient-Mat frees, optical-flow `prevGray` retain→free-on-dispose, resize reseed,
  frame throttle.

### CDN decision (documented inline in OpenCVService)
`https://docs.opencv.org/4.x/opencv.js` — the **moving `4.x` alias is intentional**: docs.opencv.org
keeps only the newest 4.x build (4.10/4.11/4.12 all 404), so pinning a version is a time-bomb. Mirrors
the app's `@mediapipe/tasks-vision@latest` convention. Single-file build with the WASM embedded base64
(no sibling `opencv_js.wasm` — it 404s), so only the no-cors `<script>` is cross-origin → loads fine
under credentialless COEP. Don't "fix" it to a pinned version.

### Open / not done (by choice)
- **Live full-graph paint** (color/shader → cv/snapshot → main-output actually painting): not run.
  Path is code-confirmed identical to the shipping `webcam-snapshot` and the OpenCV half is
  browser-proven, so residual risk is low; a full e2e rig (dev store-hook + headless WebGL + PixiJS
  readback) wasn't judged worth it. Easy to add later — `flows` store exposes `addNode`/`addEdge`.
- **Tier B (YOLOv8-ONNX)** — deferred per the plan's gate ("only if YOLOS/DETR insufficient"; no
  evidence it is). Needs onnxruntime-web direct + letterbox + NMS + a hosted `.onnx`.
- **`object-detection-live`** not exercised against a live model (transformers.js download); logic
  mirrors the shipping `object-detection` node.

### State
Node count **+10 → 218** (prior entry: 208). Working tree clean, **nothing pushed**. Gates green:
typecheck, eslint (0 errors), `test:unit` (1466 pass), production `build`. Commits `b495ada`,
`e98ac6f`, `0e5d35e`, `023de06`, `ed223da`, `5651c8c`, `00b25aa`, `594fe61`, `71f5b9c`.

---

## 2026-06-22 (late) — Emulator + effects fully working; persistence data-loss fixed; vision nodes planned

User-confirmed: **"it all finally works."** Everything below shipped to `main` and is live
(GitHub Pages + Netlify). Gates green each deploy (typecheck, lint, 1458 unit tests, build).

### Emulator + texture pipeline — RESOLVED (closes the saga in the entry below)
- **Effect nodes were throwing on missing built-in uniforms (`fae1e2d`).** `render()`/`renderToScreen`
  in `ThreeShaderRenderer` set `uniforms.iTime.value`/`iResolution`/`iChannel0…` unconditionally, but
  `compileEffectShader` only creates the uniforms an effect declares (`u_texture`, …). `undefined.value`
  threw a TypeError every frame (swallowed by the engine) → **every effect node** (color-correction,
  blur, blend, displacement) rendered blank for **every** input. This — not the cross-context theory —
  was the real cause of "emulator texture won't work in other nodes." Fixed by guarding each built-in
  uniform. (Two prior misfires on this: a `needsUpdate` fix that sat *after* the throw, and the
  cross-context analysis. Reading it to the actual TypeError cracked it.)
- **Effect resolution preserved (`5b802d4`).** `render()` now defaults its output size to the input
  texture's resolution (from `u_texture.image`, which also carries size for render-target inputs) so a
  non-square source (emulator 958×684) isn't squished into 512². Generative shaders keep 512².
- **Emulator capture (`4096012`) + texture realloc on resize (`9629507`).** Blit the WebGL canvas
  through an intermediate 2D canvas (a WebGL canvas is an unreliable cross-context texture source);
  recreate the THREE texture when the frame size changes (killed the `glCopySubTexture` flood).
- **Control-tab freeze (`fd89420`).** KeepAlive deactivates the editor on the Control tab → detaches the
  emulator canvas → EmulatorJS stops painting. EmulatorNode now renders into a managed host that parks
  off-screen-but-attached to `<body>` on deactivate (keeps painting) and docks back on activate, pinning
  the host+canvas size so it can't resize. User-confirmed working.

### Persistence — silent data-loss fixed (`b2c73f1`, `bfa80cc`)
Imported flows now persist to IndexedDB; the Save button writes to the DB (was: clear dirty + download
only, which also suppressed autosave); a `beforeunload` guard warns on web (no-op in Electron so it
can't block quit); node-drag marks dirty; `markFlowSaved(flowId)` clears the saved flow not the active
one; `saveAllFlows` preserves each non-active flow's stored connections. See AUDIT_2026-06-19.md pass 2.

### Next up — new vision node families (planned this session)
User wants: (1) a **generic snapshot node** (capture a still from any video/texture feed on trigger),
(2) **AI-on-live-video** (object detection — YOLOS/DETR via Transformers.js, optional YOLOv8-ONNX),
(3) **OpenCV.js** image-processing nodes. Full plan + a ready-to-paste kickoff prompt in
**`docs/plans/VISION_NODES_PLAN_2026-06-22.md`**. Key facts grounding it: there's already a
webcam-specific `webcam-snapshot` (no generic equivalent), a Transformers.js `object-detection` node
(YOLOS already a registered model) and a MediaPipe `mediapipe-object` node (both output data only, no
annotated texture), `onnxruntime-web` is present transitively via transformers, OpenCV is net-new
(CDN lazy-load like MediaPipe; Mats MUST be `.delete()`d via the gc/dispose path).

---

## 2026-06-22 — Wire-preservation, public-readiness, emulator texture saga; all shipped to main

Branch `modernization`, fast-forwarded to `main` and **deployed** (GitHub Pages + Netlify) several
times this session. All green each deploy: typecheck, lint, **1456 unit tests**, build.

### Shipped (on `main`)
- **Copy/paste/duplicate/snippet now preserve wires.** New tested flows-store actions
  `serializeSelection` (capture a selection + only its internal edges) + `insertSubgraph` (clone
  with fresh ids, remap internal edges). Fixes the headline "wires lost on paste/snippet" bug.
- **Public-readiness:** added `LICENSE` (MIT) + `CONTRIBUTING.md`, refreshed stale docs (node count
  133+/196 → 208, `dev:electron` command, test counts), untracked `.DS_Store`, moved the stray
  design-system mockup into `docs/`.
- **Test hardening:** strengthened `insertSubgraph`/subflow/heal/duplicate assertions, added the
  connect-throttle test + Electron-bridge global checks in `code.test.ts`; added `@vitest/coverage-v8`
  (the `test:coverage` script had no provider). flows.ts coverage 38%→81%. Mutation-tested the new
  guards (both caught).
- **Debug console** now renders each log as its own card (type badge + timestamp + body), not a flat
  stream.
- **Emulator → texture** (multi-step saga, see below).

### Emulator saga (resolved for the editor; two items still open)
1. **Capture fix (shipped):** the executor blits the emulator's WebGL canvas into an intermediate 2D
   canvas, then textures from that — a WebGL canvas is an unreliable cross-context texture source.
   Fixed the editor freeze.
2. **Control-tab reparenting attempt (shipped then REVERTED):** parking the emulator host off-screen
   on view switch resized the canvas and caused a `glCopySubTextureCHROMIUM: Offset overflows texture
   dimensions` flood that corrupted the texture for *all* consumers. Reverted.
3. **Texture-size fix (shipped, current):** recreate the THREE texture whenever the frame size changes
   (`emulation.ts`) instead of uploading a larger canvas into stale storage. Killed the flood.

**Still OPEN (post-audit 2026-06-22):**
- **Cross-context texture (HIGH, NEW):** there are THREE live WebGL contexts — `ThreeShaderRenderer`
  (shaders + previews + emulator), `ThreeRenderer` (all 3D nodes), `UnifiedRenderer` (unused). A
  `THREE.Texture` uploaded in one context can't be sampled in another, so the emulator's texture (and
  any canvas/video THREE.Texture) is blank when fed to **3D nodes**. This is the real cause of "not
  working as texture in other nodes." Fix: in `3d.ts:convertToThreeTexture`, rebuild a
  Canvas/VideoTexture in the 3D context from `inputTexture.image` instead of returning the foreign
  texture (same pattern its raw-element branches already use). Same-context consumers (shaders, Main
  Output) work fine once the size flood is gone.
- **Control tab blank:** KeepAlive keeps `EditorView` mounted but *deactivates* it (detaches DOM), so
  the emulator canvas stops painting on the Control tab. The reparenting fix was wrong; the sound
  approach (app-root host, or only-on-the-canvas keep-rendered) needs local testing before deploy.

### TOP PRIORITY — persistence / silent data loss (2026-06-22 pass 2, see AUDIT re-audit pass 2)
The most severe open items: users can silently lose saved work on the public build.
- **Imported flows are never written to IndexedDB** → gone on reload (`importFlows` mutates store only;
  autosave watches only the active flow's dirty).
- **The "Save" button doesn't persist to the DB** (`AppHeader.saveProject` clears dirty + downloads a
  file, never calls `saveFlow`; clearing dirty also suppresses autosave).
- **No `beforeunload` guard** + 2s debounced autosave → recent edits lost on reload/crash.
- **Node drag never marks dirty** → layout reverts on reload.
- Plus: full `NodeDefinition` baked into every persisted node (bloat), no schema migration, no quota/
  eviction handling (can evict ALL saved flows), autosave can clear dirty on the wrong flow.
These rank ABOVE the texture bugs below — they lose real user work today.

### Other NEW audit findings (2026-06-22) — see AUDIT_2026-06-19.md re-audit section
- **`multiple: true` input ports drop all but the last edge** (HIGH, `ExecutionEngine.ts` `getNodeInputs`):
  Scene-3D / Group-3D expect an array but get one value, so only one wired object/light renders.
- MED/LOW: per-frame metrics serialization + reactivity bump; `renderToCanvas` per-frame canvas/array
  allocations on the scaled-readback path; FPS counter can latch to Infinity on a 0-delta frame.
- Correction: audit #10 (asset blob URL revoke) is already mitigated in `AssetStorage.deleteAsset`;
  only the orphan-node-ref half stands.

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
