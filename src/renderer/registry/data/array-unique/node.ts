import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'array-unique',
  name: 'Array Unique',
  version: '1.0.0',
  category: 'data',
  description: 'Remove duplicate values',
  icon: 'fingerprint',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'array', type: 'array', label: 'Array' }],
  outputs: [{ id: 'result', type: 'array', label: 'Result' }],
  controls: [],
  tags: ['array', 'unique', 'distinct', 'dedupe'],
  info: {
    overview: 'Removes duplicate values from an array, keeping only the first occurrence of each value. Useful for deduplicating lists of IDs, tags, or any repeated data.',
    tips: [
      'Apply this after Array Push when accumulating values that may repeat.',
      'Combine with Array Length to compare the count before and after deduplication.',
    ],
    pairsWith: ['array-push', 'array-length', 'array-sort', 'array-filter-nulls'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const array = ctx.inputs.get('array')

  if (!Array.isArray(array)) {
    return new Map<string, unknown>([['result', []]])
  }

  // Use JSON stringify for object comparison
  const seen = new Set<string>()
  const result = array.filter((item) => {
    const key = typeof item === 'object' ? JSON.stringify(item) : String(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return new Map<string, unknown>([['result', result]])
}

export default defineNode({ definition, executor })
