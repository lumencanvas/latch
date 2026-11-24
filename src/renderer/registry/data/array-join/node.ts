import { defineNode } from '@/engine/defineNode'
import { toStr, unescapeSeparator } from '../../string/strHelpers'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'array-join',
  name: 'Array Join',
  version: '1.0.0',
  category: 'data',
  description: 'Join array elements into string',
  icon: 'link',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'array', type: 'array', label: 'Array' }],
  outputs: [{ id: 'result', type: 'string', label: 'Result' }],
  controls: [
    { id: 'separator', type: 'text', label: 'Separator', default: ',', props: { placeholder: '\\n = newline, \\t = tab' } },
  ],
  tags: ['array', 'join', 'concat', 'string'],
  info: {
    overview: 'Joins all elements of an array into a single string using a configurable separator. This is the inverse of splitting a string into an array. Useful for building comma-separated lists, paths, or display text from array data.',
    tips: [
      'Type \\n in the separator for a newline (\\t for a tab) to produce multi-line output.',
      'null/undefined elements become empty slots (doubled separators); run Filter Nulls first to drop them.',
      'Object and array elements are joined as JSON.',
    ],
    pairsWith: ['to-array', 'array-filter-nulls', 'to-string', 'json-stringify'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const array = ctx.inputs.get('array')
  const separator = unescapeSeparator((ctx.controls.get('separator') as string) ?? ',')

  if (!Array.isArray(array)) {
    return new Map<string, unknown>([['result', '']])
  }

  // Objects/arrays as JSON (Array.join printed "[object Object]"); null/undefined stay empty.
  const parts = array.map((v) => (v === null || v === undefined ? '' : typeof v === 'object' ? toStr(v) : String(v)))
  return new Map<string, unknown>([['result', parts.join(separator)]])
}

export default defineNode({ definition, executor })
