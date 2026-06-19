import type { NodeDefinition } from '../types'

export const colorNode: NodeDefinition = {
  id: 'color',
  name: 'Color',
  version: '1.0.0',
  category: 'visual',
  description: 'Create RGBA color value',
  icon: 'palette',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'r', type: 'number', label: 'R' },
    { id: 'g', type: 'number', label: 'G' },
    { id: 'b', type: 'number', label: 'B' },
    { id: 'a', type: 'number', label: 'A' },
  ],
  outputs: [
    { id: 'color', type: 'data', label: 'Color' },
    { id: 'r', type: 'number', label: 'R' },
    { id: 'g', type: 'number', label: 'G' },
    { id: 'b', type: 'number', label: 'B' },
    { id: 'a', type: 'number', label: 'A' },
  ],
  controls: [
    { id: 'r', type: 'slider', label: 'R', default: 1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'g', type: 'slider', label: 'G', default: 1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'b', type: 'slider', label: 'B', default: 1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'a', type: 'slider', label: 'A', default: 1, props: { min: 0, max: 1, step: 0.01 } },
  ],
  tags: ['color', 'colour', 'rgb', 'rgba', 'swatch', 'picker', 'fill', 'solid', 'tint'],
  info: {
    overview: 'Creates an RGBA color value from individual channel sliders or numeric inputs. Outputs both the combined color object and separate R, G, B, A channel values. Useful as a color source for shaders and visual effects.',
    tips: [
      'Connect LFO nodes to individual channels to create animated color cycling without writing shader code.',
      'Use the separate channel outputs to feed different parts of a flow with the same base color values.',
      'Set alpha below 1.0 when using this as a tint layer through a blend node in normal mode.',
    ],
    pairsWith: ['shader', 'blend', 'lfo', 'color-correction', 'map-range'],
  },
}
