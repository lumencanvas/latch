import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { passIfExecutor } from '@/engine/executors/utility'

const definition: NodeDefinition = {
  id: 'pass-if',
  name: 'Pass If',
  version: '1.0.0',
  category: 'logic',
  description: 'Pass value through only if condition is met',
  icon: 'filter',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'condition', type: 'boolean', label: 'Condition' },
  ],
  outputs: [{ id: 'result', type: 'any', label: 'Result' }],
  controls: [
    {
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'when-true',
      props: { options: ['when-true', 'when-false', 'when-not-null', 'when-not-empty'] },
    },
  ],
  tags: ['conditional', 'filter', 'gate', 'pass', 'block'],
  info: {
    overview: 'Forwards the input value only when a condition is met, blocking it otherwise. Supports multiple modes including when-true, when-false, when-not-null, and when-not-empty. More flexible than a basic gate because it can filter on data presence, not just booleans.',
    tips: [
      'Use when-not-null mode to filter out missing values without a separate is-null check.',
      'Switch to when-false mode to pass values only when a condition fails.',
    ],
    pairsWith: ['gate', 'compare', 'is-null', 'is-empty', 'switch'],
  },
}

export default defineNode({ definition, executor: passIfExecutor })
