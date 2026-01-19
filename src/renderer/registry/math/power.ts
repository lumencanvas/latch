import type { NodeDefinition } from '../types'

export const powerNode: NodeDefinition = {
  id: 'power',
  name: 'Power/Root',
  version: '1.0.0',
  category: 'math',
  description: 'Power, root, and logarithm functions',
  icon: 'superscript',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'base', type: 'number', label: 'Base' },
    { id: 'exponent', type: 'number', label: 'Exponent' },
  ],
  outputs: [
    { id: 'result', type: 'number', label: 'Result' },
  ],
  controls: [
    {
      id: 'operation',
      type: 'select',
      label: 'Operation',
      default: 'Power',
      props: {
        options: ['Power', 'Sqrt', 'Cbrt', 'Log', 'Log10', 'Ln', 'Exp'],
      },
    },
    { id: 'exponent', type: 'number', label: 'Exponent', default: 2 },
  ],
}
