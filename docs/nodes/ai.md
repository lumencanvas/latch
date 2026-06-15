# AI Category

> Local machine learning inference nodes using Transformers.js in LATCH.

**Category Color:** Purple (`#A855F7`)
**Icon:** `brain`

All AI nodes run models locally in the browser using [Transformers.js](https://huggingface.co/docs/transformers.js). Models are downloaded on first use and cached for subsequent runs.

---

## Text Generate

Generate text using local language models.

### Info

Generates text using a local language model running in the browser. Takes a prompt and produces a completion with configurable length and temperature. Good for creative text, dialogue, or data augmentation tasks.

**Tips:**
- Lower the temperature toward 0.1 for more predictable, deterministic outputs.
- Use String Template to build structured prompts from multiple inputs before feeding them in.

**Works well with:** String Template, Sentiment, Speech to Text, Monitor

| Property | Value |
|----------|-------|
| **ID** | `text-generation` |
| **Icon** | `message-square` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `prompt` | `string` | Text prompt |
| `trigger` | `trigger` | Generate now |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `text` | `string` | Generated text |
| `loading` | `boolean` | Model/generation in progress |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `prompt` | `text` | `Once upon a time` | - | Text prompt |
| `maxTokens` | `number` | `50` | min: 10, max: 200 | Maximum tokens to generate |
| `temperature` | `slider` | `0.7` | min: 0.1, max: 2, step: 0.1 | Sampling temperature |

### Implementation
Uses Transformers.js text generation pipeline. Higher temperature produces more creative/random outputs, lower temperature produces more deterministic outputs.

---

## Classify Image

Classify images using Vision Transformer.

### Info

Classifies images using a Vision Transformer model and returns ranked labels with confidence scores. Outputs the top K predictions along with the highest-scoring label and its score. Useful for sorting, filtering, or reacting to visual content.

**Tips:**
- Lower the Top K value to reduce noise when you only care about the most likely class.
- Connect the topLabel output to a Gate node to trigger actions only when a specific class is detected.

**Works well with:** Webcam, Detect Objects, Caption Image, Gate

| Property | Value |
|----------|-------|
| **ID** | `image-classification` |
| **Icon** | `scan` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `image` | `data` | Image data (ImageData, base64, or blob) |
| `trigger` | `trigger` | Classify now |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `labels` | `data` | Array of {label, score} objects |
| `topLabel` | `string` | Highest confidence label |
| `topScore` | `number` | Highest confidence score |
| `loading` | `boolean` | Classification in progress |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `topK` | `number` | `5` | min: 1, max: 10 | Number of top results |
| `interval` | `number` | `30` | min: 1, max: 120 | Frame interval for auto-classify |

### Implementation
Uses ViT (Vision Transformer) model for ImageNet classification. Returns sorted list of labels with confidence scores.

---

## Sentiment

Analyze text sentiment (positive/negative).

### Info

Analyzes text and classifies it as positive or negative, outputting both a label and numeric scores. Returns separate positive and negative confidence values. Useful for monitoring tone in chat messages, reviews, or transcribed speech.

**Tips:**
- Connect this after Speech to Text to get real-time sentiment from spoken input.
- Use the score output with an Expression node to create custom thresholds for sentiment-based branching.

**Works well with:** Speech to Text, Text Generate, String Template, Expression

| Property | Value |
|----------|-------|
| **ID** | `sentiment-analysis` |
| **Icon** | `smile` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `text` | `string` | Text to analyze |
| `trigger` | `trigger` | Analyze now |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `sentiment` | `string` | "POSITIVE" or "NEGATIVE" |
| `score` | `number` | Confidence score (0-1) |
| `positive` | `number` | Positive probability |
| `negative` | `number` | Negative probability |
| `loading` | `boolean` | Analysis in progress |

### Controls
*None*

### Implementation
Uses distilled BERT model for binary sentiment classification. Returns both the classification and probability scores.

---

## Caption Image

Generate captions for images.

### Info

Generates a natural language description of an image using a vision-language model. Takes image data as input and produces a text caption. The frame interval control limits how often captioning runs on video streams.

**Tips:**
- Increase the frame interval when processing live video to reduce CPU and memory usage.
- Feed the caption output into Text Generate or Sentiment Analysis for further language processing.

**Works well with:** Webcam, Classify Image, Text Generate, Sentiment

| Property | Value |
|----------|-------|
| **ID** | `image-captioning` |
| **Icon** | `image` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `image` | `data` | Image data |
| `trigger` | `trigger` | Generate caption |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `caption` | `string` | Generated caption |
| `loading` | `boolean` | Captioning in progress |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `interval` | `number` | `60` | min: 1, max: 300 | Frame interval for auto-caption |

### Implementation
Uses image-to-text model to generate natural language descriptions of image content. Useful for accessibility or content analysis.

---

## Vision-Language-Action

Image + instruction → an action/answer, in-browser.

### Info

Runs a vision-language model (SmolVLM) on an image plus a natural-language instruction and outputs the model's response — an answer or a chosen action. This is the "VLM-as-policy" pattern: the model reasons over what it sees and the instruction, then emits a short action/command in text. Runs entirely in the browser (WebGPU or WASM); load the model from the AI Model Manager (Vision-Language). A true robotics VLA action head (e.g. SmolVLA's flow-matching head) is not yet browser-runnable, so a vision-language model stands in.

