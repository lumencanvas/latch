import type { NodeDefinition } from '../types'

export const group3dNode: NodeDefinition = {
  id: 'group-3d',
  name: 'Group 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Combine multiple objects into a group',
  icon: 'layers',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'objects', type: 'object3d', label: 'Objects', multiple: true },
    { id: 'posX', type: 'number', label: 'Pos X' },
    { id: 'posY', type: 'number', label: 'Pos Y' },
    { id: 'posZ', type: 'number', label: 'Pos Z' },
  ],
  outputs: [
    { id: 'object', type: 'object3d', label: 'Object' },
  ],
  controls: [
    { id: 'posX', type: 'number', label: 'Position X', default: 0 },
    { id: 'posY', type: 'number', label: 'Position Y', default: 0 },
    { id: 'posZ', type: 'number', label: 'Position Z', default: 0 },
  ],
  tags: ['group', '3d', 'container', 'parent', 'combine', 'hierarchy'],
  info: {
    overview: 'Combines multiple 3D objects into a single group that can be positioned as one unit. Moving or transforming the group affects all children together, which simplifies scene organization.',
    tips: [
      'Nest groups inside other groups to build a hierarchy for complex assemblies.',
      'Apply a single Transform 3D to the group instead of transforming each child individually.',
      'Connect several primitive shapes to the objects input to build compound objects.',
    ],
    pairsWith: ['scene-3d', 'transform-3d', 'box-3d', 'sphere-3d', 'gltf-loader'],
  },
}
