import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
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
  info: {
    overview: 'Performs 3D vector operations on two input vectors, including addition, subtraction, cross product, normalization, scaling, interpolation, and dot product. Also outputs the magnitude of the result. Select the operation from the dropdown.',
    tips: [
      'Use Normalize to get a unit-length direction vector from any input.',
      'Use Dot to measure the alignment between two direction vectors.',
    ],
    pairsWith: ['add', 'multiply', 'lerp', 'trig', 'smooth'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const ax = (ctx.inputs.get('ax') as number) ?? 0
  const ay = (ctx.inputs.get('ay') as number) ?? 0
  const az = (ctx.inputs.get('az') as number) ?? 0
  const bx = (ctx.inputs.get('bx') as number) ?? 0
  const by = (ctx.inputs.get('by') as number) ?? 0
  const bz = (ctx.inputs.get('bz') as number) ?? 0
  const scalar = (ctx.controls.get('scalar') as number) ?? 1
  const operation = (ctx.controls.get('operation') as string) ?? 'Add'

  let x: number, y: number, z: number

  switch (operation) {
    case 'Add':
      x = ax + bx
      y = ay + by
      z = az + bz
      break
    case 'Subtract':
      x = ax - bx
      y = ay - by
      z = az - bz
      break
    case 'Cross':
      x = ay * bz - az * by
      y = az * bx - ax * bz
      z = ax * by - ay * bx
      break
    case 'Normalize': {
      const mag = Math.sqrt(ax * ax + ay * ay + az * az)
      if (mag > 0) {
        x = ax / mag
        y = ay / mag
        z = az / mag
      } else {
        x = y = z = 0
      }
      break
    }
    case 'Scale':
      x = ax * scalar
      y = ay * scalar
      z = az * scalar
      break
    case 'Lerp':
      x = ax + (bx - ax) * scalar
      y = ay + (by - ay) * scalar
      z = az + (bz - az) * scalar
      break
    case 'Dot': {
      const dot = ax * bx + ay * by + az * bz
      x = dot
      y = dot
      z = dot
      break
    }
    default:
      x = ax + bx
      y = ay + by
      z = az + bz
  }

  const magnitude = Math.sqrt(x * x + y * y + z * z)

  return new Map([
    ['x', x],
    ['y', y],
    ['z', z],
    ['magnitude', magnitude],
  ])
}

export default defineNode({ definition, executor, pure: true })
