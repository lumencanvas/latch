/**
 * Visual shared state, helpers & lifecycle (Workstream B co-location).
 *
 * The shader/texture caches + per-node state Maps, the shared helpers (runImageFx / makeImageFxExecutor /
 * resolveEffectSource / coerceInputToTexture / hexToVec3 / initWebcamSnapshot), the shader-fragment
 * constants, and the gc/dispose lifecycle live here so each visual node's executor can co-locate in its
 * own registry/visual/<id>/node.ts. Moved verbatim from engine/executors/visual.ts (now a thin
 * re-export shim). Store-free leaf.
 *
 * These executors handle visual/shader nodes using Three.js-based rendering
 * for proper per-node framebuffer management and texture display.
 */

import * as THREE from 'three'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineLifecycle } from '@/engine/nodeState'
import { getPresetById, injectUniformDeclarations, type UniformDefinition } from '@/services/visual/ShaderPresets'
import { getShaderRenderer, hasShaderRenderer } from '@/services/visual/ShaderRenderer'
import { getTextureBridge } from '@/services/visual/TextureBridge'
import { getThreeShaderRenderer, type CompiledShaderMaterial, type ThreeShaderUniform } from '@/services/visual/ThreeShaderRenderer'


// Keep old renderer for legacy framebuffer cleanup during dispose (only if it was used)

// Re-export for use by other executors (e.g., AI texture conversion)

// Store for compiled shaders (now uses Three.js ShaderMaterial)
export const compiledShaderMaterials = new Map<string, CompiledShaderMaterial>()
// Legacy compiled shaders - kept for cleanup during dispose
export const compiledShaders = new Map<string, unknown>()
// Node textures - now THREE.Texture instead of raw WebGLTexture
export const nodeTextures = new Map<string, THREE.Texture>()

// Image loader state per node - now uses THREE.Texture
export const imageLoaderState = new Map<
  string,
  {
    image: HTMLImageElement | null
    texture: THREE.Texture | null
    loading: boolean
    loadedUrl: string | null
    error: string | null
  }
>()

// Video player state per node - now uses THREE.Texture
export const videoPlayerState = new Map<
  string,
  {
    video: HTMLVideoElement | null
    texture: THREE.Texture | null
    loadedUrl: string | null
    lastSeek: number | null
  }
>()
// Track last preset to detect changes
export const lastPreset = new Map<string, string>()
// Cache detected uniforms per-node to persist across frames
export const cachedUniforms = new Map<string, UniformDefinition[]>()
// Per-node video→canvas conversion for shader-effect nodes (image-fx + blur /
// color-correction / displacement / transform-2d). A video-backed THREE.Texture
// can't be uploaded through the offscreen ThreeShaderRenderer (it samples BLACK — the
// v1.2.1 video-texture issue), so the live frame is drawn to a 2D canvas and a
// canvas-backed texture is sampled instead. Holds a reused canvas + texture per node.
export const effectVideoState = new Map<string, { canvas: HTMLCanvasElement; texture: THREE.Texture | null }>()

/** Dispose an image-fx node's video-conversion canvas/texture. */
export function disposeEffectVideoState(nodeId: string): void {
  const st = effectVideoState.get(nodeId)
  if (st) {
    if (st.texture) st.texture.dispose()
    st.canvas.width = 0
    st.canvas.height = 0
    effectVideoState.delete(nodeId)
  }
}

/**
 * Dispose visual resources for a node
 */
