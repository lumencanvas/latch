import type { NodeDefinition } from '../types'

export const claspConnectionNode: NodeDefinition = {
  id: 'clasp-connection',
  name: 'CLASP Connection',
  version: '1.0.0',
  category: 'connectivity',
  description: 'Manage a named CLASP connection (can be shared across nodes)',
  icon: 'network',
  color: '#6366f1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'url', type: 'string', label: 'URL' },
    { id: 'connect', type: 'trigger', label: 'Connect' },
    { id: 'disconnect', type: 'trigger', label: 'Disconnect' },
  ],
  outputs: [
    { id: 'connected', type: 'boolean', label: 'Connected' },
    { id: 'status', type: 'string', label: 'Status' },
    { id: 'error', type: 'string', label: 'Error' },
    { id: 'session', type: 'string', label: 'Session ID' },
    { id: 'connectionId', type: 'string', label: 'Connection ID' },
  ],
  controls: [
    { id: 'connectionId', type: 'text', label: 'Connection ID', default: 'default', props: { placeholder: 'Unique ID to reference this connection' } },
    { id: 'url', type: 'text', label: 'URL', default: 'ws://localhost:7330', props: { placeholder: 'ws://host:port' } },
    { id: 'name', type: 'text', label: 'Client Name', default: 'latch' },
    { id: 'token', type: 'text', label: 'Token', default: '', props: { placeholder: 'cpsk_... or empty for open' } },
    { id: 'autoConnect', type: 'toggle', label: 'Auto Connect', default: true },
    { id: 'autoReconnect', type: 'toggle', label: 'Auto Reconnect', default: true },
    { id: 'reconnectDelay', type: 'number', label: 'Reconnect Delay (ms)', default: 5000, props: { min: 1000, max: 60000 } },
  ],
  tags: ['clasp', 'protocol', 'connection', 'websocket'],
}
