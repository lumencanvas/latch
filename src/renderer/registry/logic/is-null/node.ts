import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { isNullExecutor } from '@/engine/executors/utility'

const definition: NodeDefinition = {
  id: 'is-null',
  name: 'Is Null',
  version: '1.0.0',
  category: 'logic',
  description: 'Check if value is null or undefined',
  icon: 'circle-off',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
  controls: [],
  tags: ['null', 'undefined', 'check', 'empty', 'missing'],
  info: {
    overview: 'Tests whether a value is strictly null or undefined. Outputs true if the value is missing and false for all other values, including empty strings, zero, and false. Use this when you need to distinguish between missing data and legitimate falsy values.',
    tips: [
      'Prefer is-empty if you also want to catch empty strings and arrays.',
      'Feed the result into gate or pass-if to filter out null values.',
    ],
    pairsWith: ['is-empty', 'default-value', 'coalesce', 'gate'],
  },
}

export default defineNode({ definition, executor: isNullExecutor })
