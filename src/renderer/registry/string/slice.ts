import type { NodeDefinition } from '../types'

export const stringSliceNode: NodeDefinition = {
  id: 'string-slice',
  name: 'String Slice',
  version: '1.0.0',
  category: 'string',
  description: 'Extract a portion of a string',
  icon: 'slice',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'string', label: 'Input' },
    { id: 'start', type: 'number', label: 'Start' },
    { id: 'end', type: 'number', label: 'End' },
  ],
  outputs: [
    { id: 'result', type: 'string', label: 'Result' },
    { id: 'length', type: 'number', label: 'Length' },
  ],
  controls: [
    { id: 'start', type: 'number', label: 'Start', default: 0 },
    { id: 'end', type: 'number', label: 'End', default: -1 },
  ],
}
