import type { NodeDefinition } from '../types'

export const equalsNode: NodeDefinition = {
  id: 'equals',
  name: 'Equals',
  version: '1.0.0',
  category: 'logic',
  description: 'Type-agnostic equality comparison',
  icon: 'equal',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'any', label: 'A' },
    { id: 'b', type: 'any', label: 'B' },
  ],
  outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
  controls: [
    { id: 'strict', type: 'toggle', label: 'Strict (===)', default: true },
    { id: 'a', type: 'text', label: 'A', default: '' },
    { id: 'b', type: 'text', label: 'B', default: '' },
  ],
  tags: ['compare', 'equal', 'match', 'same'],
  info: {
    overview: 'Checks whether two values of any type are equal and outputs a boolean. Supports both strict (===) and loose (==) comparison modes. Unlike Compare, this works with strings, booleans, and other non-numeric types.',
    tips: [
      'Use strict mode to avoid unexpected type coercion.',
      'Pair with switch to branch on exact value matches.',
    ],
    pairsWith: ['compare', 'switch', 'gate', 'not', 'pass-if'],
  },
}
