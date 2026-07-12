import { markRaw } from 'vue'
import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { knobExecutor } from '@/engine/executors/input'
import KnobNode from './KnobNode.vue'

const definition: NodeDefinition = {
  id: 'knob',
  component: markRaw(KnobNode),
  name: 'Knob',
  version: '1.0.0',
  category: 'inputs',
  description: 'Rotary knob control (0-1)',
  icon: 'disc',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [{ id: 'value', type: 'number', label: 'Value' }],
  controls: [
    { id: 'value', type: 'slider', label: 'Value', default: 0.5, exposable: true, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'min', type: 'number', label: 'Min', default: 0 },
    { id: 'max', type: 'number', label: 'Max', default: 1 },
  ],
  info: {
    overview: 'A rotary knob that outputs a numeric value within a configurable range. The default range is 0 to 1 but can be adjusted with the min and max controls. The knob value can be exposed for direct manipulation on the node surface.',
    tips: [
      'Set custom min/max to output frequency or gain values directly without a downstream map-range.',
      'Use the exposable option to adjust the knob without opening the node inspector.',
      'Knobs work well for parameters you rotate slowly, while sliders suit fast sweeps.',
    ],
    pairsWith: ['gain', 'filter', 'oscillator', 'map-range'],
  },
}

export default defineNode({ definition, executor: knobExecutor })
