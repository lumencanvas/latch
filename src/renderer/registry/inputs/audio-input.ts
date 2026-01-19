import type { NodeDefinition } from '../types'

export const audioInputNode: NodeDefinition = {
  id: 'audio-input',
  name: 'Audio Input',
  version: '1.0.0',
  category: 'inputs',
  description: 'Capture audio from microphone',
  icon: 'mic',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'level', type: 'number', label: 'Level' },
    { id: 'beat', type: 'trigger', label: 'Beat' },
  ],
  controls: [
    {
      id: 'source',
      type: 'select',
      label: 'Source',
      default: 'default',
      props: { deviceType: 'audio-input' },
    },
  ],
}
