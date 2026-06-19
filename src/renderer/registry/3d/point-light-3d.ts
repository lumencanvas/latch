import type { NodeDefinition } from '../types'

export const pointLight3dNode: NodeDefinition = {
  id: 'point-light-3d',
  name: 'Point Light',
  version: '1.0.0',
  category: '3d',
  description: 'Light that radiates in all directions from a point',
  icon: 'lightbulb',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'intensity', type: 'number', label: 'Intensity' },
    { id: 'posX', type: 'number', label: 'Pos X' },
    { id: 'posY', type: 'number', label: 'Pos Y' },
    { id: 'posZ', type: 'number', label: 'Pos Z' },
  ],
  outputs: [
    { id: 'light', type: 'light3d', label: 'Light' },
    { id: 'object', type: 'object3d', label: 'Object' },
  ],
  controls: [
    { id: 'color', type: 'color', label: 'Color', default: '#ffffff' },
    { id: 'intensity', type: 'slider', label: 'Intensity', default: 1, props: { min: 0, max: 5, step: 0.01 } },
    { id: 'distance', type: 'number', label: 'Distance', default: 0, props: { min: 0 } },
    { id: 'decay', type: 'number', label: 'Decay', default: 2, props: { min: 0, max: 5 } },
    { id: 'posX', type: 'number', label: 'Position X', default: 0 },
    { id: 'posY', type: 'number', label: 'Position Y', default: 2 },
    { id: 'posZ', type: 'number', label: 'Position Z', default: 0 },
    { id: 'castShadow', type: 'toggle', label: 'Cast Shadow', default: false },
  ],
  tags: ['point light', 'bulb', 'light', 'omni', '3d', 'lighting'],
  info: {
    overview: 'Emits light equally in all directions from a single point in space, similar to a bare light bulb. Intensity falls off with distance based on the decay setting. Works well for indoor scenes and localized highlights.',
    tips: [
      'Set distance to 0 for infinite range, or use a positive value to limit the light radius.',
      'Increase decay for a more realistic, physically based falloff.',
      'Place several point lights at low intensity around a room for soft, even indoor illumination.',
    ],
    pairsWith: ['scene-3d', 'ambient-light-3d', 'material-3d', 'spot-light-3d'],
  },
}