**Tips:**
- Feed it a Webcam Snapshot (or any Texture → Data) image and pulse Run; read the Action output.
- Constrain the output, e.g. *"Reply with exactly one of: left, right, forward, stop."*
- Wire Action into an LLM, Switch, or expression node to drive behavior; Done pulses when a result lands.
- SmolVLM 256M is fastest; 500M is more capable. Raise Frame Interval on live video to limit cost.

**Works well with:** Webcam, Caption Image, LLM (Streaming), Text Generate

| Property | Value |
|----------|-------|
| **ID** | `vla` |
| **Icon** | `bot` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `image` | `data` | Image data |
| `instruction` | `string` | Natural-language instruction (overrides the control) |
| `trigger` | `trigger` | Run inference |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `action` | `string` | The model's action/answer text |
| `loading` | `boolean` | Inference in progress |
| `done` | `trigger` | Pulses for one frame when a fresh result lands |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `model` | `select` | `SmolVLM-256M-Instruct` | 256M / 500M | Vision-language model |
| `instruction` | `text` | (an action prompt) | — | Default instruction if no input wired |
| `maxTokens` | `number` | `64` | min: 8, max: 256 | Max new tokens |
| `interval` | `number` | `120` | min: 1, max: 600 | Frame interval for auto-run |

### Implementation
Runs `HuggingFaceTB/SmolVLM-*-Instruct` via transformers.js (`AutoProcessor` + `AutoModelForVision2Seq`): `apply_chat_template` → `processor(text, [image])` → `model.generate` → decode (prompt tokens trimmed). Async fire-and-latch like Caption Image, so the frame never blocks. Browser-validated end to end.

---

## Text Embed

Convert text to embedding vectors.

### Info

Converts text into a numeric embedding vector using a transformer model. The resulting high-dimensional vector captures semantic meaning, making it useful for similarity comparisons and clustering. Runs entirely in the browser.

**Tips:**
- Connect the trigger input to control when extraction runs, since it can be computationally expensive.
- Use the dimensions output to verify the embedding size matches what downstream nodes expect.

**Works well with:** Vector Memory, Retrieve, String Template, Monitor

| Property | Value |
|----------|-------|
| **ID** | `feature-extraction` |
| **Icon** | `hash` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `text` | `string` | Text to embed |
| `trigger` | `trigger` | Extract features |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `embedding` | `data` | Embedding vector (plain `number[]`; the worker returns `Array.from(tensor.data)`) |
| `dimensions` | `number` | Vector dimensions |
| `loading` | `boolean` | Extraction in progress |

### Controls
*None*

### Implementation
Uses a sentence-transformer model to convert text into dense vector representations. Forms the embedding step of the in-browser RAG pipeline: **Text Embed → Vector Memory → Retrieve**.

---

## Vector Memory

Build a retrieval corpus incrementally from embeddings over time.

### Info

A stateful, incrementally-built RAG corpus. Pulse `add` to store the current Vector + Text; pulse `clear` to empty it. The accumulated Corpus output wires straight into the Retrieve node, so a small, short-context LLM can answer over text gathered across a whole session. Pure and offline — no model call here. State is held per-node (a `VectorStore` in a module map) and is **runtime-only**: it is cleared when execution stops and is not persisted to the saved flow (consistent with other stateful nodes).

