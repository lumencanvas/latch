import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { randomExecutor } from '@/engine/executors/math'

const definition: NodeDefinition = {
  id: 'random',
  name: 'Random',
  version: '1.0.0',
  category: 'math',
  description: 'Generate random number',
  icon: 'shuffle',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'seed', type: 'number', label: 'Seed' },
    { id: 'trigger', type: 'trigger', label: 'Trigger' },
  ],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [
    { id: 'min', type: 'number', label: 'Min', default: 0 },
    { id: 'max', type: 'number', label: 'Max', default: 1 },
    { id: 'mode', type: 'select', label: 'Mode', default: 'every-frame', props: { options: ['every-frame', 'on-trigger'] } },
    { id: 'integer', type: 'toggle', label: 'Integers', default: false },
  ],
  tags: ['random', 'noise', 'rng', 'probabilistic', 'chance', 'generator', 'jitter', 'dice'],
  info: {
    overview: 'Generates a random number between Min and Max. In every-frame mode a new value is drawn each frame (noise); in on-trigger mode one value is held until the Trigger input fires. A connected Seed makes the output a deterministic function of the seed (the same seed always gives the same value). Enable Integers for whole numbers from Min to Max inclusive.',
    tips: [
      'Use on-trigger mode with a Metronome beat to pick a new random value on every beat.',
      'Drive Seed with a Counter for a reproducible sequence: each count maps to a fixed value.',
      'Enable Integers to roll dice or pick a random index (e.g. Min 0, Max 3 for Select).',
    ],
    pairsWith: ['clamp', 'quantize', 'map-range', 'trigger'],
  },
}

export default defineNode({ definition, executor: randomExecutor })
