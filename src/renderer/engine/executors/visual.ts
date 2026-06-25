/**
 * Visual Node Executors
 *
 * These executors handle visual/shader nodes using Three.js-based rendering
 * for proper per-node framebuffer management and texture display.
 */

import * as THREE from 'three'
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import {
  getThreeShaderRenderer,
  type CompiledShaderMaterial,
  type ThreeShaderUniform,
} from '@/services/visual/ThreeShaderRenderer'
// Keep old renderer for legacy framebuffer cleanup during dispose (only if it was used)
import { getShaderRenderer, hasShaderRenderer } from '@/services/visual/ShaderRenderer'
import { webcamCapture } from '@/services/visual/WebcamCapture'
import {
  getPresetById,
  parseUniformsFromCode,
  generateInputsFromUniforms,
  generateControlsFromUniforms,
  injectUniformDeclarations,
  type UniformDefinition,
} from '@/services/visual/ShaderPresets'
import { getTextureBridge } from '@/services/visual/TextureBridge'

// Re-export for use by other executors (e.g., AI texture conversion)
export { getShaderRenderer, getThreeShaderRenderer }

// Store for compiled shaders (now uses Three.js ShaderMaterial)
const compiledShaderMaterials = new Map<string, CompiledShaderMaterial>()
// Legacy compiled shaders - kept for cleanup during dispose
const compiledShaders = new Map<string, unknown>()
// Node textures - now THREE.Texture instead of raw WebGLTexture
const nodeTextures = new Map<string, THREE.Texture>()

// Image loader state per node - now uses THREE.Texture
const imageLoaderState = new Map<
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
const videoPlayerState = new Map<
  string,
  {
    video: HTMLVideoElement | null
    texture: THREE.Texture | null
    loadedUrl: string | null
    lastSeek: number | null
  }
>()
// Track last preset to detect changes
const lastPreset = new Map<string, string>()
// Cache detected uniforms per-node to persist across frames
const cachedUniforms = new Map<string, UniformDefinition[]>()

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
 * Garbage collect orphaned visual state entries.
 * Call this with the set of currently valid node IDs.
 */
