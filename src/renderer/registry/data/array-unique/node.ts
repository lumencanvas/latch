import { defineNode } from '@/engine/defineNode'
import { isPlainData, safeStringify } from '../valueHelpers'
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

  // Primitives dedupe by SameValueZero (keeps 1 and '1', null and 'null' distinct; NaN
  // dedupes). Plain objects/arrays dedupe by JSON content in their OWN key space, so an
  // object never collides with a string that happens to equal its JSON. Non-serializable
  // values (cycles, textures) fall back to identity.
  const seenPrim = new Set<unknown>()
  const seenJson = new Set<string>()
  const result = array.filter((item) => {
    if (item !== null && typeof item === 'object') {
      const key = isPlainData(item) ? safeStringify(item) : undefined
      if (key === undefined) {
        if (seenPrim.has(item)) return false
        seenPrim.add(item)
        return true
      }
      if (seenJson.has(key)) return false
      seenJson.add(key)
      return true
    }
    if (seenPrim.has(item)) return false
    seenPrim.add(item)
    return true
  })

  return new Map<string, unknown>([['result', result]])
}

export default defineNode({ definition, executor })
