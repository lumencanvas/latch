import type { NodeDefinition } from '../types'

export const moduloNode: NodeDefinition = {
  id: 'modulo',
  name: 'Modulo',
  version: '1.0.0',
  category: 'math',
  description: 'Modulo (remainder) operation',
  icon: 'percent',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'divisor', type: 'number', label: 'Divisor' },
  ],
  outputs: [
    { id: 'result', type: 'number', label: 'Result' },
  ],
  controls: [
    { id: 'divisor', type: 'number', label: 'Divisor', default: 1 },
    {
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'Standard',
      props: {
        options: ['Standard', 'Positive', 'Floor'],
      },
    },
  ],
}
