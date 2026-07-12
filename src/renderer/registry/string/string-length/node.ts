import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'string-length',
  name: 'String Length',
  version: '1.0.0',
  category: 'string',
  description: 'Get length of a string',
  icon: 'ruler',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'input', type: 'string', label: 'Input' }],
  outputs: [
    { id: 'length', type: 'number', label: 'Length' },
    { id: 'isEmpty', type: 'boolean', label: 'Is Empty' },
  ],
  controls: [],
  tags: ['length', 'count', 'size', 'characters'],
  info: {
    overview: 'Returns the character count of a string and a boolean indicating whether the string is empty. Useful for validation, truncation decisions, or conditional branching based on input size.',
    tips: [
      'Connect the isEmpty output to a Gate node to skip processing when there is no input.',
      'Pair with String Slice to truncate strings that exceed a maximum length.',
    ],
    pairsWith: ['string-slice', 'gate', 'string-contains', 'expression'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''

  return new Map([
    ['length', input.length],
    ['isEmpty', input.length === 0 ? 1 : 0],
  ])
}

export default defineNode({ definition, executor })
