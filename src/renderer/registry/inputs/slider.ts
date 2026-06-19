import type { NodeDefinition } from '../types'

export const sliderNode: NodeDefinition = {
  id: 'slider',
  name: 'Slider',
  version: '1.0.0',
  category: 'inputs',
  description: 'Slider control (0-1)',
  icon: 'sliders-horizontal',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [{ id: 'value', type: 'number', label: 'Value' }],
  controls: [
    { id: 'value', type: 'slider', label: 'Value', default: 0.5, exposable: true, props: { min: 0, max: 1, step: 0.01 } },
  ],
  tags: ['slider', 'fader', 'value', 'range', 'control', 'input'],
  info: {
    overview: 'A horizontal slider that outputs a normalized 0-to-1 value. It provides fine-grained control with a step size of 0.01 by default. The value can be exposed on the node surface for quick access.',
    tips: [
      'Feed the slider into a map-range node to rescale the 0-1 output to any target range.',
      'Expose the slider value to adjust it without opening the node, which speeds up live tweaking.',
      'Connect to a smooth node to filter out abrupt jumps when dragging quickly.',
    ],
    pairsWith: ['map-range', 'smooth', 'gain', 'lerp'],
  },
}
