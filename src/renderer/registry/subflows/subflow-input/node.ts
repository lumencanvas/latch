import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { subflowInputExecutor } from '@/engine/executors/subflow'

const definition: NodeDefinition = {
  id: 'subflow-input',
  name: 'Subflow Input',
  version: '1.0.0',
  category: 'subflows',
  description: 'Input port for a subflow',
  icon: 'log-in',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [
    { id: 'value', type: 'any', label: 'Value' },
  ],
  controls: [
    { id: 'portName', type: 'text', label: 'Port Name', default: 'input' },
    { id: 'portType', type: 'select', label: 'Type', default: 'any', props: { options: ['any', 'number', 'string', 'boolean', 'trigger', 'audio', 'texture', 'data'] } },
    { id: 'defaultValue', type: 'text', label: 'Default', default: '' },
  ],
  info: {
    overview: 'Defines an input port on a subflow. When a subflow is used as a node inside another flow, each Subflow Input becomes a visible input on that node. Set the port name and type so the parent flow knows what to connect.',
    tips: [
      'The port name must be unique within the subflow or the inputs will collide.',
      'Setting a default value lets the subflow work even when the parent leaves the input disconnected.',
      'Change the port type from "any" to a specific type to enforce connection compatibility.',
    ],
    pairsWith: ['subflow-output', 'function', 'expression', 'router'],
  },
}

export default defineNode({ definition, executor: subflowInputExecutor })
