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
    overview: 'Computes the remainder after dividing a value by a divisor. Supports standard, positive-only, and floor modes for different remainder conventions. Useful for creating repeating patterns and cyclic behavior from increasing values.',
    tips: [
      'Use Positive mode to ensure the result is always non-negative.',
      'Combine with time to create looping counters or repeating animations.',
    ],
    pairsWith: ['divide', 'wrap', 'time', 'quantize'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const divisorInput = ctx.inputs.get('divisor') as number | undefined
  const divisorControl = (ctx.controls.get('divisor') as number) ?? 1
  const divisor = divisorInput ?? divisorControl
  const mode = (ctx.controls.get('mode') as string) ?? 'Standard'

  if (divisor === 0) {
    return new Map([['result', 0]])
  }

  let result: number
  switch (mode) {
    case 'Standard':
      result = value % divisor
      break
    case 'Positive':
      // Always returns positive result
      result = ((value % divisor) + divisor) % divisor
      break
    case 'Floor':
      // Floor division remainder (Python-style)
      result = value - divisor * Math.floor(value / divisor)
      break
    default:
      result = value % divisor
  }

  return new Map([['result', result]])
}

export default defineNode({ definition, executor, pure: true })
