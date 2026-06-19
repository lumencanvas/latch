import type { NodeDefinition } from '../types'

export const filterNode: NodeDefinition = {
  id: 'filter',
  name: 'Filter',
  version: '1.0.0',
  category: 'audio',
  description: 'Filter audio frequencies',
  icon: 'sliders',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'frequency', type: 'number', label: 'Freq' },
  ],
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  controls: [
    { id: 'frequency', type: 'number', label: 'Frequency', default: 1000 },
    { id: 'Q', type: 'number', label: 'Q', default: 1 },
    { id: 'type', type: 'select', label: 'Type', default: 'lowpass', props: { options: ['lowpass', 'highpass', 'bandpass', 'notch'] } },
  ],
  tags: ['filter', 'lowpass', 'highpass', 'bandpass', 'cutoff', 'resonance', 'eq', 'effect'],
  info: {
    overview: 'A standard biquad filter that removes or emphasizes frequencies in the audio signal. Supports lowpass, highpass, bandpass, and notch modes. The Q parameter controls the sharpness of the filter curve around the cutoff frequency.',
    tips: [
      'Automate the frequency input with an envelope or LFO for classic filter sweep effects.',
      'Use bandpass mode with a high Q to isolate a narrow frequency band.',
      'Chain two filters in series for a steeper rolloff (24 dB/octave instead of 12).',
    ],
    pairsWith: ['oscillator', 'gain', 'envelope', 'audio-output', 'svf-filter'],
  },
}