export function gcVisualState(validNodeIds: Set<string>): void {
  const threeRenderer = getThreeShaderRenderer()

  // Clean compiledShaderMaterials
  for (const key of compiledShaderMaterials.keys()) {
    if (key.startsWith('_')) continue
    const baseId = key.includes('_') ? key.split('_')[0] : key
    if (baseId && !validNodeIds.has(baseId)) {
      const material = compiledShaderMaterials.get(key)
      if (material) material.material.dispose()
      compiledShaderMaterials.delete(key)
    }
  }

  // Clean legacy compiledShaders
  for (const key of compiledShaders.keys()) {
    if (key.startsWith('_')) continue
    const baseId = key.includes('_') ? key.split('_')[0] : key
    if (baseId && !validNodeIds.has(baseId)) {
      compiledShaders.delete(key)
    }
  }

  // Clean nodeTextures - dispose Three.js textures
  for (const nodeId of nodeTextures.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const texture = nodeTextures.get(nodeId)
      if (texture) texture.dispose()
      nodeTextures.delete(nodeId)
      threeRenderer.disposeNode(nodeId)
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
// Shader Node (using Three.js ShaderMaterial)
// ============================================================================

/**
 * Shader Executor v4.0 - Three.js Based Rendering
 *
 * Uses Three.js ShaderMaterial for proper per-node framebuffer management.
 * This fixes:
 * 1. Per-node render targets (no more shared canvas issues)
 * 2. Proper texture output (THREE.Texture not raw WebGLTexture)
 * 3. Clean uniform management via ShaderMaterial
 */
export const shaderExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const preset = (ctx.controls.get('preset') as string) ?? 'custom'
  let fragmentCode = (ctx.controls.get('code') as string) ?? ''
  const vertexCode = (ctx.controls.get('vertexCode') as string) ?? ''
  const isShadertoy = (ctx.controls.get('shadertoy') as boolean) ?? true

  const renderer = getThreeShaderRenderer()
  const outputs = new Map<string, unknown>()

  // Detected uniforms for dynamic port generation
  let detectedUniforms: UniformDefinition[] = []

  // Check if preset changed - load preset code and uniforms
  const prevPreset = lastPreset.get(ctx.nodeId)
  if (preset !== 'custom' && !preset.startsWith('---')) {
    if (preset !== prevPreset) {
      // Preset changed - load and cache uniforms
      const presetData = getPresetById(preset)
      if (presetData) {
        detectedUniforms = presetData.uniforms
        cachedUniforms.set(ctx.nodeId, detectedUniforms)

        // Inject uniform declarations into preset code so parseUniformsFromCode() can find them
        // This ensures the stored code is self-contained and works in the shader editor
        fragmentCode = injectUniformDeclarations(presetData.fragmentCode, detectedUniforms)

        // Signal that code and ports need updating
        outputs.set('_preset_code', fragmentCode)
        outputs.set('_preset_uniforms', presetData.uniforms)

        // Generate dynamic ports from preset uniforms
        outputs.set('_dynamicInputs', generateInputsFromUniforms(detectedUniforms))
        outputs.set('_dynamicControls', generateControlsFromUniforms(detectedUniforms))
      }
      lastPreset.set(ctx.nodeId, preset)
    } else {
      // Same preset - use cached uniforms
      detectedUniforms = cachedUniforms.get(ctx.nodeId) || []
    }
  } else if (preset === 'custom') {
    lastPreset.set(ctx.nodeId, 'custom')
    cachedUniforms.delete(ctx.nodeId)
  }

  // Skip separator options
  if (preset.startsWith('---')) {
    outputs.set('texture', null)
    outputs.set('_error', 'Select a preset or use custom')
    return outputs
  }

  if (!fragmentCode.trim()) {
    outputs.set('texture', null)
    outputs.set('_error', 'No shader code')
    return outputs
  }

  // Parse uniforms from code if not already done (from preset)
  if (detectedUniforms.length === 0) {
    detectedUniforms = parseUniformsFromCode(fragmentCode)
  }

  // Get or compile shader using Three.js
  const customVertex = vertexCode.trim() ? vertexCode : undefined
  // Use a hash of the full code to avoid cache collisions when code changes after first 100 chars
  // Simple hash function (djb2)
  const hashCode = (str: string): number => {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
    }
    return hash >>> 0 // Convert to unsigned 32-bit
  }
  const cacheKey = `${ctx.nodeId}_${hashCode(fragmentCode)}_${customVertex ? hashCode(customVertex) : ''}_${isShadertoy}_${detectedUniforms.length}`

  let shaderMaterial = compiledShaderMaterials.get(cacheKey)
  if (!shaderMaterial) {
    // Pass uniform definitions so declarations get injected into GLSL
    const result = renderer.compileShader(fragmentCode, customVertex, isShadertoy, detectedUniforms)

    if ('error' in result) {
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }

    shaderMaterial = result
    compiledShaderMaterials.set(cacheKey, shaderMaterial)
    compiledShaderMaterials.set(ctx.nodeId, shaderMaterial)
  }

  // Set time for animation
  renderer.setTime(ctx.totalTime)

  // Build uniforms array from detected uniforms
  const uniforms: ThreeShaderUniform[] = []

  // Process all detected uniforms
  for (const def of detectedUniforms) {
    // Get value from input port first, then control, then default
    const inputVal = ctx.inputs.get(def.name)
    const controlVal = ctx.controls.get(def.name)
    const value = inputVal ?? controlVal ?? def.default

    // Handle different uniform types
    switch (def.type) {
      case 'float':
        uniforms.push({
          name: def.name,
          type: 'float',
          value: Number(value) || 0,
        })
        break

      case 'int':
        uniforms.push({
          name: def.name,
          type: 'int',
          value: Math.round(Number(value)) || 0,
        })
        break

      case 'vec2':
        if (Array.isArray(value)) {
          uniforms.push({
            name: def.name,
            type: 'vec2',
            value: [Number(value[0]) || 0, Number(value[1]) || 0],
          })
        } else {
          uniforms.push({
            name: def.name,
            type: 'vec2',
            value: def.default as number[],
          })
        }
        break

      case 'vec3':
        if (Array.isArray(value)) {
          uniforms.push({
            name: def.name,
            type: 'vec3',
            value: [
              Number(value[0]) || 0,
              Number(value[1]) || 0,
              Number(value[2]) || 0,
            ],
          })
        } else if (typeof value === 'string' && value.startsWith('#')) {
          // Convert hex color to vec3
          const hex = value.slice(1)
          const r = parseInt(hex.substring(0, 2), 16) / 255
          const g = parseInt(hex.substring(2, 4), 16) / 255
          const b = parseInt(hex.substring(4, 6), 16) / 255
          uniforms.push({
            name: def.name,
            type: 'vec3',
            value: [r, g, b],
          })
        } else {
          uniforms.push({
            name: def.name,
            type: 'vec3',
            value: def.default as number[],
          })
        }
        break

      case 'vec4':
        if (Array.isArray(value)) {
          uniforms.push({
            name: def.name,
            type: 'vec4',
            value: [
              Number(value[0]) || 0,
              Number(value[1]) || 0,
              Number(value[2]) || 0,
              Number(value[3]) ?? 1,
            ],
          })
        } else {
          uniforms.push({
            name: def.name,
            type: 'vec4',
            value: def.default as number[],
          })
        }
        break

      case 'sampler2D':
      case 'samplerCube':
        // Texture uniform - accepts both THREE.Texture and raw WebGLTexture
        // Note: samplerCube treated same as sampler2D for now (cubemaps not fully supported)
        if (value instanceof THREE.Texture) {
          uniforms.push({
            name: def.name,
            type: 'sampler2D',
            value: value,
          })
        } else if (value instanceof WebGLTexture) {
          // Convert WebGLTexture to THREE.Texture for compatibility
          const threeTexture = renderer.createTextureFromWebGL(value, 512, 512)
          if (threeTexture) {
            uniforms.push({
              name: def.name,
              type: 'sampler2D',
              value: threeTexture,
            })
          }
        }
        break
    }
  }

  // Add static texture inputs (iChannel0-3 for Shadertoy compatibility)
  for (let i = 0; i < 4; i++) {
    const textureInput = ctx.inputs.get(`iChannel${i}`)
    if (textureInput) {
      // Only add if not already in uniforms from detected uniforms
      if (!uniforms.some(u => u.name === `iChannel${i}`)) {
        if (textureInput instanceof THREE.Texture) {
          uniforms.push({ name: `iChannel${i}`, type: 'sampler2D', value: textureInput })
        } else if (textureInput instanceof WebGLTexture) {
          const threeTexture = renderer.createTextureFromWebGL(textureInput, 512, 512)
          if (threeTexture) {
            uniforms.push({ name: `iChannel${i}`, type: 'sampler2D', value: threeTexture })
          }
        } else if (textureInput instanceof HTMLCanvasElement || textureInput instanceof HTMLVideoElement) {
          // Convert canvas/video to THREE.Texture for 3D→Shader and Webcam→Shader pipelines
          const threeTexture = renderer.createTexture(textureInput)
          if (threeTexture) {
            uniforms.push({ name: `iChannel${i}`, type: 'sampler2D', value: threeTexture })
          }
        }
      }
    }
  }

  // Render to per-node render target
  try {
    const texture = renderer.render(shaderMaterial, uniforms, ctx.nodeId)
    outputs.set('texture', texture)
    outputs.set('_error', null)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Render failed'
    console.error(`[Shader ${ctx.nodeId}] render error:`, msg)
    outputs.set('texture', null)
    outputs.set('_error', msg)
  }

  // Output detected uniforms for debugging/UI
  outputs.set('_detectedUniforms', detectedUniforms)

  return outputs
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
function coerceInputToTexture(
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

function hexToVec3(hex: string): number[] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ]
}

