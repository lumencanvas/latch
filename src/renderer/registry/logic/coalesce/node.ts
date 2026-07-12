import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { coalesceExecutor } from '@/engine/executors/utility'

const definition: NodeDefinition = {
  id: 'coalesce',
  name: 'Coalesce',
  version: '1.0.0',
  category: 'logic',
  description: 'Return first non-null/undefined value',
  icon: 'layers',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'any', label: 'A' },
    { id: 'b', type: 'any', label: 'B' },
    { id: 'c', type: 'any', label: 'C' },
    { id: 'd', type: 'any', label: 'D' },
  ],
  outputs: [{ id: 'result', type: 'any', label: 'Result' }],
  controls: [],
  tags: ['nullish', 'fallback', 'default', 'first'],
  info: {
    overview: 'Returns the first input that is not null or undefined, checking inputs A through D in order. This works like the nullish coalescing operator and is useful for building fallback chains where you want the first valid value.',
    tips: [
      'Put your preferred source in input A and fallbacks in B, C, D.',
      'Use with default-value when you also need to handle empty strings.',
    ],
    pairsWith: ['default-value', 'is-null', 'switch', 'select'],
  },
}

export default defineNode({ definition, executor: coalesceExecutor })
