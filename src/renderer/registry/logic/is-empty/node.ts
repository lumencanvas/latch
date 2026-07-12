import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { isEmptyExecutor } from '@/engine/executors/utility'

const definition: NodeDefinition = {
  id: 'is-empty',
  name: 'Is Empty',
  version: '1.0.0',
  category: 'logic',
  description: 'Check if value is null, undefined, empty string, or empty array',
  icon: 'box',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [
    { id: 'result', type: 'boolean', label: 'Result' },
    { id: 'type', type: 'string', label: 'Type' },
  ],
  controls: [],
  tags: ['null', 'undefined', 'empty', 'check', 'array', 'string'],
  info: {
    overview: 'Checks if a value is null, undefined, an empty string, or an empty array. Outputs a boolean result and also reports the detected type of the value. Broader than is-null because it also catches empty collections and strings.',
    tips: [
      'Use the Type output to inspect what kind of value arrived.',
      'Pair with default-value to replace empty inputs with a fallback.',
    ],
    pairsWith: ['is-null', 'default-value', 'coalesce', 'pass-if'],
  },
}

export default defineNode({ definition, executor: isEmptyExecutor })
