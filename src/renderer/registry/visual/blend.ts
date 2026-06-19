import type { NodeDefinition } from '../types'

export const blendNode: NodeDefinition = {
  id: 'blend',
  name: 'Blend',
  version: '1.0.0',
  category: 'visual',
  description: 'Blend two textures together',
  icon: 'layers',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'texture', label: 'A' },
    { id: 'b', type: 'texture', label: 'B' },
    { id: 'mix', type: 'number', label: 'Mix' },
  ],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    { id: 'mix', type: 'slider', label: 'Mix', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'mode', type: 'select', label: 'Mode', default: 'normal', props: { options: ['normal', 'add', 'multiply', 'screen', 'overlay'] } },
  ],
  tags: ['blend', 'mix', 'composite', 'layer', 'crossfade', 'merge', 'add', 'multiply', 'screen', 'overlay'],
  info: {
    overview: 'Combines two texture inputs into a single output using a selectable blend mode and a mix slider. Supports normal, add, multiply, screen, and overlay modes. This is the standard way to layer visuals together.',
    tips: [
      'Animate the mix value with an LFO to crossfade between two sources rhythmically.',
      'Add mode is useful for combining bright elements on dark backgrounds without washing out the image.',
      'Chain multiple blend nodes to composite more than two layers together.',
    ],
    pairsWith: ['shader', 'webcam', 'color-correction', 'lfo', 'image-loader'],
  },
}
