# LATCH Modernization Assessment — June 2026

> Snapshot date: 2026-06-14. Every claim here is backed by either a `file:line`
> reference into the repo or a dated external source. Items that could not be
> verified are explicitly flagged. The companion execution doc is
> [`docs/plans/MODERNIZATION_PLAN_2026.md`](plans/MODERNIZATION_PLAN_2026.md).

## TL;DR

The foundation is strong — clean registry/executor split, 133+ nodes, disciplined
resource cleanup. The risk is that **the execution core and the ML stack are
frozen at their 2024 design**, and the single change that would most modernize
the project — WebGPU everywhere (TSL shaders + WebLLM + threaded WASM) — is gated
behind dependency upgrades not yet taken. Mobile is currently a non-starter
(continuous unthrottled rAF, no touch-connect, hardware APIs absent on iOS).

---

## 1. Execution engine (the biggest liability) — `engine/ExecutionEngine.ts`

| Finding | Evidence | Impact |
|---|---|---|
| Whole graph re-executes every frame; no dirty-checking / change propagation | `ExecutionEngine.ts:331-355` (`executeFrame` loops all nodes in topo order) | A 200-node patch runs 200 executors at 60fps even when one slider moved. CPU/battery. |
| Frame loop `await`s each node sequentially | `ExecutionEngine.ts:343-348` | One slow async node (HTTP/AI `await pipe(...)`) **stalls the entire frame**. |
| O(n²) per frame node lookup | `ExecutionEngine.ts:344` (`nodesSnapshot.find(...)` inside loop) | Linear scan per node per frame. Trivial Map fix. |
| rAF loop never pauses/throttles | `ExecutionEngine.ts:370-378`; grep: zero `visibilitychange`/`prefers-reduced-motion` matches | No background pause, no FPS cap, no reduced-motion. Battery/thermal killer on mobile. |
| GPU resources pushed through Vue reactivity | `ExecutionEngine.ts:459-473` (direct-Map bypass added because `Object.fromEntries()` loses `THREE.Texture` identity) | Symptom of mixing the render graph with reactive UI state. |

