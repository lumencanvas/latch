import type { NodeDefinition } from '../types'

export const ambientLight3dNode: NodeDefinition = {
  id: 'ambient-light-3d',
  name: 'Ambient Light',
  version: '1.0.0',
  category: '3d',
  description: 'Uniform lighting from all directions',
  icon: 'sun',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'intensity', type: 'number', label: 'Intensity' },
  ],
  outputs: [
    { id: 'light', type: 'light3d', label: 'Light' },
    { id: 'object', type: 'object3d', label: 'Object' },
  ],
  controls: [
    { id: 'color', type: 'color', label: 'Color', default: '#ffffff' },
    { id: 'intensity', type: 'slider', label: 'Intensity', default: 0.5, props: { min: 0, max: 2, step: 0.01 } },
  ],
  tags: ['ambient light', 'light', 'ambient', 'fill', '3d', 'lighting'],
  info: {
    overview: 'Adds a base layer of uniform light that illuminates all objects equally regardless of their position or orientation. Use it to prevent completely black shadows and ensure minimum visibility across the entire scene.',
    tips: [
      'Keep intensity low (0.1 to 0.3) so directional and point lights can still define shape.',
      'Pair with a directional light to simulate outdoor lighting with soft fill.',
      'Tint the color slightly blue or warm orange to set the overall mood before adding other lights.',
    ],
    pairsWith: ['scene-3d', 'directional-light-3d', 'point-light-3d', 'material-3d'],
  },
}