**Tips:**
- Embed each document chunk with Text Embed, then pulse Add to remember it.
- Wire the Corpus output into the Retrieve node's Corpus input to rank by relevance.
- Set Max Size > 0 to cap the corpus (oldest entries are evicted) and bound memory in long-running sets; 0 means unlimited.
- All embeddings must come from the same model — a dimension mismatch is ignored (not stored) rather than throwing.

**Works well with:** Text Embed, Retrieve, Text Generate, Trigger

| Property | Value |
|----------|-------|
| **ID** | `vector-memory` |
| **Icon** | `database` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `vector` | `data` | Embedding to store (from Text Embed) |
| `text` | `string` | Text associated with the embedding |
| `add` | `trigger` | Rising edge stores the current vector + text |
| `clear` | `trigger` | Rising edge empties the store |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `corpus` | `data` | `[{ id, vector, text }]` — feeds the Retrieve node |
| `count` | `number` | Number of stored documents |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `maxSize` | `number` | `0` | - | Max entries (ring buffer); 0 = unlimited |

### Implementation
Backed by `services/ai/VectorStore.ts`. Rising-edge detection on `add`/`clear` means a held trigger acts once. The `corpus` output keeps a stable array reference between frames (rebuilt only on mutation), so change-driven (dirty) execution can correctly skip downstream Retrieve when nothing changed. Cleanup is wired via `gcRAGState` (node removal) and `disposeAllRAGState` (stop).

---

## Retrieve

Rank pre-embedded documents by similarity to a query embedding (RAG).

### Info

Ranks a corpus of pre-embedded documents by cosine similarity to a query embedding and returns the top-K. This is the retrieval step of in-browser RAG: it lets a small, short-context LLM answer over far more text than fits in its window. Pure and offline — no model call here.

**Tips:**
- Feed Corpus from a Vector Memory node, or as an array of `{ vector, text }` objects embedded once with Text Embed.
- Embed the user question with Text Embed and wire it to Query.
- Wire the Context output into a Text Generate / String Template prompt to ground the model in the retrieved text.

**Works well with:** Vector Memory, Text Embed, Text Generate, Monitor

| Property | Value |
|----------|-------|
| **ID** | `retrieve` |
| **Icon** | `search` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `corpus` | `data` | Array of `{ vector, text }` documents (e.g. from Vector Memory) |
| `query` | `data` | Query embedding (from Text Embed) |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `matches` | `data` | Top-K `{ id, score, text }`, highest similarity first |
| `context` | `string` | Newline-joined match texts, ready for prompt injection |
| `bestText` | `string` | Text of the single best match |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `topK` | `number` | `3` | - | Number of matches to return |

### Implementation
Pure cosine-similarity ranking via `services/ai/VectorStore.ts` (`cosineSimilarity`). Robust to malformed inputs — a missing/wrong-dimension vector scores 0 instead of throwing, so a stray embedding can't crash the graph.

---

## LLM (Streaming)

Stream text from a local WebGPU chat model (WebLLM / MLC).

### Info

