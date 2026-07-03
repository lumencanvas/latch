import type { NodeDefinition } from '../../types'

import { markRaw } from 'vue'
import MonitorNode from './MonitorNode.vue'

export const monitorNode: NodeDefinition = {
  id: 'monitor',
  component: markRaw(MonitorNode),
  name: 'Monitor',
  version: '1.0.0',
  category: 'debug',
  description: 'Display input values',
  icon: 'eye',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [{ id: 'value', type: 'any', label: 'Pass' }],
  controls: [],
  info: {
    overview: 'Displays the current value of any input directly on the node. It also passes the value through to its output, so you can insert it inline without breaking a connection. The simplest way to see what a signal is doing.',
    tips: [
      'Insert a Monitor between two connected nodes to inspect values without rewiring anything.',
      'Works with any data type including numbers, strings, booleans, and objects.',
    ],
    pairsWith: ['console', 'graph', 'oscilloscope', 'changed', 'type-of'],
  },
}
