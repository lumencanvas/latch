import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'array-sort',
  name: 'Array Sort',
  version: '1.0.0',
  category: 'data',
  description: 'Sort array values',
  icon: 'arrow-up-down',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'array', type: 'array', label: 'Array' }],
  outputs: [{ id: 'result', type: 'array', label: 'Result' }],
  controls: [
    {
      id: 'direction',
      type: 'select',
      label: 'Direction',
      default: 'ascending',
      props: { options: ['ascending', 'descending'] },
    },
    {
      id: 'type',
      type: 'select',
      label: 'Type',
      default: 'auto',
      props: { options: ['auto', 'numeric', 'alphabetic'] },
    },
  ],
  tags: ['array', 'sort', 'order', 'ascending', 'descending'],
  info: {
    overview: 'Sorts the elements of an array in ascending or descending order. Supports auto-detection of type as well as explicit numeric or alphabetic sorting. Returns a new sorted array.',
    tips: [
      'Use the "numeric" type when sorting strings that contain numbers to avoid lexicographic ordering.',
      'Chain with Array First/Last to quickly extract the minimum or maximum value.',
    ],
    pairsWith: ['array-first-last', 'array-reverse', 'array-unique', 'array-slice'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const array = ctx.inputs.get('array')
  const direction = (ctx.controls.get('direction') as string) ?? 'ascending'
  const sortType = (ctx.controls.get('type') as string) ?? 'auto'

  if (!Array.isArray(array)) {
    return new Map<string, unknown>([['result', []]])
  }

  const sorted = [...array].sort((a, b) => {
    let compareResult: number

    if (sortType === 'numeric' || (sortType === 'auto' && typeof a === 'number' && typeof b === 'number')) {
      compareResult = Number(a) - Number(b)
    } else {
      compareResult = String(a).localeCompare(String(b))
    }

    return direction === 'descending' ? -compareResult : compareResult
  })

  return new Map<string, unknown>([['result', sorted]])
}

export default defineNode({ definition, executor })
