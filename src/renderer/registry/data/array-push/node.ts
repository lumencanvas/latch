import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'array-push',
  name: 'Array Push',
  version: '1.0.0',
  category: 'data',
  description: 'Add element(s) to array',
  icon: 'plus-circle',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'array', type: 'array', label: 'Array' },
    { id: 'value', type: 'any', label: 'Value' },
  ],
  outputs: [{ id: 'result', type: 'array', label: 'Result' }],
  controls: [
    {
      id: 'position',
      type: 'select',
      label: 'Position',
      default: 'end',
      props: { options: ['end', 'start'] },
    },
  ],
  tags: ['array', 'push', 'add', 'append', 'prepend'],
  info: {
    overview: 'Adds an element to an array at either the start or end position. Returns a new array with the element included. Use this to build up lists incrementally from individual values.',
    tips: [
      'Set position to "start" when you need a stack-like (LIFO) structure.',
      'Chain multiple Array Push nodes together to append several values in sequence.',
    ],
    pairsWith: ['array-length', 'array-unique', 'array-contains', 'to-array'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const array = ctx.inputs.get('array')
  const value = ctx.inputs.get('value')
  const position = (ctx.controls.get('position') as string) ?? 'end'

  const arr = Array.isArray(array) ? [...array] : []

  if (value !== undefined) {
    if (position === 'start') {
      arr.unshift(value)
    } else {
      arr.push(value)
    }
  }

  return new Map<string, unknown>([['result', arr]])
}

export default defineNode({ definition, executor })