export function disposeVisualNode(nodeId: string): void {
  const threeRenderer = getThreeShaderRenderer()

  // Clean up Three.js shader materials (both nodeId key and cacheKey entries)
  compiledShaderMaterials.delete(nodeId)
  // Also clean up any cacheKey entries that start with this nodeId
  for (const key of compiledShaderMaterials.keys()) {
    if (key.startsWith(`${nodeId}_`)) {
      const material = compiledShaderMaterials.get(key)
      if (material) material.material.dispose()
      compiledShaderMaterials.delete(key)
    }
  }
  compiledShaders.delete(nodeId)
  lastPreset.delete(nodeId)
  cachedUniforms.delete(nodeId)

  // Clean up Three.js render target
  threeRenderer.disposeNode(nodeId)

  // Clean up node texture
  const nodeTexture = nodeTextures.get(nodeId)
  if (nodeTexture) {
    nodeTexture.dispose()
    nodeTextures.delete(nodeId)
  }

  // Clean up image loader state
  const imgState = imageLoaderState.get(nodeId)
  if (imgState) {
    if (imgState.texture) {
      imgState.texture.dispose()
    }
    if (imgState.image) {
      imgState.image.src = ''
      imgState.image.onload = null
      imgState.image.onerror = null
    }
    imageLoaderState.delete(nodeId)
  }

  // Clean up video player state
  const vidState = videoPlayerState.get(nodeId)
  if (vidState) {
    if (vidState.texture) {
      vidState.texture.dispose()
    }
    if (vidState.video) {
      vidState.video.pause()
      vidState.video.src = ''
      vidState.video.load()
    }
    videoPlayerState.delete(nodeId)
  }

  // Clean up canvas texture cache
  const canvasKey = `canvas_${nodeId}`
  const canvasTexture = canvasTextureCache.get(canvasKey)
  if (canvasTexture) {
    canvasTexture.dispose()
    canvasTextureCache.delete(canvasKey)
  }

  // Clean up snapshot held-frame state
  disposeSnapshotNode(nodeId)

  // Clean up image-fx video-conversion state
  disposeEffectVideoState(nodeId)

  // Clean up framebuffers (legacy renderer) - only if it was initialized
  if (hasShaderRenderer()) {
    const legacyRenderer = getShaderRenderer()
    legacyRenderer.deleteFramebuffer(nodeId)
    legacyRenderer.deleteFramebuffer(`${nodeId}_h`)
  }
}

/**
 * Dispose all visual resources
 */
export function disposeAllVisualNodes(): void {
  // Clean up Three.js materials
  for (const material of compiledShaderMaterials.values()) {
    material.material.dispose()
  }
  compiledShaderMaterials.clear()
  compiledShaders.clear()
  lastPreset.clear()
  cachedUniforms.clear()

  // Clean up Three.js textures
  for (const texture of nodeTextures.values()) {
    texture.dispose()
  }
  nodeTextures.clear()

  // Clean up all image loader states
  for (const [, state] of imageLoaderState) {
    if (state.image) {
      state.image.src = ''
      state.image.onload = null
      state.image.onerror = null
    }
  }
  imageLoaderState.clear()

  // Clean up all video player states
  for (const [, state] of videoPlayerState) {
    if (state.video) {
      state.video.pause()
      state.video.src = ''
      state.video.load()
    }
  }
  videoPlayerState.clear()

  // Clean up texture data cache
  textureDataCache.clear()

  // Clean up canvas texture cache
  for (const texture of canvasTextureCache.values()) {
    texture.dispose()
  }
  canvasTextureCache.clear()

  // Clean up all webcam snapshot states
  for (const nodeId of webcamSnapshotState.keys()) {
    disposeWebcamSnapshotNode(nodeId)
  }

  // Clean up all snapshot held-frame states
  for (const nodeId of snapshotState.keys()) {
    disposeSnapshotNode(nodeId)
  }

  // Clean up all image-fx video-conversion states
  for (const nodeId of effectVideoState.keys()) {
    disposeEffectVideoState(nodeId)
  }
  if (snapshotScratchCanvas) {
    snapshotScratchCanvas.width = 0
    snapshotScratchCanvas.height = 0
    snapshotScratchCanvas = null
  }

  // Clear pending asset loads
  pendingAssetLoads.clear()

  // Clean up textureToDataCanvas
  if (textureToDataCanvas) {
    textureToDataCanvas.width = 0
    textureToDataCanvas.height = 0
    textureToDataCanvas = null
  }
}

/**
 * True if a shader-cache key is owned by a still-valid node. Keys are either a bare
 * nodeId or a cacheKey `${nodeId}_${hash}_${hash}_${bool}_${num}`. Recovering the id
 * by `key.split('_')[0]` is WRONG: nanoid ids contain '_' (~26% of the time), so the
 * split truncates the id and gcVisualState disposed a LIVE node's compiled material on
 * any unrelated node removal (it recompiled next frame, but stutters the render).
 * Mirrors disposeVisualNode's `${nodeId}_` ownership test; with fixed-length nanoid
 * ids the `${id}_` prefix match is unambiguous.
 */
