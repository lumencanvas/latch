import type { NodeDefinition } from '../types'

export const orNode: NodeDefinition = {
  id: 'or',
  name: 'Or',
  version: '1.0.0',
  category: 'logic',
  description: 'Logical OR',
  icon: 'circle',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'boolean', label: 'A' },
    { id: 'b', type: 'boolean', label: 'B' },
  ],
  outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
  controls: [
    { id: 'a', type: 'toggle', label: 'A', default: false },
    { id: 'b', type: 'toggle', label: 'B', default: false },
  ],
  info: {
    overview: 'Outputs true when at least one of the two inputs is true. This is the standard boolean OR operation. Use it to allow multiple conditions to independently trigger the same behavior.',
    tips: [
      'Chain multiple Or nodes to combine more than two conditions.',
      'Combine with Not to create NOR logic.',
    ],
    pairsWith: ['and', 'not', 'gate', 'compare'],
  },
}
