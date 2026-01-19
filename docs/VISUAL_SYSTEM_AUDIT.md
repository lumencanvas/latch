# Visual System Audit - Three.js Migration

**Generated:** 2026-01-19
**Status:** Migration Complete
**Renderer:** ThreeShaderRenderer (Three.js based)

---

## Architecture Overview

### Core Components

| File | Purpose |
|------|---------|
| `src/renderer/services/visual/ThreeShaderRenderer.ts` | Three.js-based 2D shader renderer with per-node render targets |
| `src/renderer/engine/executors/visual.ts` | All visual node executors |
| `src/renderer/components/preview/TexturePreview.vue` | Displays THREE.Texture in 2D canvas |
| `src/renderer/services/visual/ShaderRenderer.ts` | Legacy WebGL renderer (kept for cleanup during dispose) |

### Key Data Types

| Type | Description | Used In |
|------|-------------|---------|
| `THREE.Texture` | Three.js texture object | All texture outputs |
| `THREE.WebGLRenderTarget` | Per-node framebuffer | ThreeShaderRenderer |
| `THREE.ShaderMaterial` | Compiled shader | compileShader(), compileEffectShader() |
| `CompiledShaderMaterial` | Wrapper with uniforms | Shader caching |

---

## Node Inventory

### 1. Shader Node (`shader`)

**Registry:** `src/renderer/registry/visual/shader.ts`
**Executor:** `shaderExecutor` (visual.ts:279-506)

| Inputs | Type | Description |
|--------|------|-------------|
| `iChannel0-3` | texture | Shadertoy texture channels |
| Dynamic | varies | Generated from uniform declarations |

| Outputs | Type | Description |
|---------|------|-------------|
| `texture` | THREE.Texture | Rendered shader output |
| `_error` | string | Error message if compilation fails |
| `_dynamicInputs` | array | Generated input port definitions |
| `_dynamicControls` | array | Generated control definitions |

**State Maps:**
- `compiledShaderMaterials: Map<string, CompiledShaderMaterial>` - Cached shaders
- `lastPreset: Map<string, string>` - Track preset changes

**GLSL:** User-defined (Shadertoy or raw GLSL1)

**Status:** MIGRATED

---

### 2. Webcam Node (`webcam`)

**Registry:** `src/renderer/registry/visual/webcam.ts`
**Executor:** `webcamExecutor` (visual.ts:512-562)

| Inputs | Type | Description |
|--------|------|-------------|
| None | - | - |

| Outputs | Type | Description |
|---------|------|-------------|
| `texture` | THREE.Texture | Live webcam frame |
| `video` | HTMLVideoElement | Video element reference |
| `width` | number | Video width |
| `height` | number | Video height |

**State Maps:**
- `nodeTextures: Map<string, THREE.Texture>` - Per-node textures

**Status:** MIGRATED

---

### 3. Webcam Snapshot Node (`webcam-snapshot`)

**Registry:** `src/renderer/registry/visual/webcam-snapshot.ts`
**Executor:** `webcamSnapshotExecutor` (visual.ts:1577-1657)

| Inputs | Type | Description |
|--------|------|-------------|
| `trigger` | trigger | Capture trigger |

| Outputs | Type | Description |
|---------|------|-------------|
| `texture` | THREE.Texture | Captured frame |
| `imageData` | ImageData | Raw pixel data |
| `width` | number | Image width |
| `height` | number | Image height |
| `captured` | boolean | True on capture frame |

**State Maps:**
- `webcamSnapshotState: Map<string, {...}>` - Per-node webcam state with THREE.Texture

**Status:** MIGRATED

---

### 4. Color Node (`color`)

**Registry:** `src/renderer/registry/visual/color.ts`
**Executor:** `colorExecutor` (visual.ts:568-581)

| Inputs | Type | Description |
|--------|------|-------------|
| `r`, `g`, `b`, `a` | number | RGBA components |

| Outputs | Type | Description |
|---------|------|-------------|
| `color` | [r,g,b,a] | Color as array |
| `r`, `g`, `b`, `a` | number | Individual components |