Runs a full chat LLM locally on your GPU via [WebLLM](https://github.com/mlc-ai/web-llm) and streams tokens into the Text output in real time. **Requires WebGPU** (desktop Chrome/Edge, or another WebGPU-capable browser); without it the Supported output is false and nothing is generated. Weights download once (~1–4 GB depending on model) and are cached. The engine runs in its own worker and the package is loaded on demand, so it never blocks the render loop or bloats startup.

**Tips:**
- Start with Llama 3.2 1B (smallest/fastest); larger models need more VRAM.
- Wire a Retrieve node's Context into Prompt or System to ground answers in your own documents (RAG): Text Embed → Vector Memory → Retrieve → LLM.
- Watch Generating to drive a "thinking" indicator; Done pulses once when the stream finishes.

**Works well with:** Retrieve, Vector Memory, Text Embed, String Template

| Property | Value |
|----------|-------|
| **ID** | `llm` |
| **Icon** | `sparkles` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `prompt` | `string` | User prompt (falls back to the Prompt control) |
| `system` | `string` | Optional system prompt |
| `trigger` | `trigger` | Generate now (rising edge) |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `text` | `string` | Generated text, accumulating as it streams |
| `generating` | `boolean` | Loading or generating in progress |
| `done` | `trigger` | Pulses once when a generation completes |
| `supported` | `boolean` | False when WebGPU is unavailable |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `model` | `select` | `Llama-3.2-1B-Instruct-q4f16_1-MLC` | 6 MLC models | Which model to run |
| `prompt` | `text` | `''` | - | Prompt (used when the input is unconnected) |
| `system` | `text` | `''` | - | System prompt |
| `maxTokens` | `number` | `512` | min: 16, max: 4096 | Max tokens to generate |
| `temperature` | `slider` | `0.7` | min: 0, max: 2, step: 0.1 | Sampling temperature |

### Implementation
Backed by `services/ai/WebLLMService.ts` (one shared engine + per-node streaming state) and a dedicated `webllm.worker.ts`. `@mlc-ai/web-llm` is dynamic-imported (kept out of the main bundle) and WebGPU-gated via `services/ai/webgpu.ts`. Generation is fire-and-latch: the executor starts it without awaiting and reads accumulated tokens each frame. OpenAI-compatible streaming API under the hood.

---

## Detect Objects

Detect and locate objects in images.

### Info

Detects and locates objects in images using a transformer-based model. Returns a list of detected objects with bounding boxes, labels, and confidence scores. The threshold control filters out low-confidence detections.

**Tips:**
- Lower the threshold to catch more objects at the cost of more false positives.
- Use the count output to trigger logic only when a certain number of objects are in the scene.

**Works well with:** Webcam, Classify Image, Object Detection (MediaPipe), Gate

| Property | Value |
|----------|-------|
| **ID** | `object-detection` |
| **Icon** | `box` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `image` | `data` | Image data |
| `trigger` | `trigger` | Detect now |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `objects` | `data` | Array of detected objects with bounding boxes |
| `count` | `number` | Number of detected objects |
| `loading` | `boolean` | Detection in progress |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `threshold` | `slider` | `0.5` | min: 0.1, max: 1, step: 0.05 | Confidence threshold |
| `interval` | `number` | `30` | min: 1, max: 120 | Frame interval for auto-detect |

### Implementation
Uses DETR or similar object detection model. Returns array of objects with `{label, score, box: {xmin, ymin, xmax, ymax}}` format.

---

## Speech to Text

Transcribe audio to text using Whisper.

### Info

Transcribes audio to text using the Whisper model. Supports three modes: manual transcription on trigger, continuous auto-chunking, and voice activity detection (VAD) that listens for speech and transcribes automatically. Runs entirely in the browser.

**Tips:**
- Use VAD mode for hands-free transcription that only processes audio when someone is speaking.
- Increase the buffer duration in continuous mode to get longer, more coherent transcription chunks.

**Works well with:** Audio Input, Sentiment, Text Generate, String Template

| Property | Value |
|----------|-------|
| **ID** | `speech-recognition` |
| **Icon** | `mic` |
| **Version** | 2.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `audio` | `audio` | Audio input (microphone or audio node) |
| `trigger` | `trigger` | Transcribe now (manual mode) |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `text` | `string` | Transcribed text |
| `partial` | `string` | Partial text (during transcription) |
| `speaking` | `boolean` | Voice activity detected (VAD mode) |
| `loading` | `boolean` | Transcription in progress |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `mode` | `select` | `manual` | options: manual, continuous, vad | Transcription mode |
| `bufferDuration` | `number` | `5` | min: 1, max: 30, step: 1 | Buffer duration (seconds) |
| `vadThreshold` | `number` | `0.01` | min: 0.001, max: 0.1, step: 0.001 | VAD sensitivity |
| `vadSilenceDuration` | `number` | `500` | min: 100, max: 2000, step: 50 | Silence duration before end (ms) |
| `chunkInterval` | `number` | `3000` | min: 1000, max: 10000, step: 500 | Chunk interval (ms) for continuous mode |

### Implementation
Uses Whisper model via Transformers.js. Three modes:
- **Manual**: Transcribe on trigger
- **Continuous**: Auto-chunk at fixed intervals
- **VAD**: Voice Activity Detection triggers transcription

---

## Text Transform

Transform text - summarize, translate, or rewrite.

### Info

Transforms text using T5/Flan models for summarization, translation, or paraphrasing. Select a task and the model rewrites the input accordingly. Runs locally in the browser with no external API calls.

**Tips:**
- Increase max tokens for longer summaries or translations.
- Chain with String Template to add task-specific prefixes before the input text.

**Works well with:** String Template, Text Generate, Sentiment, Speech to Text

| Property | Value |
|----------|-------|
| **ID** | `text-transformation` |
| **Icon** | `refresh-cw` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `text` | `string` | Input text |
| `trigger` | `trigger` | Transform now |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `result` | `string` | Transformed text |
| `loading` | `boolean` | Transformation in progress |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `text` | `text` | `''` | - | Input text |
| `task` | `select` | `summarize` | options: summarize, translate, paraphrase | Transformation task |
| `maxTokens` | `number` | `100` | min: 10, max: 500 | Maximum output tokens |

### Implementation
Uses T5/Flan models for text-to-text transformations:
- **Summarize**: Condense long text
- **Translate**: Convert to French
- **Paraphrase**: Rewrite in different words

---

# MediaPipe Vision Nodes

The following nodes use [MediaPipe Tasks Vision](https://developers.google.com/mediapipe/solutions/vision) for real-time computer vision. All MediaPipe nodes include custom overlay visualization.

---

## Hand Tracking

Detect and track hand landmarks using MediaPipe.

### Info

Tracks hand landmarks in real time from a video feed using MediaPipe. Outputs 21 landmark points per hand, world-space coordinates, handedness, and fingertip positions. Supports multiple visualization modes including skeleton, mesh, and bounding box.

**Tips:**
- Use the fingerTips output to get just the five fingertip positions without parsing the full landmark array.
- Enable "Color by Hand" to visually distinguish left and right hands in the overlay.

**Works well with:** Webcam, Gesture Recognition, Pose Estimation, Shader

| Property | Value |
|----------|-------|
| **ID** | `mediapipe-hand` |
| **Icon** | `hand` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`MediaPipeHandNode.vue`) |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `video` | `video` | Video source (e.g., from Webcam) |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `landmarks` | `data` | 21 hand landmark points (normalized) |
| `worldLandmarks` | `data` | 3D world coordinates |
| `handedness` | `string` | "Left" or "Right" |
| `confidence` | `number` | Detection confidence (0-1) |
| `gestureType` | `string` | Basic gesture classification |
| `fingerTips` | `data` | Finger tip positions array |
| `handCount` | `number` | Number of hands detected |
| `detected` | `boolean` | Any hand detected |
| `loading` | `boolean` | Model loading state |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | `toggle` | `true` | Enable detection |
| `handIndex` | `slider` | `0` | Which hand to output (0 or 1) |
| `showOverlay` | `toggle` | `true` | Show visualization overlay |
| `vizMode` | `select` | `skeleton` | Visualization style (skeleton, mesh, both, bbox) |
| `overlayColor` | `color` | `#00ff00` | Overlay color |
| `lineWidth` | `slider` | `2` | Line thickness |
| `pointSize` | `slider` | `4` | Landmark point size |
| `colorByHand` | `toggle` | `true` | Different colors per hand |

---

## Face Mesh

Detect face landmarks and blendshapes using MediaPipe.

### Info

Detects 468 face landmarks and blendshapes from a video feed using MediaPipe Face Mesh. Provides head rotation angles, individual expression values like mouth open and eye blink, and multiple visualization styles. Runs in real time in the browser.

**Tips:**
- Use the blendshape outputs like smile or mouthOpen to drive parameters in a Shader node.
- Switch the overlay style to "contours" for a cleaner visualization that highlights facial outlines only.

**Works well with:** Webcam, Hand Tracking, Pose Estimation, Shader

| Property | Value |
|----------|-------|
| **ID** | `mediapipe-face` |
| **Icon** | `smile` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`MediaPipeFaceNode.vue`) |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `video` | `video` | Video source |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `landmarks` | `data` | 468 face landmark points |
| `blendshapes` | `data` | ARKit-compatible blendshape weights |
| `headRotation` | `data` | Head rotation matrix |
| `pitch` | `number` | Head pitch angle |
| `yaw` | `number` | Head yaw angle |
| `roll` | `number` | Head roll angle |
| `faceBox` | `data` | Face bounding box |
| `mouthOpen` | `number` | Mouth openness (0-1) |
| `eyeBlinkLeft` | `number` | Left eye blink (0-1) |
| `eyeBlinkRight` | `number` | Right eye blink (0-1) |
| `browRaise` | `number` | Eyebrow raise (0-1) |
| `smile` | `number` | Smile intensity (0-1) |
| `detected` | `boolean` | Face detected |
| `loading` | `boolean` | Model loading state |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | `toggle` | `true` | Enable detection |
| `showOverlay` | `toggle` | `true` | Show visualization |
| `overlayColor` | `color` | `#00ff00` | Overlay color |
| `lineWidth` | `slider` | `1` | Line thickness |
| `meshMode` | `select` | `mesh` | Style (mesh, contours, points, bbox) |
| `showExpressions` | `toggle` | `true` | Show expression values |

