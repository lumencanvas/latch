# Vision Nodes Plan — Snapshot, Live-Video AI, OpenCV.js (2026-06-22)

> **STATUS (2026-06-23): all phases shipped** on `modernization` — snapshot, `object-detection-live`,
> OpenCV.js service + 8 nodes, **and Tier B `object-detection-yolo`** (YOLOv9/GELAN ONNX via
> onnxruntime-web; real-browser inference proven, output `[1,84,8400]`). See the two 2026-06-23
> HANDOFF.md entries for commits, the 4 bugs fixed, and verification (OpenCV/COEP + YOLO inference proofs).

Three new node families requested:
1. **Snapshot** — capture a still frame from any video/texture feed on trigger, pass it along.
2. **Live-video AI** — object detection on a live feed (YOLOS/DETR; optional YOLOv8-ONNX), with an
   annotated-texture output.
3. **OpenCV.js** — CPU image-processing nodes (edges, threshold, contours, morphology, …).

This plan is grounded in a read-only audit of the current architecture. The ready-to-paste **kickoff
prompt** is at the bottom.

---

## Architecture facts (verified, file:line)

**Add a node** = a `NodeDefinition` (`stores/nodes.ts:83-107`) under `registry/<category>/` + an executor
(`NodeExecutorFn`) in `engine/executors/<category>.ts`, joined by the node's string `id`.
- Register: export from `registry/<category>/index.ts` AND push into the category array (spread into
  `allNodes`, `registry/index.ts:31-50`). Executor: add to that file's map (e.g. `visualExecutors`
  `visual.ts:1792`, `aiExecutors` `ai.ts:2128`), spread into `builtinExecutors` (`executors/index.ts`),
  auto-registered in `composables/useExecutionEngine.ts:18-23`.
- **Custom Vue UI** (only if the node needs bespoke UI/overlay): add the id+component to `nodeTypes` in
  `registry/components.ts:43-91` or it silently falls back to `BaseNode`. (Precedent: MediaPipe nodes.)
- **gc/dispose (MANDATORY, CLAUDE.md):** per-node state in a module-level Map; export
  `gc<Cat>State(validNodeIds)` + `disposeAll<Cat>Nodes()`, both imported and called in
  `ExecutionEngine.ts:203-223` (per-node on removal) and `:833-842` (teardown). Precedent:
  `disposeVisualNode`/`gcVisualState` (`visual.ts:68,207`), `gcAIState` keyed `nodeId:suffix`
  (`ai.ts:2073`).

**ExecutionContext** (`ExecutionEngine.ts:101-109`): `{ nodeId, inputs:Map, controls:Map, deltaTime,
totalTime, frameCount }`. Executor returns `Map<string,unknown>` keyed by output port id. `_`-prefixed
outputs are side-channel.

**Port types** (`stores/nodes.ts:29-47`): `texture` (THREE.Texture), `video` (HTMLVideoElement), `data`
(catch-all: detections/ImageData/objects), `trigger`, plus number/boolean/string. **No `image` type** —
use `data`.

**Texture I/O:** a `texture` port carries a **THREE.Texture**; `texture.image` holds the backing
canvas/video/image. Make textures with `getThreeShaderRenderer().createTexture(source)` /
`updateTexture(tex, source)` (`ThreeShaderRenderer.ts:782,795`). Read a THREE.Texture back to a 2D canvas
with `renderToCanvas(tex, canvas)` (`:671`). Normalize any texture/video/canvas/ImageData → `ImageData`
with `convertToImageData(input)` (`ai.ts:204-235`).

**⚠️ 3-WebGL-context gotcha:** textures created on `ThreeShaderRenderer` can't be sampled by `ThreeRenderer`
(3D nodes) — a texture output displays in shaders/Main Output but is blank in 3D nodes. Keep new outputs
on the `ThreeShaderRenderer` context. (See [[latch-webgl-contexts]] / HANDOFF 2026-06-22.)

**Per-frame throttle** (canonical, `ai.ts:1086-1130`): frame-skip via `ctx.frameCount` + an `interval`
control; a `pendingOperations` guard prevents overlapping async runs; `getCached/setCached`
(`ai.ts:30-37`, keyed `nodeId:suffix`) re-serves results between runs. For capture nodes, a `continuous`
toggle vs `trigger` latch (`textureToDataExecutor` `visual.ts:1224-1306`).

**AI infra:**
- Transformers.js worker: `ai.worker.ts` runs `pipeline(task, model)` (`:221`); main-thread facade
  `AIInference.ts`; `aiInference.detectObjects(image, threshold, modelId)` (`:852`) → worker
  `detectObjects` (`ai.worker.ts:321`). Object-detection models incl. **`Xenova/yolos-tiny`** already
  registered (`AIInference.ts:146`); `onnxruntime-web` present transitively (no direct import yet).
- MediaPipe (main thread): `MediaPipeService.detectObjects(video, ts)` (`:620`) on the live `<video>`,
  WASM from jsdelivr CDN (`:329`).
- Existing detection nodes (`object-detection` `ai.ts:1055`, `mediapipe-object` `ai.ts:1516`) output
  **data only** (boxes/labels/scores) — **no annotated texture**. The new value is live texture/video
  input + a boxes-drawn texture output.

