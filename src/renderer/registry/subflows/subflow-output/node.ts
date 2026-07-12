import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { subflowOutputExecutor } from '@/engine/executors/subflow'

const definition: NodeDefinition = {
  id: 'subflow-output',
  name: 'Subflow Output',
  version: '1.0.0',
  category: 'subflows',
  description: 'Output port for a subflow',
  icon: 'log-out',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
  ],
  outputs: [],
  controls: [
    { id: 'portName', type: 'text', label: 'Port Name', default: 'output' },
    { id: 'portType', type: 'select', label: 'Type', default: 'any', props: { options: ['any', 'number', 'string', 'boolean', 'trigger', 'audio', 'texture', 'data'] } },
  ],
  info: {
    overview: 'Defines an output port on a subflow. When a subflow is used as a node inside another flow, each Subflow Output becomes a visible output on that node. Pair it with one or more Subflow Inputs to build reusable processing blocks.',
    tips: [
      'Give each output a descriptive port name so the parent flow is easy to read.',
      'You can have multiple outputs to return different signals from the same subflow.',
    ],
    pairsWith: ['subflow-input', 'function', 'expression', 'router'],
  },
}

export default defineNode({ definition, executor: subflowOutputExecutor })
