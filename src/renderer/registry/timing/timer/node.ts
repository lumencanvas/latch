import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { timerExecutor } from '@/engine/executors/timing'

const definition: NodeDefinition = {
  id: 'timer',
  name: 'Timer',
  version: '1.0.0',
  category: 'timing',
  description: 'Stopwatch timer with start/stop/reset',
  icon: 'timer',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'start', type: 'trigger', label: 'Start' },
    { id: 'stop', type: 'trigger', label: 'Stop' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [
    { id: 'elapsed', type: 'number', label: 'Elapsed (s)' },
    { id: 'running', type: 'boolean', label: 'Running' },
  ],
  controls: [],
  info: {
    overview: 'A stopwatch-style timer that counts elapsed seconds when running. It can be started, stopped, and reset via trigger inputs. The running output indicates whether the timer is currently active.',
    tips: [
      'Use the elapsed output with a clamp node to create a one-shot animation that plays for a fixed duration.',
      'Send a reset trigger followed by a start trigger to cleanly restart the timer from zero.',
      'Combine with an expression node to convert elapsed seconds into a countdown by subtracting from a target duration.',
    ],
    pairsWith: ['clamp', 'expression', 'start', 'trigger', 'map-range'],
  },
}

export default defineNode({ definition, executor: timerExecutor })
