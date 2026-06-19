import type { NodeDefinition } from '../types'

export const constantNode: NodeDefinition = {
  id: 'constant',
  name: 'Constant',
  version: '1.0.0',
  category: 'inputs',
  description: 'Output a constant value',
  icon: 'hash',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [{ id: 'value', type: 'number', label: 'Value' }],
  controls: [
    { id: 'value', type: 'number', label: 'Value', default: 0, exposable: true },
  ],
  tags: ['constant', 'value', 'number', 'fixed', 'literal', 'source'],
  info: {
    overview: 'Outputs a single fixed numeric value that does not change over time. It is the simplest way to feed a known number into other nodes. The value control can be exposed for quick adjustment without opening the node.',
    tips: [
      'Use constants for thresholds or multipliers that you want to label clearly in the flow.',
      'Prefer a slider or knob instead when you need to tweak a value interactively during playback.',
    ],
    pairsWith: ['multiply', 'add', 'expression', 'map-range'],
  },
}
