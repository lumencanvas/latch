import type { NodeDefinition } from '../types'

export const sendNode: NodeDefinition = {
  id: 'send',
  name: 'Send',
  version: '1.0.0',
  category: 'messaging',
  description: 'Send values to a named channel',
  icon: 'send',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'trigger', type: 'trigger', label: 'Send' },
  ],
  outputs: [],
  controls: [
    { id: 'channel', type: 'text', label: 'Channel', default: 'default' },
    { id: 'sendOnChange', type: 'toggle', label: 'Send on Change', default: true },
  ],
}
