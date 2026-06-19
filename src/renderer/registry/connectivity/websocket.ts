import type { NodeDefinition } from '../types'

export const websocketNode: NodeDefinition = {
  id: 'websocket',
  name: 'WebSocket',
  version: '2.0.0',
  category: 'connectivity',
  description: 'Real-time WebSocket connection using ConnectionManager',
  icon: 'radio',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'connectionId', type: 'string', label: 'Connection' },
    { id: 'send', type: 'data', label: 'Send' },
    { id: 'trigger', type: 'trigger', label: 'Send Trigger' },
  ],
  outputs: [
    { id: 'message', type: 'data', label: 'Message' },
    { id: 'connected', type: 'boolean', label: 'Connected' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    {
      id: 'connectionId',
      type: 'connection',
      label: 'Connection',
      default: '',
      props: { protocol: 'websocket', placeholder: 'Select WebSocket connection...' },
    },
  ],
  tags: ['websocket', 'ws', 'socket', 'realtime', 'network', 'stream'],
  info: {
    overview: 'Opens a persistent WebSocket connection for real-time bidirectional messaging. Uses a shared connection from the ConnectionManager so multiple nodes can share the same socket. Incoming messages appear on the Message output and you can send data through the Send input.',
    tips: [
      'Use a shared connection ID to let multiple WebSocket nodes share a single socket.',
      'Connect a trigger to the Send Trigger input to control when outgoing messages are dispatched.',
      'Pair with json-parse to decode structured messages arriving as JSON strings.',
    ],
    pairsWith: ['json-parse', 'json-stringify', 'mqtt', 'trigger', 'console'],
  },
}
