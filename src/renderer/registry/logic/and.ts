import type { NodeDefinition } from '../types'

export const andNode: NodeDefinition = {
  id: 'and',
  name: 'And',
  version: '1.0.0',
  category: 'logic',
  description: 'Logical AND',
  icon: 'circle-dot',
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
    overview: 'Outputs true only when both inputs are true. This is the standard boolean AND operation used to require multiple conditions to be satisfied simultaneously.',
    tips: [
      'Chain multiple And nodes together to require more than two conditions.',
      'Combine with Not to build NAND logic.',
    ],
    pairsWith: ['or', 'not', 'gate', 'compare'],
  },
}
