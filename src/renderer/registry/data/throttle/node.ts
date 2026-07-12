import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { throttleExecutor } from '@/engine/executors/utility'

const definition: NodeDefinition = {
  id: 'throttle',
  name: 'Throttle',
  version: '1.0.0',
  category: 'data',
  description: 'Limit how often value is output',
  icon: 'gauge',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [{ id: 'result', type: 'any', label: 'Result' }],
  controls: [
    { id: 'interval', type: 'number', label: 'Interval (ms)', default: 100 },
  ],
  tags: ['throttle', 'limit', 'rate', 'frequency'],
  info: {
    overview: 'Limits how frequently a value passes through by enforcing a minimum time interval between outputs. Unlike debounce, throttle emits at regular intervals even while the input keeps changing. Good for rate-limiting high-frequency data.',
    tips: [
      'Set the interval to match your target frame rate when throttling visual updates.',
      'Use Debounce instead if you only care about the final settled value after input stops.',
    ],
    pairsWith: ['debounce', 'counter', 'expression', 'monitor'],
  },
}

export default defineNode({ definition, executor: throttleExecutor })
