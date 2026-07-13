import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'
import { nodeObjects } from '../shared'

const definition: NodeDefinition = {
  id: 'spot-light-3d',
  name: 'Spot Light',
  version: '1.0.0',
  category: '3d',
  description: 'Cone-shaped light like a spotlight',
  icon: 'flashlight',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'intensity', type: 'number', label: 'Intensity' },
    { id: 'posX', type: 'number', label: 'Pos X' },
    { id: 'posY', type: 'number', label: 'Pos Y' },
    { id: 'posZ', type: 'number', label: 'Pos Z' },
  ],
  outputs: [
    { id: 'light', type: 'light3d', label: 'Light' },
    { id: 'object', type: 'object3d', label: 'Object' },
  ],
  controls: [
    { id: 'color', type: 'color', label: 'Color', default: '#ffffff' },
    { id: 'intensity', type: 'slider', label: 'Intensity', default: 1, props: { min: 0, max: 5, step: 0.01 } },
    { id: 'distance', type: 'number', label: 'Distance', default: 0, props: { min: 0 } },
    { id: 'angle', type: 'slider', label: 'Angle', default: 30, props: { min: 1, max: 90, step: 1 } },
    { id: 'penumbra', type: 'slider', label: 'Penumbra', default: 0.1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'decay', type: 'number', label: 'Decay', default: 2, props: { min: 0, max: 5 } },
    { id: 'posX', type: 'number', label: 'Position X', default: 0 },
    { id: 'posY', type: 'number', label: 'Position Y', default: 5 },
    { id: 'posZ', type: 'number', label: 'Position Z', default: 0 },
    { id: 'targetX', type: 'number', label: 'Target X', default: 0 },
    { id: 'targetY', type: 'number', label: 'Target Y', default: 0 },
    { id: 'targetZ', type: 'number', label: 'Target Z', default: 0 },
    { id: 'castShadow', type: 'toggle', label: 'Cast Shadow', default: true },
  ],
  tags: ['spot light', 'spotlight', 'cone', 'light', '3d', 'lighting'],
  info: {
    overview: 'Projects a cone of light from a point toward a target, like a stage spotlight or flashlight. The angle and penumbra controls shape the cone edge. Supports shadow casting for dramatic, focused lighting.',
    tips: [
      'Increase penumbra toward 1 for a soft-edged falloff at the cone boundary.',
      'Narrow the angle to create a tight, focused beam for dramatic highlights.',
      'Aim the target position at the object you want to emphasize in the scene.',
    ],
    pairsWith: ['scene-3d', 'ambient-light-3d', 'material-3d', 'point-light-3d'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const colorHex = (ctx.controls.get('color') as string) ?? '#ffffff'
  const intensity = (ctx.inputs.get('intensity') as number) ?? (ctx.controls.get('intensity') as number) ?? 1
  const distance = (ctx.controls.get('distance') as number) ?? 0
  const angle = (ctx.controls.get('angle') as number) ?? 30 // degrees
  const penumbra = (ctx.controls.get('penumbra') as number) ?? 0.1
  const decay = (ctx.controls.get('decay') as number) ?? 2
  const castShadow = (ctx.controls.get('castShadow') as boolean) ?? true

  const posX = (ctx.inputs.get('posX') as number) ?? (ctx.controls.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? (ctx.controls.get('posY') as number) ?? 5
  const posZ = (ctx.inputs.get('posZ') as number) ?? (ctx.controls.get('posZ') as number) ?? 0

  const targetX = (ctx.controls.get('targetX') as number) ?? 0
  const targetY = (ctx.controls.get('targetY') as number) ?? 0
  const targetZ = (ctx.controls.get('targetZ') as number) ?? 0

  const color = parseInt(colorHex.replace('#', ''), 16)
  const angleRad = THREE.MathUtils.degToRad(angle)

  const renderer = getThreeRenderer()
  const light = renderer.createSpotLight(
    color,
    intensity,
    distance,
    angleRad,
    penumbra,
    decay,
    [posX, posY, posZ],
    [targetX, targetY, targetZ],
    castShadow
  )

  nodeObjects.set(ctx.nodeId, light)

  const outputs = new Map<string, unknown>()
  outputs.set('light', light)
  outputs.set('object', light)
  return outputs
}

export default defineNode({ definition, executor })
