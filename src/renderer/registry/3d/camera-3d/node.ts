import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer } from '@/services/visual/ThreeRenderer'

const definition: NodeDefinition = {
  id: 'camera-3d',
  name: 'Camera 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Perspective or orthographic camera',
  icon: 'camera',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'posX', type: 'number', label: 'Pos X' },
    { id: 'posY', type: 'number', label: 'Pos Y' },
    { id: 'posZ', type: 'number', label: 'Pos Z' },
    { id: 'targetX', type: 'number', label: 'Target X' },
    { id: 'targetY', type: 'number', label: 'Target Y' },
    { id: 'targetZ', type: 'number', label: 'Target Z' },
  ],
  outputs: [
    { id: 'camera', type: 'camera3d', label: 'Camera' },
  ],
  controls: [
    { id: 'type', type: 'select', label: 'Type', default: 'perspective', props: { options: ['perspective', 'orthographic'] } },
    { id: 'fov', type: 'number', label: 'FOV', default: 50, props: { min: 10, max: 120 } },
    { id: 'near', type: 'number', label: 'Near', default: 0.1 },
    { id: 'far', type: 'number', label: 'Far', default: 1000 },
    { id: 'orthoSize', type: 'number', label: 'Ortho Size', default: 5 },
    { id: 'posX', type: 'number', label: 'Position X', default: 0 },
    { id: 'posY', type: 'number', label: 'Position Y', default: 2 },
    { id: 'posZ', type: 'number', label: 'Position Z', default: 5 },
    { id: 'targetX', type: 'number', label: 'Target X', default: 0 },
    { id: 'targetY', type: 'number', label: 'Target Y', default: 0 },
    { id: 'targetZ', type: 'number', label: 'Target Z', default: 0 },
  ],
  tags: ['camera', '3d', 'view', 'perspective', 'orthographic', 'lens'],
  info: {
    overview: 'Defines the viewpoint used to render a 3D scene. Supports both perspective projection, which mimics human vision with foreshortening, and orthographic projection, which preserves parallel lines. Connect it to Render 3D alongside a scene to produce an image.',
    tips: [
      'Lower the FOV (30-40) for a telephoto look or raise it (90+) for a wide-angle feel.',
      'Switch to orthographic mode for UI mockups or isometric game views.',
      'Animate the position inputs with an LFO or time node to create camera sweeps.',
    ],
    pairsWith: ['render-3d', 'scene-3d', 'transform-3d'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const renderer = getThreeRenderer()

  const cameraType = (ctx.controls.get('type') as 'perspective' | 'orthographic') ?? 'perspective'
  const fov = (ctx.controls.get('fov') as number) ?? 50
  const near = (ctx.controls.get('near') as number) ?? 0.1
  const far = (ctx.controls.get('far') as number) ?? 1000
  const orthoSize = (ctx.controls.get('orthoSize') as number) ?? 5

  // Get position from inputs or controls
  const posX = (ctx.inputs.get('posX') as number) ?? (ctx.controls.get('posX') as number) ?? 0
  const posY = (ctx.inputs.get('posY') as number) ?? (ctx.controls.get('posY') as number) ?? 2
  const posZ = (ctx.inputs.get('posZ') as number) ?? (ctx.controls.get('posZ') as number) ?? 5

  // Get target from inputs or controls
  const targetX = (ctx.inputs.get('targetX') as number) ?? (ctx.controls.get('targetX') as number) ?? 0
  const targetY = (ctx.inputs.get('targetY') as number) ?? (ctx.controls.get('targetY') as number) ?? 0
  const targetZ = (ctx.inputs.get('targetZ') as number) ?? (ctx.controls.get('targetZ') as number) ?? 0

  const camera = renderer.getOrCreateCamera(ctx.nodeId, cameraType, {
    fov,
    near,
    far,
    orthoSize,
    position: [posX, posY, posZ],
    target: [targetX, targetY, targetZ],
  })

  const outputs = new Map<string, unknown>()
  outputs.set('camera', camera)
  return outputs
}

export default defineNode({ definition, executor })
