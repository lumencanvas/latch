import { defineNode } from '@/engine/defineNode'
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
  inputs: [],
  outputs: [{ id: 'result', type: 'array', label: 'Result' }],
  controls: [
    { id: 'start', type: 'number', label: 'Start', default: 0 },
    { id: 'end', type: 'number', label: 'End', default: 10 },
    { id: 'step', type: 'number', label: 'Step', default: 1 },
  ],
  tags: ['array', 'range', 'sequence', 'generate'],
  info: {
    overview: 'Generates an array of sequential numbers from a start value to an end value with a configurable step. Useful for creating index lists, iteration sequences, or evenly spaced numeric data.',
    tips: [
      'Use a fractional step value like 0.1 to generate fine-grained numeric sequences.',
      'Feed the output into Array Get to iterate over another array by index.',
    ],
    pairsWith: ['array-get', 'expression', 'counter', 'array-length'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const start = (ctx.controls.get('start') as number) ?? 0
  const end = (ctx.controls.get('end') as number) ?? 10
  const step = (ctx.controls.get('step') as number) ?? 1

  const result: number[] = []
  const safeStep = step === 0 ? 1 : Math.abs(step)

  if (start <= end) {
    for (let i = start; i < end; i += safeStep) {
      result.push(i)
      if (result.length > 10000) break // Safety limit
    }
  } else {
    for (let i = start; i > end; i -= safeStep) {
      result.push(i)
      if (result.length > 10000) break // Safety limit
    }
  }

  return new Map<string, unknown>([['result', result]])
}

export default defineNode({ definition, executor })
