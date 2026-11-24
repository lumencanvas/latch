import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { defineNodeState } from '@/engine/nodeState'
import { sameValue } from '../valueHelpers'

const definition: NodeDefinition = {
  id: 'throttle',
  name: 'Throttle',
  version: '1.0.0',
  category: 'data',
  description: 'Limit how often value is output',
  icon: 'gauge',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'interval', type: 'number', label: 'Interval (ms)' },
  ],
  outputs: [{ id: 'result', type: 'any', label: 'Result' }],
  controls: [
    { id: 'interval', type: 'number', label: 'Interval (ms)', default: 100, props: { min: 0, step: 10 } },
  ],
  tags: ['throttle', 'limit', 'rate', 'frequency'],
  info: {
    overview: 'Limits how often the output changes: a new input value passes immediately if the Interval has elapsed since the last update (leading edge); changes inside the window are held and the LATEST one is emitted when the window closes (trailing edge). A return to low (0 / false / nothing) passes immediately, so trigger pulses survive. Good for rate-limiting high-frequency data.',
    tips: [
      'Set the interval to match your target frame rate when throttling visual updates.',
      'Use Debounce instead if you only care about the final settled value after input stops.',
    ],
    pairsWith: ['debounce', 'counter', 'expression', 'monitor'],
  },
}

// Co-located (was utility.ts throttleExecutor). The old version sampled on a fixed grid:
// a 1-frame trigger pulse was dropped unless it landed exactly on a sample frame, and
// `lastOutput = now` slipped the real rate up to a frame per period. Now change-driven
// with leading + trailing edges.
const throttleState = defineNodeState<{
  lastEmit: number
  out: unknown
  lastIn: unknown
  pending: boolean
  pendingValue: unknown
}>({ label: 'throttle' })

const isLow = (v: unknown) => v === undefined || v === null || v === false || v === 0

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const interval = Math.max(0, ctx.num('interval', 100))
  const now = ctx.totalTime * 1000

  let st = throttleState.get(ctx.nodeId)
  if (!st) {
    st = { lastEmit: -Infinity, out: undefined, lastIn: undefined, pending: false, pendingValue: undefined }
    throttleState.set(ctx.nodeId, st)
  }

  const changed = !sameValue(value, st.lastIn)
  st.lastIn = value
  const windowOpen = now - st.lastEmit >= interval

  if (changed) {
    if (windowOpen) {
      st.out = value
      st.lastEmit = now
      st.pending = false
    } else if (isLow(value) && !isLow(st.out) && !st.pending) {
      // Falling edge of a pulse: let it through at once (doesn't consume the window).
      st.out = value
    } else {
      st.pending = true
      st.pendingValue = value
    }
  } else if (st.pending && windowOpen) {
    st.out = st.pendingValue
    st.lastEmit = now
    st.pending = false
  }

  return new Map<string, unknown>([['result', st.out]])
}

export default defineNode({ definition, executor })
