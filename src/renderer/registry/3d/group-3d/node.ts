import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'
import { nodeObjects, groupState } from '../shared'

const definition: NodeDefinition = {
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

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const renderer = getThreeRenderer()

  let group = nodeObjects.get(ctx.nodeId) as THREE.Group | undefined

  if (!group) {
    group = renderer.createGroup()
    nodeObjects.set(ctx.nodeId, group)
  }

  // Get objects input (array or single)
  const objectsInput = ctx.inputs.get('objects')
  const inputObjects: THREE.Object3D[] = []

  if (objectsInput) {
    const objects = Array.isArray(objectsInput) ? objectsInput : [objectsInput]
    for (const obj of objects) {
      if (obj instanceof THREE.Object3D) {
        inputObjects.push(obj)
      }
    }
  }

  // Get current input IDs for comparison
  const newInputIds = inputObjects.map(obj => obj.uuid)

  // Get or create group state
  let state = groupState.get(ctx.nodeId)
  if (!state) {
    state = { inputIds: [], clones: [] }
    groupState.set(ctx.nodeId, state)
  }

  // Check if inputs changed (by comparing UUIDs)
  const inputsChanged = newInputIds.length !== state.inputIds.length ||
    newInputIds.some((id, i) => id !== state.inputIds[i])

  if (inputsChanged) {
    // Dispose old clones properly (dispose materials but geometry is shared)
    for (const clone of state.clones) {
      group.remove(clone)
      if (clone instanceof THREE.Mesh) {
        // Don't dispose geometry (it's shared with the original)
        // But do dispose materials if they were cloned
        if (Array.isArray(clone.material)) {
          clone.material.forEach(m => m.dispose())
        } else if (clone.material) {
          clone.material.dispose()
        }
      }
    }

    // Create new clones with shared geometry
    state.clones = []
    for (const obj of inputObjects) {
      // Clone with shared geometry - Three.js clone() already shares geometry
      const clone = obj.clone()
      group.add(clone)
      state.clones.push(clone)
    }

    state.inputIds = newInputIds
  }

  // Apply group transform
  const posX = (ctx.inputs.get('posX') as number) ?? (ctx.controls.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? (ctx.controls.get('posY') as number) ?? 0
  const posZ = (ctx.inputs.get('posZ') as number) ?? (ctx.controls.get('posZ') as number) ?? 0

  group.position.set(posX, posY, posZ)

  const outputs = new Map<string, unknown>()
  outputs.set('object', group)
  return outputs
}

export default defineNode({ definition, executor })