/** Run a fixed effect preset on the node's `source` texture. */
function runImageFx(ctx: ExecutionContext, presetId: string): Map<string, unknown> {
  const outputs = new Map<string, unknown>()
  const renderer = getThreeShaderRenderer()
  const preset = getPresetById(presetId)
  if (!preset) {
    outputs.set('texture', null)
    outputs.set('_error', `Unknown effect: ${presetId}`)
    return outputs
  }

  const coerced = coerceInputToTexture(renderer, ctx.inputs.get('source'))
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

  // Build uniforms from controls (control id === uniform name). Presets here use
  // only float and a single vec3 color, so the marshaling stays small.
  const uniforms: ThreeShaderUniform[] = []
  for (const def of preset.uniforms) {
    const raw = ctx.controls.get(def.name) ?? def.default
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

const makeImageFxExecutor = (presetId: string): NodeExecutorFn => (ctx) => runImageFx(ctx, presetId)

export const imageFxGlitchExecutor = makeImageFxExecutor('glitch')
export const imageFxRgbShiftExecutor = makeImageFxExecutor('chromatic-aberration')
export const imageFxPixelateExecutor = makeImageFxExecutor('pixelate')
export const imageFxKaleidoscopeExecutor = makeImageFxExecutor('kaleidoscope')
export const imageFxScanlinesExecutor = makeImageFxExecutor('scanlines')
export const imageFxPosterizeExecutor = makeImageFxExecutor('posterize')
export const imageFxDitherExecutor = makeImageFxExecutor('dither')
export const imageFxChromaKeyExecutor = makeImageFxExecutor('chroma-key')

// ============================================================================
// Webcam Input Node
// ============================================================================

export const webcamExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const enabled = (ctx.controls.get('enabled') as boolean) ?? true
  const deviceId = ctx.controls.get('device') as string | undefined

  if (!enabled) {
    const outputs = new Map<string, unknown>()
    outputs.set('texture', null)
    outputs.set('video', null)
    return outputs
  }

  // Start webcam if not already
  if (!webcamCapture.isCapturing) {
    try {
      await webcamCapture.start(deviceId)
    } catch {
      const outputs = new Map<string, unknown>()
      outputs.set('texture', null)
      outputs.set('video', null)
      outputs.set('_error', 'Webcam access denied')
      return outputs
    }
  }

  const video = webcamCapture.getVideo()
  if (!video) {
    const outputs = new Map<string, unknown>()
    outputs.set('texture', null)
    outputs.set('video', null)
    return outputs
  }

  // Get or create THREE.Texture for this node
  const threeRenderer = getThreeShaderRenderer()
  let texture = nodeTextures.get(ctx.nodeId)

  if (!texture) {
    texture = threeRenderer.createTexture(video)
    nodeTextures.set(ctx.nodeId, texture)
  } else {
    // Update texture with current frame
    threeRenderer.updateTexture(texture, video)
  }

  const outputs = new Map<string, unknown>()
  outputs.set('texture', texture)
  outputs.set('video', video)
  outputs.set('width', video.videoWidth)
  outputs.set('height', video.videoHeight)
  return outputs
}

// ============================================================================
// Color Node
// ============================================================================

export const colorExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const r = (ctx.inputs.get('r') as number) ?? (ctx.controls.get('r') as number) ?? 1
  const g = (ctx.inputs.get('g') as number) ?? (ctx.controls.get('g') as number) ?? 1
  const b = (ctx.inputs.get('b') as number) ?? (ctx.controls.get('b') as number) ?? 1
  const a = (ctx.inputs.get('a') as number) ?? (ctx.controls.get('a') as number) ?? 1

  const outputs = new Map<string, unknown>()
  outputs.set('color', [r, g, b, a])
  outputs.set('r', r)
  outputs.set('g', g)
  outputs.set('b', b)
  outputs.set('a', a)
  return outputs
}

