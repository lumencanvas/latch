import type { NodeDefinition } from '../types'

export const stringSplitNode: NodeDefinition = {
  id: 'string-split',
  name: 'String Split',
  version: '1.0.0',
  category: 'string',
  description: 'Split string into parts',
  icon: 'scissors',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'string', label: 'Input' },
  ],
  outputs: [
    { id: 'parts', type: 'array', label: 'Parts' },
    { id: 'first', type: 'string', label: 'First' },
    { id: 'count', type: 'number', label: 'Count' },
  ],
  controls: [
    { id: 'separator', type: 'text', label: 'Separator', default: ',' },
    { id: 'limit', type: 'number', label: 'Limit', default: 0, props: { min: 0 } },
  ],
}
