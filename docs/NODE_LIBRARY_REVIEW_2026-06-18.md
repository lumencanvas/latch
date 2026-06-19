# LATCH — Node Library Review: Health, Gaps, Taxonomy & UX (2026-06-18, rev. 2)

A whole-repo audit, a missing-node gap analysis, a re-organization proposal, and — new in
this pass — a **UI/UX / end-user** review of how the library is *discovered, read, and
performed with*. Read alongside `docs/AUDIT_2026-06-16.md` (correctness/security/leaks —
not rehashed here) and `docs/nodes/README.md` (per-node docs; note its `196`/per-category
counts are stale). Target users throughout: VJs, creative coders, installation artists,
hardware hackers, IoT makers.

> **What changed since rev. 1 (pressure-tested against the actual code):**
> - The headline **"224 nodes" was an overcount.** A fresh count of declared
>   `category` fields gives **205 node definitions**, of which **only 203 actually
>   register** — `counter` and `sample-hold` are *id collisions* (same `id` in two
>   categories; the registry is a `Map` keyed by `id`, so the later import silently
>   overwrites the earlier one). Rev. 1's own appendix already summed to 204, not 224.
>   `data` is **34**, not 33. **`toggle` is *not* a duplicate** (it lives only in `code`).
> - The empty categories are **`shaders` and `custom` only.** `video` is **not** empty —
>   the emulator declares `category: 'video'` (`registry/emulation/emulator/index.ts:12`).
> - **The "add a tag layer" recommendation is half-built already.** `NodeDefinition`
>   has `tags?: string[]` (`stores/nodes.ts:101`) and fuzzy search *already* matches
>   `[name, description, ...tags]` (`stores/nodes.ts:138-144`). ~**70 of 205** nodes carry
>   tags. The fix is *populate + surface as filters*, not *design a system*.
> - The id collisions are a **live correctness bug**, promoted into Part 1.
> - New **Part 4 (Node & performance UX)** covers discovery, the node itself, the
>   control-exposure → Control Panel flow, custom-node UIs, and first-run — none of which
>   rev. 1 addressed.

