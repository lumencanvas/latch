import { defineNode } from '@/engine/defineNode'
import { unescapeSeparator } from '../../string/strHelpers'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'to-array',
  name: 'To Array',
  version: '1.0.0',
  category: 'data',
  description: 'Wrap value in array, or split string to array',
  icon: 'brackets',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [{ id: 'result', type: 'array', label: 'Result' }],
  controls: [
    {
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'wrap',
      props: { options: ['wrap', 'split', 'from'] },
    },
    { id: 'separator', type: 'text', label: 'Separator', default: ',', when: { mode: 'split' }, props: { placeholder: '\\n = newline, \\t = tab' } },
    { id: 'trim', type: 'toggle', label: 'Trim Pieces', default: false, when: { mode: 'split' } },
  ],
  tags: ['convert', 'array', 'wrap', 'split'],
  info: {
    overview: 'Converts a value into an array using one of three modes: wrap places the value inside a single-element array, split divides a string by a separator, and from attempts to convert iterable values. Useful for normalizing input into array form.',
    tips: [
      'Use split mode with a comma separator to turn CSV-style strings into arrays (type \\n to split lines).',
      'An unconnected / null value becomes an empty array.',
      'Use wrap mode to ensure a value is always an array before feeding it to array-processing nodes.',
    ],
    pairsWith: ['array-join', 'array-filter-nulls', 'array-push', 'json-parse'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const mode = (ctx.controls.get('mode') as string) ?? 'wrap'
  const separator = unescapeSeparator((ctx.controls.get('separator') as string) ?? ',')
  const trim = (ctx.controls.get('trim') as boolean) ?? false

  // Nothing to convert → empty array (wrap used to emit [undefined]).
  if (value === undefined || value === null) return new Map<string, unknown>([['result', []]])

  let result: unknown[]

  switch (mode) {
    case 'split':
      if (typeof value === 'string') {
        result = separator ? value.split(separator) : [value]
        if (trim) result = (result as string[]).map((s) => s.trim())
      } else {
        result = [value]
      }
      break
    case 'from':
      // Try to convert array-like to array
      if (Array.isArray(value)) {
        result = value
      } else if (typeof value === 'object' && Symbol.iterator in value) {
        // Sets, Maps (→ entries), typed arrays, generators…
        result = Array.from(value as Iterable<unknown>)
      } else if (typeof value === 'object' && 'length' in value) {
        result = Array.from(value as ArrayLike<unknown>)
      } else {
        result = [value]
      }
      break
    default: // wrap
      if (Array.isArray(value)) {
        result = value
      } else {
        result = [value]
      }
  }

  return new Map<string, unknown>([['result', result]])
}

export default defineNode({ definition, executor })
