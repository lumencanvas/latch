import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'abs',
  name: 'Absolute',
  version: '1.0.0',
  category: 'math',
  description: 'Get absolute value',
  icon: 'flip-horizontal',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value' }],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [],
  info: {
    overview: 'Returns the absolute value of the input, converting negative numbers to positive. Zero and positive values pass through unchanged. Commonly used to get magnitude without regard to sign.',
    tips: [
      'Use after subtract to get the distance between two values.',
      'Combine with compare to check if a value exceeds a threshold in either direction.',
    ],
    pairsWith: ['subtract', 'compare', 'clamp', 'smooth'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  return new Map([['result', Math.abs(value)]])
}

export default defineNode({ definition, executor, pure: true })