// ============================================================================
// Texture Display Node (Three.js version)
// ============================================================================

export const textureDisplayExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as THREE.Texture | null

  const outputs = new Map<string, unknown>()

  if (!texture) {
    outputs.set('_display', null)
    return outputs
  }

  const renderer = getThreeShaderRenderer()

  // Render texture to internal canvas for display
  renderer.renderToCanvas(texture, renderer.getCanvas())

  outputs.set('_display', renderer.getCanvas())
  return outputs
}

// ============================================================================
// Blend Node (Three.js version)
// ============================================================================

const BLEND_FRAGMENT_THREE = `
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

export const blendExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture0 = ctx.inputs.get('a') as THREE.Texture | null
  const texture1 = ctx.inputs.get('b') as THREE.Texture | null
  const mixAmount = (ctx.inputs.get('mix') as number) ?? (ctx.controls.get('mix') as number) ?? 0.5
  const modeStr = (ctx.controls.get('mode') as string) ?? 'normal'

  const modeMap: Record<string, number> = {
    normal: 0,
    add: 1,
    multiply: 2,
    screen: 3,
    overlay: 4,
  }
  const mode = modeMap[modeStr] ?? 0

  const outputs = new Map<string, unknown>()

  if (!texture0 && !texture1) {
    outputs.set('texture', null)
    return outputs
  }

  const renderer = getThreeShaderRenderer()

  // Get or compile blend shader
  let shader = renderer.getEffectShader('_blend')
  if (!shader) {
    const result = renderer.compileEffectShader(BLEND_FRAGMENT_THREE, '_blend')
    if ('error' in result) {
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
  }

  // Update uniforms
  const { uniforms } = shader
  if (!uniforms) {
    outputs.set('texture', null)
    outputs.set('_error', 'Shader uniforms not initialized')
    return outputs
  }

  uniforms.u_mix.value = mixAmount
  uniforms.u_mode.value = mode

  if (texture0) {
    uniforms.u_texture0.value = texture0
  }
  if (texture1) {
    uniforms.u_texture1.value = texture1
  }

  // Render to per-node render target
  const resultTexture = renderer.render(shader, [], ctx.nodeId)
  outputs.set('texture', resultTexture)
  return outputs
}

// ============================================================================
// Main Output Node (Hybrid Three.js + PixiJS version)
// ============================================================================

// Cache for canvas-to-texture conversions (one per node that outputs canvas)
const canvasTextureCache = new Map<string, THREE.Texture>()

/**
 * Main Output Executor - Simplified for PixiJS display
 *
 * The executor now just passes the texture through - PixiJS handles
 * the actual display in the MainOutputNode component via TextureBridge.
 * This eliminates CPU-GPU roundtrips from renderToCanvas().
 */
export const mainOutputExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const textureInput = ctx.inputs.get('texture') as THREE.Texture | HTMLCanvasElement | null

  const outputs = new Map<string, unknown>()

  if (!textureInput) {
    outputs.set('_input_texture', null)
    return outputs
  }

  // Handle different input types
  let outputTexture: THREE.Texture

  if (textureInput instanceof THREE.Texture) {
    // Three.js texture - pass through directly for PixiJS display
    outputTexture = textureInput
  } else if (textureInput instanceof HTMLCanvasElement) {
    // Canvas element - convert to Three.js texture
    const renderer = getThreeShaderRenderer()
    const cacheKey = `canvas_${ctx.nodeId}`
    let cachedTexture = canvasTextureCache.get(cacheKey)

    if (!cachedTexture) {
      cachedTexture = renderer.createTexture(textureInput)
      canvasTextureCache.set(cacheKey, cachedTexture)
    } else {
      // Update the existing texture with new canvas content
      renderer.updateTexture(cachedTexture, textureInput)
    }
    outputTexture = cachedTexture
  } else {
    // Unknown type - return null
    outputs.set('_input_texture', null)
    return outputs
  }

  // Store the texture - PixiJS display component will render it directly
  // No more CPU-GPU roundtrip via renderToCanvas()
  outputs.set('_input_texture', outputTexture)
  return outputs
}

// ============================================================================
// Blur Node (Gaussian Blur - Three.js version)
// ============================================================================

const BLUR_FRAGMENT_THREE = `
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

