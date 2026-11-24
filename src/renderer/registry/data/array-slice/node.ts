import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'array-slice',
  name: 'Array Slice',
  version: '1.0.0',
  category: 'data',
  description: 'Get subset of array',
  icon: 'scissors',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'array', type: 'array', label: 'Array' },
    { id: 'start', type: 'number', label: 'Start' },
    { id: 'end', type: 'number', label: 'End' },
  ],
  outputs: [{ id: 'result', type: 'array', label: 'Result' }],
  controls: [
    { id: 'start', type: 'number', label: 'Start', default: 0 },
    { id: 'end', type: 'number', label: 'End', default: -1 },
  ],
  tags: ['array', 'slice', 'subset', 'range'],
  info: {
    overview: 'Extracts a portion of an array from Start (inclusive) to End (exclusive). A negative Start counts from the end. End -1 means through the last element; other negative values count from the end (-2 drops the last two).',
    tips: [
      'Leave End at -1 to slice from Start through the last element.',
      'Wire Start/End (e.g. page * size and page * size + size) to implement pagination.',
    ],
    pairsWith: ['array-length', 'array-range', 'counter', 'array-reverse'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const array = ctx.inputs.get('array')
  const start = Math.trunc(ctx.num('start', 0))
  const end = Math.trunc(ctx.num('end', -1))

  if (!Array.isArray(array)) {
    return new Map<string, unknown>([['result', []]])
  }

  // End -1 means "through the last element"; other negatives follow JS slice (-2 drops the
  // last two). Kept as-is so saved flows don't shift by one.
  const result = end === -1 ? array.slice(start) : array.slice(start, end)
  return new Map<string, unknown>([['result', result]])
}

export default defineNode({ definition, executor })
