import type { NodeDefinition } from '../types'

export const displacementNode: NodeDefinition = {
  id: 'displacement',
  name: 'Displacement',
  version: '1.0.0',
  category: 'visual',
  description: 'Displace texture using displacement map',
  icon: 'move',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'displacement', type: 'texture', label: 'Displacement Map' },
    { id: 'strength', type: 'number', label: 'Strength' },
  ],
  outputs: [{ id: 'texture', type: 'texture', label: 'Texture' }],
  controls: [
    { id: 'strength', type: 'slider', label: 'Strength', default: 0.1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'channel', type: 'select', label: 'Channel', default: 'rg', props: { options: ['r', 'rg', 'rgb'] } },
  ],
  tags: ['displacement', 'displace', 'warp', 'distortion', 'glitch', 'liquify', 'map', 'effect'],
  info: {
    overview: 'Warps the input texture by using a second texture as a displacement map. The brightness values of the displacement map shift pixel positions in the source. Strength controls how far pixels are moved, and channel selects which map channels drive the displacement axes.',
    tips: [
      'Feed a noise shader into the displacement map input for organic, fluid-like distortion.',
      'Animate the strength value with an LFO to pulse the distortion in and out.',
      'The rg channel mode gives independent horizontal and vertical displacement; use r for horizontal only.',
    ],
    pairsWith: ['shader', 'blur', 'webcam', 'lfo', 'blend'],
  },
}