export const blurExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as THREE.Texture | null
  const radius = (ctx.inputs.get('radius') as number) ?? (ctx.controls.get('radius') as number) ?? 1

  const outputs = new Map<string, unknown>()

  if (!texture) {
    outputs.set('texture', null)
    return outputs
  }

  const renderer = getThreeShaderRenderer()

  // Get or compile blur shader
  let shader = renderer.getEffectShader('_blur')
  if (!shader) {
    const result = renderer.compileEffectShader(BLUR_FRAGMENT_THREE, '_blur')
    if ('error' in result) {
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
  }

  const { uniforms } = shader
  if (!uniforms) {
    outputs.set('texture', null)
    outputs.set('_error', 'Shader uniforms not initialized')
    return outputs
  }

  const width = 512
  const height = 512

  // Horizontal pass
  uniforms.u_texture.value = texture
  uniforms.u_resolution.value.set(width, height)
  uniforms.u_radius.value = radius
  uniforms.u_direction.value = 0

  const horizontalTexture = renderer.render(shader, [], `${ctx.nodeId}_h`)

  // Vertical pass
  if (horizontalTexture) {
    uniforms.u_texture.value = horizontalTexture
    uniforms.u_direction.value = 1

    const resultTexture = renderer.render(shader, [], ctx.nodeId)
    outputs.set('texture', resultTexture)
  } else {
    outputs.set('texture', null)
  }

  return outputs
}

// ============================================================================
// Color Correction Node (Three.js version)
// ============================================================================

const COLOR_CORRECT_FRAGMENT_THREE = `
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

export const colorCorrectionExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as THREE.Texture | null
  const brightness = (ctx.inputs.get('brightness') as number) ?? (ctx.controls.get('brightness') as number) ?? 0
  const contrast = (ctx.inputs.get('contrast') as number) ?? (ctx.controls.get('contrast') as number) ?? 1
  const saturation = (ctx.inputs.get('saturation') as number) ?? (ctx.controls.get('saturation') as number) ?? 1
  const hue = (ctx.inputs.get('hue') as number) ?? (ctx.controls.get('hue') as number) ?? 0
  const gamma = (ctx.inputs.get('gamma') as number) ?? (ctx.controls.get('gamma') as number) ?? 1

  const outputs = new Map<string, unknown>()

  if (!texture) {
    outputs.set('texture', null)
    return outputs
  }

  const renderer = getThreeShaderRenderer()

  // Get or compile color correction shader
  let shader = renderer.getEffectShader('_color_correct')
  if (!shader) {
    const result = renderer.compileEffectShader(COLOR_CORRECT_FRAGMENT_THREE, '_color_correct')
    if ('error' in result) {
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
  }

  const { uniforms } = shader
  if (!uniforms) {
    outputs.set('texture', null)
    outputs.set('_error', 'Shader uniforms not initialized')
    return outputs
  }

  uniforms.u_texture.value = texture
  uniforms.u_brightness.value = brightness
  uniforms.u_contrast.value = contrast
  uniforms.u_saturation.value = saturation
  uniforms.u_hue.value = hue
  uniforms.u_gamma.value = gamma

  const resultTexture = renderer.render(shader, [], ctx.nodeId)
  outputs.set('texture', resultTexture)
  return outputs
}

// ============================================================================
// Displacement Node (Three.js version)
// ============================================================================

const DISPLACEMENT_FRAGMENT_THREE = `
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

export const displacementExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as THREE.Texture | null
  const displacementMap = ctx.inputs.get('displacement') as THREE.Texture | null
  const strength = (ctx.inputs.get('strength') as number) ?? (ctx.controls.get('strength') as number) ?? 0.1

  const channelStr = (ctx.controls.get('channel') as string) ?? 'rg'
  const channelMap: Record<string, number> = { r: 0, g: 1, b: 2, rg: 3 }
  const channel = channelMap[channelStr] ?? 3

  const outputs = new Map<string, unknown>()

  if (!texture) {
    outputs.set('texture', null)
    return outputs
  }

  // If no displacement map, pass through
  if (!displacementMap) {
    outputs.set('texture', texture)
    return outputs
  }

  const renderer = getThreeShaderRenderer()

  // Get or compile displacement shader
  let shader = renderer.getEffectShader('_displacement')
  if (!shader) {
    const result = renderer.compileEffectShader(DISPLACEMENT_FRAGMENT_THREE, '_displacement')
    if ('error' in result) {
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
  }

  const { uniforms } = shader
  if (!uniforms) {
    outputs.set('texture', null)
    outputs.set('_error', 'Shader uniforms not initialized')
    return outputs
  }

  uniforms.u_texture.value = texture
  uniforms.u_displacement.value = displacementMap
  uniforms.u_strength.value = strength
  uniforms.u_channel.value = channel

  const resultTexture = renderer.render(shader, [], ctx.nodeId)
  outputs.set('texture', resultTexture)
  return outputs
}

