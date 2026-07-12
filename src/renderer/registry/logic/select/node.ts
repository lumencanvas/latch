import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'select',
  name: 'Select',
  version: '1.0.0',
  category: 'logic',
  description: 'Select one of multiple inputs by index',
  icon: 'list',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'index', type: 'number', label: 'Index' },
    { id: 'a', type: 'any', label: 'A' },
    { id: 'b', type: 'any', label: 'B' },
    { id: 'c', type: 'any', label: 'C' },
    { id: 'd', type: 'any', label: 'D' },
  ],
  outputs: [
    { id: 'result', type: 'any', label: 'Result' },
  ],
  controls: [],
  info: {
    overview: 'Picks one of up to four inputs based on a numeric index. Index 0 selects input A, index 1 selects B, and so on. This is useful for cycling through values or building lookup-style selection from a numeric source.',
    tips: [
      'Use modulo before the index input to cycle through inputs in a loop.',
      'Combine with quantize to snap a continuous signal to discrete selection steps.',
    ],
    pairsWith: ['switch', 'modulo', 'quantize', 'compare'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const index = Math.floor((ctx.inputs.get('index') as number) ?? 0)
  const a = ctx.inputs.get('a')
  const b = ctx.inputs.get('b')
  const c = ctx.inputs.get('c')
  const d = ctx.inputs.get('d')

  const inputs = [a, b, c, d].filter(v => v !== undefined)
  const selected = inputs[Math.max(0, Math.min(index, inputs.length - 1))]

  return new Map([['result', selected]])
}

export default defineNode({ definition, executor, pure: true })
