import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

/**
 * `max` — the larger of two inputs (born co-located, ROADMAP Phase 5 primitive).
 * A true two-signal comparison, distinct from the `max` *bound* controls on clamp /
 * wrap / random. Use it to floor a signal against another live value.
 */

const definition: NodeDefinition = {
  id: 'max',
  name: 'Max',
  version: '1.0.0',
  category: 'math',
  description: 'Output the larger of two numbers',
  icon: 'chevrons-up',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'number', label: 'A' },
    { id: 'b', type: 'number', label: 'B' },
  ],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [],
  info: {
    overview:
      'Outputs whichever of the two inputs is larger. Both inputs default to 0 when unconnected. Unlike the Max control on Clamp, this compares two live signals against each other every frame.',
    tips: [
      'Use as a floor: max(signal, limit) never lets the signal drop below limit.',
      'max(signal, 0) rectifies a bipolar signal — a cheap half-wave rectifier.',
    ],
    pairsWith: ['min', 'clamp', 'abs', 'add'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? 0
  return new Map([['result', Math.max(a, b)]])
}

export default defineNode({ definition, executor, pure: true })
