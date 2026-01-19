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
