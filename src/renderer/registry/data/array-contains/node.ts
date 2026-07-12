import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'array-contains',
  name: 'Array Contains',
  version: '1.0.0',
  category: 'data',
  description: 'Check if array contains a value',
  icon: 'search',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'array', type: 'array', label: 'Array' },
    { id: 'value', type: 'any', label: 'Value' },
  ],
  outputs: [
    { id: 'result', type: 'boolean', label: 'Result' },
    { id: 'index', type: 'number', label: 'Index' },
  ],
  controls: [],
  tags: ['array', 'contains', 'includes', 'find', 'search'],
  info: {
    overview: 'Checks whether a given value exists in an array. Returns a boolean result and the index where the value was found, or -1 if it was not found.',
    tips: [
      'Use the index output to feed directly into Array Get when you need the matched element.',
      'Connect the boolean result to a Gate node to conditionally pass data based on membership.',
    ],
    pairsWith: ['array-get', 'array-filter-nulls', 'gate', 'compare'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const array = ctx.inputs.get('array')
  const value = ctx.inputs.get('value')
  const outputs = new Map<string, unknown>()

  if (!Array.isArray(array)) {
    outputs.set('result', 0)
    outputs.set('index', -1)
    return outputs
  }

  // Use JSON stringify for object comparison
  const index = array.findIndex((item) => {
    if (typeof item === 'object' && typeof value === 'object') {
      return JSON.stringify(item) === JSON.stringify(value)
    }
    return item === value
  })

  outputs.set('result', index !== -1 ? 1 : 0)
  outputs.set('index', index)
  return outputs
}

export default defineNode({ definition, executor })