---

## Pose Estimation

Detect body pose landmarks using MediaPipe.

### Info

Detects 33 body pose landmarks from a video feed using MediaPipe Pose. Provides both normalized and world-space coordinates, per-landmark visibility scores, and convenient outputs for key body points like shoulders, elbows, and hips.

**Tips:**
- Enable "Fade by Visibility" to make occluded or low-confidence landmarks less prominent in the overlay.
- Use the individual joint outputs like leftWrist directly instead of parsing the full landmarks array.

**Works well with:** Webcam, Hand Tracking, Face Mesh, Shader

| Property | Value |
|----------|-------|
| **ID** | `mediapipe-pose` |
| **Icon** | `accessibility` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`MediaPipePoseNode.vue`) |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `video` | `video` | Video source |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `landmarks` | `data` | 33 body landmark points |
| `worldLandmarks` | `data` | 3D world coordinates |
| `visibility` | `data` | Per-landmark visibility scores |
| `nose` | `data` | Nose position {x, y, z} |
| `leftShoulder` | `data` | Left shoulder position |
| `rightShoulder` | `data` | Right shoulder position |
| `leftElbow` | `data` | Left elbow position |
| `rightElbow` | `data` | Right elbow position |
| `leftWrist` | `data` | Left wrist position |
| `rightWrist` | `data` | Right wrist position |
| `leftHip` | `data` | Left hip position |
| `rightHip` | `data` | Right hip position |
| `detected` | `boolean` | Pose detected |
| `loading` | `boolean` | Model loading state |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | `toggle` | `true` | Enable detection |
| `showOverlay` | `toggle` | `true` | Show visualization |
| `vizMode` | `select` | `skeleton` | Style (skeleton, points, bbox) |
| `overlayColor` | `color` | `#00ff00` | Overlay color |
| `lineWidth` | `slider` | `2` | Line thickness |
| `pointSize` | `slider` | `4` | Landmark point size |
| `showVisibility` | `toggle` | `true` | Fade by visibility score |

