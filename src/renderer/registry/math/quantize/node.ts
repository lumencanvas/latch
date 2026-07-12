import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'quantize',
  name: 'Quantize',
  version: '1.0.0',
  category: 'math',
  description: 'Round value to nearest step',
  icon: 'grid',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value' }],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [
    { id: 'step', type: 'number', label: 'Step', default: 1 },
  ],
  tags: ['quantize', 'snap', 'round', 'grid', 'step'],
  info: {
    overview: 'Rounds a value to the nearest multiple of the specified step size. For example, with a step of 0.25, the value 0.3 becomes 0.25 and 0.4 becomes 0.5. Useful for snapping continuous signals to discrete levels.',
    tips: [
      'Set the step to 1 for standard integer rounding.',
      'Use with smooth to get stepped output that still transitions smoothly between levels.',
    ],
    pairsWith: ['smooth', 'map-range', 'step', 'select', 'clamp'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const step = (ctx.controls.get('step') as number) ?? 1

  if (step === 0) {
    return new Map([['result', value]])
  }

  const result = Math.round(value / step) * step

  return new Map([['result', result]])
}

export default defineNode({ definition, executor, pure: true })
