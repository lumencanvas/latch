/**
 * Tests for ShaderPresets service
 *
 * Tests uniform parsing, injection, and preset management
 */

import { describe, it, expect } from 'vitest'
import {
  parseUniformsFromCode,
  injectUniformDeclarations,
  getPresetById,
  getPresetsByCategory,
  generateInputsFromUniforms,
  generateModulationInputs,
  generateControlsFromUniforms,
  uniformTypeToDataType,
  SHADER_PRESETS,
  type UniformDefinition,
} from '@/services/visual/ShaderPresets'

describe('ShaderPresets - parseUniformsFromCode', () => {
  it('should parse float uniforms', () => {
    const code = 'uniform float u_brightness;'
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms).toHaveLength(1)
    expect(uniforms[0].name).toBe('u_brightness')
    expect(uniforms[0].type).toBe('float')
  })

  it('should parse int uniforms', () => {
    const code = 'uniform int u_count;'
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms).toHaveLength(1)
    expect(uniforms[0].name).toBe('u_count')
    expect(uniforms[0].type).toBe('int')
  })

  it('should parse vec2 uniforms', () => {
    const code = 'uniform vec2 u_offset;'
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms).toHaveLength(1)
    expect(uniforms[0].name).toBe('u_offset')
    expect(uniforms[0].type).toBe('vec2')
  })

  it('should parse vec3 uniforms', () => {
    const code = 'uniform vec3 u_color;'
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms).toHaveLength(1)
    expect(uniforms[0].name).toBe('u_color')
    expect(uniforms[0].type).toBe('vec3')
  })

  it('should parse vec4 uniforms', () => {
    const code = 'uniform vec4 u_rgba;'
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms).toHaveLength(1)
    expect(uniforms[0].name).toBe('u_rgba')
    expect(uniforms[0].type).toBe('vec4')
  })

  it('should parse sampler2D uniforms', () => {
    const code = 'uniform sampler2D u_customImage;'  // Using non-built-in name
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms).toHaveLength(1)
    expect(uniforms[0].name).toBe('u_customImage')
    expect(uniforms[0].type).toBe('sampler2D')
  })

  it('should parse multiple uniforms', () => {
    const code = `
      uniform float u_brightness;
      uniform vec3 u_color;
      uniform sampler2D u_image;
    `
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms).toHaveLength(3)
    expect(uniforms[0].name).toBe('u_brightness')
    expect(uniforms[1].name).toBe('u_color')
    expect(uniforms[2].name).toBe('u_image')
  })

  it('should ignore built-in Shadertoy uniforms', () => {
    const code = `
      uniform float iTime;
      uniform vec2 iResolution;
      uniform vec4 iMouse;
      uniform sampler2D iChannel0;
      uniform float u_custom;
    `
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms).toHaveLength(1)
    expect(uniforms[0].name).toBe('u_custom')
  })

  it('should ignore raw mode built-in uniforms', () => {
    const code = `
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec4 u_mouse;
      uniform float u_custom;
    `
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms).toHaveLength(1)
    expect(uniforms[0].name).toBe('u_custom')
  })

  it('should handle precision qualifiers', () => {
    const code = `
      uniform highp float u_highp;
      uniform mediump vec3 u_mediump;
      uniform lowp int u_lowp;
    `
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms).toHaveLength(3)
    expect(uniforms[0].name).toBe('u_highp')
    expect(uniforms[1].name).toBe('u_mediump')
    expect(uniforms[2].name).toBe('u_lowp')
  })

  it('should ignore uniforms in single-line comments', () => {
    const code = `
      // uniform float u_commented;
      uniform float u_active;
    `
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms).toHaveLength(1)
    expect(uniforms[0].name).toBe('u_active')
  })

  it('should ignore uniforms in multi-line comments', () => {
    const code = `
      /* uniform float u_commented; */
      /**
       * uniform vec3 u_alsoCommented;
       */
      uniform float u_active;
    `
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms).toHaveLength(1)
    expect(uniforms[0].name).toBe('u_active')
  })

  it('should generate human-readable labels', () => {
    const code = `
      uniform float u_myParameter;
      uniform vec3 u_color1;
    `
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms[0].label).toBe('My Parameter')
    expect(uniforms[1].label).toBe('Color 1')
  })

  it('should infer ranges for color uniforms', () => {
    const code = 'uniform vec3 u_color;'
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms[0].default).toEqual([1, 1, 1]) // White default for colors
  })

  it('should infer ranges for angle uniforms', () => {
    const code = 'uniform float u_angle;'
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms[0].min).toBe(0)
    expect(uniforms[0].max).toBeCloseTo(6.28318, 4) // 2*PI
  })

  it('should infer ranges for scale uniforms', () => {
    const code = 'uniform float u_scale;'
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms[0].default).toBe(1.0)
    expect(uniforms[0].min).toBe(0.1)
    expect(uniforms[0].max).toBe(10)
  })

  it('should infer ranges for speed uniforms', () => {
    const code = 'uniform float u_speed;'
    const uniforms = parseUniformsFromCode(code)

    expect(uniforms[0].default).toBe(1.0)
    expect(uniforms[0].min).toBe(0)
    expect(uniforms[0].max).toBe(5)
  })

  it('should return empty array for code without uniforms', () => {
    const code = `
      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        fragColor = vec4(1.0);
      }
    `
    const uniforms = parseUniformsFromCode(code)
    expect(uniforms).toHaveLength(0)
  })

  it('should not duplicate uniforms declared multiple times', () => {
    const code = `
      uniform float u_brightness;
      uniform float u_brightness;
    `
    const uniforms = parseUniformsFromCode(code)
    expect(uniforms).toHaveLength(1)
  })
})

