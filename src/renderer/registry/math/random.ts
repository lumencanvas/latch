import type { NodeDefinition } from '../types'

export const randomNode: NodeDefinition = {
  id: 'random',
  name: 'Random',
  version: '1.0.0',
  category: 'math',
  description: 'Generate random number',
  icon: 'shuffle',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'seed', type: 'number', label: 'Seed' }],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [
    { id: 'min', type: 'number', label: 'Min', default: 0 },
    { id: 'max', type: 'number', label: 'Max', default: 1 },
  ],
  tags: ['random', 'noise', 'rng', 'probabilistic', 'chance', 'generator', 'jitter', 'dice'],
  info: {
    overview: 'Generates a random number within a configurable minimum and maximum range. An optional seed input allows for reproducible random sequences. Each evaluation produces a new random value unless the seed is held constant.',
    tips: [
      'Set a fixed seed to get the same random sequence every time for testing.',
      'Use clamp after this node if downstream logic requires strict bounds.',
    ],
    pairsWith: ['clamp', 'quantize', 'map-range', 'trigger'],
  },
}