**Architectural gap vs peers:** cables.gl separates **value edges** (reactive,
lazy) from a **trigger/execution chain** that drives render order
([DeepWiki: cables rendering systems](https://deepwiki.com/cables-gl/cables/3-rendering-systems),
2026-06). LATCH has only one mode: pull-everything-every-frame.

**Code organization:** executors have become monoliths — `ai.ts` 2056 lines,
`connectivity.ts` 1874, `visual.ts` 1783, `clasp.ts` 1565, `audio.ts` 1594. This
is where the recurring leak bugs hide (see `HANDOFF.md` resource-management
sections).

---

## 2. Dependency version skew (verified vs npm registry, 2026-06-14)

| Dep | Installed | Latest | Notes |
|---|---|---|---|
| `@huggingface/transformers` | `^3.8.1` | **4.2.0** | v4 = C++ WebGPU runtime (~4× embeddings), q1/q2 dtypes, >8B models, new `@huggingface/tokenizers` + `ModelRegistry`. Caret stays on 3.x → won't auto-upgrade. |
| `@clasp-to/core` | `^3.3.2` | **4.3.2** | First-party (LumenCanvas). `@clasp-to/sdk` 4.5.0 is a higher-level API. Read own CHANGELOG for v3→v4 break. |
| `three` | `^0.162.0` (r162) | **~r184** | TSL + WebGPURenderer matured r155–r184. ~22 revisions behind. |
| `@vue-flow/core` | `^1.33.5` | **1.48.2** | Multi-touch + `onlyRenderVisibleElements` perf. Same major → low-risk. |

**Web build also missing:** no PWA manifest/service worker; **no COOP/COEP
headers** in `netlify.toml` (grep confirmed) → `SharedArrayBuffer` off → threaded
WASM disabled → transformers.js ~3–4× slower on web for everyone. One-block fix.

---

## 3. AI/ML stack — dated, biggest opportunity

- Default text model is **TinyLlama-1.1B**, all `Xenova/*` repos (`AIInference.ts:63-176`) — 2024-era catalog.
- **Wrong tool for chat LLMs.** transformers.js is best for breadth (embeddings, Whisper, vision) + WASM fallback; for generative chat, **WebLLM (WebGPU-only) is materially faster** with an OpenAI-style streaming API. Right answer = run both (additive; worker already isolated in `ai.worker.ts`).
- **No token streaming** — `generateText` awaits the full completion (`ai.worker.ts:238`).
- **"Uncensored" browser models that actually run today:** `onnx-community/Qwen2.5-0.5B/1.5B-abliterated-ONNX`, `Qwen3-0.6B-heretic-abliterated-ONNX` (transformers.js); `Hermes-3-Llama-3.2-3B` (WebLLM prebuilt). Dolphin & most abliterated repos are GGUF-only → not browser-runnable. Trap: `*-onnx-genai-*` ≠ transformers.js.
- **Long context on small models** = in-browser RAG: embed (`all-MiniLM-L6-v2` or `embeddinggemma-300m`) → client vector store (**Orama** or **PGlite+pgvector**) → top-k inject; plus **LLMLingua-2** prompt compression (`@atjsh/llmlingua-2`, ~57MB, 2–5×).
- **Caching:** uses Cache API (`ai.worker.ts:13`). For multi-GB weights **OPFS is ~3–4× faster than IndexedDB**; call `navigator.storage.persist()` to avoid eviction. `imageToSerializable` copies pixels via `Array.from(imageData.data)` over postMessage (`AIInference.ts:927`) instead of a transferable — slow for vision nodes.

Sizes/sources captured in memory `browser-ml-mobile-research.md`.

---

## 4. CLASP / Three.js TSL / Vue Flow

- **CLASP** is first-party (not 3rd-party SaaS). ⚠️ Public docs do **not** substantiate "video over WebCodecs/WebTransport" — the protocol appears to use WebRTC + generic pub/sub; LATCH's *local* WebCodecs work lives in `services/clasp/videoChunker.ts`. Upgrade 3→4 from own CHANGELOG.
- **Three.js TSL** = a JS node graph compiling to both WGSL + GLSL from one source → eliminates the GLSL-string-injection bug class (the "shaders render blank" saga in HANDOFF). Maps ~1:1 onto shader nodes; WebGPU with automatic WebGL2 fallback. Real migration (`three/webgpu`, async `init()`, GLSL→TSL rewrite, postprocessing rebuild). Prior art: `bandinopla/three.js-visual-node-editor`, `threejsshadergraph.com`.
- **Vue Flow**: bump `1.33.5 → 1.48.2` + siblings, enable `onlyRenderVisibleElements`, add `@vue-flow/node-resizer`. Low risk, immediate touch + large-graph wins. Don't wait on v2 (alpha unshipped).

---

## 5. Mobile (treat as a capability-reduced tier of Electron)

- **iOS Safari: NO Web MIDI / Bluetooth / Serial.** Android Chrome: MIDI+BLE, no Serial. **OSC(UDP) impossible in any browser** → OSC/data over WebSocket bridge (CLASP Bridge) is the only portable transport. Feature-detect via `utils/platform.ts`.
- **Touch editing:** Vue Flow `connect-on-click` (tap→tap), enlarged handle hit-targets, `connectionMode: Loose`, `touch-action: none`, branch on `pointerType`.
- **Layout:** properties/control panels → bottom sheets w/ drag handles; long-press radial menu; 44pt/48dp targets. Figma model: review on phone, light edit on tablet/Pencil, full edit on desktop.
- **Audio:** iOS `AudioContext` starts `suspended`, can go `interrupted`; gate Tone.js behind an explicit gesture and re-unlock.
- **ML on phones:** sub-1B q4 only (~0.25–0.5GB, 4–17 tok/s); 2B+ → Electron build. Gate on `navigator.gpu` + `maxStorageBufferBindingSize`.
- **Render loop:** the §1 throttling fixes are mandatory for mobile, free wins on laptops.

---

## Flagged / unverified

- transformers.js v4 blog-vs-GA date discrepancy; onnxruntime-web 1.26.0 exact date; per-backend dtype matrix not authoritatively documented.
- CLASP v3→v4 changelog not retrieved (read first-party repo). CLASP video transport unconfirmed.
- Three.js "rXXX = production-ready", caniuse %s — blog-tier.
- Several model file sizes inferred from backbone+quant ratios.
- Some tok/s and iOS storage-cap figures are vendor/secondary (directional).
