import type { NodeDefinition } from '../types'

export const receiveNode: NodeDefinition = {
  id: 'receive',
  name: 'Receive',
  version: '1.0.0',
  category: 'messaging',
  description: 'Receive values from a named channel',
  icon: 'inbox',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'changed', type: 'trigger', label: 'Changed' },
  ],
  controls: [
    { id: 'channel', type: 'text', label: 'Channel', default: 'default' },
  ],
}
