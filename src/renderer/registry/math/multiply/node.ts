import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'multiply',
  name: 'Multiply',
  version: '1.0.0',
  category: 'math',
  description: 'Multiply two numbers',
  icon: 'x',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'number', label: 'A' },
    { id: 'b', type: 'number', label: 'B' },
  ],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [],
  info: {
    overview: 'Multiplies two numbers together and outputs the product. This is one of the core arithmetic operations. Use it for scaling values, applying gain, or computing areas and rates.',
    tips: [
      'Multiply by -1 to negate a signal without using a subtract node.',
      'Chain with add to build linear equations of the form (a * x + b).',
    ],
    pairsWith: ['add', 'divide', 'constant', 'clamp'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? 1
  return new Map([['result', a * b]])
}

export default defineNode({ definition, executor, pure: true })
