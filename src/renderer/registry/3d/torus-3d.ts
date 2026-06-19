import type { NodeDefinition } from '../types'

export const torus3dNode: NodeDefinition = {
  id: 'torus-3d',
  name: 'Torus 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Create a torus (donut) mesh',
  icon: 'circle-dot',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'radius', type: 'number', label: 'Radius' },
    { id: 'tube', type: 'number', label: 'Tube' },
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
    { id: 'tube', type: 'number', label: 'Tube', default: 0.2 },
    { id: 'radialSegments', type: 'number', label: 'Radial Segs', default: 16, props: { min: 2, max: 32 } },
    { id: 'tubularSegments', type: 'number', label: 'Tubular Segs', default: 100, props: { min: 3, max: 200 } },
    { id: 'color', type: 'color', label: 'Color', default: '#808080' },
  ],
  tags: ['torus', 'donut', 'ring', '3d', 'geometry', 'mesh', 'primitive'],
  info: {
    overview: 'Creates a torus (donut-shaped) mesh defined by an outer radius and a tube radius. Segment controls let you balance visual smoothness against performance.',
    tips: [
      'Set tube radius close to the main radius for a thick ring, or very small for a thin hoop.',
      'Reduce radial segments to 6 or 8 for a stylized hexagonal or octagonal ring.',
      'Apply a Transform 3D to tilt the torus for use as a ring, halo, or orbit path.',
    ],
    pairsWith: ['material-3d', 'transform-3d', 'scene-3d', 'group-3d'],
  },
}
