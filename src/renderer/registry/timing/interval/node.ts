import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { intervalExecutor } from '@/engine/executors/timing'

const definition: NodeDefinition = {
  id: 'interval',
  name: 'Interval',
  version: '1.0.0',
  category: 'timing',
  description: 'Fires at regular intervals',
  icon: 'timer',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'enabled', type: 'boolean', label: 'Enabled' }],
  outputs: [{ id: 'trigger', type: 'trigger', label: 'Trigger' }],
  controls: [
    { id: 'interval', type: 'number', label: 'Interval (ms)', default: 1000, props: { min: 10, max: 60000 } },
    { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
  ],
  info: {
    overview: 'Emits a trigger output repeatedly at a fixed time interval. The interval is adjustable in milliseconds and can be toggled on and off. This is the go-to node for polling, periodic updates, or any repeating action.',
    tips: [
      'Very short intervals (under 50ms) can cause performance issues if the downstream chain is expensive.',
      'Use the enabled input to gate the interval from another node rather than removing connections.',
      'Pair with counter to build a simple clock that tracks how many ticks have elapsed.',
    ],
    pairsWith: ['counter', 'delay', 'trigger', 'toggle', 'expression'],
  },
}

export default defineNode({ definition, executor: intervalExecutor })
