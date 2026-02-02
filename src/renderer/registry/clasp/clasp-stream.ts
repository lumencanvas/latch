import type { NodeDefinition } from '../types'

export const claspStreamNode: NodeDefinition = {
  id: 'clasp-stream',
  name: 'CLASP Stream',
  version: '1.0.0',
  category: 'clasp',
  description: 'Stream high-rate data (continuous updates)',
  icon: 'activity',
  color: '#6366f1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection ID' },
    { id: 'address', type: 'string', label: 'Address' },
    { id: 'value', type: 'any', label: 'Value' },
  ],
  outputs: [
    { id: 'sent', type: 'boolean', label: 'Sent' },
  ],
  controls: [
    { id: 'connectionId', type: 'connection', label: 'Connection', default: '', props: { protocol: 'clasp', placeholder: 'Select CLASP connection...' } },
    { id: 'address', type: 'text', label: 'Address', default: '/stream', props: { placeholder: '/sensor/temperature' } },
    { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
  ],
  tags: ['clasp', 'stream', 'continuous', 'high-rate'],
  info: {
    overview: 'Sends high-rate continuous data to a CLASP address. Unlike Set, stream messages are optimized for throughput and do not guarantee persistence. Use this for sensor feeds, animation data, or any value that updates many times per second.',
    tips: [
      'Disable the Enabled toggle to pause streaming without disconnecting.',
      'Use CLASP Set instead when the value needs to persist on the server.',
      'Keep the address consistent so subscribers can reliably receive the stream.',
    ],
    pairsWith: ['clasp-connection', 'clasp-subscribe', 'oscillator', 'expression'],
  },
}
