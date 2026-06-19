import type { NodeDefinition } from '../types'

export const counterNode: NodeDefinition = {
  id: 'counter',
  name: 'Counter',
  version: '1.0.0',
  category: 'code',
  description: 'Increment/decrement counter with min/max',
  icon: 'list-ordered',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'increment', type: 'trigger', label: 'Increment' },
    { id: 'decrement', type: 'trigger', label: 'Decrement' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
    { id: 'set', type: 'number', label: 'Set Value' },
  ],
  outputs: [
    { id: 'count', type: 'number', label: 'Count' },
    { id: 'normalized', type: 'number', label: 'Normalized' },
    { id: 'atMin', type: 'boolean', label: 'At Min' },
    { id: 'atMax', type: 'boolean', label: 'At Max' },
  ],
  controls: [
    { id: 'min', type: 'number', label: 'Min', default: 0 },
    { id: 'max', type: 'number', label: 'Max', default: 100 },
    { id: 'step', type: 'number', label: 'Step', default: 1 },
    { id: 'wrap', type: 'toggle', label: 'Wrap Around', default: false },
  ],
  tags: ['counter', 'count', 'increment', 'decrement'],
  info: {
    overview: 'Maintains an integer count that responds to increment, decrement, and reset triggers. The normalized output gives a 0-1 value based on the min/max range. Wrap mode makes the counter loop back to the opposite bound when it exceeds a limit.',
    tips: [
      'Connect a trigger node to increment for a manual step sequencer.',
      'Enable wrap mode and use normalized output to drive cyclic animations.',
      'Wire atMin and atMax to toggle or gate nodes to build conditional logic around boundaries.',
    ],
    pairsWith: ['trigger', 'gate', 'switch', 'interval'],
  },
}
