import type { NodeDefinition } from '../types'

export const integralNode: NodeDefinition = {
  id: 'integral',
  name: 'Integral',
  version: '1.0.0',
  category: 'math',
  description: 'Time-accumulated sum of the input (with optional clamping).',
  icon: 'sigma',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [{ id: 'integral', type: 'number', label: 'Integral' }],
  controls: [
    { id: 'min', type: 'number', label: 'Clamp Min', default: 0 },
    { id: 'max', type: 'number', label: 'Clamp Max', default: 0 },
  ],
  tags: ['integral', 'accumulate', 'sum', 'area', 'running total', 'math'],
  info: {
    overview:
      'Accumulates the input over time (the discrete time integral). A constant input ramps steadily; a velocity input integrates to a position. Frame-rate independent. Set Clamp Max greater than Clamp Min to bound the result; leave them equal (e.g. both 0) for no clamp.',
    tips: [
      'Integrate a Derivative (or velocity) to recover position.',
      'Pulse Reset to zero the accumulator.',
    ],
    pairsWith: ['derivative', 'slider', 'trigger', 'transform-2d'],
  },
}
