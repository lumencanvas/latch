import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { debounceExecutor } from '@/engine/executors/utility'

const definition: NodeDefinition = {
  id: 'debounce',
  name: 'Debounce',
  version: '1.0.0',
  category: 'data',
  description: 'Only output value after it stops changing for a period',
  icon: 'timer',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [{ id: 'result', type: 'any', label: 'Result' }],
  controls: [
    { id: 'delay', type: 'number', label: 'Delay (ms)', default: 300 },
  ],
  tags: ['debounce', 'delay', 'wait', 'settle'],
  info: {
    overview: 'Delays passing a value through until it stops changing for a specified duration. Only the most recent value is emitted once the quiet period elapses. Ideal for handling rapid user input or noisy sensor data.',
    tips: [
      'Set the delay to 300ms or more for text input to avoid excessive downstream updates.',
      'Use Throttle instead if you need regular updates at a fixed interval rather than waiting for silence.',
    ],
    pairsWith: ['throttle', 'http-request', 'expression', 'gate'],
  },
}

export default defineNode({ definition, executor: debounceExecutor })
