import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'modulo',
  name: 'Modulo',
  version: '1.0.0',
  category: 'math',
  description: 'Modulo (remainder) operation',
  icon: 'percent',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'divisor', type: 'number', label: 'Divisor' },
  ],
  outputs: [
    { id: 'result', type: 'number', label: 'Result' },
    { id: 'quotient', type: 'number', label: 'Quotient' },
  ],
  controls: [
    { id: 'divisor', type: 'number', label: 'Divisor', default: 1 },
    {
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'Standard',
      props: {
        options: ['Standard', 'Positive', 'Floor'],
      },
    },
  ],
  info: {
    overview: 'Computes the remainder after dividing a value by a divisor. Supports Standard (JS %, sign of the value), Positive (Euclidean, always 0…|divisor|) and Floor (Python-style, sign of the divisor) modes. The Quotient output is the matching integer division. Useful for creating repeating patterns and cyclic behavior from increasing values.',
    tips: [
      'Use Positive mode to ensure the result is always non-negative.',
      'Combine with time to create looping counters or repeating animations.',
    ],
    pairsWith: ['divide', 'wrap', 'time', 'quantize'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.num('value', 0)
  const divisor = ctx.num('divisor', 1)
  const mode = (ctx.controls.get('mode') as string) ?? 'Standard'

  if (divisor === 0) {
    return new Map([['result', 0], ['quotient', 0]])
  }

  let result: number
  let quotient: number
  switch (mode) {
    case 'Positive': {
      // Euclidean modulo: ALWAYS in [0, |divisor|). The old formula was identical to Floor
      // and went negative for a negative divisor (-1 mod -3 → -1).
      const m = Math.abs(divisor)
      result = ((value % m) + m) % m
      quotient = (value - result) / divisor
      break
    }
    case 'Floor':
      // Floor division remainder (Python-style): takes the divisor's sign.
      quotient = Math.floor(value / divisor)
      result = value - divisor * quotient
      // Float rounding can land exactly ON the divisor (e.g. -1e-17 mod 1 → 1); that's 0.
      if (Math.abs(result) >= Math.abs(divisor)) result = 0
      break
    case 'Standard':
    default:
      result = value % divisor
      quotient = Math.trunc(value / divisor)
  }

  return new Map([
    ['result', Number.isFinite(result) ? result : 0],
    ['quotient', Number.isFinite(quotient) ? quotient : 0],
  ])
}

export default defineNode({ definition, executor, pure: true })
