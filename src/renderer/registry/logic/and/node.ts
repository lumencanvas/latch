import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'and',
  name: 'And',
  version: '1.0.0',
  category: 'logic',
  description: 'Logical AND',
  icon: 'circle-dot',
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
    overview: 'Outputs true only when both inputs are true. This is the standard boolean AND operation used to require multiple conditions to be satisfied simultaneously.',
    tips: [
      'Chain multiple And nodes together to require more than two conditions.',
      'Combine with Not to build NAND logic.',
    ],
    pairsWith: ['or', 'not', 'gate', 'compare'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = Boolean(ctx.inputs.get('a') ?? ctx.controls.get('a'))
  const b = Boolean(ctx.inputs.get('b') ?? ctx.controls.get('b'))
  return new Map([['result', a && b ? 1 : 0]])
}

export default defineNode({ definition, executor, pure: true })
