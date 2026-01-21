# AI Category

> Local machine learning inference nodes using Transformers.js in LATCH.

**Category Color:** Purple (`#A855F7`)
**Icon:** `brain`

All AI nodes run models locally in the browser using [Transformers.js](https://huggingface.co/docs/transformers.js). Models are downloaded on first use and cached for subsequent runs.

---

## Text Generate

Generate text using local language models.

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

## Text Embed

Convert text to embedding vectors.

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
| `embedding` | `data` | Float32Array embedding vector |
| `dimensions` | `number` | Vector dimensions |
| `loading` | `boolean` | Extraction in progress |

### Controls
*None*

### Implementation
Uses sentence transformer model to convert text into dense vector representations. Useful for semantic similarity comparisons or as input to other ML models.

---

## Detect Objects

Detect and locate objects in images.

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
