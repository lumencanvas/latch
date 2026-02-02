import type { NodeDefinition } from '../types'

export const claspBundleNode: NodeDefinition = {
  id: 'clasp-bundle',
  name: 'CLASP Bundle',
  version: '1.0.0',
  category: 'clasp',
  description: 'Send atomic bundles of operations',
  icon: 'package',
  color: '#6366f1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection ID' },
    { id: 'messages', type: 'data', label: 'Messages' },
    { id: 'at', type: 'number', label: 'Schedule At (us)' },
    { id: 'trigger', type: 'trigger', label: 'Send' },
  ],
  outputs: [
    { id: 'sent', type: 'boolean', label: 'Sent' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'connectionId', type: 'connection', label: 'Connection', default: '', props: { protocol: 'clasp', placeholder: 'Select CLASP connection...' } },
  ],
  tags: ['clasp', 'bundle', 'atomic', 'batch'],
  info: {
    overview: 'Sends multiple CLASP messages as a single atomic bundle so they are applied together on the server. You can optionally schedule the bundle to execute at a specific timestamp for sample-accurate coordination. This is useful when several parameters must change in lockstep.',
    tips: [
      'Use the Schedule At input to synchronize bundle execution with other timed events.',
      'Build the messages array using upstream nodes before connecting it to the Messages input.',
      'Pair with a CLASP Connection node to supply the Connection ID.',
    ],
    pairsWith: ['clasp-connection', 'clasp-set', 'clasp-emit', 'trigger'],
  },
}
