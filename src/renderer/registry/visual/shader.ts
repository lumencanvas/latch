import type { NodeDefinition } from '../types'

/**
 * Shader Node v3.0 - Dynamic Uniforms
 *
 * This shader node uses dynamic port generation based on the uniforms
 * declared in the GLSL code. When shader code changes, the node's
 * input ports are automatically updated to match the uniforms.
 *
 * Static ports:
 * - Texture inputs (iChannel0-3) for Shadertoy compatibility
 * - Texture output
 *
 * Dynamic ports (stored in node.data._dynamicInputs):
 * - All user-defined uniforms (u_*, or any non-builtin uniform)
 * - Generated automatically when code is saved
 */
export const shaderNode: NodeDefinition = {
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
