import type { NodeDefinition } from '../types'

export const derivativeNode: NodeDefinition = {
  id: 'derivative',
  name: 'Derivative',
  version: '1.0.0',
  category: 'math',
  description: 'Rate of change of the input signal per second (velocity).',
  icon: 'activity',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value' }],
  outputs: [{ id: 'derivative', type: 'number', label: 'd/dt' }],
  controls: [],
  tags: ['derivative', 'rate of change', 'velocity', 'slope', 'difference', 'math'],
  info: {
    overview:
      'Outputs how fast the input is changing, per second (the discrete time derivative). Positive when rising, negative when falling, zero when steady. Frame-rate independent.',
    tips: [
      'Feed a slider or audio level in to detect sudden jumps or motion.',
      'Pair with Slew Limiter or Smooth first if the input is noisy, since differentiation amplifies noise.',
    ],
    pairsWith: ['slider', 'audio-analyzer', 'slew-limiter', 'integral'],
  },
}
