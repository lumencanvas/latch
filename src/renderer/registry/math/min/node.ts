import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

/**
 * `min` — the smaller of two inputs (born co-located, ROADMAP Phase 5 primitive).
 * A true two-signal comparison, distinct from the `min` *bound* controls on clamp /
 * wrap / random. Use it to cap a signal against another live value.
 */

const definition: NodeDefinition = {
  id: 'min',
  name: 'Min',
  version: '1.0.0',
  category: 'math',
  description: 'Output the smaller of two numbers',
  icon: 'chevrons-down',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'number', label: 'A' },
    { id: 'b', type: 'number', label: 'B' },
  ],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [],
  info: {
    overview:
      'Outputs whichever of the two inputs is smaller. Both inputs default to 0 when unconnected. Unlike the Min control on Clamp, this compares two live signals against each other every frame.',
    tips: [
      'Use as a ceiling: min(signal, limit) never lets the signal exceed limit.',
      'Pair with max to build a two-node clamp when the bounds are themselves signals.',
    ],
    pairsWith: ['max', 'clamp', 'add', 'subtract'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? 0
  return new Map([['result', Math.min(a, b)]])
}

export default defineNode({ definition, executor, pure: true })
