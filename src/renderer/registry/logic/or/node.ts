import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'or',
  name: 'Or',
  version: '1.0.0',
  category: 'logic',
  description: 'Logical OR',
  icon: 'circle',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'boolean', label: 'A' },
    { id: 'b', type: 'boolean', label: 'B' },
  ],
  outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
  controls: [
    { id: 'a', type: 'toggle', label: 'A', default: false },
    { id: 'b', type: 'toggle', label: 'B', default: false },
  ],
  info: {
    overview: 'Outputs true when at least one of the two inputs is true. This is the standard boolean OR operation. Use it to allow multiple conditions to independently trigger the same behavior.',
    tips: [
      'Chain multiple Or nodes to combine more than two conditions.',
      'Combine with Not to create NOR logic.',
    ],
    pairsWith: ['and', 'not', 'gate', 'compare'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = Boolean(ctx.inputs.get('a') ?? ctx.controls.get('a'))
  const b = Boolean(ctx.inputs.get('b') ?? ctx.controls.get('b'))
  return new Map([['result', a || b ? 1 : 0]])
}

export default defineNode({ definition, executor, pure: true })
