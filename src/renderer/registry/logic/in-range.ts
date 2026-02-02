import type { NodeDefinition } from '../types'

export const inRangeNode: NodeDefinition = {
  id: 'in-range',
  name: 'In Range',
  version: '1.0.0',
  category: 'logic',
  description: 'Check if number is within a range',
  icon: 'arrow-left-right',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value' }],
  outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
  controls: [
    { id: 'value', type: 'number', label: 'Value', default: 0 },
    { id: 'min', type: 'number', label: 'Min', default: 0 },
    { id: 'max', type: 'number', label: 'Max', default: 1 },
    { id: 'inclusive', type: 'toggle', label: 'Inclusive', default: true },
  ],
  tags: ['range', 'between', 'threshold', 'bounds'],
  info: {
    overview: 'Tests whether a number falls within a specified minimum and maximum range. Returns true if the value is inside the range and false otherwise. The inclusive toggle controls whether the boundary values themselves count as in-range.',
    tips: [
      'Use with gate to only pass values that fall within acceptable bounds.',
      'Combine two In Range nodes with Or to check for values in multiple zones.',
    ],
    pairsWith: ['compare', 'clamp', 'gate', 'map-range'],
  },
}
