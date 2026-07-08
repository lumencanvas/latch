import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

/**
 * `add` — the first co-located node (ROADMAP Phase 6). Definition + executor live
 * together here; the `nodeRegistry` glob discovers this `node.ts` and merges it
 * into the live registry (see `registry/allNodes.ts` + `engine/executors/index.ts`),
 * winning over any legacy copy of the same id.
 */

const definition: NodeDefinition = {
  id: 'add',
  name: 'Add',
  version: '1.0.0',
  category: 'math',
  description: 'Add two numbers',
  icon: 'plus',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'number', label: 'A' },
    { id: 'b', type: 'number', label: 'B' },
  ],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [],
  info: {
    overview: 'Adds two numbers together and outputs the sum. This is one of the core arithmetic operations. Use it to combine values, apply offsets, or accumulate totals.',
    tips: [
      'Chain with a constant node to add a fixed offset to a signal.',
      'Pair with multiply to build linear transformations (multiply then add).',
    ],
    pairsWith: ['subtract', 'multiply', 'constant', 'smooth'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? 0
  return new Map([['result', a + b]])
}

export default defineNode({ definition, executor, pure: true })
