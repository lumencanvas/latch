import type { NodeDefinition } from '../types'

export const stringCaseNode: NodeDefinition = {
  id: 'string-case',
  name: 'String Case',
  version: '1.0.0',
  category: 'string',
  description: 'Convert string case',
  icon: 'case-upper',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'string', label: 'Input' },
  ],
  outputs: [
    { id: 'result', type: 'string', label: 'Result' },
  ],
  controls: [
    {
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'UPPER',
      props: {
        options: ['UPPER', 'lower', 'Title', 'camelCase', 'snake_case', 'kebab-case'],
      },
    },
  ],
}
