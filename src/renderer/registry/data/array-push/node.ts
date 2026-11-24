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
    overview: 'Returns a copy of the input array with one value added at the start or end. It is stateless: every frame it rebuilds the result from the current inputs, so it does not accumulate values over time on its own.',
    tips: [
      'To accumulate values over time, store the list in a Function node with getState/setState.',
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
