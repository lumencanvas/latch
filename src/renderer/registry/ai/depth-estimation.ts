import type { NodeDefinition } from '../types'

export const depthEstimationNode: NodeDefinition = {
  id: 'depth-estimation',
  name: 'Depth Estimation',
  version: '1.0.0',
  category: 'ai',
  description: 'Estimate a per-pixel depth map from any image/video feed (Depth-Anything).',
  icon: 'layers',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'source', type: 'texture', label: 'Source' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Depth' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    {
      id: 'model',
      type: 'select',
      label: 'Model',
      default: 'Xenova/depth-anything-small-hf',
      props: {
        options: [
          { value: 'Xenova/depth-anything-small-hf', label: 'Depth-Anything Small (~50 MB)' },
          { value: 'onnx-community/depth-anything-v2-small', label: 'Depth-Anything V2 Small' },
          { value: 'Xenova/dpt-hybrid-midas', label: 'DPT Hybrid MiDaS (larger)' },
        ],
      },
    },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 30, props: { min: 1, max: 120, step: 1 } },
    { id: 'colorize', type: 'toggle', label: 'Colorize', default: false },
  ],
  tags: ['depth', 'depth estimation', 'midas', 'depth anything', '3d', 'parallax', 'ai', 'vision'],
  info: {
    overview:
      'Runs monocular depth estimation in the browser and outputs the depth map as a texture (white = near, black = far). Enable Colorize for a jet-style heatmap. The first run downloads the model; raise Frame Interval if it stutters on live video.',
    tips: [
      'Feed the depth texture into a Displacement or Shader node for 2D→3D parallax.',
      'Use a higher Frame Interval (or the Trigger input) for heavier models on a live feed.',
    ],
    pairsWith: ['webcam', 'displacement', 'shader', 'main-output'],
  },
}
