import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'in-range',
  name: 'In Range',
  version: '1.0.0',
  category: 'logic',
  description: 'Check if number is within a range',
  icon: 'arrow-left-right',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value' }],
  outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
  controls: [
    { id: 'value', type: 'number', label: 'Value', default: 0 },
    { id: 'min', type: 'number', label: 'Min', default: 0 },
    { id: 'max', type: 'number', label: 'Max', default: 1 },
    { id: 'inclusive', type: 'toggle', label: 'Inclusive', default: true },
  ],
  tags: ['range', 'between', 'threshold', 'bounds'],
  info: {
    overview: 'Tests whether a number falls within a specified minimum and maximum range. Returns true if the value is inside the range and false otherwise. The inclusive toggle controls whether the boundary values themselves count as in-range.',
    tips: [
      'Use with gate to only pass values that fall within acceptable bounds.',
      'Combine two In Range nodes with Or to check for values in multiple zones.',
    ],
    pairsWith: ['compare', 'clamp', 'gate', 'map-range'],
  },
}

// Co-located (was utility.ts inRangeExecutor): inverted bounds (Min > Max) are normalised —
// they used to make every value "out of range" — and NaN input is out of range.
const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.num('value', NaN)
  const a = ctx.num('min', 0)
  const b = ctx.num('max', 1)
  const lo = Math.min(a, b)
  const hi = Math.max(a, b)
  const inclusive = (ctx.controls.get('inclusive') as boolean) ?? true
  const result = inclusive ? value >= lo && value <= hi : value > lo && value < hi
  return new Map([['result', result ? 1 : 0]])
}

export default defineNode({ definition, executor })
