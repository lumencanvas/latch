# Visual Category

> Image/texture processing and shader effects using WebGL/Three.js in LATCH.

**Category Color:** Pink (`#EC4899`)
**Icon:** `image`

---

## Shader

Custom GLSL shader with dynamic uniform inputs.

| Property | Value |
|----------|-------|
| **ID** | `shader` |
| **Icon** | `code` |
| **Version** | 3.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `iChannel0` | `texture` | Texture input channel 0 |
| `iChannel1` | `texture` | Texture input channel 1 |
| `iChannel2` | `texture` | Texture input channel 2 |
| `iChannel3` | `texture` | Texture input channel 3 |
| *(dynamic)* | varies | Generated from shader uniforms |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Rendered output texture |

### Controls
| Control | Type | Default | Description |
|---------|------|---------|-------------|
| `preset` | `select` | `custom` | Built-in shader presets |
| `code` | `code` | (default shader) | Fragment shader GLSL code |
| `vertexCode` | `code` | `''` | Optional vertex shader |
| `shadertoy` | `toggle` | `true` | Shadertoy compatibility mode |
| *(dynamic)* | varies | - | Generated from shader uniforms |

### Built-in Presets
- **Generators**: gradient, noise, plasma, circles, waves, voronoi
- **Effects**: chromatic-aberration, pixelate, vignette, glitch, edge-detect, kaleidoscope
- **Utility**: solid-color, uv-debug, passthrough
- **Artistic**: watercolor, halftone

### Implementation
Uses Three.js `ShaderMaterial` for WebGL rendering:
1. Parses GLSL code for `uniform` declarations
2. Generates dynamic input ports for user-defined uniforms
3. Provides Shadertoy-compatible built-in uniforms:
   - `iTime`: Time in seconds
   - `iResolution`: Output resolution
   - `iMouse`: Mouse position
   - `iChannel0-3`: Texture inputs

### Dynamic Uniform Detection
```glsl
uniform float u_brightness;  // -> creates number input
uniform vec3 u_color;        // -> creates data input
uniform sampler2D u_image;   // -> creates texture input
```

---

## Webcam

Capture video from camera.

| Property | Value |
|----------|-------|
| **ID** | `webcam` |
| **Icon** | `camera` |
| **Version** | 1.0.0 |

### Inputs
*None*

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Video as texture |
| `video` | `video` | HTMLVideoElement |
| `width` | `number` | Video width |
| `height` | `number` | Video height |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `enabled` | `toggle` | `true` | - | Enable/disable capture |
| `device` | `select` | `default` | deviceType: 'video-input' | Camera device |

### Implementation
Uses `navigator.mediaDevices.getUserMedia()` to access camera. Creates a `VideoTexture` that updates each frame.

---

## Webcam Snapshot

Capture snapshots from webcam on trigger.

| Property | Value |
|----------|-------|
| **ID** | `webcam-snapshot` |
| **Icon** | `camera` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `trigger` | `trigger` | Capture snapshot |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Captured image as texture |
| `imageData` | `data` | Image data for AI processing |
| `width` | `number` | Image width |
| `height` | `number` | Image height |
| `captured` | `trigger` | Fires when capture completes |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `device` | `select` | `default` | deviceType: 'video-input' | Camera device |
| `resolution` | `select` | `720p` | options: 480p, 720p, 1080p | Capture resolution |
| `mirror` | `toggle` | `false` | - | Mirror horizontally |

### Implementation
Maintains a hidden video stream. On trigger, draws current frame to canvas and creates texture/imageData from it.

---

## Color

Create RGBA color values with individual channel control.

| Property | Value |
|----------|-------|
| **ID** | `color` |
| **Icon** | `palette` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `r` | `number` | Red channel override |
| `g` | `number` | Green channel override |
| `b` | `number` | Blue channel override |
| `a` | `number` | Alpha channel override |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `color` | `data` | Color object {r, g, b, a} |
| `r` | `number` | Red value (0-1) |
| `g` | `number` | Green value (0-1) |
| `b` | `number` | Blue value (0-1) |
| `a` | `number` | Alpha value (0-1) |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `r` | `slider` | `1` | min: 0, max: 1 | Red |
| `g` | `slider` | `1` | min: 0, max: 1 | Green |
| `b` | `slider` | `1` | min: 0, max: 1 | Blue |
| `a` | `slider` | `1` | min: 0, max: 1 | Alpha |

