import type { NodeDefinition } from '../types'

export const transform2dNode: NodeDefinition = {
  id: 'transform-2d',
  name: 'Transform 2D',
  version: '1.0.0',
  category: 'visual',
  description: 'Apply 2D transforms (scale, rotate, translate)',
  icon: 'move-3d',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'scaleX', type: 'number', label: 'Scale X' },
    { id: 'scaleY', type: 'number', label: 'Scale Y' },
    { id: 'rotate', type: 'number', label: 'Rotation' },
    { id: 'translateX', type: 'number', label: 'Translate X' },
    { id: 'translateY', type: 'number', label: 'Translate Y' },
  ],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    { id: 'scaleX', type: 'slider', label: 'Scale X', default: 1, props: { min: 0.1, max: 5, step: 0.01 } },
    { id: 'scaleY', type: 'slider', label: 'Scale Y', default: 1, props: { min: 0.1, max: 5, step: 0.01 } },
    { id: 'rotate', type: 'slider', label: 'Rotation', default: 0, props: { min: -180, max: 180, step: 1 } },
    { id: 'translateX', type: 'slider', label: 'Translate X', default: 0, props: { min: -1, max: 1, step: 0.01 } },
    { id: 'translateY', type: 'slider', label: 'Translate Y', default: 0, props: { min: -1, max: 1, step: 0.01 } },
  ],
}