describe('ShaderPresets - injectUniformDeclarations', () => {
  it('should inject float uniform declarations', () => {
    const code = 'void main() {}'
    const uniforms: UniformDefinition[] = [
      { name: 'u_brightness', type: 'float', label: 'Brightness', default: 1.0 },
    ]

    const result = injectUniformDeclarations(code, uniforms)

    expect(result).toContain('uniform float u_brightness;')
    expect(result).toContain('void main() {}')
  })

  it('should inject vec3 uniform declarations', () => {
    const code = 'void main() {}'
    const uniforms: UniformDefinition[] = [
      { name: 'u_color', type: 'vec3', label: 'Color', default: [1, 0, 0] },
    ]

    const result = injectUniformDeclarations(code, uniforms)

    expect(result).toContain('uniform vec3 u_color;')
  })

  it('should inject multiple uniform declarations', () => {
    const code = 'void main() {}'
    const uniforms: UniformDefinition[] = [
      { name: 'u_brightness', type: 'float', label: 'Brightness', default: 1.0 },
      { name: 'u_color', type: 'vec3', label: 'Color', default: [1, 1, 1] },
      { name: 'u_texture', type: 'sampler2D', label: 'Texture', default: 0 },
    ]

    const result = injectUniformDeclarations(code, uniforms)

    expect(result).toContain('uniform float u_brightness;')
    expect(result).toContain('uniform vec3 u_color;')
    expect(result).toContain('uniform sampler2D u_texture;')
  })

  it('should return original code when no uniforms provided', () => {
    const code = 'void main() {}'
    const result = injectUniformDeclarations(code, [])

    expect(result).toBe(code)
  })

  it('should add auto-generated comment header', () => {
    const code = 'void main() {}'
    const uniforms: UniformDefinition[] = [
      { name: 'u_test', type: 'float', label: 'Test', default: 0 },
    ]

    const result = injectUniformDeclarations(code, uniforms)

    expect(result).toContain('// Auto-generated uniform declarations')
  })

  it('should make uniforms parseable by parseUniformsFromCode', () => {
    // This is the critical test - ensures the round-trip works
    const code = 'void mainImage(out vec4 fragColor, in vec2 fragCoord) { fragColor = vec4(u_brightness); }'
    const uniforms: UniformDefinition[] = [
      { name: 'u_brightness', type: 'float', label: 'Brightness', default: 1.0, min: 0, max: 2 },
      { name: 'u_color', type: 'vec3', label: 'Color', default: [1, 1, 1] },
    ]

    const injectedCode = injectUniformDeclarations(code, uniforms)
    const parsedUniforms = parseUniformsFromCode(injectedCode)

    expect(parsedUniforms).toHaveLength(2)
    expect(parsedUniforms[0].name).toBe('u_brightness')
    expect(parsedUniforms[1].name).toBe('u_color')
  })
})