**OpenCV.js:** net-new (not a dep, not vendored). Lazy-load from CDN with an `isLoading` flag, mirroring
`MediaPipeService` (`:329-367`). COOP/COEP in `netlify.toml` is `credentialless`, so CDN WASM loads.
**Mats live in the WASM heap — they MUST be `.delete()`d** in both `dispose*` and `gc*State` or they leak
hard. Canvas↔Mat is a CPU copy each way; throttle with frame-skip.

---

## Family 1 — Snapshot node (do first; smallest, well-templated)

**`snapshot`** (category `visual`). Capture/hold a still from any feed.
- **Inputs:** `source` (`texture`), `trigger` (`trigger`).
- **Controls:** `continuous` (boolean, default false — capture every frame), `mirror` (boolean).
- **Outputs:** `texture` (held frame, THREE.Texture), `imageData` (`data`, ImageData), `width`,
  `height`, `captured` (`trigger` pulse on capture).
- **Behavior:** on rising-edge `trigger` (or every frame when `continuous`), latch the current `source`
  frame into a per-node held canvas → `createTexture/updateTexture` → output the held texture. Between
  captures, keep emitting the last held texture. Empty until first capture.
- **Implementation:** template off `textureToDataExecutor` (`visual.ts:1224-1306`, THREE.Texture →
  `renderToCanvas` → held canvas → `getImageData`) + `webcamSnapshotExecutor` (`visual.ts:1692-1772`,
  the trigger-latch + texture-from-canvas half). For a `video`-element source, `drawImage`. Per-node
  state Map + dispose/gc in `visual.ts`. Output texture stays on `ThreeShaderRenderer` context.

## Family 2 — Live-video AI (object detection)

**Tier A (MVP, low-friction): `object-detection-live`** (category `ai`). Continuous detection on a live
feed with an annotated-texture output.
- **Inputs:** `source` (`texture` or `video`), optional `trigger`.
- **Controls:** `model` (dropdown: `Xenova/yolos-tiny` default, `Xenova/detr-resnet-50`, …), `threshold`
  (slider), `interval` (frames between runs, default ~15–30), `showBoxes` (boolean), `showLabels`,
  `boxColor`, `lineWidth`.
- **Outputs:** `detections` (`data`: `[{label,score,box:{xmin,ymin,xmax,ymax}}]`), `count` (number),
  `topLabel` (string), `texture` (`texture`: the source frame with boxes/labels drawn), `loading`
  (boolean).
- **Behavior:** reuse `convertToImageData(source)` (`ai.ts:204`) → throttle with `frameCount`/`interval`
  + `pendingOperations` guard → `aiInference.detectObjects(imageData, threshold, model)` (`ai.ts:852`).
  Each frame, draw the latched source to a per-node canvas and overlay the **last** detections (boxes +
  labels, reuse `registry/ai/utils/mediapipe-drawing.ts`) → `createTexture` → `texture` output. Cache
  detections via `getCached/setCached` so the overlay stays smooth between throttled runs.
- gc via `gcAIState` (already prefix-keyed); custom overlay controls can live on BaseNode (no bespoke Vue
  needed unless desired).

**Tier B (stretch): `yolov8` ONNX node.** A raw YOLOv8 `.onnx` doesn't fit the HF `pipeline()` path —
import `onnxruntime-web` directly in (a new section of) `ai.worker.ts`, add letterbox preprocessing +
NMS post-processing. Higher perf/control, more work. Ship Tier A first; add Tier B only if YOLOS/DETR
speed/accuracy is insufficient. (VLM path `ai.worker.ts:202-214` shows how to drop below `pipeline()`.)

## Family 3 — OpenCV.js nodes

**New `services/visual/OpenCVService.ts`** — lazy CDN load (`opencv.js`) with `load()/isReady()/isLoading()`,
mirroring `MediaPipeService` (`:329-367`). New executor file `engine/executors/opencv.ts` (map spread into
`builtinExecutors`), new defs under `registry/opencv/` (or `registry/visual/`). **Every node:**
texture/video → `convertToImageData` → `cv.matFromImageData` → op → `cv.imshow(canvas, mat)` →
`createTexture(canvas)`; **`mat.delete()` every Mat** in both `disposeOpenCVNode` and `gcOpenCVState`;
frame-skip throttle.

**Starter set (high value, low risk):**
- `cv-grayscale`, `cv-canny` (edges; controls: lo/hi threshold), `cv-threshold` (binary/adaptive),
  `cv-blur` (Gaussian/median; kernel size), `cv-morphology` (erode/dilate/open/close).
- `cv-contours` — find + draw contours; outputs annotated `texture` + `data` (contour list/count).
**Advanced (later):** optical flow (motion), perspective `warp`, feature detection (ORB/corners).

---

## Implementation order
1. **Snapshot** (1 node, no new deps) — validates the texture-latch pattern end-to-end.
2. **`object-detection-live`** (Tier A) — reuses the wired Transformers.js path; adds the annotated-texture
   capability.
