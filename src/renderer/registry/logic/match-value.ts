import type { NodeDefinition } from '../types'

export const matchValueNode: NodeDefinition = {
  id: 'match-value',
  name: 'Match Value',
  version: '1.0.0',
  category: 'logic',
  description: 'Check if input equals a specific value',
  icon: 'check-circle',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
  ],
  outputs: [
    { id: 'result', type: 'boolean', label: 'Match' },
    { id: 'value', type: 'any', label: 'Value' },
  ],
  controls: [
    { id: 'target', type: 'text', label: 'Target Value', default: '' },
    { id: 'type', type: 'select', label: 'Compare As', default: 'auto', props: { options: ['auto', 'number', 'string', 'boolean'] } },
  ],
  tags: ['match', 'compare', 'equal', 'check', 'filter'],
  info: {
    overview: 'Tests whether an input value matches a specific target value you type in. Supports automatic type detection or explicit type coercion. Passes the original value through so you can chain it with gates or other logic.',
    tips: [
      'Use "auto" mode to let the node guess the type — it tries number first, then boolean, then string.',
      'The value output passes the input through unchanged, making it easy to chain with a gate.',
    ],
    pairsWith: ['gate', 'switch', 'compare', 'equals', 'pass-if'],
  },
}
