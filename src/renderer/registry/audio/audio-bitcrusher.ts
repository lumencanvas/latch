import type { NodeDefinition } from '../types'

export const audioBitcrusherNode: NodeDefinition = {
  id: 'audio-bitcrusher',
  name: 'Bitcrusher',
  version: '1.0.0',
  category: 'audio',
  description: 'Bit-depth reduction for lo-fi, crunchy digital distortion.',
  icon: 'grid-2x2',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'bits', type: 'number', label: 'Bits' },
  ],
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  controls: [
    { id: 'bits', type: 'slider', label: 'Bits', default: 4, props: { min: 1, max: 16, step: 1 } },
    { id: 'wet', type: 'slider', label: 'Mix', default: 1, props: { min: 0, max: 1, step: 0.01 } },
  ],
  tags: ['bitcrusher', 'lo-fi', 'crush', 'digital', 'distortion', 'audio', 'effect', '8-bit'],
  info: {
    overview:
      'Quantizes the signal to a reduced bit depth for a crunchy, lo-fi digital sound. Fewer Bits = harsher crush; Mix blends against the clean input.',
    tips: [
      'Bits around 4–6 give a classic 8-bit / chiptune character.',
      'Pair with a low-pass Filter to tame the harsh high frequencies it adds.',
    ],
    pairsWith: ['oscillator', 'audio-distortion', 'filter', 'audio-output'],
  },
}
