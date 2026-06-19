import type { NodeDefinition } from '../types'

export const gainNode: NodeDefinition = {
  id: 'gain',
  name: 'Gain',
  version: '1.0.0',
  category: 'audio',
  description: 'Adjust audio volume',
  icon: 'volume-1',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'gain', type: 'number', label: 'Gain' },
  ],
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  controls: [
    { id: 'gain', type: 'number', label: 'Gain', default: 1 },
  ],
  tags: ['gain', 'volume', 'level', 'amplitude', 'amp', 'loudness'],
  info: {
    overview: 'Multiplies the audio signal amplitude by a gain factor. A value of 1 passes audio unchanged, values below 1 attenuate, and values above 1 amplify. This is the primary volume control node in any audio chain.',
    tips: [
      'Connect an envelope output to the gain input for amplitude modulation.',
      'Place a gain node right before audio output as a master volume control.',
      'Use a gain of 0 as a quick mute, or connect an LFO for tremolo effects.',
    ],
    pairsWith: ['audio-output', 'oscillator', 'filter', 'envelope', 'audio-player'],
  },
}