export function shaderCacheKeyOwned(key: string, validNodeIds: Set<string>): boolean {
  if (validNodeIds.has(key)) return true
  for (const id of validNodeIds) {
    if (key.startsWith(`${id}_`)) return true
  }
  return false
}

/**
 * Garbage collect orphaned visual state entries.
 * Call this with the set of currently valid node IDs.
 */
export function gcVisualState(validNodeIds: Set<string>): void {
  // Resolve the Three renderer lazily — only when a node texture actually needs
  // disposing. Removing a non-visual node must not spin up a WebGL context (it has
  // none in headless tests, and it is wasted work in production).

  // Clean compiledShaderMaterials
  for (const key of compiledShaderMaterials.keys()) {
    if (key.startsWith('_')) continue
    if (!shaderCacheKeyOwned(key, validNodeIds)) {
      const material = compiledShaderMaterials.get(key)
      if (material) material.material.dispose()
      compiledShaderMaterials.delete(key)
    }
  }

  // Clean legacy compiledShaders
  for (const key of compiledShaders.keys()) {
    if (key.startsWith('_')) continue
    if (!shaderCacheKeyOwned(key, validNodeIds)) {
      compiledShaders.delete(key)
    }
  }

  // Clean nodeTextures - dispose Three.js textures
  for (const nodeId of nodeTextures.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const texture = nodeTextures.get(nodeId)
      if (texture) texture.dispose()
      nodeTextures.delete(nodeId)
      getThreeShaderRenderer().disposeNode(nodeId)
    }
  }

  // Clean lastPreset
  for (const nodeId of lastPreset.keys()) {
    if (!validNodeIds.has(nodeId)) {
      lastPreset.delete(nodeId)
    }
  }

  // Clean cachedUniforms
  for (const nodeId of cachedUniforms.keys()) {
    if (!validNodeIds.has(nodeId)) {
      cachedUniforms.delete(nodeId)
    }
  }

  // Clean image-fx video-conversion state
  for (const nodeId of effectVideoState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposeEffectVideoState(nodeId)
    }
  }

  // Clean imageLoaderState
  for (const nodeId of imageLoaderState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const state = imageLoaderState.get(nodeId)
      if (state) {
        if (state.texture) state.texture.dispose()
        if (state.image) {
          state.image.src = ''
          state.image.onload = null
          state.image.onerror = null
        }
      }
      imageLoaderState.delete(nodeId)
    }
  }

  // Clean videoPlayerState
  for (const nodeId of videoPlayerState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const state = videoPlayerState.get(nodeId)
      if (state) {
        if (state.texture) state.texture.dispose()
        if (state.video) {
          state.video.pause()
          state.video.src = ''
          state.video.load()
        }
      }
      videoPlayerState.delete(nodeId)
    }
  }

  // Clean textureDataCache
  for (const nodeId of textureDataCache.keys()) {
    if (!validNodeIds.has(nodeId)) {
      textureDataCache.delete(nodeId)
    }
  }

  // Clean canvasTextureCache - dispose Three.js textures
  for (const key of canvasTextureCache.keys()) {
    const nodeId = key.replace('canvas_', '')
    if (!validNodeIds.has(nodeId)) {
      const texture = canvasTextureCache.get(key)
      if (texture) texture.dispose()
      canvasTextureCache.delete(key)
    }
  }

  // Clean webcamSnapshotState
  for (const nodeId of webcamSnapshotState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposeWebcamSnapshotNode(nodeId)
    }
  }

  // Clean snapshot held-frame state
  for (const nodeId of snapshotState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      disposeSnapshotNode(nodeId)
    }
  }

  // Clean pendingAssetLoads
  for (const nodeId of pendingAssetLoads.keys()) {
    if (!validNodeIds.has(nodeId)) {
      pendingAssetLoads.delete(nodeId)
    }
  }

  // Clean TextureBridge display sprites
  try {
    getTextureBridge().gc(validNodeIds)
  } catch (e) {
    // TextureBridge may not be initialized yet
  }
}

