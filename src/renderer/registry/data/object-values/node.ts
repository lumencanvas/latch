import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'object-values',
  name: 'Object Values',
  version: '1.0.0',
  category: 'data',
  description: 'Get array of object values',
  icon: 'list-collapse',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'object', type: 'data', label: 'Object' }],
  outputs: [
    { id: 'values', type: 'array', label: 'Values' },
    { id: 'count', type: 'number', label: 'Count' },
  ],
  controls: [],
  tags: ['object', 'values', 'enumerate'],
  info: {
    overview: 'Extracts all property values from an object and returns them as an array. Also outputs the total count of values. Useful when you need the data from an object without its keys.',
    tips: [
      'Use this with Array Sort to rank the values extracted from an object.',
      'Combine with Object Keys to create parallel arrays of keys and values for processing.',
    ],
    pairsWith: ['object-keys', 'object-entries', 'array-sort', 'array-length'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const obj = ctx.inputs.get('object')
  const outputs = new Map<string, unknown>()

  if (obj === null || obj === undefined || typeof obj !== 'object' || Array.isArray(obj)) {
    outputs.set('values', [])
    outputs.set('count', 0)
    return outputs
  }

  const values = Object.values(obj)
  outputs.set('values', values)
  outputs.set('count', values.length)
  return outputs
}

export default defineNode({ definition, executor })
