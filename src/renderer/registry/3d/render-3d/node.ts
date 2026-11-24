import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getThreeRenderer, THREE } from '@/services/visual/ThreeRenderer'
import { defineNodeState } from '@/engine/nodeState'

/** Per-node output canvas (copy of the shared renderer canvas). Freed on delete / Stop. */
const outputCanvases = defineNodeState<HTMLCanvasElement>({
  label: 'render-3d-output',
  dispose: (canvas) => {
    canvas.width = 0
    canvas.height = 0
  },
})

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
    // The renderer's canvas is ONE shared element: with two Render 3D nodes, the second render
    // overwrote the first's output before its downstream consumers ran. Copy into a per-node
    // canvas (a GPU-side blit) so each node's output is stable for the rest of the frame.
    const src = renderer.getCanvas()
    const out = outputCanvases.getOrCreate(ctx.nodeId, () => document.createElement('canvas'))
    if (out.width !== src.width) out.width = src.width
    if (out.height !== src.height) out.height = src.height
    const c2d = out.getContext('2d')
    if (c2d) {
      c2d.clearRect(0, 0, out.width, out.height)
      c2d.drawImage(src, 0, 0)
      outputs.set('texture', out) // HTMLCanvasElement
    } else {
      outputs.set('texture', src)
    }
    outputs.set('depth', null)
  }

  return outputs
}

export default defineNode({ definition, executor })
