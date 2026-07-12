import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'switch',
  name: 'Switch',
  version: '1.0.0',
  category: 'logic',
  description: 'Select between two values',
  icon: 'git-branch',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'condition', type: 'boolean', label: 'Condition' },
    { id: 'true', type: 'any', label: 'True' },
    { id: 'false', type: 'any', label: 'False' },
  ],
  outputs: [{ id: 'result', type: 'any', label: 'Result' }],
  controls: [],
  info: {
    overview: 'Outputs one of two values depending on a boolean condition. When the condition is true, the True input is forwarded. When false, the False input is forwarded. This is the basic if/else building block for data flow.',
    tips: [
      'Feed the output of compare or equals into the condition input for threshold-based switching.',
      'Use select instead when you need to choose from more than two options.',
    ],
    pairsWith: ['compare', 'equals', 'select', 'gate', 'not'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const condition = Boolean(ctx.inputs.get('condition'))
  const trueValue = ctx.inputs.get('true') ?? 1
  const falseValue = ctx.inputs.get('false') ?? 0
  return new Map([['result', condition ? trueValue : falseValue]])
}

export default defineNode({ definition, executor, pure: true })
