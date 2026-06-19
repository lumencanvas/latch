import type { NodeDefinition } from '@/stores/nodes'

export const oscilloscopeNode: NodeDefinition = {
  id: 'oscilloscope',
  name: 'Oscilloscope',
  version: '1.0.0',
  category: 'debug',
  description: 'Visualize signal waveform over time',
  icon: 'activity',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'signal', type: 'number', label: 'Signal' },
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  outputs: [],
  controls: [
    { id: 'timeScale', type: 'slider', label: 'Time Scale', default: 1, props: { min: 0.25, max: 4, step: 0.25 } },
    { id: 'amplitude', type: 'slider', label: 'Amplitude', default: 1, props: { min: 0.1, max: 2, step: 0.1 } },
  ],
  tags: ['oscilloscope', 'scope', 'waveform', 'signal', 'wave', 'monitor', 'debug'],
  info: {
    overview: 'Draws a scrolling waveform of a numeric signal or audio input over time. Use it to inspect the shape and timing of any continuous signal. Accepts both plain number values and audio connections.',
    tips: [
      'Increase the time scale to see more of the waveform history in the display.',
      'Lower the amplitude if the signal clips beyond the visible area.',
      'Connect the audio input for Web Audio signals and the signal input for regular numeric streams.',
    ],
    pairsWith: ['lfo', 'oscillator', 'audio-analyzer', 'equalizer', 'envelope'],
  },
}
