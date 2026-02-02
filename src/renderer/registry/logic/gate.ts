import type { NodeDefinition } from '../types'

export const gateNode: NodeDefinition = {
  id: 'gate',
  name: 'Gate',
  version: '1.0.0',
  category: 'logic',
  description: 'Pass or block value',
  icon: 'door-open',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'gate', type: 'boolean', label: 'Gate' },
  ],
  outputs: [{ id: 'result', type: 'any', label: 'Result' }],
  controls: [
    { id: 'open', type: 'toggle', label: 'Open', default: true },
    { id: 'value', type: 'text', label: 'Value', default: '' },
  ],
  info: {
    overview: 'Passes a value through when the gate is open and blocks it when the gate is closed. The gate state is controlled by the boolean Gate input or the Open toggle. This is the simplest way to conditionally allow or stop data flow.',
    tips: [
      'Connect a compare or equals node to the Gate input for dynamic control.',
      'Use the toggle control to manually override the gate during testing.',
    ],
    pairsWith: ['compare', 'and', 'or', 'pass-if', 'latch'],
  },
}
