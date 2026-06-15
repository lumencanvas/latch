import type { NodeDefinition } from '../types'

export const audioInputNode: NodeDefinition = {
  id: 'audio-input',
  name: 'Audio Input',
  version: '1.0.0',
  category: 'inputs',
  description: 'Capture audio from microphone',
  icon: 'mic',
  platforms: ['web', 'electron'],
  // Self-captures the mic via getUserMedia (same capability as webcam), so it
  // warns when media capture is unavailable instead of failing silently.
  requires: ['camera'],
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
  info: {
    overview: 'Captures live audio from a microphone or other system input device. It provides a raw audio stream, a level envelope, and a beat trigger. The source selector lets you pick which input device to use when multiple are available.',
    tips: [
      'Connect the beat output to a counter or toggle for rhythm-reactive patches.',
      'Use the level output with a map-range node to scale microphone loudness to a useful parameter range.',
      'Grant microphone permissions before adding this node to avoid silent failures.',
    ],
    pairsWith: ['audio-analyzer', 'beat-detect', 'gain', 'filter'],
  },
}