**State Maps:** None

**Note:** Does not produce textures, outputs data only.

**Status:** NO MIGRATION NEEDED

---

### 5. Texture Display Node (`texture-display`)

**Registry:** `src/renderer/registry/visual/texture-display.ts`
**Executor:** `textureDisplayExecutor` (visual.ts:587-604)

| Inputs | Type | Description |
|--------|------|-------------|
| `texture` | THREE.Texture | Texture to display |

| Outputs | Type | Description |
|---------|------|-------------|
| `_display` | HTMLCanvasElement | Canvas for preview |

**Status:** MIGRATED

---

### 6. Blend Node (`blend`)

**Registry:** `src/renderer/registry/visual/blend.ts`
**Executor:** `blendExecutor` (visual.ts:651-709)

| Inputs | Type | Description |
|--------|------|-------------|
| `a` | THREE.Texture | First texture |
| `b` | THREE.Texture | Second texture |
| `mix` | number | Blend amount (0-1) |

| Outputs | Type | Description |
|---------|------|-------------|
| `texture` | THREE.Texture | Blended result |

**GLSL Shader:** `BLEND_FRAGMENT_THREE` (visual.ts:610-649)

```glsl
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_mix;
uniform int u_mode;
// Modes: 0=normal, 1=add, 2=multiply, 3=screen, 4=overlay
```

**Effect Shader ID:** `_blend`

**Status:** MIGRATED

---

### 7. Blur Node (`blur`)

**Registry:** `src/renderer/registry/visual/blur.ts`
**Executor:** `blurExecutor` (visual.ts:798-853)

| Inputs | Type | Description |
|--------|------|-------------|
| `texture` | THREE.Texture | Input texture |
| `radius` | number | Blur radius |

| Outputs | Type | Description |
|---------|------|-------------|
| `texture` | THREE.Texture | Blurred result |

**GLSL Shader:** `BLUR_FRAGMENT_THREE` (visual.ts:767-796)

```glsl
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_radius;
uniform int u_direction;
// Two-pass Gaussian: direction 0=horizontal, 1=vertical
```

**Effect Shader ID:** `_blur`

**Note:** Uses two-pass (horizontal + vertical) for Gaussian blur. Creates intermediate render target `${nodeId}_h`.

**Status:** MIGRATED

---

### 8. Color Correction Node (`color-correction`)

**Registry:** `src/renderer/registry/visual/color-correction.ts`
**Executor:** `colorCorrectionExecutor` (visual.ts:904-950)

| Inputs | Type | Description |
|--------|------|-------------|
| `texture` | THREE.Texture | Input texture |
| `brightness` | number | -1 to 1 |
| `contrast` | number | 0 to 3 |
| `saturation` | number | 0 to 3 |
| `hue` | number | -180 to 180 |
| `gamma` | number | 0.1 to 3 |

| Outputs | Type | Description |
|---------|------|-------------|
| `texture` | THREE.Texture | Color-corrected result |

**GLSL Shader:** `COLOR_CORRECT_FRAGMENT_THREE` (visual.ts:859-902)

```glsl
uniform sampler2D u_texture;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_hue;
uniform float u_gamma;
// Includes rgb2hsv and hsv2rgb conversion functions
```

**Effect Shader ID:** `_color_correct`

**Status:** MIGRATED

---

### 9. Displacement Node (`displacement`)

**Registry:** `src/renderer/registry/visual/displacement.ts`
**Executor:** `displacementExecutor` (visual.ts:983-1034)

| Inputs | Type | Description |
|--------|------|-------------|
| `texture` | THREE.Texture | Input texture |
| `displacement` | THREE.Texture | Displacement map |
| `strength` | number | Displacement strength |

| Outputs | Type | Description |
|---------|------|-------------|
| `texture` | THREE.Texture | Displaced result |

**GLSL Shader:** `DISPLACEMENT_FRAGMENT_THREE` (visual.ts:956-981)

```glsl
uniform sampler2D u_texture;
uniform sampler2D u_displacement;
uniform float u_strength;
uniform int u_channel;
// Channels: 0=R, 1=G, 2=B, 3=RG
```

