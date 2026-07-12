import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { timeExecutor } from '@/engine/executors/input'

const definition: NodeDefinition = {
  id: 'time',
  name: 'Time',
  version: '1.0.0',
  category: 'timing',
  description: 'Current time and frame info',
  icon: 'clock',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [
    { id: 'time', type: 'number', label: 'Time' },
    { id: 'delta', type: 'number', label: 'Delta' },
    { id: 'frame', type: 'number', label: 'Frame' },
  ],
  controls: [],
  info: {
    overview: 'Outputs the current elapsed time in seconds, the delta time between frames, and the current frame number. These values update every frame and are the primary way to drive continuous animations.',
    tips: [
      'Use the delta output to make animations frame-rate independent by multiplying movement values by it.',
      'The time output grows without bound, so use modulo via an expression node if you need a repeating cycle.',
      'Feed the frame output into a modulo expression to trigger something every Nth frame.',
    ],
    pairsWith: ['expression', 'shader', 'lfo', 'smooth', 'map-range'],
  },
}

export default defineNode({ definition, executor: timeExecutor })
