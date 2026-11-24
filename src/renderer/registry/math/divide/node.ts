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
    overview: 'Divides the first input by the second and outputs the quotient. Division by zero is guarded: instead of Infinity or NaN, it outputs 0.',
    tips: [
      'It outputs 0 when the divisor is 0; for a different fallback, guard the denominator with a compare node upstream.',
      'Combine with modulo to get both the quotient and remainder of a division.',
    ],
    pairsWith: ['multiply', 'modulo', 'compare', 'clamp'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = ctx.num('a', 0)
  const b = ctx.num('b', 1)
  // Finite-guard: a NaN operand (or ±Infinity) must not propagate a non-finite result.
  const r = b !== 0 ? a / b : 0
  return new Map([['result', Number.isFinite(r) ? r : 0]])
}

export default defineNode({ definition, executor, pure: true })
