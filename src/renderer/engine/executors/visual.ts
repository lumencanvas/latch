/**
 * Visual Node Executors
 *
 * These executors handle visual/shader nodes using WebGL2
 */

import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import {
  getShaderRenderer,
  type CompiledShader,
  type ShaderUniform,
} from '@/services/visual/ShaderRenderer'
import { webcamCapture } from '@/services/visual/WebcamCapture'
import { getPresetById, parseUniformsFromCode } from '@/services/visual/ShaderPresets'

// Store for compiled shaders and textures
const compiledShaders = new Map<string, CompiledShader>()
const nodeTextures = new Map<string, WebGLTexture>()
// Track last preset to detect changes
const lastPreset = new Map<string, string>()

/**
 * Dispose visual resources for a node
 */
export function disposeVisualNode(nodeId: string): void {
  compiledShaders.delete(nodeId)
  // Note: textures are managed by ShaderRenderer
}

/**
 * Dispose all visual resources
 */
export function disposeAllVisualNodes(): void {
  compiledShaders.clear()
  nodeTextures.clear()
}

// ============================================================================
// Shader Node
// ============================================================================

export const shaderExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const preset = (ctx.controls.get('preset') as string) ?? 'custom'
  let fragmentCode = (ctx.controls.get('code') as string) ?? ''
  const vertexCode = (ctx.controls.get('vertexCode') as string) ?? ''
  const isShadertoy = (ctx.controls.get('shadertoy') as boolean) ?? true

  const renderer = getShaderRenderer()
  const outputs = new Map<string, unknown>()

  // Check if preset changed - load preset code
  const prevPreset = lastPreset.get(ctx.nodeId)
  if (preset !== 'custom' && !preset.startsWith('---') && preset !== prevPreset) {
    const presetData = getPresetById(preset)
    if (presetData) {
      fragmentCode = presetData.fragmentCode
      // Store in node data so UI updates
      outputs.set('_preset_code', fragmentCode)
      outputs.set('_preset_uniforms', presetData.uniforms)
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

  // Get or compile shader
  const customVertex = vertexCode.trim() ? vertexCode : undefined
  const cacheKey = `${ctx.nodeId}_${fragmentCode}_${customVertex ?? ''}_${isShadertoy}`

  let shader = compiledShaders.get(cacheKey)
  if (!shader) {
    const result = renderer.compileShader(fragmentCode, customVertex, isShadertoy)

    if ('error' in result) {
      outputs.set('texture', null)
      outputs.set('_error', result.error)
      return outputs
    }

    shader = result
    compiledShaders.set(cacheKey, shader)
    compiledShaders.set(ctx.nodeId, shader)
  }

  // Set time for animation
  renderer.setTime(ctx.totalTime)

  // Build uniforms array from inputs and controls
  const uniforms: ShaderUniform[] = []

  // Standard param uniforms (from both inputs and controls)
  for (let i = 1; i <= 4; i++) {
    const inputVal = ctx.inputs.get(`u_param${i}`) as number | undefined
    const controlVal = ctx.controls.get(`u_param${i}`) as number | undefined
    const value = inputVal ?? controlVal ?? 0.5
    uniforms.push({ name: `u_param${i}`, type: 'float', value })
  }

  // Auto-detect uniforms from code and set values
  const detectedUniforms = parseUniformsFromCode(fragmentCode)
  for (const def of detectedUniforms) {
    // Check if we already have this uniform
    if (uniforms.some(u => u.name === def.name)) continue

    // Get value from input or control
    const inputVal = ctx.inputs.get(def.name)
    const controlVal = ctx.controls.get(def.name)
    const value = inputVal ?? controlVal ?? def.default

    // Handle vec types from array inputs
    if (Array.isArray(value)) {
      switch (def.type) {
        case 'vec2':
          uniforms.push({ name: def.name, type: 'vec2', value: value.slice(0, 2) as number[] })
          break
        case 'vec3':
          uniforms.push({ name: def.name, type: 'vec3', value: value.slice(0, 3) as number[] })
          break
        case 'vec4':
          uniforms.push({ name: def.name, type: 'vec4', value: value.slice(0, 4) as number[] })
          break
      }
    } else if (def.type === 'float' || def.type === 'int') {
      uniforms.push({ name: def.name, type: 'float', value: Number(value) || 0 })
    }
  }

  // Color uniform (common for many shaders)
  const colorInput = ctx.inputs.get('u_color')
  if (colorInput && Array.isArray(colorInput)) {
    uniforms.push({ name: 'u_color', type: 'vec3', value: colorInput.slice(0, 3) as number[] })
    uniforms.push({ name: 'u_color1', type: 'vec3', value: colorInput.slice(0, 3) as number[] })
  }

  // Vec2 uniform
  const vec2Input = ctx.inputs.get('u_vec2')
  if (vec2Input && Array.isArray(vec2Input)) {
    uniforms.push({ name: 'u_vec2', type: 'vec2', value: vec2Input.slice(0, 2) as number[] })
  }

  // Add texture inputs (iChannel0-3 for Shadertoy compatibility)
  for (let i = 0; i < 4; i++) {
    const texture = ctx.inputs.get(`texture${i}`) as WebGLTexture | undefined
    if (texture) {
      uniforms.push({ name: `iChannel${i}`, type: 'sampler2D', value: texture })
      uniforms.push({ name: `u_texture${i}`, type: 'sampler2D', value: texture })
    }
  }

  // Render to framebuffer
  try {
    renderer.render(shader, uniforms, ctx.nodeId)
    outputs.set('texture', renderer.getFramebufferTexture(ctx.nodeId))
    outputs.set('_error', null)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Render failed'
    outputs.set('texture', null)
    outputs.set('_error', msg)
  }

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

  // Get or create texture for this node
  const renderer = getShaderRenderer()
  let texture = nodeTextures.get(ctx.nodeId)

  if (!texture) {
    texture = renderer.createTexture(video)
    nodeTextures.set(ctx.nodeId, texture)
  } else {
    // Update texture with current frame
    renderer.updateTexture(texture, video)
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
const canvasTextureCache = new Map<string, WebGLTexture>()

export const mainOutputExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const textureInput = ctx.inputs.get('texture') as WebGLTexture | HTMLCanvasElement | null

  if (!textureInput) {
    const outputs = new Map<string, unknown>()
    outputs.set('_input_texture', null)
    return outputs
  }

  const renderer = getShaderRenderer()

  // Convert canvas to texture if needed (for 3D rendering)
  let texture: WebGLTexture
  if (textureInput instanceof HTMLCanvasElement) {
    // Get or create cached texture for this canvas
    const cacheKey = `canvas_${ctx.nodeId}`
    let cachedTexture = canvasTextureCache.get(cacheKey)

    if (!cachedTexture) {
      cachedTexture = renderer.createTexture(textureInput)
      canvasTextureCache.set(cacheKey, cachedTexture)
    } else {
      // Update the existing texture with new canvas content
      renderer.updateTexture(cachedTexture, textureInput)
    }
    texture = cachedTexture
  } else {
    texture = textureInput
  }

  // Get or compile display shader
  let shader = compiledShaders.get('_display_shader')
  if (!shader) {
    const result = renderer.compileShader(DISPLAY_FRAGMENT)
    if ('error' in result) {
      const outputs = new Map<string, unknown>()
      outputs.set('_input_texture', null)
      outputs.set('_error', result.error)
      return outputs
    }
    shader = result
    compiledShaders.set('_display_shader', shader)
  }

  // Render to screen (null framebuffer) for preview
  renderer.render(shader, [
    { name: 'u_texture', type: 'sampler2D', value: texture },
  ])

  const outputs = new Map<string, unknown>()
  // Store the input texture so the node component can display it
  outputs.set('_input_texture', texture)
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
// Registry
// ============================================================================

export const visualExecutors: Record<string, NodeExecutorFn> = {
  shader: shaderExecutor,
  webcam: webcamExecutor,
  color: colorExecutor,
  'texture-display': textureDisplayExecutor,
  blend: blendExecutor,
  'main-output': mainOutputExecutor,
  blur: blurExecutor,
  'color-correction': colorCorrectionExecutor,
  displacement: displacementExecutor,
  'transform-2d': transform2DExecutor,
}