---

## Object Detection (MediaPipe)

Detect objects in video using MediaPipe EfficientDet.

### Info

Detects objects in a video stream using the MediaPipe EfficientDet model. Returns bounding boxes, labels, and confidence scores for each detected object. Includes a label filter to focus on specific object categories.

**Tips:**
- Use the label filter to restrict detections to only the categories you care about, like "person" or "car".
- Connect the topBox output to a Shader node to highlight the most confident detection visually.

**Works well with:** Webcam, Detect Objects, Classify Image, Gate

| Property | Value |
|----------|-------|
| **ID** | `mediapipe-object` |
| **Icon** | `scan` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`MediaPipeObjectNode.vue`) |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `video` | `video` | Video source |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `detections` | `data` | Array of all detections |
| `count` | `number` | Number of objects detected |
| `filtered` | `data` | Detections matching label filter |
| `topLabel` | `string` | Highest confidence label |
| `topConfidence` | `number` | Highest confidence score |
| `topBox` | `data` | Top detection bounding box |
| `detected` | `boolean` | Any object detected |
| `loading` | `boolean` | Model loading state |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | `toggle` | `true` | Enable detection |
| `minConfidence` | `slider` | `0.5` | Minimum confidence threshold |
| `maxResults` | `slider` | `10` | Maximum results to return |
| `labelFilter` | `text` | `''` | Filter by label (comma-separated) |
| `showOverlay` | `toggle` | `true` | Show bounding boxes |
| `overlayColor` | `color` | `#00ff00` | Box color |
| `lineWidth` | `slider` | `2` | Box line thickness |
| `showLabels` | `toggle` | `true` | Show labels on boxes |

---

## Selfie Segmentation

Segment person from background using MediaPipe.

### Info

Separates a person from the background in a video feed using MediaPipe Selfie Segmentation. Outputs a mask that can be used for cutout effects, background blur, or custom compositing. Runs in real time in the browser.

**Tips:**
- Use the "Blur BG" overlay mode for a quick virtual background effect without additional nodes.
- Adjust mask opacity to blend the segmentation visualization with the original video.

