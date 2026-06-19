import type { NodeDefinition } from '../types'

export const transform3dNode: NodeDefinition = {
  id: 'transform-3d',
  name: 'Transform 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Apply position, rotation, and scale',
  icon: 'move-3d',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'object', type: 'object3d', label: 'Object', required: true },
    { id: 'posX', type: 'number', label: 'Pos X' },
    { id: 'posY', type: 'number', label: 'Pos Y' },
    { id: 'posZ', type: 'number', label: 'Pos Z' },
    { id: 'rotX', type: 'number', label: 'Rot X' },
    { id: 'rotY', type: 'number', label: 'Rot Y' },
    { id: 'rotZ', type: 'number', label: 'Rot Z' },
    { id: 'scaleX', type: 'number', label: 'Scale X' },
    { id: 'scaleY', type: 'number', label: 'Scale Y' },
    { id: 'scaleZ', type: 'number', label: 'Scale Z' },
  ],
  outputs: [
    { id: 'object', type: 'object3d', label: 'Object' },
    { id: 'transform', type: 'transform3d', label: 'Transform' },
  ],
  controls: [
    { id: 'posX', type: 'number', label: 'Position X', default: 0 },
    { id: 'posY', type: 'number', label: 'Position Y', default: 0 },
    { id: 'posZ', type: 'number', label: 'Position Z', default: 0 },
    { id: 'rotX', type: 'number', label: 'Rotation X', default: 0 },
    { id: 'rotY', type: 'number', label: 'Rotation Y', default: 0 },
    { id: 'rotZ', type: 'number', label: 'Rotation Z', default: 0 },
    { id: 'scaleX', type: 'number', label: 'Scale X', default: 1 },
    { id: 'scaleY', type: 'number', label: 'Scale Y', default: 1 },
    { id: 'scaleZ', type: 'number', label: 'Scale Z', default: 1 },
  ],
  tags: ['transform', '3d', 'position', 'rotation', 'scale', 'move', 'translate'],
  info: {
    overview: 'Applies position, rotation, and scale to any 3D object without modifying the original geometry. Chain multiple transforms or drive inputs with animated values for motion. The transform output can also be reused by other nodes.',
    tips: [
      'Connect an LFO or time node to rotation inputs for continuous spinning animations.',
      'Stack transforms by feeding one transform output into the next for complex motion.',
      'Use non-uniform scale (different X, Y, Z) to stretch primitives into new shapes.',
    ],
    pairsWith: ['box-3d', 'sphere-3d', 'group-3d', 'gltf-loader', 'scene-3d'],
  },
}
