import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'array-length',
  name: 'Array Length',
  version: '1.0.0',
  category: 'data',
  description: 'Get length of array',
  icon: 'list',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'array', type: 'array', label: 'Array' }],
  outputs: [
    { id: 'length', type: 'number', label: 'Length' },
    { id: 'isEmpty', type: 'boolean', label: 'Is Empty' },
  ],
  controls: [],
  tags: ['array', 'length', 'count', 'size'],
  info: {
    overview: 'Returns the number of elements in an array and a boolean indicating whether the array is empty. This is a lightweight way to check the size of any list before processing it.',
    tips: [
      'Use the isEmpty output with a Gate to skip processing on empty arrays.',
      'Combine with Counter to track how array sizes change over time.',
    ],
    pairsWith: ['array-filter-nulls', 'gate', 'compare', 'counter'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const array = ctx.inputs.get('array')
  const outputs = new Map<string, unknown>()

  if (!Array.isArray(array)) {
    outputs.set('length', 0)
    outputs.set('isEmpty', 1)
    return outputs
  }

  outputs.set('length', array.length)
  outputs.set('isEmpty', array.length === 0 ? 1 : 0)
  return outputs
}

export default defineNode({ definition, executor })