**Effect Shader ID:** `_displacement`

**Note:** If no displacement map provided, passes texture through unchanged.

**Status:** MIGRATED

---

### 10. Transform 2D Node (`transform-2d`)

**Registry:** `src/renderer/registry/visual/transform-2d.ts`
**Executor:** `transform2DExecutor` (visual.ts:1071-1121)

| Inputs | Type | Description |
|--------|------|-------------|
| `texture` | THREE.Texture | Input texture |
| `translateX` | number | X translation |
| `translateY` | number | Y translation |
| `rotate` | number | Rotation (degrees) |
| `scaleX` | number | X scale |
| `scaleY` | number | Y scale |

| Outputs | Type | Description |
|---------|------|-------------|
| `texture` | THREE.Texture | Transformed result |

**GLSL Shader:** `TRANSFORM_FRAGMENT_THREE` (visual.ts:1040-1069)

```glsl
uniform sampler2D u_texture;
uniform vec2 u_translate;
uniform float u_rotate;
uniform vec2 u_scale;
uniform vec2 u_pivot;
// Rotation converted to radians in executor
```

**Effect Shader ID:** `_transform2d`

**Status:** MIGRATED

---

### 11. Texture to Data Node (`texture-to-data`)

**Registry:** `src/renderer/registry/data/texture-to-data.ts`
**Executor:** `textureToDataExecutor` (visual.ts:1133-1214)

| Inputs | Type | Description |
|--------|------|-------------|
| `texture` | THREE.Texture | Input texture |
| `trigger` | trigger | Capture trigger |

| Outputs | Type | Description |
|---------|------|-------------|
| `data` | ImageData/string/Blob | Converted data |
| `width` | number | Image width |
| `height` | number | Image height |

**State Maps:**
- `textureDataCache: Map<string, {...}>` - Cached conversion results

**Note:** Uses `ThreeShaderRenderer.renderToCanvas()` to read pixels from THREE.Texture.

**Status:** MIGRATED

---

### 12. Image Loader Node (`image-loader`)

**Registry:** `src/renderer/registry/visual/image-loader.ts`
**Executor:** `imageLoaderExecutor` (visual.ts:1225-1367)

| Inputs | Type | Description |
|--------|------|-------------|
| `url` | string | Image URL |
| `trigger` | trigger | Reload trigger |

| Outputs | Type | Description |
|---------|------|-------------|
| `texture` | THREE.Texture | Loaded image texture |
| `width` | number | Image width |
| `height` | number | Image height |
| `loading` | boolean | Loading state |

**State Maps:**
- `imageLoaderState: Map<string, {...}>` - Per-node loading state with THREE.Texture

**Status:** MIGRATED

---

### 13. Video Player Node (`video-player`)

**Registry:** `src/renderer/registry/visual/video-player.ts`
**Executor:** `videoPlayerExecutor` (visual.ts:1373-1481)

| Inputs | Type | Description |
|--------|------|-------------|
| `url` | string | Video URL |
| `play` | trigger | Play trigger |
| `pause` | trigger | Pause trigger |
| `seek` | number | Seek position (seconds) |

| Outputs | Type | Description |
|---------|------|-------------|
| `texture` | THREE.Texture | Current frame |
| `video` | HTMLVideoElement | Video element |
| `playing` | boolean | Playing state |
| `time` | number | Current time |
| `duration` | number | Total duration |
| `progress` | number | Progress (0-1) |

**State Maps:**
- `videoPlayerState: Map<string, {...}>` - Per-node video state with THREE.Texture

**Status:** MIGRATED

---

### 14. Main Output Node (`main-output`)

**Registry:** `src/renderer/registry/outputs/main-output/definition.ts`
**Executor:** `mainOutputExecutor` (visual.ts:718-761)

| Inputs | Type | Description |
|--------|------|-------------|
| `texture` | THREE.Texture or HTMLCanvasElement | Texture to display |

