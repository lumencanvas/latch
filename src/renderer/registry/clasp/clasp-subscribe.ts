import type { NodeDefinition } from '../types'

export const claspSubscribeNode: NodeDefinition = {
  id: 'clasp-subscribe',
  name: 'CLASP Subscribe',
  version: '1.0.0',
  category: 'clasp',
  description: 'Subscribe to CLASP address patterns and receive values',
  icon: 'bell',
  color: '#6366f1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection ID' },
    { id: 'pattern', type: 'string', label: 'Pattern' },
  ],
  outputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'address', type: 'string', label: 'Address' },
    { id: 'type', type: 'string', label: 'Signal Type' },
    { id: 'revision', type: 'number', label: 'Revision' },
    { id: 'subscribed', type: 'boolean', label: 'Subscribed' },
    { id: 'updated', type: 'boolean', label: 'Updated' },
  ],
  controls: [
    { id: 'connectionId', type: 'connection', label: 'Connection', default: '', props: { protocol: 'clasp', placeholder: 'Select CLASP connection...' } },
    { id: 'pattern', type: 'text', label: 'Pattern', default: '/**', props: { placeholder: '/lights/** or /param/*' } },
    { id: 'types', type: 'select', label: 'Signal Types', default: 'all', props: { options: ['all', 'param', 'event', 'stream', 'gesture'] } },
    { id: 'maxRate', type: 'number', label: 'Max Rate (Hz)', default: 0, props: { min: 0, max: 120, step: 1 } },
    { id: 'epsilon', type: 'number', label: 'Change Threshold', default: 0, props: { min: 0, max: 1, step: 0.01 } },
  ],
  tags: ['clasp', 'subscribe', 'listen', 'receive'],
  info: {
    overview: 'Subscribes to one or more CLASP addresses using glob-style patterns and outputs values as they change. You can filter by signal type and throttle the update rate. The node stays subscribed for as long as the connection is active.',
    tips: [
      'Use wildcard patterns like /lights/** to subscribe to an entire address subtree.',
      'Set a Max Rate to throttle high-frequency updates and reduce CPU load.',
      'Use the Change Threshold (epsilon) to ignore updates smaller than a given delta.',
    ],
    pairsWith: ['clasp-connection', 'clasp-set', 'clasp-emit', 'monitor', 'json-parse'],
  },
}
