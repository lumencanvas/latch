import type { NodeDefinition } from '../types'

export const trigNode: NodeDefinition = {
  id: 'trig',
  name: 'Trig',
  version: '1.0.0',
  category: 'math',
  description: 'Trigonometric functions',
  icon: 'waves',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'number', label: 'Value' },
  ],
  outputs: [
    { id: 'result', type: 'number', label: 'Result' },
  ],
  controls: [
    {
      id: 'function',
      type: 'select',
      label: 'Function',
      default: 'sin',
      props: {
        options: ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh'],
      },
    },
    { id: 'degrees', type: 'toggle', label: 'Use Degrees', default: false },
  ],
}
