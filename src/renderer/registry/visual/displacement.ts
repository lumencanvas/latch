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
}
