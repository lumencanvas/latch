import { defineNode } from '@/engine/defineNode'
import { toStr } from '../strHelpers'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'string-slice',
  name: 'String Slice',
  version: '1.0.0',
  category: 'string',
  description: 'Extract a portion of a string',
  icon: 'slice',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'string', label: 'Input' },
    { id: 'start', type: 'number', label: 'Start' },
    { id: 'end', type: 'number', label: 'End' },
  ],
  outputs: [
    { id: 'result', type: 'string', label: 'Result' },
    { id: 'length', type: 'number', label: 'Length' },
  ],
  controls: [
    { id: 'start', type: 'number', label: 'Start', default: 0 },
    { id: 'end', type: 'number', label: 'End', default: -1 },
  ],
  info: {
    overview: 'Extracts a substring from the input using start and end indices. Negative indices count from the end of the string. Also outputs the length of the extracted portion.',
    tips: [
      'Set end to -1 to slice from the start index through the rest of the string.',
      'Combine with String Length to dynamically calculate slice boundaries.',
    ],
    pairsWith: ['string-length', 'string-contains', 'string-split', 'expression'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = toStr(ctx.inputs.get('input'))
  const start = Math.trunc(ctx.num('start', 0))
  const end = Math.trunc(ctx.num('end', -1))

  const outputs = new Map<string, unknown>()

  if (!input) {
    outputs.set('result', '')
    outputs.set('length', 0)
    return outputs
  }

  // End -1 means "through the last element"; other negatives follow JS slice (-2 drops the
  // last two). Kept as-is so saved flows don't shift by one.
  const result = end === -1 ? input.slice(start) : input.slice(start, end)

  outputs.set('result', result)
  outputs.set('length', result.length)

  return outputs
}

export default defineNode({ definition, executor })
