import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { render3DExecutor } from '@/engine/executors/3d'

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

export default defineNode({ definition, executor: render3DExecutor })