describe('ShaderPresets - getPresetById', () => {
  it('should return gradient preset', () => {
    const preset = getPresetById('gradient')

    expect(preset).toBeDefined()
    expect(preset!.name).toBe('Gradient')
    expect(preset!.category).toBe('generator')
    expect(preset!.uniforms).toHaveLength(3)
  })

  it('should return waves preset', () => {
    const preset = getPresetById('waves')

    expect(preset).toBeDefined()
    expect(preset!.name).toBe('Waves')
    expect(preset!.uniforms).toHaveLength(4)
    expect(preset!.uniforms.map(u => u.name)).toContain('u_frequency')
    expect(preset!.uniforms.map(u => u.name)).toContain('u_amplitude')
    expect(preset!.uniforms.map(u => u.name)).toContain('u_speed')
    expect(preset!.uniforms.map(u => u.name)).toContain('u_layers')
  })

  it('should return undefined for unknown preset', () => {
    const preset = getPresetById('nonexistent')
    expect(preset).toBeUndefined()
  })

  it('should return chromatic-aberration effect preset', () => {
    const preset = getPresetById('chromatic-aberration')

    expect(preset).toBeDefined()
    expect(preset!.category).toBe('effect')
    expect(preset!.uniforms.map(u => u.name)).toContain('u_amount')
  })

  it('should return solid-color utility preset', () => {
    const preset = getPresetById('solid-color')

    expect(preset).toBeDefined()
    expect(preset!.category).toBe('utility')
  })
})

describe('ShaderPresets - getPresetsByCategory', () => {
  it('should return generator presets', () => {
    const generators = getPresetsByCategory('generator')

    expect(generators.length).toBeGreaterThan(0)
    expect(generators.every(p => p.category === 'generator')).toBe(true)
    expect(generators.map(p => p.id)).toContain('gradient')
    expect(generators.map(p => p.id)).toContain('waves')
  })

  it('should return effect presets', () => {
    const effects = getPresetsByCategory('effect')

    expect(effects.length).toBeGreaterThan(0)
    expect(effects.every(p => p.category === 'effect')).toBe(true)
    expect(effects.map(p => p.id)).toContain('chromatic-aberration')
  })

  it('should return utility presets', () => {
    const utilities = getPresetsByCategory('utility')

    expect(utilities.length).toBeGreaterThan(0)
    expect(utilities.every(p => p.category === 'utility')).toBe(true)
  })

  it('should return artistic presets', () => {
    const artistic = getPresetsByCategory('artistic')

    expect(artistic.length).toBeGreaterThan(0)
    expect(artistic.every(p => p.category === 'artistic')).toBe(true)
  })
})

describe('ShaderPresets - uniformTypeToDataType', () => {
  it('should map float to number', () => {
    expect(uniformTypeToDataType('float')).toBe('number')
  })

  it('should map int to number', () => {
    expect(uniformTypeToDataType('int')).toBe('number')
  })

  it('should map vec types to data', () => {
    expect(uniformTypeToDataType('vec2')).toBe('data')
    expect(uniformTypeToDataType('vec3')).toBe('data')
    expect(uniformTypeToDataType('vec4')).toBe('data')
  })

  it('should map sampler2D to texture', () => {
    expect(uniformTypeToDataType('sampler2D')).toBe('texture')
  })
})

describe('ShaderPresets - generateInputsFromUniforms', () => {
  it('should generate input ports from uniforms', () => {
    const uniforms: UniformDefinition[] = [
      { name: 'u_brightness', type: 'float', label: 'Brightness', default: 1.0 },
      { name: 'u_color', type: 'vec3', label: 'Color', default: [1, 1, 1] },
    ]

    const inputs = generateInputsFromUniforms(uniforms)

    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toEqual({
      id: 'u_brightness',
      type: 'number',
      label: 'Brightness',
      default: 1.0,
    })
    expect(inputs[1]).toEqual({
      id: 'u_color',
      type: 'data',
      label: 'Color',
      default: [1, 1, 1],
    })
  })
})