// ============================================================================
// Image FX nodes — discrete one-effect shader nodes (glitch, rgb-shift, …).
//
// Each wraps a fixed ShaderPreset: source texture -> iChannel0 -> effect ->
// texture output. The compiled material is cached under the nodeId (same map as
// the Shader node), so the existing disposeVisualNode/gcVisualState/
// disposeAllVisualNodes paths free it and its render target — no new gc needed.
// ============================================================================

/** Coerce any texture-ish input to a THREE.Texture + its source dimensions. */
export function coerceInputToTexture(
  renderer: ReturnType<typeof getThreeShaderRenderer>,
  input: unknown
): { tex: THREE.Texture; w: number; h: number } | null {
  let tex: THREE.Texture | null = null
  if (input instanceof THREE.Texture) tex = input
  else if (input instanceof WebGLTexture) tex = renderer.createTextureFromWebGL(input, 512, 512)
  else if (input instanceof HTMLCanvasElement || input instanceof HTMLVideoElement) {
    tex = renderer.createTexture(input)
  }
  if (!tex) return null
  const img = tex.image as
    { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | undefined
  const w = img?.videoWidth || img?.width || 512
  const h = img?.videoHeight || img?.height || 512
  return { tex, w, h }
}

export function hexToVec3(hex: string): number[] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ]
}

/**
 * Resolve an image-fx `source` input to a sampleable texture. A video-backed
 * source (a raw <video> or a video-backed THREE.Texture, e.g. the Webcam node's
 * texture output) renders BLACK if sampled directly through the offscreen
 * renderer, so its live frame is drawn to a per-node 2D canvas and a canvas-backed
 * texture is returned instead. Everything else passes through coerceInputToTexture.
 */
export function resolveEffectSource(
  nodeId: string,
  renderer: ReturnType<typeof getThreeShaderRenderer>,
  input: unknown
): { tex: THREE.Texture; w: number; h: number } | null {
  const video =
    input instanceof HTMLVideoElement
      ? input
      : input instanceof THREE.Texture && input.image instanceof HTMLVideoElement
        ? input.image
        : null

  if (video) {
    const w = video.videoWidth || 0
    const h = video.videoHeight || 0
    if (!w || !h || video.readyState < 2) return null // not painting yet
    let st = effectVideoState.get(nodeId)
    if (!st) {
      st = { canvas: document.createElement('canvas'), texture: null }
      effectVideoState.set(nodeId, st)
    }
    st.canvas.width = w
    st.canvas.height = h
    const c2d = st.canvas.getContext('2d')
    if (!c2d) return null
    c2d.drawImage(video, 0, 0, w, h)
    if (st.texture) renderer.updateTexture(st.texture, st.canvas)
    else st.texture = renderer.createTexture(st.canvas)
    return st.texture ? { tex: st.texture, w, h } : null
  }

  return coerceInputToTexture(renderer, input)
}

