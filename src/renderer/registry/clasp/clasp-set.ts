import type { NodeDefinition } from '../types'

export const claspSetNode: NodeDefinition = {
  id: 'clasp-set',
  name: 'CLASP Set',
  version: '1.0.0',
  category: 'clasp',
  description: 'Set a CLASP parameter value (persistent state)',
  icon: 'edit-3',
  color: '#6366f1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection ID' },
    { id: 'address', type: 'string', label: 'Address' },
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'trigger', type: 'trigger', label: 'Send' },
  ],
  outputs: [
    { id: 'sent', type: 'boolean', label: 'Sent' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'connectionId', type: 'connection', label: 'Connection', default: '', props: { protocol: 'clasp', placeholder: 'Select CLASP connection...' } },
    { id: 'address', type: 'text', label: 'Address', default: '/param', props: { placeholder: '/lights/strip1/brightness' } },
  ],
  tags: ['clasp', 'set', 'parameter', 'send'],
  info: {
    overview: 'Writes a value to a CLASP parameter address. The value persists on the server until changed again, making this the right choice for durable state like brightness levels or configuration values. Pair with CLASP Subscribe on other clients to observe the change.',
    tips: [
      'Use the trigger input to control exactly when the value is written.',
      'Combine with an expression node to transform values before sending.',
      'Use CLASP Emit instead when you need a fire-and-forget event that does not persist.',
    ],
    pairsWith: ['clasp-connection', 'clasp-get', 'clasp-subscribe', 'expression'],
  },
}
