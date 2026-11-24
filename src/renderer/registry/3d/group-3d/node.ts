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
    // Drop old clones. Object3D.clone() SHARES geometry and material with the source, so they
    // must NOT be disposed here — doing so disposed the upstream node's live material (forcing
    // a recompile, and blanking it if that material was otherwise idle). Only light clones own
    // something of their own: a separate shadow map.
    for (const clone of state.clones) {
      group.remove(clone)
      clone.traverse((o) => {
        if (o instanceof THREE.Light) o.dispose()
      })
    }

    // Create new clones with shared geometry
    state.clones = []
    for (const obj of inputObjects) {
      const clone = obj.clone()
      group.add(clone)
      state.clones.push(clone)
    }

    state.inputIds = newInputIds
  }

  // Keep clones in sync with their sources: the source's transform, geometry (primitives swap
  // it on a param change) and material are live, but a one-time clone froze them.
  for (let i = 0; i < state.clones.length; i++) {
    const src = inputObjects[i]
    const clone = state.clones[i]
    if (!src || !clone) continue
    clone.position.copy(src.position)
    clone.quaternion.copy(src.quaternion)
    clone.scale.copy(src.scale)
    clone.visible = src.visible
    if (src instanceof THREE.Mesh && clone instanceof THREE.Mesh) {
      if (clone.geometry !== src.geometry) clone.geometry = src.geometry
      if (clone.material !== src.material) clone.material = src.material
    } else if (src instanceof THREE.Light && clone instanceof THREE.Light) {
      clone.color.copy(src.color)
      clone.intensity = src.intensity
      clone.castShadow = src.castShadow
    }
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
