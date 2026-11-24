import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'smoothstep',
  name: 'Smoothstep',
  version: '1.0.0',
  category: 'math',
  description: 'Hermite interpolation between 0 and 1',
  icon: 'wave',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'edge0', type: 'number', label: 'Edge 0' },
    { id: 'edge1', type: 'number', label: 'Edge 1' },
  ],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [
    { id: 'edge0', type: 'number', label: 'Edge 0', default: 0, props: { step: 0.01 } },
    { id: 'edge1', type: 'number', label: 'Edge 1', default: 1, props: { step: 0.01 } },
  ],
  tags: ['smoothstep', 'ease', 'hermite', 'smooth'],
  info: {
    overview: 'Applies Hermite interpolation to produce a smooth S-curve between 0 and 1. Values below edge0 output 0, values above edge1 output 1, and values between are smoothly interpolated. This is the classic smoothstep function from shader programming.',
    tips: [
      'Use as a softer alternative to step when you want gradual transitions instead of hard cutoffs.',
      'Set edge0 and edge1 to control where the transition begins and ends.',
    ],
    pairsWith: ['step', 'lerp', 'remap', 'clamp', 'smooth'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.num('value', 0)
  const edge0 = ctx.num('edge0', 0)
  const edge1 = ctx.num('edge1', 1)

  // Clamp to 0-1 range. Guard the degenerate edge0 === edge1 (division by zero → NaN):
  // behave like a hard step at the shared edge.
  const denom = edge1 - edge0
  let t = denom !== 0 ? (value - edge0) / denom : (value < edge0 ? 0 : 1)
  t = Math.max(0, Math.min(1, t))

  // Hermite interpolation
  const result = t * t * (3 - 2 * t)

  return new Map([['result', result]])
}

export default defineNode({ definition, executor, pure: true })
