import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'divide',
  name: 'Divide',
  version: '1.0.0',
  category: 'math',
  description: 'Divide two numbers',
  icon: 'divide',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'number', label: 'A' },
    { id: 'b', type: 'number', label: 'B' },
  ],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [],
  info: {
    overview: 'Divides the first input by the second and outputs the quotient. This is standard numeric division. Be aware that dividing by zero will produce Infinity or NaN.',
    tips: [
      'Use a compare node to guard against division by zero before this node.',
      'Combine with modulo to get both the quotient and remainder of a division.',
    ],
    pairsWith: ['multiply', 'modulo', 'compare', 'clamp'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? 1
  return new Map([['result', b !== 0 ? a / b : 0]])
}

export default defineNode({ definition, executor, pure: true })