/** Run a fixed effect preset on the node's `source` texture. */
export function runImageFx(ctx: ExecutionContext, presetId: string): Map<string, unknown> {
  const outputs = new Map<string, unknown>()
  const renderer = getThreeShaderRenderer()
  const preset = getPresetById(presetId)
  if (!preset) {
    outputs.set('texture', null)
    outputs.set('_error', `Unknown effect: ${presetId}`)
    return outputs
  }

  const coerced = resolveEffectSource(ctx.nodeId, renderer, ctx.inputs.get('source'))
  if (!coerced) {
    outputs.set('texture', null)
    if (ctx.inputs.get('source')) {
      outputs.set('_error', 'Unsupported source. Connect a texture or video feed.')
    }
    return outputs
  }

  // Effect GLSL is constant per node, so compile once and cache under the nodeId
  // (visual gc/dispose frees this map entry + the render target on teardown).
  let material = compiledShaderMaterials.get(ctx.nodeId)
  if (!material) {
    const code = injectUniformDeclarations(preset.fragmentCode, preset.uniforms)
    const result = renderer.compileShader(code, undefined, true, preset.uniforms)
    if ('error' in result) {
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    material = result
    compiledShaderMaterials.set(ctx.nodeId, material)
  }

  renderer.setTime(ctx.totalTime)

  // Build uniforms (control/port id === uniform name). Presets here use only float and a
  // single vec3 color, so the marshaling stays small.
  const uniforms: ThreeShaderUniform[] = []
  for (const def of preset.uniforms) {
    // A wired input port modulates the param; otherwise fall back to the control, then the
    // preset default. Mirrors the color-correction executor idiom. Numeric ports only —
    // vec3 uniforms have no input port, so they always resolve from the control.
    const raw = ctx.inputs.get(def.name) ?? ctx.controls.get(def.name) ?? def.default
    if (def.type === 'vec3') {
      let value: number[]
      if (typeof raw === 'string' && raw.startsWith('#')) value = hexToVec3(raw)
      else if (Array.isArray(raw)) value = [Number(raw[0]) || 0, Number(raw[1]) || 0, Number(raw[2]) || 0]
      else value = def.default as number[]
      uniforms.push({ name: def.name, type: 'vec3', value })
    } else {
      uniforms.push({ name: def.name, type: 'float', value: Number(raw) || 0 })
    }
  }
  uniforms.push({ name: 'iChannel0', type: 'sampler2D', value: coerced.tex })

  try {
    const texture = renderer.render(material, uniforms, ctx.nodeId, coerced.w, coerced.h)
    outputs.set('texture', texture)
    outputs.set('_error', null)
  } catch (error) {
    outputs.set('texture', null)
    outputs.set('_error', error instanceof Error ? error.message : 'Render failed')
  }
  return outputs
}

export const makeImageFxExecutor = (presetId: string): NodeExecutorFn => (ctx) => runImageFx(ctx, presetId)

// ============================================================================
// Blend Node (Three.js version)
// ============================================================================

export const BLEND_FRAGMENT_THREE = `
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_mix;
uniform int u_mode;

void main() {
  vec4 a = texture2D(u_texture0, vUv);
  vec4 b = texture2D(u_texture1, vUv);

  vec4 result;

  if (u_mode == 0) {
    // Normal (mix)
    result = mix(a, b, u_mix);
  } else if (u_mode == 1) {
    // Add
    result = a + b * u_mix;
  } else if (u_mode == 2) {
    // Multiply
    result = mix(a, a * b, u_mix);
  } else if (u_mode == 3) {
    // Screen
    result = mix(a, 1.0 - (1.0 - a) * (1.0 - b), u_mix);
  } else if (u_mode == 4) {
    // Overlay
    vec4 overlay = vec4(
      a.r < 0.5 ? 2.0 * a.r * b.r : 1.0 - 2.0 * (1.0 - a.r) * (1.0 - b.r),
      a.g < 0.5 ? 2.0 * a.g * b.g : 1.0 - 2.0 * (1.0 - a.g) * (1.0 - b.g),
      a.b < 0.5 ? 2.0 * a.b * b.b : 1.0 - 2.0 * (1.0 - a.b) * (1.0 - b.b),
      a.a
    );
    result = mix(a, overlay, u_mix);
  } else {
    result = mix(a, b, u_mix);
  }

  gl_FragColor = result;
}
`

// ============================================================================
// Main Output Node (Hybrid Three.js + PixiJS version)
// ============================================================================

// Cache for canvas-to-texture conversions (one per node that outputs canvas)
export const canvasTextureCache = new Map<string, THREE.Texture>()

// ============================================================================
// Blur Node (Gaussian Blur - Three.js version)
// ============================================================================

export const BLUR_FRAGMENT_THREE = `
uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_radius;
uniform int u_direction;

void main() {
  vec2 texelSize = 1.0 / u_resolution;

  // Gaussian weights for 9-tap kernel
  float weights[5];
  weights[0] = 0.227027;
  weights[1] = 0.1945946;
  weights[2] = 0.1216216;
  weights[3] = 0.054054;
  weights[4] = 0.016216;

  vec3 result = texture2D(u_texture, vUv).rgb * weights[0];

  vec2 direction = u_direction == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);

  for (int i = 1; i < 5; i++) {
    vec2 offset = direction * texelSize * float(i) * u_radius;
    result += texture2D(u_texture, vUv + offset).rgb * weights[i];
    result += texture2D(u_texture, vUv - offset).rgb * weights[i];
  }

  gl_FragColor = vec4(result, 1.0);
}
`

// ============================================================================
// Color Correction Node (Three.js version)
// ============================================================================

export const COLOR_CORRECT_FRAGMENT_THREE = `
uniform sampler2D u_texture;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_hue;
uniform float u_gamma;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 color = texture2D(u_texture, vUv);

  // Brightness
  vec3 c = color.rgb + u_brightness;

  // Contrast
  c = (c - 0.5) * u_contrast + 0.5;

  // Saturation and Hue
  vec3 hsv = rgb2hsv(c);
  hsv.x = fract(hsv.x + u_hue);
  hsv.y *= u_saturation;
  c = hsv2rgb(hsv);

  // Gamma
  c = pow(max(c, 0.0), vec3(1.0 / u_gamma));

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), color.a);
}
`

// ============================================================================
// Displacement Node (Three.js version)
// ============================================================================

export const DISPLACEMENT_FRAGMENT_THREE = `
uniform sampler2D u_texture;
uniform sampler2D u_displacement;
uniform float u_strength;
uniform int u_channel;

void main() {
  vec4 disp = texture2D(u_displacement, vUv);

  vec2 offset;
  if (u_channel == 0) {
    offset = vec2(disp.r - 0.5, 0.0);
  } else if (u_channel == 1) {
    offset = vec2(0.0, disp.g - 0.5);
  } else if (u_channel == 2) {
    offset = vec2(disp.b - 0.5, 0.0);
  } else {
    offset = vec2(disp.r - 0.5, disp.g - 0.5);
  }

  offset *= u_strength;

  vec4 color = texture2D(u_texture, vUv + offset);
  gl_FragColor = color;
}
`

// ============================================================================
// Transform 2D Node (Three.js version)
// ============================================================================

export const TRANSFORM_FRAGMENT_THREE = `
uniform sampler2D u_texture;
uniform vec2 u_translate;
uniform float u_rotate;
uniform vec2 u_scale;
uniform vec2 u_pivot;

void main() {
  // Move to pivot
  vec2 uv = vUv - u_pivot;

  // Scale
  uv /= u_scale;

  // Rotate
  float c = cos(u_rotate);
  float s = sin(u_rotate);
  uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);

  // Move back and translate
  uv = uv + u_pivot - u_translate;

  // Sample with edge clamping
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0);
  } else {
    gl_FragColor = texture2D(u_texture, uv);
  }
}
`

// ============================================================================
// Texture to Data Node (Three.js version)
// ============================================================================

// Cache for converted image data per node
export const textureDataCache = new Map<string, { data: ImageData | string | Blob; width: number; height: number }>()

// Temp canvas for reading texture data
let textureToDataCanvas: HTMLCanvasElement | null = null

export const textureToDataExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as THREE.Texture | null
  const trigger = ctx.inputs.get('trigger')
  const format = (ctx.controls.get('format') as string) ?? 'imageData'
  const continuous = (ctx.controls.get('continuous') as boolean) ?? false

  const outputs = new Map<string, unknown>()

  if (!texture) {
    outputs.set('data', null)
    outputs.set('width', 0)
    outputs.set('height', 0)
    return outputs
  }

  // Only capture on trigger or continuous mode
  const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0) || (typeof trigger === 'string' && trigger.length > 0)

  if (!hasTrigger && !continuous) {
    // Return cached data
    const cached = textureDataCache.get(ctx.nodeId)
    if (cached) {
      outputs.set('data', cached.data)
      outputs.set('width', cached.width)
      outputs.set('height', cached.height)
    } else {
      outputs.set('data', null)
      outputs.set('width', 0)
      outputs.set('height', 0)
    }
    return outputs
  }

  const renderer = getThreeShaderRenderer()

  // Get canvas dimensions from texture or use default (image is `{}` in @types/three 0.184)
  const image = texture.image as { width?: number; height?: number } | undefined
  const width = image?.width || 512
  const height = image?.height || 512

  // Create or reuse temp canvas
  if (!textureToDataCanvas) {
    textureToDataCanvas = document.createElement('canvas')
  }
  textureToDataCanvas.width = width
  textureToDataCanvas.height = height

  // Render texture to temp canvas
  renderer.renderToCanvas(texture, textureToDataCanvas)

  // Get canvas 2D context to read pixels
  const ctx2d = textureToDataCanvas.getContext('2d')
  if (!ctx2d) {
    outputs.set('data', null)
    outputs.set('width', 0)
    outputs.set('height', 0)
    outputs.set('_error', 'Failed to get 2D context')
    return outputs
  }

  // Read pixels from canvas
  const imageData = ctx2d.getImageData(0, 0, width, height)

  // Convert to requested format
  let data: ImageData | string | Blob

  if (format === 'imageData') {
    data = imageData
  } else if (format === 'base64') {
    data = textureToDataCanvas.toDataURL('image/png')
  } else {
    // blob - convert synchronously using data URL for now
    data = textureToDataCanvas.toDataURL('image/png')
  }

  // Cache the result
  textureDataCache.set(ctx.nodeId, { data, width, height })

  outputs.set('data', data)
  outputs.set('width', width)
  outputs.set('height', height)
  return outputs
}