**Works well with:** Webcam, Shader, Pose Estimation, Face Mesh

| Property | Value |
|----------|-------|
| **ID** | `mediapipe-segmentation` |
| **Icon** | `layers` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`MediaPipeSegmentationNode.vue`) |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `video` | `video` | Video source |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `mask` | `data` | Segmentation mask (ImageData) |
| `detected` | `boolean` | Person detected |
| `loading` | `boolean` | Model loading state |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | `toggle` | `true` | Enable segmentation |
| `showOverlay` | `toggle` | `true` | Show visualization |
| `overlayMode` | `select` | `mask` | Mode (mask, cutout, blur) |
| `overlayColor` | `color` | `#00ff00` | Mask color |
| `maskOpacity` | `slider` | `0.5` | Mask transparency |

### Implementation
Uses MediaPipe Selfie Segmentation for real-time person/background separation. Useful for virtual backgrounds, compositing, and effects.

---

## Gesture Recognition

Recognize hand gestures using MediaPipe.

### Info

Recognizes hand gestures from a video feed using MediaPipe. Identifies common gestures like thumbs up, open palm, and pointing, and outputs the gesture name, confidence, and hand landmarks. Can track multiple hands simultaneously.

**Tips:**
- Increase the min confidence threshold to reduce false positives in noisy environments.
- Use the gesture string output with a Gate node to trigger different actions for different gestures.

**Works well with:** Webcam, Hand Tracking, Gate, Monitor

| Property | Value |
|----------|-------|
| **ID** | `mediapipe-gesture` |
| **Icon** | `hand` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`MediaPipeGestureNode.vue`) |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `video` | `video` | Video source |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `gesture` | `string` | Recognized gesture name |
| `confidence` | `number` | Gesture confidence (0-1) |
| `landmarks` | `data` | Hand landmarks |
| `handedness` | `string` | "Left" or "Right" |
| `handCount` | `number` | Number of hands detected |
| `allGestures` | `data` | All recognized gestures array |
| `detected` | `boolean` | Gesture detected |
| `loading` | `boolean` | Model loading state |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | `toggle` | `true` | Enable recognition |
| `showOverlay` | `toggle` | `true` | Show visualization |
| `overlayColor` | `color` | `#00ff00` | Overlay color |
| `lineWidth` | `slider` | `2` | Line thickness |
| `confidenceThreshold` | `slider` | `0.5` | Minimum confidence |

### Implementation
Recognizes predefined gestures like: Thumb Up, Thumb Down, Victory, Pointing Up, ILoveYou, Closed Fist, Open Palm.

---

## Audio Classifier

Classify audio using MediaPipe YamNet model.

### Info

Classifies audio input using the MediaPipe YamNet model, identifying sounds like speech, music, and environmental noise. Outputs the top category, confidence score, and convenience booleans for speech and music detection.

**Tips:**
- Raise the min score threshold to filter out low-confidence classifications.
- Use the isSpeech output to trigger speech recognition only when someone is actually talking.

**Works well with:** Audio Input, Speech to Text, Gate, Monitor

| Property | Value |
|----------|-------|
| **ID** | `mediapipe-audio` |
| **Icon** | `audio-waveform` |
| **Version** | 1.0.0 |
| **Custom UI** | Yes (`MediaPipeAudioNode.vue`) |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `audio` | `audio` | Audio source |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `category` | `string` | Top classification label |
| `confidence` | `number` | Top classification confidence |
| `categories` | `data` | All classifications array |
| `isSpeech` | `boolean` | Speech detected |
| `isMusic` | `boolean` | Music detected |
| `detected` | `boolean` | Classification available |
| `loading` | `boolean` | Model loading state |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `enabled` | `toggle` | `true` | Enable classification |
| `classifyInterval` | `number` | `500` | Classification interval in milliseconds |
| `maxResults` | `slider` | `5` | Maximum results |
| `scoreThreshold` | `slider` | `0.3` | Minimum score threshold |

### Implementation
Uses YamNet model via MediaPipe Tasks Audio to classify 521 audio categories including speech, music, environmental sounds, and more. The `isSpeech` and `isMusic` outputs are derived by checking if any of the top classifications match known speech or music category patterns.

**Note:** The `maxResults` and `scoreThreshold` controls are applied when the model is first loaded. Changing them after the model has loaded requires restarting the flow.
