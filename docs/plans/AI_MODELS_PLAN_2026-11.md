# AI models plan: better WebGPU and vision models, real model control (2026-11-25)

Status: **approved 2026-11-25** (decisions in §5). **Phases 0 and 1 done** (2026-11-25); Phase 2 next.

Goal: LATCH's AI nodes should use current models that actually load, run on WebGPU where the
machine has it (and fall back cleanly where it doesn't), and give the person one honest place to
see what each model needs, whether it fits this device, and what it's doing. The source of better
models and model control is our own `hackbuild/hackbuild-browser-ai` (npm `@hackbuild/*`).

---

## 1. Where we are

### Runtimes

| Runtime | Version | Where it runs | Notes |
|---|---|---|---|
| transformers.js | 4.2.0 | one module worker (`services/ai/ai.worker.ts`), spawned at startup | WebGPU **off by default** (`AIInference.ts:129`, user toggle). Every model forced to `q4` (`:131`, never changed). Cache API storage. |
| onnxruntime-web | 1.26.0-dev (via transformers) | same worker | WASM from jsDelivr at a hand-pinned version, kept in sync in three places: the lockfile, `ai.worker.ts:35`, and the Electron CSP in `src/main/protocol.ts:96-98` (`tests/unit/main/csp-sync.test.ts`). YOLO uses it directly on WASM only. |
| WebLLM | 0.2.84 | one worker per engine (`WebLLMService.ts`) | WebGPU only. 24 MLC models (`models/webllm/`). Keeps its own IndexedDB cache. |
| MediaPipe tasks-vision/audio | 0.10.32 | **main thread**, GPU delegate only | Model URLs are hard-coded per task (`MediaPipeService.ts:397-537`). Not in the model registry. 1.x adds Google telemetry, so we pinned. |
| Text to speech | — | Web Speech API | No model. |

Cross-origin isolation is on everywhere: COOP/COEP on Netlify, in Vite and on Electron's `app://`, plus a coi-serviceworker fallback. So multi-threaded WASM works.

### How a model gets loaded today

- **Registry:**
  - One `*.model.ts` spec per model (`services/ai/models/`): 35 transformers specs and 24 WebLLM specs.
  - The spec shape is `id, name, family, task, size (a string like "~270 MB"), license`.
  - The per-task default and its alternates are in `models/transformers/taskCatalog.ts`.
  - Nodes get a model select of "Default" plus the alternates (`AIInference.getModelSelectOptions`).
- **Loading:**
  - Loading starts in one of three places: the Model Manager, the runtime prompt ("This flow needs an AI model that isn't loaded"), or implicitly when a node first runs.
  - `runModelInference` gates on the model and reports needs to `modelNeeds`, which drives the prompt.
  - The loading pill shows transformers models in the `loading` state.
- **Outside that path:**
  - Depth and Detect Objects (Live) use hand-written selects that aren't in the catalog.
  - YOLO uses raw ORT URLs.
  - MediaPipe and WebLLM have their own lifecycles.

### What's broken or inconsistent

All of these were checked against the code (2026-11-25):

1. **Image Captioning's default is dead.** BLIP returns 401 from Hugging Face (`taskCatalog.ts:144`), and vit-gpt2 fails in ORT-web. Narrated Camera works around it by using the VLA node with SmolVLM.
2. **Model Manager key bug.** The modal builds state keys from the catalog *entry id*, but the service builds them from the *task* (`AIModelManagerModal.vue:131-134`). The `vision-language` row (task `image-text-to-text`) therefore always reads idle, and its auto-load box never shows as checked.
3. **Progress cross-talk.** Every worker progress message is applied to *every* model that is loading (`AIInference.ts:164-175`). "Load all" shows the wrong bars.
4. **The Manager's model choice doesn't reach nodes.** `setSelectedModel` is saved, but no node reads it. A node left on "Default" still wants the catalog default. So "I loaded Qwen" doesn't satisfy a text-generation node.
5. **Speech Recognition reads a `model` control it doesn't declare** (`speech-recognition/node.ts:97`), so it always uses whisper-tiny.en.
6. **WebLLM downloads never appear in the loading pill.** Depth, the live detector, YOLO and MediaPipe never trigger the "model needed" prompt and aren't in the Manager.
7. **Defaults duplicated and disagreeing:**
   - The VLA select duplicates the catalog.
   - The depth default lives in two places.
   - The YOLO fallback URL (gelan-c) is not the control's default (yolov10s).
   - There are two WebGPU checks.
8. **Device and precision are wrong for the hardware.** q4 everywhere and WASM by default leave most of the speed of an Apple-silicon or recent-GPU machine unused. Some old `Xenova/*` repos may not even ship q4 files (not verified).
9. **No fit information.** A 4 GB WebLLM model is offered on a phone the same way as on a workstation. Failures surface as raw runtime errors.
10. **MediaPipe on the main thread** competes with the WebGL frame.
11. **Docs are stale.** `docs/nodes/ai.md` says every AI node uses transformers.js.

Tests: all unit tests, all with mocks. Nothing runs real inference. The worker, the Manager, the prompt and the MediaPipe executors have no tests.

### AI nodes (23)

- **Text:** text-generation (TinyLlama default, 13 alternates), text-transformation (flan-t5), sentiment, feature-extraction (MiniLM and 3 others), llm (WebLLM, 24 models).
- **Vision:**
  - image-classification (ViT), object-detection (DETR) and image-captioning (broken).
  - vla (SmolVLM 256M/500M), depth-estimation (Depth Anything small), object-detection-live (yolos-tiny, D-FINE, RT-DETR) and object-detection-yolo (v10s/m, v9).
  - Six MediaPipe vision nodes (hand, face, pose, gesture, object, segmentation).
- **Audio:** speech-recognition (whisper .en), mediapipe-audio (YAMNet), text-to-speech (Web Speech).
- **RAG:** vector-memory and retrieve (pure JS).

---

## 2. What `hackbuild-browser-ai` offers

The repo has 23 packages, all MIT and ESM only, with no framework coupling. Everything was published to npm as `@hackbuild/*` 0.1.1–0.1.2 on 2026-11-24. **Maturity, honestly:**
- Thorough unit tests against fakes.
- One automated real-browser pass (Chrome, M1, WebGPU): 18 of 57 checks pass, 0 fail, 39 not run. No person has looked at the pages.
- Safari, Firefox, camera and microphone paths, and most models over ~300 MB have never run.

The parts that matter for LATCH:

| Package | What it gives us | Verified? |
|---|---|---|
| `@hackbuild/models` | **Model records**: capabilities, provider, pinned source with SHA-256, size and how the size is known, VRAM, a **device/dtype ladder**, quirks, **licence and commercial flag** (required). `ladderFor(rec, env)` drops rungs the device can't run, `walkLadder` tries rungs in order with classified failures (OOM, f16, device-lost, unsupported-op, …), and `fitOf()` returns "fits / fits on cpu, slow / needs f16 / needs webgpu / over memory / over storage / cannot run here" with a reason. **Hub**: memory budget with idle eviction, a GPU-exclusive queue, frame-aware scheduling (`reportFrame`, `minIntervalMs`, `frameBudgetMs`, `when: skip`), load phases, stubs. A 31-record catalog. | Unit tests only. No catalog ladder has been loaded end to end (browser check 8 not run). |
| `@hackbuild/ai-env` | `probe()`: WebGPU, f16, adapter limits, isolation, threads, OPFS, device memory, Prompt API. | Unit tests. |
| `@hackbuild/devices` | `tjsProvider` / `ortProvider` (they **accept our bundled runtime**: `runtime: () => import(...)`), ladder presets for depth, SmolVLM and Whisper, and `humanError(e)` for one-line messages. | Partly. |
| `@hackbuild/vision` | Depth Anything v2 small, plus a `depthWorker` (raw RGBA in, normalised depth out, all in a worker). SlimSAM point and box segmentation (~40 MB). SmolVLM-256M and LFM2-VL-450M captions and `ask(img, question)`. MediaPipe detect, segment and landmarks with fallbacks. `readbackLoop` (async readback, skips while busy, ≤10 Hz), `perceptionLoop`, `ResultCache`, mask operations and exports. | Measured on M1 WebGPU: depth 512 px p50 205 ms (vs 3 s on WASM); LFM2-VL load 8.7 s, caption 4.7 s; SmolVLM caption 17 s; SlimSAM first mask 5.3 s. Webcam paths not run. |
| `@hackbuild/weights` | One store with OPFS → IndexedDB → Cache fallback, **resumable range downloads**, SHA-256, a Web Lock so two tabs share one download, cancel and resume, and a `transformersCache` adapter. | The custom-cache path with real transformers.js (check 6) is **not verified**. |
| `@hackbuild/chat` | One streaming interface over WebLLM, **wllama (GGUF on WASM, for machines without WebGPU)**, transformers.js, the Prompt API (Gemini Nano) and remote endpoints. | Verified for WebLLM and transformers.js only. |
| `@hackbuild/embed`, `transcribe`, `listen`, `speak`, `structured`, `memory`, `depth-mesh`, `agent`, `imagegen`, `stems`, `notes` | `embed`: a model2vec static embedder (no runtime) that is verified. `speak`: Kokoro plus a **bellows** engine that is ours. `transcribe`: Whisper large-v3-turbo and Moonshine. `depth-mesh`: depth → relief and mesh, for the 3D nodes. | Mostly unproven in a browser. Use them for ideas; adopt later, one at a time. |
| `@hackbuild/ai-elements` | Web components: a model picker with "why it can't run", a download bar, status pills. | Styled in the hackbuild look, not LATCH's tokens. Never checked by a person. |

**The most useful measured fact.** Frame-aware scheduling alone did *not* remove stutter next to a three.js scene: depth on the main thread stayed at 49.8 ms p95. **Moving depth into a worker** brought it to 18.3 ms. LATCH already keeps transformers.js in a worker, which is the right base. MediaPipe is the exception.

Runtime pins in hackbuild are newer than ours:

| Runtime | hackbuild | LATCH |
|---|---|---|
| transformers.js | 4.3.2 | 4.2.0 |
| onnxruntime-web | 1.27.0 | 1.26-dev |
| MediaPipe | 1.2.3 | 0.10.32 |

---

## 3. Approach

**Use hackbuild's model logic, keep LATCH's workers and UI.**

1. **Depend on `@hackbuild/models`, `@hackbuild/ai-env`, `@hackbuild/devices` and `@hackbuild/vision` from npm, pinned exactly.**
   - The same person maintains both, so we fix them upstream rather than fork.
   - We always pass our bundled runtimes in. No CDN runtime loads, which keeps COEP and the Electron CSP simple.
   - We don't take `ai-elements`: LATCH builds its own Vue picker on top of `fitOf()`.
2. **Run the hub inside our AI worker, not on the main thread.**
   - The worker owns model state, the memory budget and the GPU queue.
   - The main thread gets one status stream keyed by model id, which fixes the progress cross-talk by construction.
   - `ExecutionEngine` sends a throttled `reportFrame` (about once a second, rolling mean) so the hub can defer or skip heavy runs while frames are long.
   - WebLLM stays in its own worker. Cross-worker GPU contention is noted in §5.
3. **LATCH model specs become hackbuild `ModelRecord`s.** The `defineModel` fields gain `provides`, `ladder`, `sizeMB` + `sizeSource`, `vramMB`, `licence`, `commercial`, `source.revision/sha256` and `quirks`, keeping the one-file-per-model layout and the duplicate/orphan tests. Catalog defaults keep living in our task catalog, so LATCH decides what a node uses.
4. **Defer `@hackbuild/weights`** until its transformers.js cache path passes a real-browser check (6). Switching stores means everyone re-downloads cached models, so do it once, for a real gain: resume and shared downloads.

---

## Phase 0 result (2026-11-25)

Done and verified in Chrome on the upgraded runtime (transformers.js 4.3.2, onnxruntime-web
1.31.0-dev, web-llm 0.2.89):
- **Captioning:** Image Captioning runs SmolVLM-256M; a shader image came back as "The image
  displays a black and green spiral pattern."
- **Depth:** Depth uses Depth Anything v2 small (~27 MB) through the catalog and the "model needed"
  prompt.
- **Fixes:**
  - The Manager's VLA state.
  - "Default" follows the Manager's pick.
  - Per-request progress.
  - Speech Recognition's model select.
  - WebLLM loads in the pill.
  - The live detector asks for its model.
  - The YOLO default agrees with its control.
  - The VLA select comes from the catalog.
- **Worker:** VLMs load once per model, shared between captioning and VLA.
- **Seen live:** while a slow WASM caption ran, a depth model load sat at 0% until the worker was
  free. One worker serves every model, which is the contention Phase 2's scheduler addresses.
- **Not done:** the duplicate WebGPU check. It's left for Phase 1, which replaces both checks with
  `ai-env`'s probe.

## Phase 1 result (2026-11-25)

- **Packages:** `@hackbuild/models` and `@hackbuild/ai-env` 0.1.1 are dependencies, pinned exactly.
- **Records:** `services/ai/modelRecords.ts` turns every model spec (transformers and WebLLM) into a
  `ModelRecord`. Each record has:
  - What the model provides.
  - Its size, parsed from the spec strings and marked `inferred`.
  - Its licence and whether that allows commercial use. WebLLM specs gained licences.
  - A device and precision ladder.
  - A test checks that every spec validates with hackbuild's `validateRecord`.
- **Ladders:**
  - Task defaults come from hackbuild's measured presets. SmolVLM runs its vision encoder in fp32 on
    the GPU first, because fp16 gave wrong captions on M1.
  - The worker walks the rungs with `walkLadder` and reports the rung it used plus any failures.
  - The global q4 and "WebGPU off by default" are gone. "Use GPU" (stored as `aiPreferCpu`) is on by
    default; off means CPU rungs only.
- **One probe:** `ai-env`'s probe replaces both WebGPU checks.
- **Fit and licence are shown:**
  - In the Manager: fit and reason, a licence badge, and the device and precision a model loaded on
    plus anything it fell back from.
  - In the runtime prompt: the licence and badge before download, a fit warning, and "Default" now
    following the Manager's pick.
  - To agents: `latch_list_models`.
- **Verified in Chrome (M1, WebGPU with shader-f16, 16 GB):**
  - Depth Anything v2 loaded on the GPU in fp16 (on the CPU in q4 before).
  - SmolVLM captioned on the GPU (vision fp32 / decoder q4): "In the center of the image there are
    circles." The CPU run had said "spiral".
- **Not done:**
  - Node model selects don't show fit. They're built when the app starts, before the probe answers.
    The Manager and the prompt do show it.
  - Sizes are still the hand-written estimates. Measured per-dtype sizes come with the weights store.

## 4. Phases

Each phase ships on its own and is verified in Chrome (WebGPU) and with WebGPU disabled (WASM fallback) before the next starts.

### Phase 0: fix what's broken (no new dependencies) — small

- **Image Captioning:** default to **SmolVLM-256M-Instruct** through the image-text-to-text path the VLA node already uses, with a fixed "Describe this image in one sentence." prompt. Keep BLIP out of the catalog. Narrated Camera can go back to the Image Captioning node.
- **Model Manager:**
  - Key state by task (fixes VLA).
  - Make "selected model" mean something: a node on "Default" uses the model chosen in the Manager for that task, and the prompt and gating respect it.
- **Progress:** key worker progress by request id → model key (fixes the cross-talk).
- **Speech Recognition:** declare its model select (`models: [{ task: 'automatic-speech-recognition' }]`).
- **Catalog and prompt coverage:**
  - Put depth and the live detectors (D-FINE, RT-DETR) in the catalog.
  - Route depth, live detection and YOLO through `reportModelNeed`, so they get the prompt and the pill.
  - Show WebLLM loads in the pill.
- **De-duplicate:** the VLA select, the depth default, the YOLO default, and the WebGPU checks.
- **Upgrades:**
  - transformers.js 4.3.2: the ORT pin moves in the lockfile, `ai.worker.ts` and the CSP together; the csp-sync test guards this.
  - web-llm 0.2.89: adds gemma-4-E2B, SmolLM3-3B, LFM2.5 and MiniCPM5.
  - MediaPipe stays on 0.10.32 until the telemetry decision (§5).
- **Tests:**
  - Worker message routing and progress keys.
  - The Manager's state keys.
  - The selected-model-as-default rule.

### Phase 1: records, ladders and fit — medium

- Add `@hackbuild/models` and `@hackbuild/ai-env`, and map our specs to `ModelRecord`, with a test that every spec converts and carries a licence.
- **Per-model device and dtype ladders replace the global WebGPU toggle and q4:**
  - Ladders are tried in order through `walkLadder`.
  - Failures are classified and logged per model ("fell back to WASM: no shader-f16").
  - The WebGPU toggle becomes an override ("prefer CPU") instead of a gate.
- Show `fitOf()` everywhere a model is offered, with the reason when it doesn't fit: node selects, the Manager and the runtime prompt.
- Use real `sizeMB` numbers. Replace the "~270 MB" strings, and label where each size comes from.
- **Licence:**
  - Show it on first load (hackbuild RULES), routed through the hub's `onLicence` to a LATCH notice.
  - Mark non-commercial or restricted models: Qwen research licence, LFM open licence, AGPL YOLO, gated Llama/Gemma.
- Expose a `latch_list_models` read tool to agents: id, task, size, fit and loaded state. Loading stays with the person; agents can't start downloads.

### Phase 2: the hub in the worker — medium

- Create the hub in `ai.worker.ts` through `tjsProvider({ runtime: () => import('@huggingface/transformers') })` and `ortProvider` (YOLO).
- Memory budget with idle eviction, the GPU-exclusive queue, and one status stream (phases fetch → compile → warm → ready / failed).
- `ExecutionEngine` → worker `reportFrame` (throttled). AI node executors pass `schedule: { minIntervalMs, when: 'skip' }`, so live vision degrades its rate instead of the frame rate.
- **Move MediaPipe off the main thread.** Its tasks support a worker with OffscreenCanvas. Verify the GPU delegate there, and fall back to CPU when it fails.
- Measure frames under load: p95 frame time with depth plus hand tracking plus a 3D scene, before and after. The target is to stay under the 16.7/33 ms budget we set per flow.

### Phase 3: better vision nodes — medium

Built on `@hackbuild/vision`:
- **Depth:**
  - Default to Depth Anything **v2** small on a WebGPU rung (205 ms vs 3 s on WASM).
  - `depthWorker` for live video: texture → ImageData readback at ≤10 Hz through `readbackLoop`, so it never blocks frames.
  - Output stays a texture, plus a new `depth` data output.
- **Image Captioning and VLA** (kept as two nodes, decision 4) both run on `@hackbuild/vision`:
  - The models are SmolVLM-256M (default, Apache-2.0) and LFM2-VL-450M (WebGPU only, 3–4× faster, licence restricts commercial use by revenue).
  - Captioning uses `caption()`; VLA uses `ask(img, question)`.
- **Segment (new node), using SlimSAM:**
  - Point or box prompts come from an XY pad, blob-track or a detection box.
  - It outputs a mask texture and a cut-out texture.
  - Mask operations (feather, dilate, largest component) are controls.
  - This makes "click a thing to cut it out" possible live.
- **Detection:** keep YOLO and D-FINE. Add `ResultCache` and `detectCadenceMs` so detection runs at `max(450 ms, 4× latency)` instead of every frame. Boxes interpolate between runs.
- **Landmarks:** keep MediaPipe (now in the worker). Hackbuild's fallbacks (face-api for faces) fill in where the GPU delegate fails.
- Optionally later: `depth-mesh` → a "Depth to 3D relief" node for the 3D category.

### Phase 4: one Model Manager — medium

- One list over every family: transformers, WebLLM, MediaPipe, and later wllama and the Prompt API.
- Filter by what it does (`provides`), with fit badges and reasons, size and source, licence, and where it's stored.
- Per-model load and unload with real phases, total storage, and "free up space" (evict by last use).
- Show which open flows use each model.
- The runtime prompt reuses the same rows.
- Built in Vue with LATCH tokens; no ai-elements.

### Phase 5: later, each optional

- **`@hackbuild/weights`:** resumable, shared, verified downloads, once check 6 passes.
- **`@hackbuild/chat`:**
  - wllama, so the LLM node works without WebGPU.
  - The Prompt API (Gemini Nano) where Chrome has it.
  - `structured` for JSON outputs from the LLM node.
- **Speech:**
  - Whisper large-v3-turbo / Moonshine (`transcribe`).
  - Kokoro TTS and the bellows engine through `speak`, as a "Speak (neural)" node next to Web Speech.
- **`embed`:** the model2vec static embedder as an instant, no-download default for feature-extraction.

---

## 5. Decisions (made 2026-11-25)

1. **Depend on `@hackbuild/*` from npm**, pinned exactly. Fixes go upstream.
2. **MediaPipe stays as it is** (0.10.32): no 1.x upgrade and no telemetry. Moving it to a worker
   (Phase 2) is still planned.
3. **Offer every model**, including restricted licences (LFM2-VL, Qwen research, AGPL YOLO), each
   with a visible licence badge and the licence shown on first load.
4. **Keep Image Captioning and VLA as separate nodes.** Image Captioning gets a working default
   (SmolVLM through image-text-to-text with a fixed "describe" prompt). VLA stays the
   ask-a-question node. Phase 3 upgrades both on the shared vision path.
5. **Switch to `@hackbuild/weights`' download cache** once its transformers.js path passes a
   real-browser check. Everyone re-downloads once, which is accepted.

## 6. Risks

- **GPU contention.** The WebGL renderers, the transformers worker and the WebLLM worker all share one GPU, and a hub in one worker can't queue work in another. Mitigation: the hub's frame-aware skipping for vision, plus an app-level "AI busy" flag that pauses WebLLM generation while a vision model loads. Measure before adding more.
- **hackbuild immaturity.** Every adopted path needs our own real-browser check before release. The plan's verification steps are those checks, and we feed failures back upstream.
- **Electron.** Any runtime still fetched from a CDN needs the CSP pin moved. Passing bundled runtimes avoids most of this; the ORT WASM path remains.
- **Old flows.** Node ids, control ids and model ids in saved flows must keep loading. Add aliases and migrations with tests, as for earlier renames.

## 7. How we'll verify each phase

- Real Chrome on this Mac with WebGPU on, and again with `--disable-webgpu` or the toggle (the WASM ladder).
- For every model touched:
  - Load from a cold cache, then a warm reload.
  - Unload.
  - The fit reason on a low-memory profile, using hackbuild's stub env.
- Frame times with the Performance panel: the p95 numbers from Phase 2.
- Agent check over WebMCP: build a flow that uses the node, play it, and read its outputs.
- The existing unit gates (typecheck, vitest, lint), plus new tests for each fixed bug.
