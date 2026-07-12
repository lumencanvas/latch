import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'step',
  name: 'Step',
  version: '1.0.0',
  category: 'math',
  description: 'Returns 0 if value < edge, otherwise 1',
  icon: 'stairs',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value' }],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [
    { id: 'edge', type: 'number', label: 'Edge', default: 0.5 },
  ],
  tags: ['step', 'threshold', 'binary', 'heaviside'],
  info: {
    overview: 'Outputs 0 when the input is below the edge value and 1 when it is at or above the edge. This is a hard threshold function, also known as the Heaviside step. Useful for converting continuous signals into binary on/off states.',
    tips: [
      'Use smoothstep instead if you need a gradual transition around the threshold.',
      'Feed the output into a gate or switch to control flow based on a threshold.',
    ],
    pairsWith: ['smoothstep', 'compare', 'gate', 'quantize'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const edge = (ctx.controls.get('edge') as number) ?? 0.5

  const result = value < edge ? 0 : 1

  return new Map([['result', result]])
}

export default defineNode({ definition, executor, pure: true })
