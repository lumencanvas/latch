import type { NodeDefinition } from '../types'

export const shaderNode: NodeDefinition = {
  id: 'shader',
  name: 'Shader',
  version: '2.0.0',
  category: 'visual',
  description: 'Custom GLSL shader with presets and Shadertoy support',
  icon: 'code',
  platforms: ['web', 'electron'],
  inputs: [
    // Texture inputs for effects
    { id: 'texture0', type: 'texture', label: 'Texture 0' },
    { id: 'texture1', type: 'texture', label: 'Texture 1' },
    { id: 'texture2', type: 'texture', label: 'Texture 2' },
    { id: 'texture3', type: 'texture', label: 'Texture 3' },
    // Dynamic uniform inputs (auto-detected from code)
    { id: 'u_param1', type: 'number', label: 'Param 1' },
    { id: 'u_param2', type: 'number', label: 'Param 2' },
    { id: 'u_param3', type: 'number', label: 'Param 3' },
    { id: 'u_param4', type: 'number', label: 'Param 4' },
    { id: 'u_color', type: 'data', label: 'Color' },
    { id: 'u_vec2', type: 'data', label: 'Vec2' },
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
      default: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
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
    { id: 'u_param1', type: 'slider', label: 'Param 1', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'u_param2', type: 'slider', label: 'Param 2', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'u_param3', type: 'slider', label: 'Param 3', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'u_param4', type: 'slider', label: 'Param 4', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
  ],
}
