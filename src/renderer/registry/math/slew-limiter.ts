import type { NodeDefinition } from '../types'

export const slewLimiterNode: NodeDefinition = {
  id: 'slew-limiter',
  name: 'Slew Limiter',
  version: '1.0.0',
  category: 'math',
  description: 'Limit how fast a value can change — separate rise/fall rates (units per second).',
  icon: 'trending-up',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [{ id: 'value', type: 'number', label: 'Value' }],
  controls: [
    { id: 'rise', type: 'number', label: 'Rise Rate (/s)', default: 1, props: { min: 0, max: 1000, step: 0.1 } },
    { id: 'fall', type: 'number', label: 'Fall Rate (/s)', default: 1, props: { min: 0, max: 1000, step: 0.1 } },
  ],
  tags: ['slew', 'rate limit', 'smooth', 'ramp', 'portamento', 'glide', 'math'],
  info: {
    overview:
      'Caps the rate at which the output can move toward the input. Rising and falling can have different speeds, so you get asymmetric glide / portamento. Unlike Smooth or Spring it moves at a constant rate, not an eased curve.',
    tips: [
      'Use a fast Rise and slow Fall for envelope-follower-style decay.',
      'Pulse Reset to jump instantly to the current input.',
    ],
    pairsWith: ['slider', 'audio-analyzer', 'spring', 'transform-2d'],
  },
}
