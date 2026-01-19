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
// Keep old renderer for backward compatibility with non-shader visual nodes
import {
  getShaderRenderer,
  type ShaderUniform,
} from '@/services/visual/ShaderRenderer'
import { webcamCapture } from '@/services/visual/WebcamCapture'
import {
  getPresetById,
  parseUniformsFromCode,
  generateInputsFromUniforms,
  generateControlsFromUniforms,
  type UniformDefinition,
} from '@/services/visual/ShaderPresets'

// Re-export for use by other executors (e.g., AI texture conversion)
export { getShaderRenderer, getThreeShaderRenderer }

// Store for compiled shaders (now uses Three.js ShaderMaterial)
const compiledShaderMaterials = new Map<string, CompiledShaderMaterial>()
// Legacy compiled shaders for non-shader nodes
const compiledShaders = new Map<string, import('@/services/visual/ShaderRenderer').CompiledShader>()
// Node textures - now THREE.Texture instead of raw WebGLTexture
const nodeTextures = new Map<string, THREE.Texture>()

// Image loader state per node
const imageLoaderState = new Map<
  string,
  {
    image: HTMLImageElement | null
    texture: WebGLTexture | null
    loading: boolean
    loadedUrl: string | null
    error: string | null
  }
>()

// Video player state per node
const videoPlayerState = new Map<
  string,
  {
    video: HTMLVideoElement | null
    texture: WebGLTexture | null
    loadedUrl: string | null
    lastSeek: number | null
  }
>()
// Track last preset to detect changes
const lastPreset = new Map<string, string>()

/**
 * Dispose visual resources for a node
 */
export function disposeVisualNode(nodeId: string): void {
  const renderer = getShaderRenderer()
  const threeRenderer = getThreeShaderRenderer()

  // Clean up Three.js shader materials
  compiledShaderMaterials.delete(nodeId)
  compiledShaders.delete(nodeId)
  lastPreset.delete(nodeId)

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
      renderer.deleteTexture(imgState.texture)
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
      renderer.deleteTexture(vidState.texture)
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

  // Clean up framebuffers (legacy renderer)
  renderer.deleteFramebuffer(nodeId)
  renderer.deleteFramebuffer(`${nodeId}_h`)
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
}

/**
 * Garbage collect orphaned visual state entries.
 * Call this with the set of currently valid node IDs.
 */
