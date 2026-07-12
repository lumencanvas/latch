import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { valueDelayExecutor } from '@/engine/executors/code'

const definition: NodeDefinition = {
  id: 'value-delay',
  name: 'Value Delay',
  version: '1.0.0',
  category: 'code',
  description: 'Delay value by N frames',
  icon: 'timer',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'any', label: 'Input' },
  ],
  outputs: [
    { id: 'output', type: 'any', label: 'Output' },
  ],
  controls: [
    { id: 'frames', type: 'number', label: 'Frames', default: 1, props: { min: 1, max: 300 } },
  ],
  info: {
    overview: 'Delays the pass-through of any value by a configurable number of frames. The node buffers incoming values and releases them after the specified frame count. This is useful for creating time-offset effects or comparing a signal with its past self.',
    tips: [
      'Set frames to 1 to get the previous frame value, which is useful for computing velocity or change detection.',
      'Chain several value-delay nodes at different frame counts to build a visual trail or echo effect.',
      'Higher frame counts consume more memory, so keep the delay under 60 frames for complex flows.',
    ],
    pairsWith: ['subtract', 'smooth', 'compare', 'expression'],
  },
}

export default defineNode({ definition, executor: valueDelayExecutor })
