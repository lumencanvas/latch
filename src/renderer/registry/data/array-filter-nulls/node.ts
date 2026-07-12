import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'array-filter-nulls',
  name: 'Filter Nulls',
  version: '1.0.0',
  category: 'data',
  description: 'Remove null/undefined/empty values from array',
  icon: 'filter-x',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'array', type: 'array', label: 'Array' }],
  outputs: [
    { id: 'result', type: 'array', label: 'Result' },
    { id: 'removed', type: 'number', label: 'Removed' },
  ],
  controls: [
    { id: 'removeEmpty', type: 'toggle', label: 'Remove Empty Strings', default: true },
  ],
  tags: ['array', 'filter', 'null', 'clean', 'compact'],
  info: {
    overview: 'Removes null, undefined, and optionally empty string values from an array. Returns the cleaned array along with a count of how many elements were removed. Useful for sanitizing data before further processing.',
    tips: [
      'Enable the Remove Empty Strings toggle when working with user input or CSV data.',
      'Chain this before Array Length to get an accurate count of meaningful values.',
    ],
    pairsWith: ['array-length', 'array-unique', 'json-parse', 'to-array'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const array = ctx.inputs.get('array')
  const removeEmpty = (ctx.controls.get('removeEmpty') as boolean) ?? true
  const outputs = new Map<string, unknown>()

  if (!Array.isArray(array)) {
    outputs.set('result', [])
    outputs.set('removed', 0)
    return outputs
  }

  const originalLength = array.length
  const filtered = array.filter((item) => {
    if (item === null || item === undefined) return false
    if (removeEmpty && typeof item === 'string' && item === '') return false
    return true
  })

  outputs.set('result', filtered)
  outputs.set('removed', originalLength - filtered.length)
  return outputs
}

export default defineNode({ definition, executor })