---

## Texture Display

Display a texture for preview.

| Property | Value |
|----------|-------|
| **ID** | `texture-display` |
| **Icon** | `monitor` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Texture to display |

### Outputs
*None*

### Controls
*None*

### Implementation
Renders the input texture to the node's preview area. Used for debugging/monitoring visual pipelines.

---

## Blend

Blend two textures using various blend modes.

| Property | Value |
|----------|-------|
| **ID** | `blend` |
| **Icon** | `layers` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `a` | `texture` | Base texture |
| `b` | `texture` | Blend texture |
| `mix` | `number` | Mix amount override |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Blended result |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `mix` | `slider` | `0.5` | min: 0, max: 1 | Blend amount |
| `mode` | `select` | `normal` | options: normal, add, multiply, screen, overlay | Blend mode |

### Implementation
Uses a shader that implements blend modes:
- **normal**: Linear interpolation
- **add**: `a + b`
- **multiply**: `a * b`
- **screen**: `1 - (1-a) * (1-b)`
- **overlay**: Conditional multiply/screen

---

## Blur

Apply Gaussian blur to texture.

| Property | Value |
|----------|-------|
| **ID** | `blur` |
| **Icon** | `droplet` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Input texture |
| `radius` | `number` | Blur radius override |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Blurred result |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `radius` | `slider` | `5` | min: 0, max: 50 | Blur radius (pixels) |
| `passes` | `number` | `2` | min: 1, max: 10 | Number of blur passes |

### Implementation
Uses separable Gaussian blur (horizontal then vertical passes) for efficiency. Multiple passes increase blur quality.

---

## Color Correction

Adjust brightness, contrast, saturation, hue, and gamma.

| Property | Value |
|----------|-------|
| **ID** | `color-correction` |
| **Icon** | `palette` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Input texture |
| `brightness` | `number` | Brightness override |
| `contrast` | `number` | Contrast override |
| `saturation` | `number` | Saturation override |
| `hue` | `number` | Hue shift override |
| `gamma` | `number` | Gamma override |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Corrected result |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `brightness` | `slider` | `0` | min: -1, max: 1 | Brightness adjustment |
| `contrast` | `slider` | `1` | min: 0, max: 3 | Contrast multiplier |
| `saturation` | `slider` | `1` | min: 0, max: 3 | Saturation multiplier |
| `hue` | `slider` | `0` | min: -180, max: 180 | Hue rotation (degrees) |
| `gamma` | `slider` | `1` | min: 0.1, max: 3 | Gamma correction |

---

## Displacement

Displace texture using a displacement map.

| Property | Value |
|----------|-------|
| **ID** | `displacement` |
| **Icon** | `move` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Source texture |
| `displacement` | `texture` | Displacement map |
| `strength` | `number` | Strength override |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Displaced result |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `strength` | `slider` | `0.1` | min: 0, max: 1 | Displacement strength |
| `channel` | `select` | `rg` | options: r, rg, rgb | Channel(s) for displacement |

---

## Transform 2D

Apply 2D transforms to texture.

| Property | Value |
|----------|-------|
| **ID** | `transform-2d` |
| **Icon** | `move-3d` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Input texture |
| `scaleX` | `number` | Scale X override |
| `scaleY` | `number` | Scale Y override |
| `rotate` | `number` | Rotation override |
| `translateX` | `number` | Translate X override |
| `translateY` | `number` | Translate Y override |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Transformed result |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `scaleX` | `slider` | `1` | min: 0.1, max: 5 | Horizontal scale |
| `scaleY` | `slider` | `1` | min: 0.1, max: 5 | Vertical scale |
| `rotate` | `slider` | `0` | min: -180, max: 180 | Rotation (degrees) |
| `translateX` | `slider` | `0` | min: -1, max: 1 | Horizontal offset |
| `translateY` | `slider` | `0` | min: -1, max: 1 | Vertical offset |

