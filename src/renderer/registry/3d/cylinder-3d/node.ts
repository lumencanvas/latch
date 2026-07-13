import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'
import { nodeObjects, nodeMaterials } from '../shared'

const definition: NodeDefinition = {
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

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const radiusTop = (ctx.inputs.get('radiusTop') as number) ?? (ctx.controls.get('radiusTop') as number) ?? 0.5
  const radiusBottom = (ctx.inputs.get('radiusBottom') as number) ?? (ctx.controls.get('radiusBottom') as number) ?? 0.5
  const height = (ctx.inputs.get('height') as number) ?? (ctx.controls.get('height') as number) ?? 1
  const radialSegments = (ctx.controls.get('radialSegments') as number) ?? 32
  const material = ctx.inputs.get('material') as THREE.Material | undefined

  const colorHex = (ctx.controls.get('color') as string) ?? '#808080'

  const renderer = getThreeRenderer()

  let mesh = nodeObjects.get(ctx.nodeId) as THREE.Mesh | undefined

  if (!mesh) {
    const defaultMat = renderer.createMaterial({ color: parseInt(colorHex.replace('#', ''), 16) })
    mesh = renderer.createCylinder(radiusTop, radiusBottom, height, radialSegments, material ?? defaultMat)
    nodeObjects.set(ctx.nodeId, mesh)
  } else {
    mesh.geometry.dispose()
    mesh.geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)

    if (material && mesh.material !== material) {
      const oldMat = mesh.material as THREE.Material
      if (oldMat && !nodeMaterials.has(ctx.nodeId)) {
        oldMat.dispose()
      }
      mesh.material = material
    }
  }

  const posX = (ctx.inputs.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? 0
  const posZ = (ctx.inputs.get('posZ') as number) ?? 0
  mesh.position.set(posX, posY, posZ)

  const outputs = new Map<string, unknown>()
  outputs.set('object', mesh)
  return outputs
}

export default defineNode({ definition, executor })
