import { defineNode } from '@/engine/defineNode'
import { parseLooseJson, sameValue } from '../valueHelpers'
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
  controls: [
    { id: 'value', type: 'text', label: 'Value (if unwired)', default: '', props: { placeholder: 'JSON or text' } },
  ],
  tags: ['array', 'contains', 'includes', 'find', 'search'],
  info: {
    overview: 'Checks whether a given value exists in an array. Returns a boolean result and the index where the value was found, or -1 if it was not found.',
    tips: [
      'Index is -1 when the value is not found (and Array Get treats -1 as the LAST element), so gate any Array Get lookup with the Result output.',
      'Matching is structural: NaN finds NaN and plain objects/arrays match by content; 1 and "1" are different.',
      'Connect the boolean result to a Gate node to conditionally pass data based on membership.',
    ],
    pairsWith: ['array-get', 'array-filter-nulls', 'gate', 'compare'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const array = ctx.inputs.get('array')
  const value = ctx.inputs.get('value') ?? parseLooseJson(ctx.controls.get('value'))
  const outputs = new Map<string, unknown>()

  if (!Array.isArray(array)) {
    outputs.set('result', 0)
    outputs.set('index', -1)
    return outputs
  }

  const index = array.findIndex((item) => sameValue(item, value))

  outputs.set('result', index !== -1 ? 1 : 0)
  outputs.set('index', index)
  return outputs
}

export default defineNode({ definition, executor })