3. **OpenCVService + starter OpenCV nodes** — net-new service + 4–6 nodes; nail the Mat `.delete()`
   discipline first (write the dispose/gc before the ops).
4. (Optional) YOLOv8-ONNX (Tier B); advanced OpenCV nodes.

Each phase: definition + executor + register + **gc/dispose wired** + `npm run typecheck`/`lint`/
`test:unit`/`build` green; single-purpose commit (no AI attribution); verify a node renders + runs.

---

## KICKOFF PROMPT (paste into a fresh session)

> Implement three new vision node families in LATCH (Vue 3 + TS + Vite node-graph app), per
> `docs/plans/VISION_NODES_PLAN_2026-06-22.md`. Build in this order, one phase at a time, verifying and
> committing each: **(1) a generic `snapshot` node, (2) an `object-detection-live` AI node, (3) an
> `OpenCVService` + a starter set of OpenCV.js nodes.**
>
> **Read first:** `CLAUDE.md` (rules), `docs/plans/VISION_NODES_PLAN_2026-06-22.md` (this plan), and the
> cited files. Don't assume — read the actual implementations.
>
> **Architecture (verified):** A node = a `NodeDefinition` (`src/renderer/stores/nodes.ts:83-107`) under
> `src/renderer/registry/<category>/` + a `NodeExecutorFn` in `src/renderer/engine/executors/<category>.ts`,
> joined by string `id`. Register the def in `registry/<category>/index.ts` (export + push into the category
> array) and the executor in that file's map (spread into `builtinExecutors`, `executors/index.ts`;
> auto-registered in `composables/useExecutionEngine.ts`). Custom Vue UI must be added to `nodeTypes` in
> `registry/components.ts` or it falls back to `BaseNode`.
>
> **MANDATORY conventions:**
> - **gc/dispose:** per-node state in a module-level Map; export `gc<Cat>State(validNodeIds)` +
>   `disposeAll<Cat>Nodes()` and wire BOTH into `ExecutionEngine.ts` (`:203-223` per-node, `:833-842`
>   teardown). For OpenCV, **every `cv.Mat` MUST be `.delete()`d** in those paths (WASM heap leak otherwise).
> - **Port types** (`stores/nodes.ts:29-47`): `texture` (THREE.Texture), `video`, `data`, `trigger`,
>   number/boolean/string. No `image` type.
> - **Textures:** create with `getThreeShaderRenderer().createTexture/updateTexture`; read back with
>   `renderToCanvas`; normalize inputs with `convertToImageData(input)` (`ai.ts:204`). **Keep outputs on the
>   ThreeShaderRenderer context** (a texture made there is blank if sampled by 3D nodes — the 3-context
>   gotcha).
> - **Throttle** expensive per-frame work with `ctx.frameCount` + an `interval` control + a
>   `pendingOperations` guard + `getCached/setCached` (pattern in `ai.ts:1086-1130`).
> - Commits: single-purpose, imperative, **no AI attribution** (CLAUDE.md). Run `npm run typecheck`,
>   `npm run lint`, `npm run test:unit`, `npm run build` before declaring a phase done.
>
> **Phase 1 — `snapshot` (category visual):** inputs `source`(texture) + `trigger`; controls `continuous`,
> `mirror`; outputs `texture` (held frame), `imageData`(data), `width`, `height`, `captured`(trigger). On
> trigger (or continuous), latch the current source into a per-node canvas → `createTexture` → output; hold
> the last frame between captures. Template off `textureToDataExecutor` (`visual.ts:1224-1306`) +
> `webcamSnapshotExecutor` (`visual.ts:1692-1772`).
>
> **Phase 2 — `object-detection-live` (category ai):** input `source`(texture/video); controls `model`
> (default `Xenova/yolos-tiny`), `threshold`, `interval`, `showBoxes`/`showLabels`/`boxColor`/`lineWidth`;
> outputs `detections`(data), `count`, `topLabel`, `texture` (source frame with boxes drawn), `loading`.
> Reuse `convertToImageData` + `aiInference.detectObjects` (`ai.ts:852`) + the frame-skip throttle; draw the
> overlay each frame from cached detections using `registry/ai/utils/mediapipe-drawing.ts`; gc via
> `gcAIState`. (YOLOv8-ONNX is a later stretch — needs onnxruntime-web direct + letterbox/NMS; do YOLOS
> first.)
>
> **Phase 3 — OpenCV.js:** add `services/visual/OpenCVService.ts` (lazy CDN load of opencv.js with
> `isReady()/isLoading()`, mirroring `MediaPipeService`), a new `executors/opencv.ts`, and a new
> `registry/opencv/` (or under visual). Starter nodes: `cv-grayscale`, `cv-canny`, `cv-threshold`,
> `cv-blur`, `cv-morphology`, `cv-contours` (annotated texture + contour data). Each: texture/video →
> `convertToImageData` → `cv.matFromImageData` → op → `cv.imshow(canvas,mat)` → `createTexture`; **delete
> every Mat**; throttle. Write the dispose/gc (with Mat deletes) BEFORE the ops.
>
> Start with Phase 1. After each node renders + runs, commit, then continue.
