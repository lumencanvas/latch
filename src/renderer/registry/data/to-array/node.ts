import { defineNode } from '@/engine/defineNode'
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
    { id: 'separator', type: 'text', label: 'Separator', default: ',' },
  ],
  tags: ['convert', 'array', 'wrap', 'split'],
  info: {
    overview: 'Converts a value into an array using one of three modes: wrap places the value inside a single-element array, split divides a string by a separator, and from attempts to convert iterable values. Useful for normalizing input into array form.',
    tips: [
      'Use split mode with a comma separator to turn CSV-style strings into arrays.',
      'Use wrap mode to ensure a value is always an array before feeding it to array-processing nodes.',
    ],
    pairsWith: ['array-join', 'array-filter-nulls', 'array-push', 'json-parse'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const mode = (ctx.controls.get('mode') as string) ?? 'wrap'
  const separator = (ctx.controls.get('separator') as string) ?? ','

  let result: unknown[]

  switch (mode) {
    case 'split':
      if (typeof value === 'string') {
        result = separator ? value.split(separator) : [value]
      } else {
        result = [value]
      }
      break
    case 'from':
      // Try to convert array-like to array
      if (Array.isArray(value)) {
        result = value
      } else if (value && typeof value === 'object' && 'length' in value) {
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