// ============================================================================
// Transform 2D Node (Three.js version)
// ============================================================================

const TRANSFORM_FRAGMENT_THREE = `
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

export const transform2DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as THREE.Texture | null
  const translateX = (ctx.inputs.get('translateX') as number) ?? (ctx.controls.get('translateX') as number) ?? 0
  const translateY = (ctx.inputs.get('translateY') as number) ?? (ctx.controls.get('translateY') as number) ?? 0
  const rotate = (ctx.inputs.get('rotate') as number) ?? (ctx.controls.get('rotate') as number) ?? 0
  const scaleX = (ctx.inputs.get('scaleX') as number) ?? (ctx.controls.get('scaleX') as number) ?? 1
  const scaleY = (ctx.inputs.get('scaleY') as number) ?? (ctx.controls.get('scaleY') as number) ?? 1
  const pivotX = (ctx.controls.get('pivotX') as number) ?? 0.5
  const pivotY = (ctx.controls.get('pivotY') as number) ?? 0.5

  const outputs = new Map<string, unknown>()

  if (!texture) {
    outputs.set('texture', null)
    return outputs
  }

  const renderer = getThreeShaderRenderer()

  // Get or compile transform shader
  let shader = renderer.getEffectShader('_transform2d')
  if (!shader) {
    const result = renderer.compileEffectShader(TRANSFORM_FRAGMENT_THREE, '_transform2d')
    if ('error' in result) {
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
  }

  // Convert rotation from degrees to radians
  const rotateRad = (rotate * Math.PI) / 180

  const { uniforms } = shader
  if (!uniforms) {
    outputs.set('texture', null)
    outputs.set('_error', 'Shader uniforms not initialized')
    return outputs
  }

  uniforms.u_texture.value = texture
  uniforms.u_translate.value.set(translateX, translateY)
  uniforms.u_rotate.value = rotateRad
  uniforms.u_scale.value.set(scaleX, scaleY)
  uniforms.u_pivot.value.set(pivotX, pivotY)

  const resultTexture = renderer.render(shader, [], ctx.nodeId)
  outputs.set('texture', resultTexture)
  return outputs
}

// ============================================================================
// Texture to Data Node (Three.js version)
// ============================================================================

// Cache for converted image data per node
const textureDataCache = new Map<string, { data: ImageData | string | Blob; width: number; height: number }>()

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

import { assetStorageManager } from '@/services/assets/AssetStorage'

// Track pending asset URL resolutions
const pendingAssetLoads = new Map<string, Promise<void>>()

export const imageLoaderExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const urlInput = ctx.inputs.get('url') as string | undefined
  const urlControl = ctx.controls.get('url') as string
  const assetId = ctx.controls.get('assetId') as string | null
  const trigger = ctx.inputs.get('trigger')
  const crossOrigin = (ctx.controls.get('crossOrigin') as string) ?? 'anonymous'

  const outputs = new Map<string, unknown>()

  // Initialize state for this node
  let state = imageLoaderState.get(ctx.nodeId)
  if (!state) {
    state = { image: null, texture: null, loading: false, loadedUrl: null, error: null }
    imageLoaderState.set(ctx.nodeId, state)
  }

  // Determine the URL to use: asset takes priority over URL input
  let url = ''
  const hasTrigger = trigger === true || trigger === 1 || (typeof trigger === 'number' && trigger > 0)

  // If assetId is set, resolve it to a URL
  if (assetId) {
    const assetUrlKey = `asset:${assetId}`

    // Check if we've already loaded this asset
    if (state.loadedUrl === assetUrlKey && state.texture && !hasTrigger) {
      outputs.set('texture', state.texture)
      outputs.set('width', state.image?.naturalWidth ?? 0)
      outputs.set('height', state.image?.naturalHeight ?? 0)
      outputs.set('loading', state.loading)
      return outputs
    }

    // Start loading asset URL if not already pending
    if (!pendingAssetLoads.has(ctx.nodeId) && (!state.loadedUrl?.startsWith('asset:') || hasTrigger)) {
      state.loading = true
      state.error = null

      const loadPromise = (async () => {
        try {
          const assetUrl = await assetStorageManager.getAssetUrl(assetId)
          if (assetUrl) {
            // Load the image from the asset URL
            const img = new Image()
            img.crossOrigin = 'anonymous'

            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve()
              img.onerror = () => reject(new Error('Failed to load asset image'))
              img.src = assetUrl
            })

            const renderer = getThreeShaderRenderer()
            if (state!.texture) {
              state!.texture.dispose()
            }
            state!.texture = renderer.createTexture(img)
            state!.image = img
            state!.loadedUrl = assetUrlKey
            state!.loading = false
          } else {
            state!.error = 'Asset not found'
            state!.loading = false
            // Latch the gate so a missing asset doesn't re-fire getAssetUrl every
            // frame; a Trigger still forces a retry. (Matches the URL branch.)
            state!.loadedUrl = assetUrlKey
          }
        } catch (error) {
          state!.error = error instanceof Error ? error.message : 'Failed to load asset'
          state!.loading = false
          state!.loadedUrl = assetUrlKey
        } finally {
          pendingAssetLoads.delete(ctx.nodeId)
        }
      })()

      pendingAssetLoads.set(ctx.nodeId, loadPromise)
    }

    outputs.set('texture', state.texture)
    outputs.set('width', state.image?.naturalWidth ?? 0)
    outputs.set('height', state.image?.naturalHeight ?? 0)
    outputs.set('loading', state.loading)
    if (state.error) {
      outputs.set('_error', state.error)
    }
    return outputs
  }

  // Fall back to URL input/control
  url = urlInput ?? urlControl ?? ''

  if (!url) {
    outputs.set('texture', null)
    outputs.set('width', 0)
    outputs.set('height', 0)
    outputs.set('loading', false)
    return outputs
  }

  // Check if URL changed or trigger was fired
  const urlChanged = url !== state.loadedUrl

  // Start loading if needed
  if ((urlChanged || hasTrigger) && !state.loading) {
    state.loading = true
    state.loadedUrl = url
    state.error = null

    const img = new Image()
    if (crossOrigin !== 'none') {
      img.crossOrigin = crossOrigin
    }

    img.onload = () => {
      const renderer = getThreeShaderRenderer()
      // Dispose old texture if exists
      if (state!.texture) {
        state!.texture.dispose()
      }
      // Create texture from image
      const texture = renderer.createTexture(img)
      state!.image = img
      state!.texture = texture
      state!.loading = false
    }

    img.onerror = () => {
      state!.loading = false
      state!.error = 'Failed to load image'
      state!.image = null
      state!.texture = null
    }

    img.src = url
  }

  outputs.set('texture', state.texture)
  outputs.set('width', state.image?.naturalWidth ?? 0)
  outputs.set('height', state.image?.naturalHeight ?? 0)
  outputs.set('loading', state.loading)
  if (state.error) {
    outputs.set('_error', state.error)
  }

  return outputs
}

// ============================================================================
// Video Player Node
// ============================================================================

export const videoPlayerExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const urlInput = ctx.inputs.get('url') as string | undefined
  const urlControl = ctx.controls.get('url') as string
  const url = urlInput ?? urlControl ?? ''

  const playTrigger = ctx.inputs.get('play')
  const pauseTrigger = ctx.inputs.get('pause')
  const seekInput = ctx.inputs.get('seek') as number | undefined

  const autoplay = (ctx.controls.get('autoplay') as boolean) ?? false
  const loop = (ctx.controls.get('loop') as boolean) ?? true
  const playbackRate = (ctx.controls.get('playbackRate') as number) ?? 1
  const volume = (ctx.controls.get('volume') as number) ?? 0.5

  const outputs = new Map<string, unknown>()

  // Initialize state for this node
  let state = videoPlayerState.get(ctx.nodeId)
  if (!state) {
    state = { video: null, texture: null, loadedUrl: null, lastSeek: null }
    videoPlayerState.set(ctx.nodeId, state)
  }

  if (!url) {
    outputs.set('texture', null)
    outputs.set('video', null)
    outputs.set('playing', false)
    outputs.set('time', 0)
    outputs.set('duration', 0)
    outputs.set('progress', 0)
    return outputs
  }

  // Check if URL changed
  const urlChanged = url !== state.loadedUrl

  // Create or update video element
  if (urlChanged || !state.video) {
    if (state.video) {
      state.video.pause()
      state.video.src = ''
    }

    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = volume === 0
    video.loop = loop
    video.playbackRate = playbackRate
    video.volume = volume
    video.playsInline = true
    video.src = url

    if (autoplay) {
      video.play().catch(() => {
        // Autoplay may be blocked by browser
      })
    }

    state.video = video
    state.loadedUrl = url
    state.texture = null
  }

  const video = state.video!

  // Update video properties
  if (video.loop !== loop) video.loop = loop
  if (Math.abs(video.playbackRate - playbackRate) > 0.01) video.playbackRate = playbackRate
  if (Math.abs(video.volume - volume) > 0.01) video.volume = volume
  video.muted = volume === 0

  // Handle play/pause triggers
  const hasPlayTrigger = playTrigger === true || playTrigger === 1 || (typeof playTrigger === 'number' && playTrigger > 0)
  const hasPauseTrigger = pauseTrigger === true || pauseTrigger === 1 || (typeof pauseTrigger === 'number' && pauseTrigger > 0)

  if (hasPlayTrigger && video.paused) {
    video.play().catch(() => {})
  }
  if (hasPauseTrigger && !video.paused) {
    video.pause()
  }

  // Handle seek
  if (seekInput !== undefined && seekInput !== state.lastSeek) {
    if (video.readyState >= 1) {
      video.currentTime = Math.max(0, Math.min(seekInput, video.duration || 0))
    }
    state.lastSeek = seekInput
  }

  // Update texture from video frame
  if (video.readyState >= 2 && video.videoWidth > 0) {
    const renderer = getThreeShaderRenderer()
    if (!state.texture) {
      state.texture = renderer.createTexture(video)
    } else {
      renderer.updateTexture(state.texture, video)
    }
  }

  outputs.set('texture', state.texture)
  outputs.set('video', video)
  outputs.set('playing', !video.paused)
  outputs.set('time', video.currentTime || 0)
  outputs.set('duration', video.duration || 0)
  outputs.set('progress', video.duration ? video.currentTime / video.duration : 0)

  return outputs
}

// ============================================================================
// Webcam Snapshot Node
// ============================================================================

// State for webcam snapshot nodes - now uses THREE.Texture
const webcamSnapshotState = new Map<
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
const resolutionPresets: Record<string, { width: number; height: number }> = {
  '480p': { width: 640, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
}

async function initWebcamSnapshot(
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

export const webcamSnapshotExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
  const trigger = ctx.inputs.get('trigger')
  const deviceId = ctx.controls.get('device') as string | undefined
  const resolution = (ctx.controls.get('resolution') as string) ?? '720p'
  const mirror = (ctx.controls.get('mirror') as boolean) ?? false

  const outputs = new Map<string, unknown>()

  // Initialize webcam if not already
  await initWebcamSnapshot(ctx.nodeId, deviceId, resolution)

  const state = webcamSnapshotState.get(ctx.nodeId)
  if (!state || !state.initialized || !state.video || !state.canvas) {
    outputs.set('texture', null)
    outputs.set('imageData', null)
    outputs.set('width', 0)
    outputs.set('height', 0)
    outputs.set('captured', false)
    outputs.set('_error', 'Webcam not initialized')
    return outputs
  }

  // Check if trigger fired
  const hasTrigger =
    trigger === true ||
    trigger === 1 ||
    (typeof trigger === 'number' && trigger > 0) ||
    (typeof trigger === 'string' && trigger.length > 0)

  let capturedThisFrame = false

  if (hasTrigger) {
    const now = Date.now()
    // Debounce captures to prevent rapid-fire
    if (now - state.lastCaptureTime > 100) {
      // Capture frame to canvas
      const ctx2d = state.canvas.getContext('2d')!

      // Update canvas size to match video
      state.canvas.width = state.video.videoWidth
      state.canvas.height = state.video.videoHeight

      // Apply mirror transform if needed
      if (mirror) {
        ctx2d.save()
        ctx2d.scale(-1, 1)
        ctx2d.drawImage(state.video, -state.canvas.width, 0)
        ctx2d.restore()
      } else {
        ctx2d.drawImage(state.video, 0, 0)
      }

      // Get image data
      state.capturedImageData = ctx2d.getImageData(
        0,
        0,
        state.canvas.width,
        state.canvas.height
      )

      // Create or update THREE.Texture
      const renderer = getThreeShaderRenderer()
      if (state.texture) {
        renderer.updateTexture(state.texture, state.canvas)
      } else {
        state.texture = renderer.createTexture(state.canvas)
      }

      state.lastCaptureTime = now
      capturedThisFrame = true
    }
  }

  outputs.set('texture', state.texture)
  outputs.set('imageData', state.capturedImageData)
  outputs.set('width', state.canvas.width)
  outputs.set('height', state.canvas.height)
  outputs.set('captured', capturedThisFrame)

  return outputs
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
interface SnapshotState {
  canvas: HTMLCanvasElement
  texture: THREE.Texture | null
  imageData: ImageData | null
  width: number
  height: number
  prevTrigger: boolean
}

const snapshotState = new Map<string, SnapshotState>()
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

export const visualExecutors: Record<string, NodeExecutorFn> = {
  snapshot: snapshotExecutor,
  shader: shaderExecutor,
  'image-fx-glitch': imageFxGlitchExecutor,
  'image-fx-rgb-shift': imageFxRgbShiftExecutor,
  'image-fx-pixelate': imageFxPixelateExecutor,
  'image-fx-kaleidoscope': imageFxKaleidoscopeExecutor,
  'image-fx-scanlines': imageFxScanlinesExecutor,
  'image-fx-posterize': imageFxPosterizeExecutor,
  'image-fx-dither': imageFxDitherExecutor,
  'image-fx-chroma-key': imageFxChromaKeyExecutor,
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