// ============================================================================
// Image Loader Node
// ============================================================================


// Track pending asset URL resolutions
export const pendingAssetLoads = new Map<string, Promise<void>>()

// ============================================================================
// Webcam Snapshot Node
// ============================================================================

// State for webcam snapshot nodes - now uses THREE.Texture
export const webcamSnapshotState = new Map<
  string,
  {
    video: HTMLVideoElement | null
    canvas: HTMLCanvasElement | null
    texture: THREE.Texture | null
    stream: MediaStream | null
    lastCaptureTime: number
    capturedImageData: ImageData | null
    deviceId: string | null
    resolution: string
    initialized: boolean
    failed: boolean
  }
>()

// Resolution presets
export const resolutionPresets: Record<string, { width: number; height: number }> = {
  '480p': { width: 640, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
}

export async function initWebcamSnapshot(
  nodeId: string,
  deviceId: string | undefined,
  resolution: string
): Promise<void> {
  let state = webcamSnapshotState.get(nodeId)

  // If a previous getUserMedia attempt failed for this exact request, don't retry
  // every frame — that re-prompts the user / re-hits a denied device ~60×/s. Wait
  // until the requested device or resolution changes.
  if (
    state &&
    state.failed &&
    (state.deviceId ?? '') === (deviceId ?? '') &&
    state.resolution === resolution
  ) {
    return
  }

  // Check if we need to reinitialize
  const needsReinit =
    !state ||
    !state.initialized ||
    state.deviceId !== deviceId ||
    state.resolution !== resolution

  if (!needsReinit && state?.stream?.active) {
    return
  }

  // Clean up existing
  if (state?.stream) {
    state.stream.getTracks().forEach((track) => track.stop())
  }

  // Initialize new state
  if (!state) {
    state = {
      video: document.createElement('video'),
      canvas: document.createElement('canvas'),
      texture: null,
      stream: null,
      lastCaptureTime: 0,
      capturedImageData: null,
      deviceId: deviceId ?? null,
      resolution,
      initialized: false,
      failed: false,
    }
    webcamSnapshotState.set(nodeId, state)
  }

  const res = resolutionPresets[resolution] ?? resolutionPresets['720p']

  try {
    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: res.width },
        height: { ideal: res.height },
        deviceId: deviceId ? { exact: deviceId } : undefined,
      },
    }

    state.stream = await navigator.mediaDevices.getUserMedia(constraints)
    state.video!.srcObject = state.stream
    state.video!.muted = true
    state.video!.playsInline = true
    await state.video!.play()

    state.canvas!.width = state.video!.videoWidth || res.width
    state.canvas!.height = state.video!.videoHeight || res.height
    state.deviceId = deviceId ?? null
    state.resolution = resolution
    state.initialized = true
    state.failed = false
  } catch (error) {
    console.error('[Webcam Snapshot] Failed to initialize:', error)
    state.initialized = false
    // Latch the failure for this request so we don't re-prompt every frame.
    state.deviceId = deviceId ?? null
    state.resolution = resolution
    state.failed = true
  }
}

