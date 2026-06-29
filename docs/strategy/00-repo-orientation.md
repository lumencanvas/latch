# Repo Orientation — How LATCH Is Built

A concern-by-concern map for someone new to the codebase. For line-accurate detail
see `docs/AUDIT_2026-06-28.md` and `docs/plans/*`; this is the mental model.

## What LATCH is

A node-based creative flow programming environment ("Live Art Tool for Creative
Humans"). Vue 3 + TypeScript + Vite, shipped for web (Netlify, `latch.design`) and
desktop (Electron Forge). ~238 nodes across 18 categories. Targets creative coders,
VJs, installation artists, hardware hackers, IoT makers. Key libs: Vue Flow (node
editor canvas), Pinia (state), Three.js (3D/shaders), Tone.js + Meyda (audio),
Transformers.js + ONNX Runtime + MediaPipe (in-browser ML), Dexie (IndexedDB),
`@clasp-to/core` (first-party realtime connectivity protocol).

## The big picture (data flows downhill)

```
registry/  (what a node IS)        engine/  (how nodes RUN)            services/ (heavy capabilities)
  definition: ports/controls   →    ExecutionEngine: topo sort,    →    audio (Tone), visual (Three),
  + optional custom .vue            per-frame rAF loop, dirty mode       ai (workers/ONNX/MediaPipe),
                                    executors/: per-node behavior        connections (adapters), clasp
        ↑                                   ↓                                   ↓
   stores/ (graph + UI + runtime state, Pinia)  ←→  components/ (Vue Flow canvas, BaseNode, panels)
```

A flow is a graph of nodes + edges. The engine topologically sorts it and runs each
node's *executor* every animation frame (or only when inputs change, in "dirty"
mode). Executors read inputs, do work (possibly via a service), and return outputs,
which flow along edges to the next node.

## The node system — three things, three places (today)

A single node is currently spread across files (the modularization plan in
`docs/plans/EXTENSIBILITY_ARCHITECTURE_2026-06-28.md` collapses this to one folder):

1. **Definition** — `src/renderer/registry/<category>/` — ports, controls, metadata
   (icon, info/tips, platform `requires`, connection needs). Pure data.
2. **Executor** — `src/renderer/engine/executors/<category>.ts` (and a 1600-line
   `index.ts` monolith) — the runtime behavior + any per-node state Map + its
   `gc*`/`disposeAll*` cleanup.
3. **Component (optional)** — a custom `.vue` for nodes that need bespoke UI
   (synth, oscilloscope, emulator…), hand-registered in `registry/components.ts`.
   Most nodes have no component and render through the generic `BaseNode.vue`.

`BaseNode.vue` renders ports + a generic control switch (slider/toggle/select/
number/text/color). The properties panel has a *second* control switch.

## Execution model (`engine/ExecutionEngine.ts`)

- **Per-frame rAF loop**: topo-sorted nodes run each frame; the loop pauses on tab
  hide and clamps delta time. Each node gets an `ExecutionContext` (inputs, controls,
  `deltaTime`/`totalTime`/`frameCount`).
- **Per-node exception isolation**: one node throwing can't break the frame loop.
- **Modes**: `full` (run everything every frame, the default) and `dirty`
  (change-driven; pure nodes skip when inputs+controls are unchanged — the
  `PURE_NODE_TYPES` allowlist). `deferred` = fire-and-latch for long-I/O/async nodes.
- **Lifecycle**: per-node `gc*State(validNodeIds)` on node deletion (`updateGraph`)
  and `disposeAll*State()` on stop — currently hand-wired for ~23 state groups (the
  recurring leak class; being replaced by auto-registered `defineNodeState`).
- **Special outputs**: executors can return `_dynamicInputs/_dynamicOutputs`,
  `_preset_code`, `_controlUpdates` to mutate their own node.

## The data/graph model (`stores/`)

- `flows` — the graph (nodes, edges), tabs, subflow ops, save/load, JSON import/
  export, autosave (Dexie).
- `runtime` — execution state, per-node metrics + `lastError` (recorded but not yet
  shown on the node).
