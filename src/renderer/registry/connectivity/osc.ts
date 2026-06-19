import type { NodeDefinition } from '../types'

export const oscNode: NodeDefinition = {
  id: 'osc',
  name: 'OSC',
  version: '1.0.0',
  category: 'connectivity',
  description: 'Open Sound Control over WebSocket',
  icon: 'radio-tower',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'host', type: 'string', label: 'Host' },
    { id: 'port', type: 'number', label: 'Port' },
    { id: 'address', type: 'string', label: 'Address' },
    { id: 'send', type: 'data', label: 'Send' },
  ],
  outputs: [
    { id: 'address', type: 'string', label: 'Address' },
    { id: 'args', type: 'data', label: 'Arguments' },
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'connected', type: 'boolean', label: 'Connected' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'host', type: 'text', label: 'Host', default: 'localhost' },
    { id: 'port', type: 'number', label: 'Port', default: 8080, props: { min: 1, max: 65535 } },
    { id: 'address', type: 'text', label: 'Address', default: '/clasp', props: { placeholder: '/path/to/param' } },
    { id: 'connect', type: 'toggle', label: 'Connect', default: true },
  ],
  tags: ['osc', 'open sound control', 'udp', 'touchosc', 'network', 'control'],
  info: {
    overview: 'Sends and receives Open Sound Control messages over a WebSocket bridge. You specify a host, port, and OSC address pattern. Incoming messages are split into their address and argument components for easy downstream processing.',
    tips: [
      'Make sure an OSC-to-WebSocket bridge is running on the target host and port.',
      'Use address patterns like /mixer/fader1 to target specific parameters.',
      'Connect the Value output to a gain or expression node for real-time parameter control.',
    ],
    pairsWith: ['midi-input', 'expression', 'gain', 'monitor', 'console'],
  },
}
