import type { NodeDefinition } from '../types'

export const claspGetNode: NodeDefinition = {
  id: 'clasp-get',
  name: 'CLASP Get',
  version: '1.0.0',
  category: 'clasp',
  description: 'Get current value of a CLASP parameter',
  icon: 'download',
  color: '#6366f1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection ID' },
    { id: 'address', type: 'string', label: 'Address' },
    { id: 'trigger', type: 'trigger', label: 'Get' },
  ],
  outputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'connectionId', type: 'connection', label: 'Connection', default: '', props: { protocol: 'clasp', placeholder: 'Select CLASP connection...' } },
    { id: 'address', type: 'text', label: 'Address', default: '/param', props: { placeholder: '/lights/strip1/brightness' } },
  ],
  tags: ['clasp', 'get', 'read', 'fetch'],
  info: {
    overview: 'Fetches the current value of a single CLASP parameter on demand. Unlike Subscribe, this performs a one-time read each time it is triggered. Use it when you need a snapshot of a parameter rather than continuous updates.',
    tips: [
      'Connect a trigger node to poll the value at specific intervals or on user action.',
      'Use CLASP Subscribe instead if you need real-time continuous updates.',
      'Check the Error output to handle cases where the address does not exist.',
    ],
    pairsWith: ['clasp-connection', 'clasp-set', 'clasp-subscribe', 'trigger'],
  },
}
