import type { NodeDefinition } from '../types'

export const sphere3dNode: NodeDefinition = {
  id: 'sphere-3d',
  name: 'Sphere 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Create a sphere mesh',
  icon: 'circle',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'radius', type: 'number', label: 'Radius' },
    { id: 'material', type: 'material3d', label: 'Material' },
    { id: 'posX', type: 'number', label: 'Pos X' },
    { id: 'posY', type: 'number', label: 'Pos Y' },
    { id: 'posZ', type: 'number', label: 'Pos Z' },
  ],
  outputs: [
    { id: 'object', type: 'object3d', label: 'Object' },
  ],
  controls: [
    { id: 'radius', type: 'number', label: 'Radius', default: 0.5 },
    { id: 'widthSegments', type: 'number', label: 'Width Segs', default: 32, props: { min: 3, max: 64 } },
    { id: 'heightSegments', type: 'number', label: 'Height Segs', default: 16, props: { min: 2, max: 32 } },
    { id: 'color', type: 'color', label: 'Color', default: '#808080' },
  ],
  tags: ['sphere', 'ball', 'globe', '3d', 'geometry', 'mesh', 'primitive'],
  info: {
    overview: 'Creates a sphere mesh with configurable radius and segment counts. Higher segment values produce smoother surfaces. It is a good primitive for testing materials and lighting setups.',
    tips: [
      'Use 32 width segments and 16 height segments as a balanced default for most use cases.',
      'Lower segment counts intentionally for a faceted, low-poly look.',
      'Connect a Material 3D with high metalness and low roughness to see clear environment reflections.',
    ],
    pairsWith: ['material-3d', 'transform-3d', 'scene-3d', 'point-light-3d'],
  },
}
