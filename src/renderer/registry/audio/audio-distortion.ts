import type { NodeDefinition } from '../types'

export const audioDistortionNode: NodeDefinition = {
  id: 'audio-distortion',
  name: 'Distortion',
  version: '1.0.0',
  category: 'audio',
  description: 'Waveshaping distortion / overdrive.',
  icon: 'flame',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'amount', type: 'number', label: 'Amount' },
  ],
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  controls: [
    { id: 'amount', type: 'slider', label: 'Amount', default: 0.4, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'wet', type: 'slider', label: 'Mix', default: 1, props: { min: 0, max: 1, step: 0.01 } },
  ],
  tags: ['distortion', 'overdrive', 'fuzz', 'waveshaper', 'audio', 'effect'],
  info: {
    overview:
      'Adds harmonic distortion by waveshaping the signal. Amount controls how hard it is driven; Mix blends the distorted signal against the clean input.',
    tips: [
      'Drive Amount from an envelope or LFO for evolving grit.',
      'Lower the Mix for parallel distortion that keeps the original punch.',
    ],
    pairsWith: ['oscillator', 'filter', 'audio-output', 'audio-bitcrusher'],
  },
}
