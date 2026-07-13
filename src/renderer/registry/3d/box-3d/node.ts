import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'
import { nodeObjects, nodeMaterials } from '../shared'

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
  const material = ctx.inputs.get('material') as THREE.Material | undefined

  const colorHex = (ctx.controls.get('color') as string) ?? '#808080'

  const renderer = getThreeRenderer()

  // Create or update mesh
  let mesh = nodeObjects.get(ctx.nodeId) as THREE.Mesh | undefined

  if (!mesh) {
    const defaultMat = renderer.createMaterial({ color: parseInt(colorHex.replace('#', ''), 16) })
    mesh = renderer.createBox(width, height, depth, material ?? defaultMat)
    nodeObjects.set(ctx.nodeId, mesh)
  } else {
    // Update geometry if dimensions changed
    mesh.geometry.dispose()
    mesh.geometry = new THREE.BoxGeometry(width, height, depth)

    // Update material if provided - dispose old material if it's not shared
    if (material && mesh.material !== material) {
      const oldMat = mesh.material as THREE.Material
      // Only dispose if it's a default material (not provided by user via input)
      if (oldMat && !nodeMaterials.has(ctx.nodeId)) {
        oldMat.dispose()
      }
      mesh.material = material
    }
  }

  // Apply transforms from inputs
  const posX = (ctx.inputs.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? 0
  const posZ = (ctx.inputs.get('posZ') as number) ?? 0
  mesh.position.set(posX, posY, posZ)

  const outputs = new Map<string, unknown>()
  outputs.set('object', mesh)
  return outputs
}

export default defineNode({ definition, executor })
