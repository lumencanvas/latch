import type { NodeDefinition } from '../../types'

export const dispatchNode: NodeDefinition = {
  id: 'dispatch',
  name: 'Dispatch',
  version: '1.0.0',
  category: 'logic',
  description: 'Route to outputs based on multiple conditions',
  icon: 'git-fork',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
  ],
  outputs: [
    { id: 'out-0', type: 'any', label: '→ 1' },
  ],
  controls: [
    { id: 'conditions', type: 'data', label: 'Conditions', default: JSON.stringify([{ operator: '==', value: '', type: 'number' }]) },
    { id: 'property', type: 'text', label: 'Property Path', default: '' },
    { id: 'checkAll', type: 'toggle', label: 'Check All Rules', default: false },
  ],
  tags: ['dispatch', 'route', 'switch', 'conditional', 'branch', 'filter'],
  info: {
    overview: 'Routes an input value to one or more outputs based on a list of conditions you define. Each condition maps to its own output port. Similar to a switch statement or Node-RED switch node. By default, stops at the first matching condition.',
    tips: [
      'Enable "Check All Rules" to send the value to every matching output, not just the first.',
      'Use the Property Path to check a nested value (e.g. "payload.value") while still passing the full input through.',
      'Add an "otherwise" condition at the end to catch unmatched values.',
    ],
    pairsWith: ['compare', 'gate', 'switch', 'equals', 'match-value'],
  },
}