---

## Image Loader

Load images from URL, file, or asset library.

| Property | Value |
|----------|-------|
| **ID** | `image-loader` |
| **Icon** | `image` |
| **Version** | 1.1.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `url` | `string` | Image URL override |
| `trigger` | `trigger` | Reload image |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Loaded image as texture |
| `width` | `number` | Image width |
| `height` | `number` | Image height |
| `loading` | `boolean` | Loading state |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `assetId` | `asset-picker` | `null` | assetType: 'image' | Select from asset library |
| `url` | `text` | `''` | - | Direct URL input |
| `crossOrigin` | `select` | `anonymous` | options: anonymous, use-credentials, none | CORS mode |

---

## Video Player

Play video from URL.

| Property | Value |
|----------|-------|
| **ID** | `video-player` |
| **Icon** | `play-circle` |
| **Version** | 1.0.0 |

### Inputs
| Port | Type | Description |
|------|------|-------------|
| `url` | `string` | Video URL override |
| `play` | `trigger` | Start playback |
| `pause` | `trigger` | Pause playback |
| `seek` | `number` | Seek to time (seconds) |

### Outputs
| Port | Type | Description |
|------|------|-------------|
| `texture` | `texture` | Video as texture |
| `video` | `video` | HTMLVideoElement |
| `playing` | `boolean` | Playing state |
| `time` | `number` | Current time (s) |
| `duration` | `number` | Total duration (s) |
| `progress` | `number` | Progress (0-1) |

### Controls
| Control | Type | Default | Props | Description |
|---------|------|---------|-------|-------------|
| `url` | `text` | `''` | - | Video URL |
| `autoplay` | `toggle` | `false` | - | Auto-start on load |
| `loop` | `toggle` | `true` | - | Loop playback |
| `playbackRate` | `number` | `1` | min: 0.25, max: 4 | Playback speed |
| `volume` | `slider` | `0.5` | min: 0, max: 1 | Audio volume |

---

## Rendering Architecture

The visual system uses Three.js for all GPU rendering operations:

### Texture Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    ThreeShaderRenderer                          │
├─────────────────────────────────────────────────────────────────┤
│ • Manages WebGLRenderer and WebGLRenderTargets                  │
│ • Compiles GLSL shaders to Three.js ShaderMaterial              │
│ • Renders shaders to render targets (THREE.Texture output)      │
│ • Provides renderToCanvas() for GPU → 2D canvas display         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ExecutionEngine                               │
├─────────────────────────────────────────────────────────────────┤
│ • Stores node outputs in nodeOutputs Map<nodeId, Map<port, val>>│
│ • THREE.Texture objects stored directly (not converted)         │
│ • Provides getNodeTexture() for direct texture access           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              MainOutputNode / TexturePreview                     │
├─────────────────────────────────────────────────────────────────┤
│ • Gets texture directly from ExecutionEngine                    │
│ • Uses ThreeShaderRenderer.renderToCanvas() for display         │
│ • Bypasses Vue reactivity (which loses texture identity)        │
└─────────────────────────────────────────────────────────────────┘
```

### Key Services

| Service | Location | Purpose |
|---------|----------|---------|
| `ThreeShaderRenderer` | `services/visual/ThreeShaderRenderer.ts` | GLSL shader compilation and rendering |
| `ThreeRenderer` | `services/visual/ThreeRenderer.ts` | 3D scene rendering |
| `UnifiedRenderer` | `services/visual/UnifiedRenderer.ts` | PixiJS 8 + Three.js shared context (future) |
| `TextureBridge` | `services/visual/TextureBridge.ts` | Texture format conversion (future) |

### Interop Scenarios

All visual pipelines ultimately output `THREE.Texture`:

1. **Shader → OUTPUT**: ShaderMaterial renders to WebGLRenderTarget → texture output
2. **Webcam → Shader → OUTPUT**: VideoTexture → shader iChannel0 input → processed output
3. **3D → Shader → OUTPUT**: ThreeRenderer scene → render target texture → shader input
4. **Multi-shader chains**: Shader A output → Shader B iChannel0 → final output