// Cleanup function for webcam snapshot
export function disposeWebcamSnapshotNode(nodeId: string): void {
  const state = webcamSnapshotState.get(nodeId)
  if (state) {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop())
    }
    if (state.texture) {
      state.texture.dispose()
    }
    webcamSnapshotState.delete(nodeId)
  }
}

// ============================================================================
// Snapshot Node
// ============================================================================

// Per-node held-frame state. The held canvas + texture persist between captures
// so the node keeps emitting the last latched frame until the next trigger.
export interface SnapshotState {
  canvas: HTMLCanvasElement
  texture: THREE.Texture | null
  imageData: ImageData | null
  width: number
  height: number
  prevTrigger: boolean
}

export const snapshotState = new Map<string, SnapshotState>()
// Shared scratch canvas used to render the source texture before (optionally)
// mirroring it into each node's held canvas.
let snapshotScratchCanvas: HTMLCanvasElement | null = null

export const snapshotExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const source = ctx.inputs.get('source') as THREE.Texture | null
  const trigger = ctx.inputs.get('trigger')
  const continuous = (ctx.controls.get('continuous') as boolean) ?? false
  const mirror = (ctx.controls.get('mirror') as boolean) ?? false

  const outputs = new Map<string, unknown>()

  let state = snapshotState.get(ctx.nodeId)
  if (!state) {
    state = {
      canvas: document.createElement('canvas'),
      texture: null,
      imageData: null,
      width: 0,
      height: 0,
      prevTrigger: false,
    }
    snapshotState.set(ctx.nodeId, state)
  }

  // Rising-edge trigger detection so a held trigger only fires one capture.
  const triggerActive =
    trigger === true ||
    trigger === 1 ||
    (typeof trigger === 'number' && trigger > 0) ||
    (typeof trigger === 'string' && trigger.length > 0)
  const risingEdge = triggerActive && !state.prevTrigger
  state.prevTrigger = triggerActive

  let capturedThisFrame = false

  if (source && (continuous || risingEdge)) {
    // Determine source dimensions (covers image/canvas + video-backed textures).
    const image = source.image as
      | { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
      | undefined
    const width = image?.width || image?.videoWidth || 512
    const height = image?.height || image?.videoHeight || 512

    const renderer = getThreeShaderRenderer()

    // Render the source texture into the shared scratch canvas first.
    if (!snapshotScratchCanvas) {
      snapshotScratchCanvas = document.createElement('canvas')
    }
    snapshotScratchCanvas.width = width
    snapshotScratchCanvas.height = height
    renderer.renderToCanvas(source, snapshotScratchCanvas)

    // Latch into the per-node held canvas, applying mirror if requested.
    state.canvas.width = width
    state.canvas.height = height
    const ctx2d = state.canvas.getContext('2d')
    if (ctx2d) {
      if (mirror) {
        ctx2d.save()
        ctx2d.scale(-1, 1)
        ctx2d.drawImage(snapshotScratchCanvas, -width, 0)
        ctx2d.restore()
      } else {
        ctx2d.drawImage(snapshotScratchCanvas, 0, 0)
      }

      state.imageData = ctx2d.getImageData(0, 0, width, height)
      state.width = width
      state.height = height

      // Keep the output texture on the ThreeShaderRenderer context.
      if (state.texture) {
        renderer.updateTexture(state.texture, state.canvas)
      } else {
        state.texture = renderer.createTexture(state.canvas)
      }

      capturedThisFrame = true
    }
  }

  outputs.set('texture', state.texture)
  outputs.set('imageData', state.imageData)
  outputs.set('width', state.width)
  outputs.set('height', state.height)
  outputs.set('captured', capturedThisFrame)
  return outputs
}

// Cleanup for a single snapshot node.
export function disposeSnapshotNode(nodeId: string): void {
  const state = snapshotState.get(nodeId)
  if (state) {
    if (state.texture) state.texture.dispose()
    state.canvas.width = 0
    state.canvas.height = 0
    snapshotState.delete(nodeId)
  }
}

// ============================================================================
// Registry
// ============================================================================

// All visual nodes (image-fx-*, shader, blend, webcam, main-output, …) are co-located
// (registry/visual/<id>/node.ts) and import their executor consts from this module; there is
// no `visualExecutors` map to register.

// Visual state cleanup self-registers with the engine's generic lifecycle loop
// (was hand-wired as gcVisualState / disposeAllVisualNodes calls in ExecutionEngine).
// defineLifecycle-wrap, NOT defineNodeState: the WebGL/texture/video teardown spans
// many module-level maps with their own dispose order; the cleanup logic is unchanged,
// only WHERE it is invoked (explicit engine calls → generic loop, same timing).
defineLifecycle({
  label: 'visual',
  gc: gcVisualState,
  disposeAll: disposeAllVisualNodes,
})
