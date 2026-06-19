import type { NodeDefinition } from '../types'

export const blurNode: NodeDefinition = {
  id: 'blur',
  name: 'Blur',
  version: '1.0.0',
  category: 'visual',
  description: 'Apply Gaussian blur to texture',
  icon: 'droplet',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'radius', type: 'number', label: 'Radius' },
  ],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    { id: 'radius', type: 'slider', label: 'Radius', default: 5, props: { min: 0, max: 50, step: 0.5 } },
    { id: 'passes', type: 'number', label: 'Passes', default: 2, props: { min: 1, max: 10 } },
  ],
  tags: ['blur', 'gaussian', 'bloom', 'glow', 'soften', 'defocus', 'depth of field', 'effect'],
  info: {
    overview: 'Applies a Gaussian blur to the input texture. The radius controls how far the blur spreads, and the passes control determines quality. More passes produce a smoother result at the cost of performance.',
    tips: [
      'Keep passes at 2 or 3 for a good balance between quality and speed; going above 5 rarely looks different.',
      'Animate the radius with an LFO for a pulsing depth-of-field effect.',
      'Use a small blur radius as a noise reduction step before feeding into edge detection or color correction.',
    ],
    pairsWith: ['shader', 'blend', 'color-correction', 'lfo', 'displacement'],
  },
}