describe('ShaderPresets - generateModulationInputs', () => {
  it('should generate number input ports for float and int uniforms', () => {
    const uniforms: UniformDefinition[] = [
      { name: 'u_intensity', type: 'float', label: 'Intensity', default: 0.5 },
      { name: 'u_levels', type: 'int', label: 'Levels', default: 4 },
    ]

    const inputs = generateModulationInputs(uniforms)

    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toEqual({
      id: 'u_intensity',
      type: 'number',
      label: 'Intensity',
      default: 0.5,
    })
    expect(inputs[1]).toEqual({
      id: 'u_levels',
      type: 'number',
      label: 'Levels',
      default: 4,
    })
  })

  it('should skip non-numeric (vec/color/sampler) uniforms — numeric-only by design', () => {
    const uniforms: UniformDefinition[] = [
      { name: 'u_amount', type: 'float', label: 'Amount', default: 0.1 },
      { name: 'u_key_color', type: 'vec3', label: 'Key Color', default: [0, 1, 0] },
      { name: 'u_offset', type: 'vec2', label: 'Offset', default: [0, 0] },
      { name: 'u_tex', type: 'sampler2D', label: 'Tex', default: 0 },
    ]

    const inputs = generateModulationInputs(uniforms)

    expect(inputs).toHaveLength(1)
    expect(inputs[0].id).toBe('u_amount')
    expect(inputs.every(i => i.type === 'number')).toBe(true)
  })

  it('should return an empty array when no numeric uniforms exist', () => {
    const uniforms: UniformDefinition[] = [
      { name: 'u_color', type: 'vec3', label: 'Color', default: [1, 1, 1] },
    ]
    expect(generateModulationInputs(uniforms)).toEqual([])
  })
})

describe('ShaderPresets - generateControlsFromUniforms', () => {
  it('should generate slider controls for float uniforms', () => {
    const uniforms: UniformDefinition[] = [
      { name: 'u_brightness', type: 'float', label: 'Brightness', default: 1.0, min: 0, max: 2, step: 0.1 },
    ]

    const controls = generateControlsFromUniforms(uniforms)

    expect(controls).toHaveLength(1)
    expect(controls[0].type).toBe('slider')
    expect(controls[0].props).toEqual({ min: 0, max: 2, step: 0.1 })
  })

  it('should generate number controls for int uniforms', () => {
    const uniforms: UniformDefinition[] = [
      { name: 'u_count', type: 'int', label: 'Count', default: 5, min: 1, max: 10, step: 1 },
    ]

    const controls = generateControlsFromUniforms(uniforms)

    expect(controls).toHaveLength(1)
    expect(controls[0].type).toBe('number')
  })

  it('should generate color controls for color-named vec3 uniforms', () => {
    const uniforms: UniformDefinition[] = [
      { name: 'u_color', type: 'vec3', label: 'Color', default: [1, 1, 1] },
    ]

    const controls = generateControlsFromUniforms(uniforms)

    expect(controls).toHaveLength(1)
    expect(controls[0].type).toBe('color')
  })

  it('should generate vec3 controls for non-color vec3 uniforms', () => {
    const uniforms: UniformDefinition[] = [
      { name: 'u_position', type: 'vec3', label: 'Position', default: [0, 0, 0] },
    ]

    const controls = generateControlsFromUniforms(uniforms)

    expect(controls).toHaveLength(1)
    expect(controls[0].type).toBe('vec3')
  })

  it('should not generate controls for sampler2D uniforms', () => {
    const uniforms: UniformDefinition[] = [
      { name: 'u_texture', type: 'sampler2D', label: 'Texture', default: 0 },
    ]

    const controls = generateControlsFromUniforms(uniforms)

    expect(controls).toHaveLength(0)
  })
})

describe('ShaderPresets - preset code integrity', () => {
  it('all presets should have valid fragment code', () => {
    const presets = SHADER_PRESETS

    for (const preset of presets) {
      expect(preset.fragmentCode).toBeDefined()
      expect(preset.fragmentCode.length).toBeGreaterThan(0)
      // Should contain mainImage or main
      expect(
        preset.fragmentCode.includes('mainImage') || preset.fragmentCode.includes('void main')
      ).toBe(true)
    }
  })

  it('all preset uniforms should be used in the code', () => {
    const presets = SHADER_PRESETS

    for (const preset of presets) {
      for (const uniform of preset.uniforms) {
        expect(preset.fragmentCode).toContain(
          uniform.name
        )
      }
    }
  })

  it('injecting preset uniforms should make them parseable', () => {
    // This is the key test for the shader preview fix
    const wavesPreset = getPresetById('waves')
    expect(wavesPreset).toBeDefined()

    const injectedCode = injectUniformDeclarations(
      wavesPreset!.fragmentCode,
      wavesPreset!.uniforms
    )
    const parsedUniforms = parseUniformsFromCode(injectedCode)

    // All 4 uniforms should be parseable
    expect(parsedUniforms).toHaveLength(4)
    expect(parsedUniforms.map(u => u.name)).toContain('u_frequency')
    expect(parsedUniforms.map(u => u.name)).toContain('u_amplitude')
    expect(parsedUniforms.map(u => u.name)).toContain('u_speed')
    expect(parsedUniforms.map(u => u.name)).toContain('u_layers')
  })
})
