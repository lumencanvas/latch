import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'clamp',
  name: 'Clamp',
  version: '1.0.0',
  category: 'math',
  description: 'Clamp a value between min and max',
  icon: 'shrink',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value' }],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [
    { id: 'min', type: 'number', label: 'Min', default: 0, props: { step: 0.01 } },
    { id: 'max', type: 'number', label: 'Max', default: 1, props: { step: 0.01 } },
  ],
  info: {
    overview: 'Constrains a value to stay within a minimum and maximum range. Values below the minimum are raised to the minimum, and values above the maximum are lowered to the maximum. Values already within range pass through unchanged.',
    tips: [
      'Place after map-range to ensure the output never exceeds the target bounds.',
      'Use with lerp to keep interpolation parameters in the 0 to 1 range.',
    ],
    pairsWith: ['map-range', 'lerp', 'smooth', 'in-range', 'wrap'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = ctx.num('min', 0)
  const b = ctx.num('max', 1)
  // Normalise inverted bounds: Min > Max used to output a constant (Max) for every input.
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  // NaN input → the lower bound (the safety node must never emit NaN); ±Infinity still
  // clamps correctly against the finite bounds.
  const raw = ctx.inputs.get('value')
  const v = typeof raw === 'number' && !Number.isNaN(raw) ? raw : ctx.num('value', lo)
  return new Map([['result', Math.min(hi, Math.max(lo, v))]])
}

export default defineNode({ definition, executor, pure: true })
