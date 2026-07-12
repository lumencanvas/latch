import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { delayExecutor } from '@/engine/executors/timing'

const definition: NodeDefinition = {
  id: 'delay',
  name: 'Delay',
  version: '1.0.0',
  category: 'timing',
  description: 'Delays a value by specified time',
  icon: 'clock',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [{ id: 'value', type: 'any', label: 'Delayed' }],
  controls: [
    { id: 'delay', type: 'number', label: 'Delay (ms)', default: 500, props: { min: 0, max: 10000 } },
  ],
  info: {
    overview: 'Passes any incoming value through to its output after a configurable delay in milliseconds. Useful for staggering events, creating echo-like timing patterns, or offsetting signals in a chain.',
    tips: [
      'Chain multiple delay nodes with different times to create a spread of staggered triggers from a single source.',
      'Set delay to 0 to use it as a simple pass-through for debugging signal flow.',
      'Feeding a trigger through delay and back into the same chain can create repeating loops, but watch for runaway feedback.',
    ],
    pairsWith: ['trigger', 'interval', 'lfo', 'smooth', 'counter'],
  },
}

export default defineNode({ definition, executor: delayExecutor })
