import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { routerExecutor } from '@/engine/executors/utility'

const definition: NodeDefinition = {
  id: 'router',
  name: 'Router',
  version: '1.0.0',
  category: 'data',
  description: 'Route value to one of multiple outputs based on index',
  icon: 'git-branch',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'route', type: 'number', label: 'Route' },
  ],
  outputs: [
    { id: 'out0', type: 'any', label: 'Out 0' },
    { id: 'out1', type: 'any', label: 'Out 1' },
    { id: 'out2', type: 'any', label: 'Out 2' },
    { id: 'out3', type: 'any', label: 'Out 3' },
  ],
  controls: [],
  tags: ['router', 'demux', 'switch', 'route', 'split'],
  info: {
    overview: 'Routes an input value to one of four outputs based on a numeric route index. Only the selected output receives the value; all others remain inactive. Useful for demultiplexing data streams or directing flow based on state.',
    tips: [
      'Connect a Counter node to the route input to cycle through outputs sequentially.',
      'Use an Expression node to compute the route index dynamically from input data.',
    ],
    pairsWith: ['counter', 'select', 'switch', 'gate'],
  },
}

export default defineNode({ definition, executor: routerExecutor })