| Outputs | Type | Description |
|---------|------|-------------|
| `_input_texture` | THREE.Texture | Pass-through for preview |

**State Maps:**
- `canvasTextureCache: Map<string, THREE.Texture>` - Canvas-to-texture conversion cache

**Note:** Handles both THREE.Texture and HTMLCanvasElement inputs. Converts canvas to THREE.Texture if needed.

**Status:** MIGRATED

---

## Executor Registry

```typescript
// visual.ts:1677-1692
export const visualExecutors: Record<string, NodeExecutorFn> = {
  shader: shaderExecutor,
  webcam: webcamExecutor,
  'webcam-snapshot': webcamSnapshotExecutor,
  color: colorExecutor,
  'texture-display': textureDisplayExecutor,
  blend: blendExecutor,
  'main-output': mainOutputExecutor,
  blur: blurExecutor,
  'color-correction': colorCorrectionExecutor,
  displacement: displacementExecutor,
  'transform-2d': transform2DExecutor,
  'texture-to-data': textureToDataExecutor,
  'image-loader': imageLoaderExecutor,
  'video-player': videoPlayerExecutor,
}
```

---

## State Management

### Global State Maps

| Map | Type | Purpose | Cleanup |
|-----|------|---------|---------|
| `compiledShaderMaterials` | `Map<string, CompiledShaderMaterial>` | Cached shader materials | `disposeVisualNode`, `disposeAllVisualNodes` |
| `compiledShaders` | `Map<string, unknown>` | Legacy shaders (cleanup only) | `disposeVisualNode` |
| `nodeTextures` | `Map<string, THREE.Texture>` | Per-node textures (webcam, etc.) | `disposeVisualNode`, `gcVisualState` |
| `imageLoaderState` | `Map<string, {...}>` | Image loading state | `disposeVisualNode`, `gcVisualState` |
| `videoPlayerState` | `Map<string, {...}>` | Video player state | `disposeVisualNode`, `gcVisualState` |
| `lastPreset` | `Map<string, string>` | Shader preset tracking | `disposeVisualNode`, `gcVisualState` |
| `textureDataCache` | `Map<string, {...}>` | Texture conversion cache | `disposeAllVisualNodes`, `gcVisualState` |
| `canvasTextureCache` | `Map<string, THREE.Texture>` | Canvas-to-texture cache | `disposeVisualNode`, `gcVisualState` |
| `webcamSnapshotState` | `Map<string, {...}>` | Webcam snapshot state | `disposeWebcamSnapshotNode` |

### ThreeShaderRenderer State

| Map | Type | Purpose |
|-----|------|---------|
| `renderTargets` | `Map<string, WebGLRenderTarget>` | Per-node framebuffers |
| `materials` | `Map<string, ShaderMaterial>` | Cached materials |
| `effectShaders` | `Map<string, CompiledShaderMaterial>` | Effect shader cache |

---

## Texture Flow Patterns

### Pattern 1: Source Nodes (produce textures)

```
[webcam] -> THREE.Texture
[webcam-snapshot] -> THREE.Texture
[image-loader] -> THREE.Texture
[video-player] -> THREE.Texture
[shader] -> THREE.Texture
```

### Pattern 2: Effect Nodes (transform textures)

```
THREE.Texture -> [blend] -> THREE.Texture
THREE.Texture -> [blur] -> THREE.Texture
THREE.Texture -> [color-correction] -> THREE.Texture
THREE.Texture -> [displacement] -> THREE.Texture
THREE.Texture -> [transform-2d] -> THREE.Texture
```

### Pattern 3: Output Nodes (consume textures)

```
THREE.Texture -> [main-output] -> Display
THREE.Texture -> [texture-display] -> Display
THREE.Texture -> [texture-to-data] -> ImageData/base64
```

### Pattern 4: Shader Input Chain

```
[webcam] -> texture -> [shader iChannel0] -> [shader] -> texture -> [main-output]
```

---

## Cleanup Functions

