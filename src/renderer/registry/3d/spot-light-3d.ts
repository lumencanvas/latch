import type { NodeDefinition } from '../types'

export const spotLight3dNode: NodeDefinition = {
  id: 'spot-light-3d',
  name: 'Spot Light',
  version: '1.0.0',
  category: '3d',
  description: 'Cone-shaped light like a spotlight',
  icon: 'flashlight',
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
    { id: 'angle', type: 'slider', label: 'Angle', default: 30, props: { min: 1, max: 90, step: 1 } },
    { id: 'penumbra', type: 'slider', label: 'Penumbra', default: 0.1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'decay', type: 'number', label: 'Decay', default: 2, props: { min: 0, max: 5 } },
    { id: 'posX', type: 'number', label: 'Position X', default: 0 },
    { id: 'posY', type: 'number', label: 'Position Y', default: 5 },
    { id: 'posZ', type: 'number', label: 'Position Z', default: 0 },
    { id: 'targetX', type: 'number', label: 'Target X', default: 0 },
    { id: 'targetY', type: 'number', label: 'Target Y', default: 0 },
    { id: 'targetZ', type: 'number', label: 'Target Z', default: 0 },
    { id: 'castShadow', type: 'toggle', label: 'Cast Shadow', default: true },
  ],
  tags: ['spot light', 'spotlight', 'cone', 'light', '3d', 'lighting'],
  info: {
    overview: 'Projects a cone of light from a point toward a target, like a stage spotlight or flashlight. The angle and penumbra controls shape the cone edge. Supports shadow casting for dramatic, focused lighting.',
    tips: [
      'Increase penumbra toward 1 for a soft-edged falloff at the cone boundary.',
      'Narrow the angle to create a tight, focused beam for dramatic highlights.',
      'Aim the target position at the object you want to emphasize in the scene.',
    ],
    pairsWith: ['scene-3d', 'ambient-light-3d', 'material-3d', 'point-light-3d'],
  },
}
