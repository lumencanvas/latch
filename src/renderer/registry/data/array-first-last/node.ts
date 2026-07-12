import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'array-first-last',
  name: 'Array First/Last',
  version: '1.0.0',
  category: 'data',
  description: 'Get first and last elements',
  icon: 'move-horizontal',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'array', type: 'array', label: 'Array' }],
  outputs: [
    { id: 'first', type: 'any', label: 'First' },
    { id: 'last', type: 'any', label: 'Last' },
    { id: 'length', type: 'number', label: 'Length' },
  ],
  controls: [],
  tags: ['array', 'first', 'last', 'head', 'tail'],
  info: {
    overview: 'Extracts the first and last elements from an array and outputs them individually. Also provides the array length. This is a quick way to peek at the boundaries of a list without indexing manually.',
    tips: [
      'Use this after Array Sort to grab the minimum and maximum values in one step.',
      'Check the length output to guard against empty arrays before using the element values.',
    ],
    pairsWith: ['array-sort', 'array-reverse', 'array-length', 'compare'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const array = ctx.inputs.get('array')
  const outputs = new Map<string, unknown>()

  if (!Array.isArray(array) || array.length === 0) {
    outputs.set('first', undefined)
    outputs.set('last', undefined)
    outputs.set('length', 0)
    return outputs
  }

  outputs.set('first', array[0])
  outputs.set('last', array[array.length - 1])
  outputs.set('length', array.length)
  return outputs
}

export default defineNode({ definition, executor })
