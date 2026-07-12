import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'compare',
  name: 'Compare',
  version: '1.0.0',
  category: 'logic',
  description: 'Compare two values',
  icon: 'git-compare',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'number', label: 'A' },
    { id: 'b', type: 'number', label: 'B' },
  ],
  outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
  controls: [
    { id: 'operator', type: 'select', label: 'Op', default: '==', props: { options: ['==', '!=', '>', '>=', '<', '<='] } },
    { id: 'a', type: 'number', label: 'A', default: 0 },
    { id: 'b', type: 'number', label: 'B', default: 0 },
  ],
  info: {
    overview: 'Compares two numeric values using a selectable operator and outputs a boolean result. Supports equality, inequality, greater-than, and less-than checks. Use this for threshold detection and conditional branching.',
    tips: [
      'Feed the boolean result into a gate or switch to route values based on the comparison.',
      'Use the >= or <= operators for inclusive threshold checks.',
    ],
    pairsWith: ['gate', 'switch', 'in-range', 'clamp', 'equals'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = (ctx.inputs.get('a') as number) ?? (ctx.controls.get('a') as number) ?? 0
  const b = (ctx.inputs.get('b') as number) ?? (ctx.controls.get('b') as number) ?? 0
  const operator = (ctx.controls.get('operator') as string) ?? '=='

  let result: boolean
  switch (operator) {
    case '==':
      result = a === b
      break
    case '!=':
      result = a !== b
      break
    case '>':
      result = a > b
      break
    case '>=':
      result = a >= b
      break
    case '<':
      result = a < b
      break
    case '<=':
      result = a <= b
      break
    default:
      result = false
  }

  return new Map([['result', result ? 1 : 0]])
}

export default defineNode({ definition, executor, pure: true })
