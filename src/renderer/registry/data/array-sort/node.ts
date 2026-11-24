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
      props: { options: ['auto', 'numeric', 'alphabetic', 'natural'] },
    },
  ],
  tags: ['array', 'sort', 'order', 'ascending', 'descending'],
  info: {
    overview: 'Sorts the elements of an array in ascending or descending order. Supports auto-detection of type as well as explicit numeric or alphabetic sorting. Returns a new sorted array.',
    tips: [
      'Auto sorts numerically when every element is a number (or numeric string), otherwise alphabetically.',
      'Use "natural" to order labels like "item2" before "item10".',
      'Use "numeric" to force number ordering; non-numeric elements sort last.',
      'Chain with Array First/Last to quickly extract the minimum or maximum value.',
    ],
    pairsWith: ['array-first-last', 'array-reverse', 'array-unique', 'array-slice'],
  },
}

const plainCollator = new Intl.Collator()
const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** A finite number for a number / numeric string, else null. */
function toSortNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const array = ctx.inputs.get('array')
  const direction = (ctx.controls.get('direction') as string) ?? 'ascending'
  const sortType = (ctx.controls.get('type') as string) ?? 'auto'

  if (!Array.isArray(array)) {
    return new Map<string, unknown>([['result', []]])
  }

  // Pick ONE comparison mode for the whole array. Deciding per pair (the old auto mode) is
  // non-transitive on mixed arrays, and numeric mode with any NaN (`a - NaN`) broke the sort
  // contract — Array.sort then leaves the numbers unsorted.
  const numeric =
    sortType === 'numeric' ||
    (sortType === 'auto' && array.length > 0 && array.every((v) => toSortNumber(v) !== null))
  const sign = direction === 'descending' ? -1 : 1
  let cmp: (a: unknown, b: unknown) => number
  if (numeric) {
    cmp = (a, b) => {
      // Non-numeric elements always sort LAST (both directions) so the comparator stays consistent.
      const x = toSortNumber(a)
      const y = toSortNumber(b)
      if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1
      return sign * (x - y)
    }
  } else {
    const collator = sortType === 'natural' ? naturalCollator : plainCollator
    cmp = (a, b) => sign * collator.compare(String(a), String(b))
  }
  const sorted = [...array].sort(cmp)

  return new Map<string, unknown>([['result', sorted]])
}

export default defineNode({ definition, executor })
