import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { toggleExecutor } from '@/engine/executors/code'

const definition: NodeDefinition = {
  id: 'toggle',
  name: 'Toggle',
  version: '1.0.0',
  category: 'code',
  description: 'Flip-flop toggle with set/reset',
  icon: 'toggle-left',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'trigger', type: 'trigger', label: 'Toggle' },
    { id: 'set', type: 'trigger', label: 'Set' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [
    { id: 'value', type: 'boolean', label: 'Value' },
    { id: 'inverted', type: 'boolean', label: 'Inverted' },
    { id: 'number', type: 'number', label: 'Number' },
  ],
  controls: [
    { id: 'initial', type: 'toggle', label: 'Initial Value', default: false },
  ],
  info: {
    overview: 'A flip-flop that alternates between true and false each time its trigger fires. Separate set and reset inputs allow forcing the state directly. The number output emits 1 or 0, which is convenient for math operations downstream.',
    tips: [
      'Use the inverted output to drive two mutually exclusive signal paths without an extra node.',
      'Wire a beat-detect trigger into the toggle input for rhythm-synced on/off effects.',
      'Combine with a gate node to let signals through only while the toggle is active.',
    ],
    pairsWith: ['trigger', 'gate', 'beat-detect', 'switch'],
  },
}

export default defineNode({ definition, executor: toggleExecutor })