> **Implementation status (first sprint, landed 2026-06-18):**
> - ✅ **Dedupe + guard (§1.1):** removed the dead `data/counter` and `code/sample-hold`
>   twins; `counter` now serves from `code` (rich/edge-triggered) and `sample-hold` from
>   `logic`/`utility` (its `latch`/`changed` family) — fixing the crossed def↔executor
>   wiring that left **both nodes broken**. Added a DEV duplicate-id warning in the nodes
>   store `register()` and `tests/unit/registry/registry-integrity.test.ts`.
> - ✅ **Subflow leak (§1.2#2):** added `gcSubflowState()` and wired
>   `clearAllSubflowContexts()`/`gcSubflowState()` into `ExecutionEngine.stop()` + the
>   per-node GC path.
> - ✅ **Tags pass (§3.1):** VJ-vocabulary tags added across visual/audio/timing/debug/
>   math/output **and** inputs/connectivity/3d/ai — tagged-node coverage **70 → 148 of
>   203** (all VJ-facing categories now covered; remaining untagged are name-discoverable
>   technical nodes — array-*/object-*/clasp-* — and a few custom-UI audio nodes). `echo`,
>   `noise`, `glitch`, `feedback`, `tempo`, `bpm`, `output`, `scope`, `donut`, `whisper`
>   now return results; the `shader` node's buried presets (glitch/plasma/noise/
>   kaleidoscope) are searchable.
> - ✅ **Category icons (§1.2#6):** extracted a single-source `categoryIcons` map
>   (`utils/categoryIcons.ts`), refactored `BaseNode` to consume it, and rendered
>   per-category icons (tinted with the category color) in both the sidebar palette and the
>   node-explorer `CategoryNav` — so the palette icon now matches the node-header icon.
> - ✅ **Tag filter-chips (§3.1#2):** the Node Explorer now shows the top tags for the
>   current category as toggle chips (`selectedTags` in the explorer store); selecting chips
>   narrows the grid (union match), composing with category + fuzzy search.
> - ✅ **Explorer/empty-state polish (§3.2, Part 4):** hid the empty `shaders`/`custom`
>   buckets from the explorer's CategoryNav, added a **port-type colour legend** to the
>   explorer (Part 4.1 — the data-type colours were undocumented), and rewrote the Control
>   Panel empty state to say controls appear there automatically.
> - ✅ **Reserve purple for AI (§3.2):** repointed the stray category purples
>   (`debug`→slate, `messaging`→cyan, `subflows`→lime) and the non-AI accent purples
>   (parametric-eq/EQ→cyan, synth section→blue, xy-pad point→pink) so the vivid `#A855F7`
>   now uniquely signals the AI sub-brand. (The `string` *data-type* port colour stays
>   violet — that's a separate type-colour axis, not a category colour; recolour only if
>   you want strings off purple too.) Also removed the orphaned `.category-color` CSS the
>   audit flagged.
> - ✅ **Testing pass:** added unit tests for the subflow GC, the duplicate-id `register()`
>   guard, `categoryIcons` exhaustiveness, the explorer tag-filter store, Color Ramp
>   preset↔palette sync, and full coverage for the Noise / Color Ramp / Euclidean executors
>   (suite now 1376 passing).
> - ✅ **Per-frame storms (carried, priority #2):** fixed the imageLoader asset-fail storm
>   (latched `loadedUrl` on the not-found/catch paths), the webcam-snapshot `getUserMedia`
>   re-prompt loop (a `failed` latch cleared on device/resolution change), and the
>   **http-request flood** (rising-edge + in-flight gate; unit-tested). A connectivity audit
>   precisely scoped the rest. Also fixed the **`BleAdapter` notification-listener leak**
>   (stored handler ≠ attached handler → stacked on reconnect; now removed via a shared
>   `detachNotificationListeners` helper, unit-tested). **Still open:** the mqtt/ws/http/BLE
>   connect backoff (no per-attempt throttle), `ConnectionManager.disconnect` error-masking →
>   wedged toggle, the shared-`autoReconnect` clasp mutation, and the
>   `createTextureFromWebGL`/`disposeObject`/`TextureBridge.gc` texture leaks (MED). The
>   feedback-buffer node is feasible but needs live GPU verification (not a blind ship).
> - ⏳ **Remaining:** build more **Tier-A missing nodes** (§2 — Noise, Color Ramp, Euclidean,
>   Easing, and Spring landed — the latter is the first new gc-wired stateful executor,
>   wiring verified complete across the engine);
>   reconcile the Control Panel hardcoded allow-list with `exposedControls` (Part 4.2);
>   finish tagging the last technical/custom-UI nodes. Typecheck + lint + unit tests +
>   production build all green throughout.

## Snapshot

- **208 node definitions** across 18 categories (205 → 203 after the §1.1 dedupe, then +5
  for the new Noise, Color Ramp, Euclidean Rhythm, Easing, and Spring nodes; no id
  collisions remain). Two `NodeCategory` union members are **empty**: `shaders` (its nodes
  live under `visual`) and `custom` (runtime placeholder).
- Category sizes are wildly uneven: `data` 33, `math` 22, `logic` 20, `ai` 19, `audio` 16,
  `3d` 16, `visual` 12, `string` 12, `inputs` 12, `connectivity` 10, `clasp` 10, `timing` 9,
  `code` 7, `debug` 5, `subflows` 2, `messaging` 2, `video` 1, `outputs` 1.
- The `_`-prefixed *registry* dirs (`_knob`, `_synth`, …) are **live** — re-exported via
  proxy `.ts` files and registered in `components.ts`. The underscore is a naming holdover,
  not a dead-code marker. The only genuinely dead tree is `components/nodes/_archived/`.
- **The single highest-leverage finding:** a VJ who searches the words they actually type —
  `feedback`, `glitch`, `echo`, `trail`, `noise` — gets **zero results today**, *even for
  capabilities that already exist* (glitch/plasma/noise are buried as Shader presets; "echo"
  is the audio Delay). Discovery, not category count, is what blocks the core audience.

---

## 1. Repo health audit

Architecture is fundamentally sound; the newer code (WebLLMService, the engine's async
lifecycle, VectorStore, the GC discipline) is reference-quality. Issues cluster in a few
places.

### 1.1 Duplicate node ids were a live bug (FIXED 2026-06-18 — see implementation status)

`counter` and `sample-hold` each exist **twice with an identical `id`**:

- `registry/data/counter.ts:4` (`id: 'counter'`) **and** `registry/code/counter.ts:4`
  (`id: 'counter'`).
- `registry/logic/sample-hold.ts:4` (`id: 'sample-hold'`) **and**
  `registry/code/sample-hold.ts:4` (`id: 'sample-hold'`).

The registry registers into a `Map<string, NodeDefinition>` keyed by `id`
(`registry/index.ts`), so **the later import silently overwrites the earlier** — `code`'s
versions win because `code` is imported after `data`/`logic`. The losing definition (its
own ports, controls, info, and any custom executor mapping) is **unreachable dead code**,
and which one wins is a load-order accident. Two definitions also drift: the `data` and
`code` counters have different output ports. **Fix:** pick one canonical definition per id,
delete the other, and consider a dev-time `register()` guard that throws on duplicate ids so
this can't recur silently. (`toggle` is fine — single, in `code`.)

### 1.2 Structural findings (carried from rev. 1, still valid)

1. **`engine/executors/index.ts` is a 1596-line god-seam** — both the assembly barrel
   (`builtinExecutors`) *and* the inline home of ~49 executors (inputs/math/logic/timing/
   debug **plus** RAG + WebLLM), while audio/visual/ai/3d live in their own
   `executors/<category>.ts`. `executors/ai.ts` (2145 lines) is the next god-file.
   RAG/WebLLM extract cleanly to `executors/{rag,llm}.ts`.
2. **GC/dispose wiring is manual and positional.** Each stateful executor must remember
   2 imports + 2 call sites in `ExecutionEngine` (`updateGraph` GC block + `stop()`). This
   exact "forgot to wire GC" bug has recurred in every audit. **`subflow` is still
   unwired** (~4-line leak — `clearAllSubflowContexts` called nowhere). Fix the class:
   executor modules should **self-register** their gc/dispose.
3. **Startup bundle carries `three` + `tone` eagerly.** `useExecutionEngine` registers
   *all* `builtinExecutors` at init, so three+tone load even for a user who only places a
   Slider — the real >500 kB driver. Argues for **lazy executor registration** (load a
   category's executors on first use), which also structurally fixes #2. Cheap interim:
   `manualChunks` + `chunkSizeWarningLimit` in `vite.config.ts`.
4. **Zero component tests.** `@vue/test-utils` + `happy-dom` are installed but nothing
   mounts a `.vue` — BaseNode, PropertiesPanel, modals, all custom node UIs untested.
   `AudioManager` has no mock-AudioContext harness. The biggest test gap.
5. **Dead/stale cruft.** `components/nodes/_archived/` (~104 KB) is dead. `vite.config.ts`
   has 5 aliases (`@engine`, `@nodes`, `@platform`, `@storage`, `@utils`) pointing at
   nonexistent dirs. `docs/architecture/ARCHITECTURE.md` describes a layout that doesn't
   exist.
6. **Two UI metadata fields are defined but unused/under-used (NEW):** `categoryMeta`
   gives every category an `icon` (`stores/nodes.ts:208-229`), but `AppSidebar` renders
   only the **color dot** (`AppSidebar.vue:274,297,319,353`) — the icons never appear, a
   free visual-scan win left on the table. And `tags` is searched but populated on only
   ~70/205 nodes (see §3).

**Carried from `AUDIT_2026-06-16.md` (still open, higher severity):** the `with(ctx)`
non-sandbox in `code.ts`/`compiler.ts` (and the UI calling it "sandboxed"); unvalidated
`importFlow`; open `setWindowOpenHandler`; per-frame storms — *imageLoader asset-fail, webcam
`getUserMedia` re-prompt, and the http-request flood are now **fixed (2026-06-19)***; the
mqtt/ws/http/BLE connect backoff is still open.

**Priority order:** security (carried) → per-frame storms (carried) → **dedupe the two
colliding ids (§1.1)** → wire `subflow` cleanup (4 lines) → split the `index.ts` seam +
carve `ai.ts` → lazy executor registration (kills bundle weight *and* the GC-wiring bug
class) → first `@vue/test-utils` mounts + AudioManager harness → delete `_archived/` + the
dead vite aliases.

---

## 2. Missing nodes — by user value × effort

The library is deep on math/logic/data/string and strong on audio/3D/AI/CLASP, but thin for
**live visuals and physical installations** — exactly the half of the audience the brand
markets to. **New framing:** separate gaps that are *genuinely absent* from gaps that
*exist but can't be found* — the latter are far cheaper to close (§3).

### Tier A — signature gaps, high value (build these)
- **Feedback / frame-buffer** (previous-frame texture) — the most-missed VJ primitive
  (trails, echo, infinite zoom). Nothing today, and unsearchable (§3). Highest value.
- **Noise** (Perlin/Simplex, 1D/2D/3D) — there's `random` but no *coherent* noise; the
  backbone of organic/generative motion. ✅ **landed** as `math/noise` (stateless 3D
  simplex + fBm octaves, value/normalized outputs).
- **Text → texture** — no way to put words/numbers/a clock on the output today.
- **Color ramp / gradient / palette** — map a 0–1 signal to color (cheap, unlocks a lot).
  ✅ **landed** as `visual/color-ramp` (7 colormaps + custom 2-stop, `[r,g,b,a]` output).
- **Classic image FX as discrete nodes** — glitch, RGB-shift, scanlines, pixelate,
  posterize, dither, kaleidoscope, chroma-key, edge-detect, LUT. (Some exist *only* as
  buried Shader presets — promoting them to nodes also fixes discovery.)
- **Particle system** (2D/3D).

### Tier B — installation / hardware (high value, higher effort, Electron-bound)
- **DMX / Art-Net / sACN** — lighting control; nothing exists, yet installation artists +
  IoT makers are half the audience.
- **NDI / Spout / Syphon out** (Electron) — feed Resolume/OBS/projection software.
- **Projection mapping** (corner-pin / warp / mesh).
- **Firmata/Arduino**; **MIDI-learn / CC-mapper**.

### Tier C — medium value
- **Timeline / keyframe** animator; generic **ramp/tween-to-target with easing** (the
  **easing-curve** half landed as `math/easing` — a 20-curve shaper; the stateful
  tween-to-target is still open).
- **Ableton Link** tempo sync; **Euclidean rhythm** ✅ **landed** as `timing/euclidean`
  (stateless Bjorklund pattern, step-indexed); **tap-tempo**.
- **Physical input nodes:** computer **keyboard**, **mouse/pointer**,
  **device-motion/orientation** (today's `keyboard` node is a *virtual piano*, not keys).
- **Audio dynamics** (compressor/limiter), **distortion/bitcrusher**, **granular/sampler**,
  **recorder**.
- **TTS** (have STT + LLM, can't speak); **depth estimation (MiDaS)** for 2D→3D parallax.
- **Persist/state** node (save/restore across reloads); **multi-output / recorder**
  (single Main Output today).

### Tier D — nice-to-have
Spring/physics value ✅ **landed** as `math/spring` (damped oscillator; value/velocity/
atRest), slew limiter, derivative/integral of a signal, musical-scale
quantizer, CSV/table, screen capture, instanced/points 3D, post-FX (bloom/DOF) on the 3D
render.

---

## 3. Discoverability & taxonomy (tags first, migration later)

Rev. 1 led with an 18→12 category migration. The code says the cheaper, higher-impact work
is **discovery**, because the search infrastructure already exists and the category count is
not what's blocking users.

### 3.1 The search a VJ actually performs returns nothing

Search (`AppSidebar` and `NodeExplorerModal`) is fuzzy, case-insensitive, and matches
`(d) => [d.name, d.description, ...(d.tags ?? [])]` (`stores/nodes.ts:138-144`;
`utils/fuzzySearch.ts`). Solid engine — starved of data:

| Query | Result today | Why |
|---|---|---|
| `feedback` | ∅ | node doesn't exist *and* no alias |
| `glitch` | ∅ | exists only as a **Shader preset**, not a node/tag |
| `noise` | ∅ | `random` exists but isn't tagged `noise`; coherent noise absent |
| `echo` | ∅ | it's the audio **Delay** node — no alias |
| `trail` | ∅ | needs a feedback buffer (absent) |

Only ~**70 of 205** nodes carry any `tags`; visual/audio/timing nodes are the least tagged —
precisely the VJ-facing ones. **This is the cheapest high-value fix in the whole review.**

**Action (do first, ~1–2 days, zero saved-flow risk):**
1. **Populate `tags` with user vocabulary**, especially aliases for capabilities that
   already exist: `random` → `noise, probabilistic, rng`; `audio-delay` → `echo`;
   `reverb` → `room, space`; `displacement` → `warp, distortion, glitch`;
   `blur` → `bloom, glow, defocus`; `shader` → `glsl, plasma, kaleidoscope, generator`.
2. **Surface tags as faceted filter chips** in `NodeExplorerModal` (it already has the real
   estate) — this is the "tag layer" rev. 1 wanted, and the data model already supports it.
3. **Promote buried Shader presets** (glitch/plasma/noise/kaleidoscope) to either discrete
   nodes (see Tier A) or at minimum searchable aliases, so "glitch" resolves to *something*.
4. **Render the category `icon`** in `AppSidebar` (already in `categoryMeta`, currently
   unused) for faster visual scanning.
5. Consider a **recents / favorites** strip — neither exists today; both are low-effort and
   high-frequency wins for performers.

### 3.2 Dedupe, empty categories, color sub-brand (cheap, do alongside tags)

- **Dedupe the two colliding ids** (§1.1) — choose one canonical category per node.
- **Resolve the empty categories:** `shaders` (fold into `visual`) and `custom` (keep as the
  runtime placeholder it is, or drop from the palette-facing union). Don't ship empty
  buckets in the palette.
- **Repoint stray purple.** If "AI = purple, teal = primary" is the intended sub-brand, the
  source of truth contradicts it: `debug` `#8B5CF6`, `messaging` `#8B5CF6`, and `subflows`
  `#7C3AED` are all purple/violet in `categoryMeta` (`stores/nodes.ts:208-229`). A taxonomy
  pass is the moment to reassign these so purple reads as "AI."

### 3.3 Category migration (optional, slower follow-on)

Still worth doing eventually, but **down-ranked** below §3.1–3.2. The grain is inconsistent
(`data` 33 vs `outputs`/`video` 1) and the classification axis is mixed (domain vs operation
vs role). A ~12-category target organized on **one primary axis — the data/domain the node
works on** (TouchDesigner's CHOP/TOP/SOP spirit) collapses the size anomalies:

1. **Control** — inputs & value sources (slider, knob, xy-pad, trigger, *keyboard/mouse/
   sensors*, gamepad, MIDI-in).
2. **Generators** — LFO, *noise*, random, time, clock, envelope, *ramp/tween*, euclidean.
3. **Math** (unchanged).
4. **Logic & Routing** — comparisons, gates, switch/select, dispatch, **+ the state nodes**
   (latch, sample-hold, changed, counter, toggle) deduped into one home.
5. **Data** — structured data + conversions only (≈half its current size; Text → a tag).
6. **Audio** — synthesis, FX, analysis.
7. **Image & Video** — merges `visual` + `video` + empty `shaders`: shaders, compositing/FX,
   *feedback/text/particles/gradient*, media sources. Kills two sizing anomalies.
8. **3D**.
9. **AI & ML** (unchanged).
10. **Connectivity** — all external I/O incl. *DMX/Art-Net* + **CLASP as a featured
    sub-group**.
11. **Output** — Main Output, *multi-output, recorder, NDI/Spout, projection-map*.
12. **Meta** — Code, Debug, Composition (subflows + send/receive).

**Migration is saved-flow-safe:** flows persist only `data.nodeType` (the node `id`), never
`category` (`stores/flows.ts` `exportFlow`), so re-categorizing won't break saved work —
**provided ids stay stable.** `NodeCategory` is a TS union + exhaustive `categoryMeta`
record, so changes are localized to those two structures + the palette.

---

## 4. Node & performance UX (NEW)

Rev. 1 was an architecture lens; this is the lens the audience actually experiences. None of
the below requires schema changes — they're UI affordances.

### 4.1 The node itself (`BaseNode.vue`)
- **Port labels are hidden until hover or selection.** A new user can't see what a port
  *is* (type or meaning) at rest, and there is **no legend** for the data-type color code
  (`dataTypeMeta`, `stores/nodes.ts:232-251`: number=teal, trigger=amber, string=purple,
  texture=pink, …). Either show labels by default on hover-adjacent nodes, or ship a small
  always-available type legend. This is the steepest part of the first-hour learning curve.
- **Resize exists on only two nodes** (Monitor, Emulator) via a subtle diagonal-stripe grip;
  most custom UIs are fixed-size. The grip is easy to miss — a hover tooltip would help.
- **Custom-UI affordance rough edges** (verify before polishing): knob indicator notch is
  thin and the knob has no `grab` cursor; xy-pad sits on a low-contrast purple gradient;
  EQ band labels are 9px and don't visibly map to their colored curves; canvas editors
  (EQ/wavetable/envelope) give no "draggable" cursor cue. Individually minor; collectively
  they make the deep nodes feel read-only.

### 4.2 The performance workflow (editor → expose → Control Panel)
This is the product's reason to exist for a VJ, and it's under-discovered:
- **Exposing a control is a per-control toggle buried in PropertiesPanel**
  (`toggleControlExposure`, `PropertiesPanel.vue:162`; Crosshair→Check icon). Nothing in the
  **editor** indicates which controls are exposed.
- **A second, parallel surfacing path exists and is a hardcoded allow-list.**
  `ControlPanelView.vue:33-34` defines `controlNodeTypes` / `monitorNodeTypes` as literal
  arrays and filters by them (`:80`). A **new or custom control node is invisible to the
  Control Panel** until someone edits this array. The relationship between this allow-list
  and the per-control `exposedControls` store path is undocumented and should be reconciled
  (ideally: drive the Control Panel from `exposedControls` + node capability flags, not a
  hardcoded list).
- **Reported, verify before acting:** Control Panel faders are click-to-set rather than
  drag-to-slide — if true, that's a real defect for a live surface (no fine control during a
  set). Confirm in `ControlPanelView.vue` before fixing.
- **No Control Panel layout presets** (save/recall an arrangement) — a frequent ask for
  performers who rebuild the same surface per gig.

### 4.3 First-run, empty states, onboarding
- **First visit loads a sample flow silently** (`flows.ts:1008 loadSampleFlowIfFirstVisit`,
  key `latch_has_visited`; `EditorView.vue:80`) — but with **no walkthrough or annotation**,
  and the sample is incomplete (nothing wired to Main Output, so a beginner sees no visual
  result). Either annotate it or ship a "hello-world" that renders something.
- **Empty states are bare strings** ("Drag nodes from the sidebar", "No Controls in Flow",
  "Select a node") that don't point to the next action — especially the Control Panel empty
  state, which never tells the user *how* to expose a control from the editor.
- **Power features are keyboard-only and undiscovered:** copy/paste/duplicate, subflows
  (Ctrl+G/E), undo/redo batching. No shortcut reference in-app.
- **Settings is a stub** (`SettingsView.vue`: theme + grid only); real config (AI models,
  connections, file I/O) is scattered across header buttons, sidebar tabs, and modals.

---

## 5. Prioritized recommendations (value × effort × risk)

| # | Action | Part | Value | Effort | Saved-flow risk |
|---|---|---|---|---|---|
| 1 | Security + per-frame storms (carried from AUDIT_2026-06-16) | 1 | ★★★ | M–L | none |
| 2 | **Dedupe `counter`/`sample-hold` ids + add duplicate-id guard** | 1.1 | ★★★ | S | none |
| 3 | **Populate `tags` with VJ vocab + aliases for existing nodes** | 3.1 | ★★★ | S | none |
| 4 | **Surface tags as filter chips in NodeExplorer; render category icons** | 3.1 | ★★ | S–M | none |
| 5 | Wire `subflow` cleanup (4 lines) | 1.2 | ★★ | S | none |
| 6 | Fix empty categories + repoint stray purple to honor AI sub-brand | 3.2 | ★★ | S | none |
| 7 | Reconcile Control Panel allow-list ↔ `exposedControls`; verify fader drag | 4.2 | ★★★ | M | none |
| 8 | Port-type legend + default-visible labels; first-run annotation | 4.1/4.3 | ★★ | M | none |
| 9 | Build Tier-A missing nodes (feedback, noise, text, gradient, image-FX) | 2 | ★★★ | M–L | none |
| 10 | Lazy executor registration (bundle weight + GC-wiring class) | 1.2 | ★★ | L | none |
| 11 | Split `index.ts` seam + carve `ai.ts`; first component tests | 1.2 | ★★ | L | none |
| 12 | 18→12 category migration (ids stable) | 3.3 | ★ | L | low (ids stay) |
| 13 | Tier-B installation nodes (DMX/Art-Net, NDI/Spout, projection) | 2 | ★★★ | L | none |

**Recommended first sprint (all low-risk, high-felt-impact):** #2, #3, #4, #5, #6 — a few
days of work that removes a live bug, makes the existing library *findable* by its actual
audience, and tightens the brand, with zero risk to saved flows.

---

## Appendix — Full inventory (205 definitions; 203 unique registered)

Counts below are **declared `category` fields** measured from the registry source
(`grep "  category: '"`). Two collide (see §1.1), so 203 unique ids register.

**data (33):** json-parse, json-stringify, texture-to-data, array-length, array-get,
array-first-last, array-contains, array-slice, array-join, array-reverse, array-push,
array-filter-nulls, array-unique, array-sort, array-range, object-get, object-set,
object-keys, object-values, object-has, object-merge, object-create, object-entries, router,
debounce, throttle, to-string, to-number, to-boolean, parse-int, parse-float,
to-array, format-number.
**logic (20):** compare, and, or, not, gate, switch, select, is-null, is-empty, pass-if,
default-value, coalesce, equals, changed, type-of, in-range, sample-hold, latch,
match-value, dispatch.
**math (22):** add, subtract, multiply, divide, clamp, abs, random, noise, easing, spring,
map-range, smooth, trig, power, vector-math, modulo, lerp, step, smoothstep, remap, quantize, wrap.
**ai (19):** text-generation, image-classification, sentiment-analysis, image-captioning,
feature-extraction, object-detection, speech-recognition, text-transformation, retrieve,
vector-memory, llm, vla, mediapipe-hand, mediapipe-face, mediapipe-pose, mediapipe-object,
mediapipe-segmentation, mediapipe-gesture, mediapipe-audio.
**audio (16):** oscillator, audio-output, audio-analyzer, gain, filter, audio-delay,
beat-detect, audio-player, envelope, reverb, svf-filter, pitch-detect, envelope-visual,
parametric-eq, wavetable, synth.
**3d (16):** scene-3d, camera-3d, render-3d, box-3d, sphere-3d, plane-3d, cylinder-3d,
torus-3d, transform-3d, material-3d, group-3d, ambient-light-3d, directional-light-3d,
point-light-3d, spot-light-3d, gltf-loader.
**string (12):** string-concat, string-split, string-replace, string-slice, string-case,
string-length, string-contains, string-starts-ends, string-trim, string-pad,
string-template, string-match.
**inputs (12):** constant, slider, audio-input, trigger, xy-pad, textbox, knob, keyboard,
gamepad, gamepad-visual, midi-input, webcam.
**visual (12):** shader, webcam-snapshot, color, color-ramp, texture-display, blend, blur,
color-correction, displacement, transform-2d, image-loader, video-player.
**connectivity (10):** http-request, websocket, midi-output, mqtt, osc, serial, ble,
ble-scanner, ble-device, ble-characteristic.
**clasp (10):** clasp-connection, clasp-subscribe, clasp-set, clasp-emit, clasp-get,
clasp-stream, clasp-bundle, clasp-video-receive, clasp-video-send, clasp-gesture.
**timing (9):** time, lfo, start, interval, delay, timer, metronome, step-sequencer, euclidean.
**code (6):** function, expression, template, counter, toggle, value-delay.
**debug (5):** console, monitor, oscilloscope, graph, equalizer.
**subflows (2):** subflow-input, subflow-output.
**messaging (2):** send, receive.
**video (1):** emulator *(physically under `registry/emulation/`, declares `category:'video'`)*.
**outputs (1):** main-output.

**Empty categories:** `shaders`, `custom`.
**Id collisions: RESOLVED 2026-06-18** — `counter` is now `code`-only (was data + code) and
`sample-hold` is now `logic`-only (was logic + code); a DEV `register()` guard + a registry
test prevent recurrence. `toggle` was always single (code only).
**Dead code:** `components/nodes/_archived/`.
</content>
</invoke>
