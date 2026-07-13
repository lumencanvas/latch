import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'

const definition: NodeDefinition = {
  id: 'render-3d',
  name: 'Render 3D',
  version: '1.0.0',
  category: '3d',
  description: 'Render 3D scene to texture',
  icon: 'image',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'scene', type: 'scene3d', label: 'Scene', required: true },
    { id: 'camera', type: 'camera3d', label: 'Camera', required: true },
  ],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'depth', type: 'texture', label: 'Depth' },
  ],
  controls: [
    { id: 'width', type: 'number', label: 'Width', default: 512, props: { min: 64, max: 2048 } },
    { id: 'height', type: 'number', label: 'Height', default: 512, props: { min: 64, max: 2048 } },
    { id: 'includeDepth', type: 'toggle', label: 'Include Depth', default: false },
  ],
  tags: ['render', '3d', 'output', 'rasterize', 'draw', 'camera', 'scene'],
  info: {
    overview: 'Takes a scene and a camera and produces a rendered texture output. This is the final step in any 3D pipeline. It can also output a depth buffer for post-processing effects.',
    tips: [
      'Increase width and height for sharper output, but watch performance on complex scenes.',
      'Enable Include Depth to get a depth texture for fog, DOF, or edge-detection effects.',
      'Connect the texture output to an image display or further processing nodes.',
    ],
    pairsWith: ['scene-3d', 'camera-3d'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const scene = ctx.inputs.get('scene') as THREE.Scene | undefined
  const camera = ctx.inputs.get('camera') as THREE.Camera | undefined

  if (!scene || !camera) {
    const outputs = new Map<string, unknown>()
    outputs.set('texture', null)
    outputs.set('depth', null)
    return outputs
  }

  const renderer = getThreeRenderer()
  const width = (ctx.controls.get('width') as number) ?? 512
  const height = (ctx.controls.get('height') as number) ?? 512
  const includeDepth = (ctx.controls.get('includeDepth') as boolean) ?? false

  const outputs = new Map<string, unknown>()

  if (includeDepth) {
    // Render to render target with depth texture support
    const result = renderer.render(scene, camera, ctx.nodeId, width, height, true)
    outputs.set('texture', result.texture) // WebGLTexture
    outputs.set('depth', result.depthTexture ?? null) // WebGLTexture (depth values: 0=near, 1=far)
  } else {
    // Render to default framebuffer (canvas) for better compatibility
    renderer.renderToCanvas(scene, camera, width, height)
    outputs.set('texture', renderer.getCanvas()) // HTMLCanvasElement
    outputs.set('depth', null)
  }

  return outputs
}

export default defineNode({ definition, executor })
