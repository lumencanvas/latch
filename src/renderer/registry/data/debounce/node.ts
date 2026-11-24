import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import { sameValue } from '../valueHelpers'

const definition: NodeDefinition = {
  id: 'debounce',
  name: 'Debounce',
  version: '1.0.0',
  category: 'data',
  description: 'Only output value after it stops changing for a period',
  icon: 'timer',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'delay', type: 'number', label: 'Delay (ms)' },
  ],
  outputs: [
    { id: 'result', type: 'any', label: 'Result' },
    { id: 'pending', type: 'boolean', label: 'Pending' },
  ],
  controls: [
    { id: 'delay', type: 'number', label: 'Delay (ms)', default: 300, props: { min: 0, step: 10 } },
  ],
  tags: ['debounce', 'delay', 'wait', 'settle'],
  info: {
    overview: 'Waits until the input stops changing for the Delay, then outputs it. While the input is still changing the output HOLDS the last settled value (it never goes blank), and Pending is 1. Ideal for handling rapid user input or noisy sensor data.',
    tips: [
      'Set the delay to 300ms or more for text input to avoid excessive downstream updates.',
      'Use Throttle instead if you need regular updates at a fixed interval rather than waiting for silence.',
    ],
    pairsWith: ['throttle', 'http-request', 'expression', 'gate'],
  },
}

// Co-located (was utility.ts debounceExecutor). Fixes: (1) while the input was changing the
// node emitted NOTHING, so downstream fell back to its control defaults — it now holds the
// last settled value; (2) two JSON.stringify calls per frame threw on cyclic values and
// serialized textures — now a non-throwing structural compare (sameValue).
const debounceState = defineNodeState<{
  pending: unknown
  lastChange: number
  settled: unknown
  hasPending: boolean
}>({ label: 'debounce' })

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const delay = Math.max(0, ctx.num('delay', 300))
  const now = ctx.totalTime * 1000

  let st = debounceState.get(ctx.nodeId)
  if (!st) {
    st = { pending: undefined, lastChange: now, settled: undefined, hasPending: false }
    debounceState.set(ctx.nodeId, st)
  }

  const reference = st.hasPending ? st.pending : st.settled
  if (!sameValue(value, reference)) {
    st.pending = value
    st.lastChange = now
    st.hasPending = true
  }
  if (st.hasPending && now - st.lastChange >= delay) {
    st.settled = st.pending
    st.hasPending = false
  }

  return new Map<string, unknown>([
    ['result', st.settled],
    ['pending', st.hasPending ? 1 : 0],
  ])
}

export default defineNode({ definition, executor })
