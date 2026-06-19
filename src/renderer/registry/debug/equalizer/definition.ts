import type { NodeDefinition } from '../../types'

export const equalizerNode: NodeDefinition = {
  id: 'equalizer',
  name: 'Equalizer',
  version: '1.0.0',
  category: 'debug',
  description: 'Visualize audio frequency spectrum as bars',
  icon: 'bar-chart-3',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  outputs: [],
  controls: [
    { id: 'barCount', type: 'slider', label: 'Bars', default: 16, props: { min: 8, max: 32, step: 4 } },
    { id: 'colorMode', type: 'select', label: 'Color', default: 'gradient', props: { options: ['gradient', 'spectrum', 'solid'] } },
    { id: 'smoothing', type: 'slider', label: 'Smooth', default: 0.8, props: { min: 0, max: 0.95, step: 0.05 } },
  ],
  tags: ['equalizer', 'spectrum', 'fft', 'frequency', 'analyzer', 'bands', 'audio reactive', 'visualizer'],
  info: {
    overview: 'Shows the frequency spectrum of an audio signal as animated bars. Connect any audio source to see a real-time breakdown of low, mid, and high frequencies. Helpful for verifying filter or EQ behavior at a glance.',
    tips: [
      'Lower the smoothing value to make the bars react faster to transients.',
      'Use "spectrum" color mode to map bar color to frequency, making it easier to spot dominant bands.',
    ],
    pairsWith: ['audio-analyzer', 'filter', 'parametric-eq', 'audio-input', 'oscilloscope'],
  },
}
