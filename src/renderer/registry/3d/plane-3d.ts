import type { NodeDefinition } from '../types'

export const plane3dNode: NodeDefinition = {
  id: 'plane-3d',
  name: 'Plane 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Create a plane mesh',
  icon: 'square',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
    { id: 'material', type: 'material3d', label: 'Material' },
    { id: 'posX', type: 'number', label: 'Pos X' },
    { id: 'posY', type: 'number', label: 'Pos Y' },
    { id: 'posZ', type: 'number', label: 'Pos Z' },
  ],
  outputs: [
    { id: 'object', type: 'object3d', label: 'Object' },
  ],
  controls: [
    { id: 'width', type: 'number', label: 'Width', default: 1 },
    { id: 'height', type: 'number', label: 'Height', default: 1 },
    { id: 'color', type: 'color', label: 'Color', default: '#808080' },
  ],
  tags: ['plane', 'quad', 'ground', 'floor', '3d', 'geometry', 'mesh', 'primitive'],
  info: {
    overview: 'Creates a flat rectangular surface. Planes are useful as ground floors, walls, backgrounds, or shadow-receiving surfaces beneath other objects.',
    tips: [
      'Place a large plane at Y=0 to act as a ground that catches shadows from directional lights.',
      'Set the material side to double so the plane is visible from both sides.',
      'Scale up width and height rather than using Transform 3D scale to keep UV coordinates consistent.',
    ],
    pairsWith: ['material-3d', 'scene-3d', 'directional-light-3d', 'transform-3d'],
  },
}
