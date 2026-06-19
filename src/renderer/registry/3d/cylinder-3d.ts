import type { NodeDefinition } from '../types'

export const cylinder3dNode: NodeDefinition = {
  id: 'cylinder-3d',
  name: 'Cylinder 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Create a cylinder mesh',
  icon: 'cylinder',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'radiusTop', type: 'number', label: 'Radius Top' },
    { id: 'radiusBottom', type: 'number', label: 'Radius Bottom' },
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
    { id: 'radiusTop', type: 'number', label: 'Radius Top', default: 0.5 },
    { id: 'radiusBottom', type: 'number', label: 'Radius Bottom', default: 0.5 },
    { id: 'height', type: 'number', label: 'Height', default: 1 },
    { id: 'radialSegments', type: 'number', label: 'Segments', default: 32, props: { min: 3, max: 64 } },
    { id: 'color', type: 'color', label: 'Color', default: '#808080' },
  ],
  tags: ['cylinder', 'tube', 'pipe', '3d', 'geometry', 'mesh', 'primitive'],
  info: {
    overview: 'Generates a cylinder mesh with independent top and bottom radii. Setting one radius to zero produces a cone, making this node flexible for columns, pipes, and tapered shapes.',
    tips: [
      'Set Radius Top to 0 to create a cone.',
      'Increase the segment count for smoother silhouettes when the cylinder is large on screen.',
      'Combine with Transform 3D to lay the cylinder on its side for log or pipe shapes.',
    ],
    pairsWith: ['material-3d', 'transform-3d', 'scene-3d', 'group-3d'],
  },
}