| Function | Purpose | Location |
|----------|---------|----------|
| `disposeVisualNode(nodeId)` | Dispose single node resources | visual.ts:64-122 |
| `disposeAllVisualNodes()` | Dispose all visual resources | visual.ts:127-170 |
| `gcVisualState(validNodeIds)` | GC orphaned entries | visual.ts:176-264 |
| `disposeWebcamSnapshotNode(nodeId)` | Dispose webcam snapshot | visual.ts:1660-1671 |

---

## ThreeShaderRenderer API

### Compilation

| Method | Purpose | Returns |
|--------|---------|---------|
| `compileShader(frag, vert?, shadertoy?, uniforms?)` | Compile user shader | CompiledShaderMaterial or {error} |
| `compileEffectShader(frag, id)` | Compile effect shader | CompiledShaderMaterial or {error} |
| `getEffectShader(id)` | Get cached effect shader | CompiledShaderMaterial or null |

### Rendering

| Method | Purpose | Returns |
|--------|---------|---------|
| `render(shader, uniforms, nodeId, w?, h?)` | Render to per-node target | THREE.Texture |
| `renderToScreen(shader, uniforms, w?, h?)` | Render to internal canvas | void |
| `renderToCanvas(texture, canvas)` | Copy texture to 2D canvas | void |

### Texture Management

| Method | Purpose | Returns |
|--------|---------|---------|
| `createTexture(source)` | Create from img/video/canvas | THREE.Texture |
| `updateTexture(texture, source)` | Update existing texture | void |
| `createTextureFromWebGL(texture, w, h)` | Convert raw WebGLTexture | THREE.Texture |
| `getNodeTexture(nodeId, w?, h?)` | Get node's render target texture | THREE.Texture or null |

### State

| Method | Purpose | Returns |
|--------|---------|---------|
| `setTime(time)` | Update animation time | void |
| `setMouse(x, y, down)` | Update mouse position | void |
| `isContextLost()` | Check WebGL context | boolean |

### Cleanup

| Method | Purpose | Returns |
|--------|---------|---------|
| `disposeNode(nodeId)` | Dispose node resources | void |
| `deleteRenderTarget(nodeId)` | Delete node's render target | void |
| `dispose()` | Dispose entire renderer | void |

---

## Verification Checklist

- [x] All texture outputs are THREE.Texture type
- [x] All effect shaders use GLSL1 (texture2D, gl_FragColor, vUv)
- [x] All state maps properly cleaned up in dispose functions
- [x] No WebGLTexture references in output types
- [x] ThreeShaderRenderer handles context loss
- [x] Effect shaders cached by ID to avoid recompilation
- [x] Two-pass blur creates separate render target for horizontal pass
- [x] Shader uniforms include null checks before access
- [x] Legacy ShaderRenderer only used for cleanup in disposeVisualNode

---

## Known Issues / Notes

1. **Blur passes control not used** - Registry defines `passes` control but executor only does 2-pass
2. ~~**Transform-2d registry mismatch**~~ - FIXED: Registry now uses `scaleX/scaleY` and `rotate` to match executor
3. ~~**Displacement input name mismatch**~~ - FIXED: Registry now uses `displacement` to match executor
4. **Fixed resolution** - Many effect shaders use hardcoded 512x512 resolution

---

## Migration Summary

| Node | Pre-Migration | Post-Migration |
|------|---------------|----------------|
| shader | WebGLTexture | THREE.Texture |
| webcam | WebGLTexture | THREE.Texture |
| webcam-snapshot | WebGLTexture | THREE.Texture |
| blend | WebGLTexture | THREE.Texture |
| blur | WebGLTexture | THREE.Texture |
| color-correction | WebGLTexture | THREE.Texture |
| displacement | WebGLTexture | THREE.Texture |
| transform-2d | WebGLTexture | THREE.Texture |
| image-loader | WebGLTexture | THREE.Texture |
| video-player | WebGLTexture | THREE.Texture |
| texture-to-data | WebGLTexture | THREE.Texture |
| main-output | WebGLTexture | THREE.Texture |
| texture-display | WebGLTexture | THREE.Texture |

**All 14 visual executors migrated to Three.js renderer.**
