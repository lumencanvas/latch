# Data Category

> JSON parsing, serialization, and data conversion nodes in LATCH.

**Category Color:** Gray (`#6B7280`)
**Icon:** `database`

---

## JSON Parse

Parse JSON string to object.

| Property | Value |
|----------|-------|
| **ID** | `json-parse` |
| **Icon** | `braces` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `input` | `string` | JSON string |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `output` | `data` | Parsed object |
| `error` | `string` | Parse error message |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `path` | `text` | `''` | placeholder: "e.g., data.items[0]" | Optional path to extract |

### Implementation
Uses `JSON.parse()` with optional path extraction using dot notation. Supports array indexing (e.g., `items[0].name`). Invalid JSON produces error output instead of throwing.

---

## JSON Stringify

Convert object to JSON string.

| Property | Value |
|----------|-------|
| **ID** | `json-stringify` |
| **Icon** | `braces` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `input` | `data` | Object to stringify |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `output` | `string` | JSON string |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `pretty` | `toggle` | `false` | Pretty print with indentation |

### Implementation
Uses `JSON.stringify()`. Pretty print adds 2-space indentation and newlines for readability. Handles circular references gracefully.

---

## Texture to Data

Convert texture to image data for AI processing.

| Property | Value |
|----------|-------|
| **ID** | `texture-to-data` |
| **Icon** | `image-down` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Source texture (required) |
| `trigger` | `trigger` | Capture now |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `data` | `data` | Image data in selected format |
| `width` | `number` | Image width |
| `height` | `number` | Image height |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `format` | `select` | `imageData` | options: imageData, base64, blob | Output format |
| `continuous` | `toggle` | `false` | - | Capture every frame |

### Implementation
Reads texture pixels from WebGL framebuffer. Output formats:
- **imageData**: Raw ImageData object (for Canvas/AI processing)
- **base64**: Base64-encoded PNG string
- **blob**: Blob object (for file operations)

Useful as bridge between visual pipeline and AI nodes.