- `ui` — panels, zoom/selection, exposed controls, mobile flags.
- `nodes` — the node-definition registry + `categoryMeta` (the category→color source
  of truth) + `DataType`/`ControlDefinition`/`NodeDefinition` types.
- `assets`, `connections` — IndexedDB assets; live connection state.

## Rendering — THREE separate WebGL contexts (critical gotcha)

LATCH has **three independent WebGL renderers** (the main output compositor, the 3D
scene renderer, and the shader/effect renderer). **A `THREE.Texture` is NOT portable
between them** — wiring a texture made in one context into a node that samples it in
another renders blank. Worse, **video-backed textures render black** through the
shader renderer unless converted video→canvas first. This is the root cause of a
whole class of "texture is blank/black" bugs (see audit §D, and the memories
`latch-webgl-contexts` / `latch-video-texture-black`). Any node that produces or
consumes `texture` must respect which context it's in.

## Services (the heavy lifting)

- `services/audio` — Tone.js graph; nodes pass live Tone audio nodes along `audio`
  edges; AudioContext unlock handling.
- `services/visual` — the Three renderers, shader compilation, texture bridging.
- `services/ai` — `AIInference` (Transformers.js via a Web Worker + `WorkerFacade`),
  `WebLLMService` (MLC WebGPU LLMs), `MediaPipeService`, `VectorStore` (RAG). Three
  separate model catalogs today (being unified by `defineModel`).
- `services/connections` — a generic, data-driven adapter registry (`Connection
  Manager` + `BaseAdapter` subclasses for WebSocket/MQTT/OSC/HTTP/BLE…). Protocols
  are data, but registration is currently spread across several files.
- `services/clasp` — the first-party realtime protocol (video chunking, peer
  discovery); large and special-cased (doesn't use the generic adapter).
- `services/customNodes` — loads user-authored nodes (definition.json + compiled
  executor.js) from `custom-nodes/` (Electron) or from code strings (web). BaseNode
  UI only today.

## Subflows (subgraphs) — currently inert

The subflow system *looks* complete (create-from-selection, ports, unpack) but is
**non-functional at runtime**: instances never execute and render with zero ports.
A full rebuild is specced in `docs/plans/SUBFLOW_REBUILD_SPEC_2026-06-28.md`.

## Build & test

- `npm run dev` (web), `npm run dev:electron`, `npm run build`, `npm run typecheck`
  (`vue-tsc --noEmit`), `npm run test:unit` (Vitest, ~1300 tests, happy-dom).
- Two build roots: web (`vite.config.ts`) and electron (`electron.vite.config.ts`).
  No `import.meta.glob` yet (the auto-registry will introduce the first use).
- Cross-origin isolation (COOP/COEP) is required for SharedArrayBuffer (threaded
  WASM ML) — configured in dev, preview, and `netlify.toml`.

## The architecture direction (in-flight, not yet built)

The plans move LATCH toward: **one declarative `defineNode()` unit per node in one
folder**, auto-discovered via `import.meta.glob`; `defineNodeState()` that
self-registers its own cleanup (killing the leak class); register-once
`defineProtocol()` and `defineModel()`; a declarative `ui` schema rendered by one
interpreter (so custom UI needs no bespoke `.vue` and is safe for user nodes); and
node-data **versioning + migration** so saved flows never break. See
`docs/plans/EXTENSIBILITY_ARCHITECTURE_2026-06-28.md`.

## Known gotchas (the short list that bites everyone)

- The 3-WebGL-context texture trap (above).
- Tone.js nodes are unusable after `.dispose()` — the cache guards against serving
  disposed nodes on restart.
- Executor state Maps **must** register cleanup or they leak (the recurring class).
- Undefined CSS tokens silently fall back — verify a token exists in `tokens.css`
  before using it (memory `latch-undefined-css-tokens`).
- Deploy: Netlify is canonical; GitHub Pages can't serve LATCH (absolute paths +
  COEP).
- Never add AI attribution to git history (CLAUDE.md).
