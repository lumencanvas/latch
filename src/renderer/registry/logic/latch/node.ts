import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { latchExecutor } from '@/engine/executors/utility'

const definition: NodeDefinition = {
  id: 'latch',
  name: 'Latch',
  version: '1.0.0',
  category: 'logic',
  description: 'Flip-flop style latch with set and reset inputs',
  icon: 'toggle-left',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'set', type: 'trigger', label: 'Set' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
  controls: [
    { id: 'initialState', type: 'toggle', label: 'Initial', default: false },
  ],
  tags: ['flip-flop', 'toggle', 'state', 'memory'],
  info: {
    overview: 'A flip-flop that holds a boolean state. The Set trigger turns the output to true, and the Reset trigger turns it back to false. The state persists between evaluations, making it useful for toggle behavior and stateful control.',
    tips: [
      'Use the Initial toggle to choose whether the latch starts in the on or off state.',
      'Connect the output to a gate to create a controllable on/off valve for data flow.',
    ],
    pairsWith: ['gate', 'trigger', 'sample-hold', 'switch'],
  },
}

export default defineNode({ definition, executor: latchExecutor })
