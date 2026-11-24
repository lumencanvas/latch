import { defineNode } from '@/engine/defineNode'
import { defineNodeState } from '@/engine/nodeState'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'array-range',
  name: 'Array Range',
  version: '1.0.0',
  category: 'data',
  description: 'Generate an array of sequential numbers',
  icon: 'list-tree',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'start', type: 'number', label: 'Start' },
    { id: 'end', type: 'number', label: 'End' },
    { id: 'step', type: 'number', label: 'Step' },
  ],
  outputs: [{ id: 'result', type: 'array', label: 'Result' }],
  controls: [
    { id: 'start', type: 'number', label: 'Start', default: 0 },
    { id: 'end', type: 'number', label: 'End (exclusive)', default: 10 },
    { id: 'step', type: 'number', label: 'Step', default: 1, props: { step: 0.1 } },
  ],
  tags: ['array', 'range', 'sequence', 'generate'],
  info: {
    overview: 'Generates an array of sequential numbers from Start up to (but not including) End, spaced by Step. Counts down automatically when End is below Start. Capped at 10,000 elements. Useful for creating index lists, iteration sequences, or evenly spaced numeric data.',
    tips: [
      'Use a fractional step value like 0.1 to generate fine-grained numeric sequences.',
      'Pair with Array Get and a Counter to step through a generated sequence one element at a time.',
    ],
    pairsWith: ['array-get', 'expression', 'counter', 'array-length'],
  },
}

const MAX_ELEMENTS = 10000
const rangeCache = defineNodeState<{ key: string; value: number[] }>({ label: 'array-range' })

/** Number of decimal places in a number's shortest representation (0.25 → 2, 1e-7 → 7). */
function decimalsOf(n: number): number {
  if (!Number.isFinite(n) || Number.isInteger(n)) return 0
  const s = String(n)
  const e = s.match(/e-(\d+)$/)
  if (e) return Number(e[1]) + (s.split('e')[0].split('.')[1]?.length ?? 0)
  return s.split('.')[1]?.length ?? 0
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const start = ctx.num('start', 0)
  const end = ctx.num('end', 10)
  const rawStep = Math.abs(ctx.num('step', 1))
  const step = rawStep === 0 ? 1 : rawStep

  // Pure function of (start, end, step): memoize per node so a static range isn't rebuilt
  // (up to 10k elements) every frame. A copy is emitted so downstream mutation can't
  // corrupt the cache.
  const key = `${start}|${end}|${step}`
  const cached = rangeCache.get(ctx.nodeId)
  if (cached && cached.key === key) return new Map<string, unknown>([['result', [...cached.value]]])

  // Index-based generation (start + k*step) instead of repeated `i += step`: accumulation
  // drifted (0.1 steps produced 0.30000000000000004 and an extra element just below End).
  const dir = end >= start ? 1 : -1
  const count = Math.min(MAX_ELEMENTS, Math.max(0, Math.ceil(Math.abs(end - start) / step - 1e-9)))
  const decimals = Math.min(15, Math.max(decimalsOf(start), decimalsOf(step)))
  const result: number[] = new Array(count)
  for (let k = 0; k < count; k++) {
    const v = start + dir * k * step
    result[k] = decimals > 0 ? Number(v.toFixed(decimals)) : v
  }
  rangeCache.set(ctx.nodeId, { key, value: result })
  return new Map<string, unknown>([['result', [...result]]])
}

export default defineNode({ definition, executor })
