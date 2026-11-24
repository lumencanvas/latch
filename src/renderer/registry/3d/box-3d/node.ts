import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { THREE } from '@/services/visual/ThreeRenderer'
import { updatePrimitiveMesh } from '../shared'

const definition: NodeDefinition = {
  id: 'box-3d',
  name: 'Box 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Create a box/cube mesh',
  icon: 'box',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
    { id: 'depth', type: 'number', label: 'Depth' },
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
    { id: 'depth', type: 'number', label: 'Depth', default: 1 },
    { id: 'color', type: 'color', label: 'Color', default: '#808080' },
  ],
  tags: ['box', 'cube', 'block', '3d', 'geometry', 'mesh', 'primitive'],
  info: {
    overview: 'Creates a rectangular box mesh with configurable width, height, and depth. It is the most common primitive for building architectural elements, platforms, and placeholder geometry in a 3D scene.',
    tips: [
      'Connect a Material 3D node to the material input to override the default flat color.',
      'Set one dimension very small to approximate a wall or panel.',
      'Use Transform 3D after this node to rotate or reposition the box without editing its own controls.',
    ],
    pairsWith: ['material-3d', 'transform-3d', 'scene-3d', 'group-3d'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const width = (ctx.inputs.get('width') as number) ?? (ctx.controls.get('width') as number) ?? 1
  const height = (ctx.inputs.get('height') as number) ?? (ctx.controls.get('height') as number) ?? 1
  const depth = (ctx.inputs.get('depth') as number) ?? (ctx.controls.get('depth') as number) ?? 1

  // Geometry is rebuilt only when its params change; color/material/position update in place.
  const mesh = updatePrimitiveMesh(ctx, `${width}|${height}|${depth}`, () => new THREE.BoxGeometry(width, height, depth))

  const outputs = new Map<string, unknown>()
  outputs.set('object', mesh)
  return outputs
}

export default defineNode({ definition, executor })
