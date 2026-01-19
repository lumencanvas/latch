import type { NodeDefinition } from '../types'

export const vectorMathNode: NodeDefinition = {
  id: 'vector-math',
  name: 'Vector Math',
  version: '1.0.0',
  category: 'math',
  description: '3D vector operations',
  icon: 'move-3d',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'ax', type: 'number', label: 'A.x' },
    { id: 'ay', type: 'number', label: 'A.y' },
    { id: 'az', type: 'number', label: 'A.z' },
    { id: 'bx', type: 'number', label: 'B.x' },
    { id: 'by', type: 'number', label: 'B.y' },
    { id: 'bz', type: 'number', label: 'B.z' },
  ],
  outputs: [
    { id: 'x', type: 'number', label: 'X' },
    { id: 'y', type: 'number', label: 'Y' },
    { id: 'z', type: 'number', label: 'Z' },
    { id: 'magnitude', type: 'number', label: 'Magnitude' },
  ],
  controls: [
    {
      id: 'operation',
      type: 'select',
      label: 'Operation',
      default: 'Add',
      props: {
        options: ['Add', 'Subtract', 'Cross', 'Normalize', 'Scale', 'Lerp', 'Dot'],
      },
    },
    { id: 'scalar', type: 'number', label: 'Scalar', default: 1 },
  ],
}
