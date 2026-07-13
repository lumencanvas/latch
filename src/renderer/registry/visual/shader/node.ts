import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import * as THREE from 'three'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getPresetById, parseUniformsFromCode, generateInputsFromUniforms, generateControlsFromUniforms, injectUniformDeclarations, type UniformDefinition } from '@/services/visual/ShaderPresets'
import { getThreeShaderRenderer, type ThreeShaderUniform } from '@/services/visual/ThreeShaderRenderer'
import { compiledShaderMaterials, lastPreset, cachedUniforms } from '../shared'

const definition: NodeDefinition = {
  id: 'shader',
  name: 'Shader',
  version: '3.0.0',
  category: 'visual',
  description: 'Custom GLSL shader with dynamic uniform inputs. Uniforms in your code automatically become input ports.',
  icon: 'code',
  platforms: ['web', 'electron'],
  inputs: [
    // Static texture inputs for Shadertoy compatibility (iChannel0-3)
    { id: 'iChannel0', type: 'texture', label: 'Channel 0' },
    { id: 'iChannel1', type: 'texture', label: 'Channel 1' },
    { id: 'iChannel2', type: 'texture', label: 'Channel 2' },
    { id: 'iChannel3', type: 'texture', label: 'Channel 3' },
    // Note: Additional inputs are dynamically generated from shader uniforms
    // and stored in node.data._dynamicInputs
  ],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    {
      id: 'preset',
      type: 'select',
      label: 'Preset',
      default: 'custom',
      props: {
        options: [
          'custom',
          '--- Generators ---',
          'gradient',
          'noise',
          'plasma',
          'circles',
          'waves',
          'voronoi',
          '--- Effects ---',
          'chromatic-aberration',
          'pixelate',
          'vignette',
          'glitch',
          'edge-detect',
          'kaleidoscope',
          'scanlines',
          'posterize',
          'dither',
          'chroma-key',
          '--- Utility ---',
          'solid-color',
          'uv-debug',
          'passthrough',
          '--- Artistic ---',
          'watercolor',
          'halftone',
        ],
      },
    },
    {
      id: 'code',
      type: 'code',
      label: 'Fragment Shader',
      default: `// Declare uniforms to create input ports:
// uniform float u_brightness;  -> creates a number input
// uniform vec3 u_color;        -> creates a color/data input
// uniform sampler2D u_image;   -> creates a texture input

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4));
  fragColor = vec4(col, 1.0);
}`,
    },
    {
      id: 'vertexCode',
      type: 'code',
      label: 'Vertex Shader (optional)',
      default: '',
    },
    { id: 'shadertoy', type: 'toggle', label: 'Shadertoy Mode', default: true },
    // Note: Additional controls for uniforms are dynamically generated
    // and stored in node.data._dynamicControls
  ],
  tags: ['shader', 'glsl', 'fragment', 'generator', 'procedural', 'noise', 'plasma', 'glitch', 'kaleidoscope', 'voronoi', 'chromatic aberration', 'pixelate', 'effect', 'shadertoy'],
  info: {
    overview: 'Runs custom GLSL fragment shaders with automatic uniform detection. Declared uniforms become input ports so other nodes can feed values into the shader. Includes Shadertoy compatibility mode and a library of built-in presets for common effects and generators.',
    tips: [
      'Start with a preset and modify the code to learn how the uniform-to-port system works.',
      'Disable Shadertoy mode if you want to write standard WebGL shaders with your own varying setup.',
      'Texture inputs iChannel0 through iChannel3 are always available regardless of what uniforms you declare.',
      'Connect a time node to a float uniform for animations that stay in sync with the rest of your flow.',
    ],
    pairsWith: ['time', 'lfo', 'webcam', 'blend', 'texture-display'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
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

export default defineNode({ definition, executor })
