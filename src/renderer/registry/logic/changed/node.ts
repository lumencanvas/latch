import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import { sameValue } from '../../data/valueHelpers'

const definition: NodeDefinition = {
  id: 'changed',
  name: 'Changed',
  version: '1.0.0',
  category: 'logic',
  description: 'Only output when value changes from previous',
  icon: 'diff',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [
    { id: 'result', type: 'any', label: 'Result' },
    { id: 'changed', type: 'boolean', label: 'Changed' },
  ],
  controls: [],
  tags: ['detect', 'change', 'state', 'difference'],
  info: {
    overview: 'Passes the input value through only when it differs from the previous value. Also outputs a boolean indicating whether the value changed. Useful for triggering downstream logic only when data actually updates.',
    tips: [
      'Use the Changed boolean output to trigger other nodes selectively.',
      'Place before expensive operations to avoid redundant processing.',
    ],
    pairsWith: ['gate', 'sample-hold', 'pass-if', 'trigger'],
  },
}

// Co-located (was utility.ts changedExecutor): the per-frame JSON.stringify compare threw on
// cyclic values and serialized textures every frame; sameValue never throws and treats
// NaN === NaN (a NaN-holding source no longer reads as "changed" every frame).
const changedPrev = defineNodeState<{ value: unknown }>({ label: 'changed' })

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const prev = changedPrev.get(ctx.nodeId)
  const hasChanged = prev === undefined ? value !== undefined : !sameValue(value, prev.value)
  changedPrev.set(ctx.nodeId, { value })
  return new Map<string, unknown>([
    ['result', hasChanged ? value : undefined],
    ['changed', hasChanged ? 1 : 0],
  ])
}

export default defineNode({ definition, executor })