export function gcVisualState(validNodeIds: Set<string>): void {
  const renderer = getShaderRenderer()
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

  // Clean imageLoaderState
  for (const nodeId of imageLoaderState.keys()) {
    if (!validNodeIds.has(nodeId)) {
      const state = imageLoaderState.get(nodeId)
      if (state) {
        if (state.texture) renderer.deleteTexture(state.texture)
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
        if (state.texture) renderer.deleteTexture(state.texture)
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
  if (preset !== 'custom' && !preset.startsWith('---') && preset !== prevPreset) {
    const presetData = getPresetById(preset)
    if (presetData) {
      fragmentCode = presetData.fragmentCode
      detectedUniforms = presetData.uniforms

      // Signal that code and ports need updating
      outputs.set('_preset_code', fragmentCode)
      outputs.set('_preset_uniforms', presetData.uniforms)

      // Generate dynamic ports from preset uniforms
      outputs.set('_dynamicInputs', generateInputsFromUniforms(detectedUniforms))
      outputs.set('_dynamicControls', generateControlsFromUniforms(detectedUniforms))
    }
    lastPreset.set(ctx.nodeId, preset)
  } else if (preset === 'custom') {
    lastPreset.set(ctx.nodeId, 'custom')
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
  // Include uniform count in cache key since they affect GLSL source
  const cacheKey = `${ctx.nodeId}_${fragmentCode.substring(0, 100)}_${customVertex?.substring(0, 50) ?? ''}_${isShadertoy}_${detectedUniforms.length}`

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
        // Texture uniform - accepts both THREE.Texture and raw WebGLTexture
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
    outputs.set('texture', null)
    outputs.set('_error', msg)
  }

  // Output detected uniforms for debugging/UI
  outputs.set('_detectedUniforms', detectedUniforms)

  return outputs
}

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
// Texture Display Node (renders texture to visible canvas)
// ============================================================================

const DISPLAY_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;

void main() {
  fragColor = texture(u_texture, v_texCoord);
}
`

export const textureDisplayExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as WebGLTexture | null

  if (!texture) {
    const outputs = new Map<string, unknown>()
    outputs.set('_display', null)
    return outputs
  }

  const renderer = getShaderRenderer()

  // Get or compile display shader
  let shader = compiledShaders.get('_display_shader')
  if (!shader) {
    const result = renderer.compileShader(DISPLAY_FRAGMENT)
    if ('error' in result) {
      const outputs = new Map<string, unknown>()
      outputs.set('_display', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
    compiledShaders.set('_display_shader', shader)
  }

  // Render to screen (null framebuffer)
  renderer.render(shader, [
    { name: 'u_texture', type: 'sampler2D', value: texture },
  ])

  const outputs = new Map<string, unknown>()
  outputs.set('_display', renderer.getCanvas())
  return outputs
}

// ============================================================================
// Blend Node
// ============================================================================

const BLEND_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_mix;
uniform int u_mode;

void main() {
  vec4 a = texture(u_texture0, v_texCoord);
  vec4 b = texture(u_texture1, v_texCoord);

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

  fragColor = result;
}
`

export const blendExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture0 = ctx.inputs.get('a') as WebGLTexture | null
  const texture1 = ctx.inputs.get('b') as WebGLTexture | null
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

  if (!texture0 && !texture1) {
    const outputs = new Map<string, unknown>()
    outputs.set('texture', null)
    return outputs
  }

  const renderer = getShaderRenderer()

  // Get or compile blend shader
  let shader = compiledShaders.get('_blend_shader')
  if (!shader) {
    const result = renderer.compileShader(BLEND_FRAGMENT)
    if ('error' in result) {
      const outputs = new Map<string, unknown>()
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
    compiledShaders.set('_blend_shader', shader)
  }

  const uniforms: ShaderUniform[] = [
    { name: 'u_mix', type: 'float', value: mixAmount },
    { name: 'u_mode', type: 'int', value: mode },
  ]

  if (texture0) {
    uniforms.push({ name: 'u_texture0', type: 'sampler2D', value: texture0 })
  }
  if (texture1) {
    uniforms.push({ name: 'u_texture1', type: 'sampler2D', value: texture1 })
  }

  renderer.render(shader, uniforms, ctx.nodeId)

  const outputs = new Map<string, unknown>()
  outputs.set('texture', renderer.getFramebufferTexture(ctx.nodeId))
  return outputs
}

// ============================================================================
// Main Output Node (viewer)
// ============================================================================

// Cache for canvas-to-texture conversions (one per node that outputs canvas)
// Now uses THREE.Texture instead of raw WebGLTexture
const canvasTextureCache = new Map<string, THREE.Texture>()

export const mainOutputExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const textureInput = ctx.inputs.get('texture') as THREE.Texture | WebGLTexture | HTMLCanvasElement | null

  if (!textureInput) {
    const outputs = new Map<string, unknown>()
    outputs.set('_input_texture', null)
    return outputs
  }

  const legacyRenderer = getShaderRenderer()
  const threeRenderer = getThreeShaderRenderer()

  // Handle different input types
  let outputTexture: THREE.Texture | WebGLTexture

  if (textureInput instanceof THREE.Texture) {
    // Three.js texture - pass through directly
    outputTexture = textureInput
  } else if (textureInput instanceof HTMLCanvasElement) {
    // Canvas element - convert to Three.js texture
    const cacheKey = `canvas_${ctx.nodeId}`
    let cachedTexture = canvasTextureCache.get(cacheKey)

    if (!cachedTexture) {
      cachedTexture = threeRenderer.createTexture(textureInput)
      canvasTextureCache.set(cacheKey, cachedTexture)
    } else {
      // Update the existing texture with new canvas content
      threeRenderer.updateTexture(cachedTexture, textureInput)
    }
    outputTexture = cachedTexture
  } else {
    // Raw WebGLTexture - keep for backward compatibility
    outputTexture = textureInput
  }

  // For display purposes, render the texture using legacy renderer if it's WebGLTexture
  // or use Three.js canvas for THREE.Texture
  if (outputTexture instanceof THREE.Texture) {
    // Render to Three.js canvas for preview
    threeRenderer.renderToCanvas(outputTexture, threeRenderer.getCanvas())
  } else {
    // Legacy WebGL texture - use old renderer
    let shader = compiledShaders.get('_display_shader')
    if (!shader) {
      const result = legacyRenderer.compileShader(DISPLAY_FRAGMENT)
      if ('error' in result) {
        const outputs = new Map<string, unknown>()
        outputs.set('_input_texture', null)
        outputs.set('_error', result.error)
        return outputs
      }
      shader = result
      compiledShaders.set('_display_shader', shader)
    }

    legacyRenderer.render(shader, [
      { name: 'u_texture', type: 'sampler2D', value: outputTexture },
    ])
  }

  const outputs = new Map<string, unknown>()
  // Store the input texture so the node component can display it
  outputs.set('_input_texture', outputTexture)
  return outputs
}

// ============================================================================
// Blur Node (Gaussian Blur)
// ============================================================================

const BLUR_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_radius;
uniform int u_direction; // 0 = horizontal, 1 = vertical

// Gaussian weights for 9-tap kernel
const float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

void main() {
  vec2 texelSize = 1.0 / u_resolution;
  vec3 result = texture(u_texture, v_texCoord).rgb * weights[0];

  vec2 direction = u_direction == 0 ? vec2(1.0, 0.0) : vec2(0.0, 1.0);

  for (int i = 1; i < 5; i++) {
    vec2 offset = direction * texelSize * float(i) * u_radius;
    result += texture(u_texture, v_texCoord + offset).rgb * weights[i];
    result += texture(u_texture, v_texCoord - offset).rgb * weights[i];
  }

  fragColor = vec4(result, 1.0);
}
`

export const blurExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as WebGLTexture | null
  const radius = (ctx.inputs.get('radius') as number) ?? (ctx.controls.get('radius') as number) ?? 1

  if (!texture) {
    const outputs = new Map<string, unknown>()
    outputs.set('texture', null)
    return outputs
  }

  const renderer = getShaderRenderer()

  // Get or compile blur shader
  let shader = compiledShaders.get('_blur_shader')
  if (!shader) {
    const result = renderer.compileShader(BLUR_FRAGMENT)
    if ('error' in result) {
      const outputs = new Map<string, unknown>()
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
    compiledShaders.set('_blur_shader', shader)
  }

  // Two-pass Gaussian blur: horizontal then vertical
  const canvas = renderer.getCanvas()

  // Horizontal pass
  renderer.render(shader, [
    { name: 'u_texture', type: 'sampler2D', value: texture },
    { name: 'u_resolution', type: 'vec2', value: [canvas.width, canvas.height] },
    { name: 'u_radius', type: 'float', value: radius },
    { name: 'u_direction', type: 'int', value: 0 },
  ], `${ctx.nodeId}_h`)

  const horizontalTexture = renderer.getFramebufferTexture(`${ctx.nodeId}_h`)

  // Vertical pass
  if (horizontalTexture) {
    renderer.render(shader, [
      { name: 'u_texture', type: 'sampler2D', value: horizontalTexture },
      { name: 'u_resolution', type: 'vec2', value: [canvas.width, canvas.height] },
      { name: 'u_radius', type: 'float', value: radius },
      { name: 'u_direction', type: 'int', value: 1 },
    ], ctx.nodeId)
  }

  const outputs = new Map<string, unknown>()
  outputs.set('texture', renderer.getFramebufferTexture(ctx.nodeId))
  return outputs
}

// ============================================================================
// Color Correction Node
// ============================================================================

const COLOR_CORRECT_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

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
  vec4 color = texture(u_texture, v_texCoord);

  // Brightness
  vec3 c = color.rgb + u_brightness;

  // Contrast
  c = (c - 0.5) * u_contrast + 0.5;

  // Saturation and Hue
  vec3 hsv = rgb2hsv(c);
  hsv.x = fract(hsv.x + u_hue); // Hue shift
  hsv.y *= u_saturation; // Saturation
  c = hsv2rgb(hsv);

  // Gamma
  c = pow(max(c, 0.0), vec3(1.0 / u_gamma));

  fragColor = vec4(clamp(c, 0.0, 1.0), color.a);
}
`

export const colorCorrectionExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as WebGLTexture | null
  const brightness = (ctx.inputs.get('brightness') as number) ?? (ctx.controls.get('brightness') as number) ?? 0
  const contrast = (ctx.inputs.get('contrast') as number) ?? (ctx.controls.get('contrast') as number) ?? 1
  const saturation = (ctx.inputs.get('saturation') as number) ?? (ctx.controls.get('saturation') as number) ?? 1
  const hue = (ctx.inputs.get('hue') as number) ?? (ctx.controls.get('hue') as number) ?? 0
  const gamma = (ctx.inputs.get('gamma') as number) ?? (ctx.controls.get('gamma') as number) ?? 1

  if (!texture) {
    const outputs = new Map<string, unknown>()
    outputs.set('texture', null)
    return outputs
  }

  const renderer = getShaderRenderer()

  // Get or compile color correction shader
  let shader = compiledShaders.get('_color_correct_shader')
  if (!shader) {
    const result = renderer.compileShader(COLOR_CORRECT_FRAGMENT)
    if ('error' in result) {
      const outputs = new Map<string, unknown>()
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
    compiledShaders.set('_color_correct_shader', shader)
  }

  renderer.render(shader, [
    { name: 'u_texture', type: 'sampler2D', value: texture },
    { name: 'u_brightness', type: 'float', value: brightness },
    { name: 'u_contrast', type: 'float', value: contrast },
    { name: 'u_saturation', type: 'float', value: saturation },
    { name: 'u_hue', type: 'float', value: hue },
    { name: 'u_gamma', type: 'float', value: gamma },
  ], ctx.nodeId)

  const outputs = new Map<string, unknown>()
  outputs.set('texture', renderer.getFramebufferTexture(ctx.nodeId))
  return outputs
}

// ============================================================================
// Displacement Node
// ============================================================================

const DISPLACEMENT_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform sampler2D u_displacement;
uniform float u_strength;
uniform int u_channel; // 0=R, 1=G, 2=B, 3=RG

void main() {
  vec4 disp = texture(u_displacement, v_texCoord);

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

  vec4 color = texture(u_texture, v_texCoord + offset);
  fragColor = color;
}
`

export const displacementExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as WebGLTexture | null
  const displacementMap = ctx.inputs.get('displacement') as WebGLTexture | null
  const strength = (ctx.inputs.get('strength') as number) ?? (ctx.controls.get('strength') as number) ?? 0.1

  const channelStr = (ctx.controls.get('channel') as string) ?? 'rg'
  const channelMap: Record<string, number> = { r: 0, g: 1, b: 2, rg: 3 }
  const channel = channelMap[channelStr] ?? 3

  if (!texture) {
    const outputs = new Map<string, unknown>()
    outputs.set('texture', null)
    return outputs
  }

  // If no displacement map, pass through
  if (!displacementMap) {
    const outputs = new Map<string, unknown>()
    outputs.set('texture', texture)
    return outputs
  }

  const renderer = getShaderRenderer()

  // Get or compile displacement shader
  let shader = compiledShaders.get('_displacement_shader')
  if (!shader) {
    const result = renderer.compileShader(DISPLACEMENT_FRAGMENT)
    if ('error' in result) {
      const outputs = new Map<string, unknown>()
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
    compiledShaders.set('_displacement_shader', shader)
  }

  renderer.render(shader, [
    { name: 'u_texture', type: 'sampler2D', value: texture },
    { name: 'u_displacement', type: 'sampler2D', value: displacementMap },
    { name: 'u_strength', type: 'float', value: strength },
    { name: 'u_channel', type: 'int', value: channel },
  ], ctx.nodeId)

  const outputs = new Map<string, unknown>()
  outputs.set('texture', renderer.getFramebufferTexture(ctx.nodeId))
  return outputs
}

// ============================================================================
// Transform 2D Node (scale, rotate, translate)
// ============================================================================

const TRANSFORM_FRAGMENT = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_translate;
uniform float u_rotate;
uniform vec2 u_scale;
uniform vec2 u_pivot;

void main() {
  // Move to pivot
  vec2 uv = v_texCoord - u_pivot;

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
    fragColor = vec4(0.0);
  } else {
    fragColor = texture(u_texture, uv);
  }
}
`

export const transform2DExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as WebGLTexture | null
  const translateX = (ctx.inputs.get('translateX') as number) ?? (ctx.controls.get('translateX') as number) ?? 0
  const translateY = (ctx.inputs.get('translateY') as number) ?? (ctx.controls.get('translateY') as number) ?? 0
  const rotate = (ctx.inputs.get('rotate') as number) ?? (ctx.controls.get('rotate') as number) ?? 0
  const scaleX = (ctx.inputs.get('scaleX') as number) ?? (ctx.controls.get('scaleX') as number) ?? 1
  const scaleY = (ctx.inputs.get('scaleY') as number) ?? (ctx.controls.get('scaleY') as number) ?? 1
  const pivotX = (ctx.controls.get('pivotX') as number) ?? 0.5
  const pivotY = (ctx.controls.get('pivotY') as number) ?? 0.5

  if (!texture) {
    const outputs = new Map<string, unknown>()
    outputs.set('texture', null)
    return outputs
  }

  const renderer = getShaderRenderer()

  // Get or compile transform shader
  let shader = compiledShaders.get('_transform2d_shader')
  if (!shader) {
    const result = renderer.compileShader(TRANSFORM_FRAGMENT)
    if ('error' in result) {
      const outputs = new Map<string, unknown>()
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
    compiledShaders.set('_transform2d_shader', shader)
  }

  // Convert rotation from degrees to radians
  const rotateRad = (rotate * Math.PI) / 180

  renderer.render(shader, [
    { name: 'u_texture', type: 'sampler2D', value: texture },
    { name: 'u_translate', type: 'vec2', value: [translateX, translateY] },
    { name: 'u_rotate', type: 'float', value: rotateRad },
    { name: 'u_scale', type: 'vec2', value: [scaleX, scaleY] },
    { name: 'u_pivot', type: 'vec2', value: [pivotX, pivotY] },
  ], ctx.nodeId)

  const outputs = new Map<string, unknown>()
  outputs.set('texture', renderer.getFramebufferTexture(ctx.nodeId))
  return outputs
}

// ============================================================================
// Texture to Data Node (convert GPU texture to CPU image data for AI)
// ============================================================================

// Cache for converted image data per node
const textureDataCache = new Map<string, { data: ImageData | string | Blob; width: number; height: number }>()

export const textureToDataExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const texture = ctx.inputs.get('texture') as WebGLTexture | null
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

  const renderer = getShaderRenderer()
  const gl = renderer.getCanvas().getContext('webgl2')

  if (!gl) {
    outputs.set('data', null)
    outputs.set('width', 0)
    outputs.set('height', 0)
    outputs.set('_error', 'WebGL2 context not available')
    return outputs
  }

  const canvas = renderer.getCanvas()
  const width = canvas.width
  const height = canvas.height

  // Create a framebuffer to read the texture
  const fbo = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

  // Check framebuffer status
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(fbo)
    outputs.set('data', null)
    outputs.set('width', 0)
    outputs.set('height', 0)
    outputs.set('_error', 'Framebuffer incomplete')
    return outputs
  }

  // Read pixels from texture
  const pixels = new Uint8Array(width * height * 4)
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

  // Clean up
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.deleteFramebuffer(fbo)

  // WebGL texture is upside down, need to flip vertically
  const flipped = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const srcRow = (height - 1 - y) * width * 4
    const dstRow = y * width * 4
    flipped.set(pixels.subarray(srcRow, srcRow + width * 4), dstRow)
  }

  // Convert to requested format
  let data: ImageData | string | Blob

  if (format === 'imageData') {
    // Create ImageData directly from pixels
    const clampedArray = new Uint8ClampedArray(flipped)
    data = new ImageData(clampedArray, width, height)
  } else {
    // For base64 and blob, we need a canvas
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = width
    tempCanvas.height = height
    const tempCtx = tempCanvas.getContext('2d')!
    const imageData = new ImageData(new Uint8ClampedArray(flipped), width, height)
    tempCtx.putImageData(imageData, 0, 0)

    if (format === 'base64') {
      data = tempCanvas.toDataURL('image/png')
    } else {
      // blob - convert synchronously using data URL for now
      data = tempCanvas.toDataURL('image/png')
    }
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

            const renderer = getShaderRenderer()
            if (state!.texture) {
              renderer.deleteTexture(state!.texture)
            }
            state!.texture = renderer.createTexture(img)
            state!.image = img
            state!.loadedUrl = assetUrlKey
            state!.loading = false
          } else {
            state!.error = 'Asset not found'
            state!.loading = false
          }
        } catch (error) {
          state!.error = error instanceof Error ? error.message : 'Failed to load asset'
          state!.loading = false
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
      const renderer = getShaderRenderer()
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
    const renderer = getShaderRenderer()
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

// State for webcam snapshot nodes
const webcamSnapshotState = new Map<
  string,
  {
    video: HTMLVideoElement | null
    canvas: HTMLCanvasElement | null
    texture: WebGLTexture | null
    stream: MediaStream | null
    lastCaptureTime: number
    capturedImageData: ImageData | null
    deviceId: string | null
    resolution: string
    initialized: boolean
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
  } catch (error) {
    console.error('[Webcam Snapshot] Failed to initialize:', error)
    state.initialized = false
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

      // Create or update WebGL texture
      const renderer = getShaderRenderer()
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
      const renderer = getShaderRenderer()
      renderer.deleteTexture(state.texture)
    }
    webcamSnapshotState.delete(nodeId)
  }
}

// ============================================================================
// Registry
// ============================================================================

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
