import type { NodeDefinition } from '../types'

export const lfoNode: NodeDefinition = {
  id: 'lfo',
  name: 'LFO',
  version: '1.0.0',
  category: 'timing',
  description: 'Low frequency oscillator',
  icon: 'waves',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [{ id: 'value', type: 'number', label: 'Value' }],
  controls: [
    { id: 'frequency', type: 'number', label: 'Frequency', default: 1 },
    { id: 'amplitude', type: 'number', label: 'Amplitude', default: 1 },
    { id: 'offset', type: 'number', label: 'Offset', default: 0 },
    { id: 'waveform', type: 'select', label: 'Waveform', default: 'sine', props: { options: ['sine', 'square', 'triangle', 'sawtooth'] } },
  ],
  tags: ['lfo', 'oscillator', 'modulation', 'wobble', 'wave', 'sine', 'automation', 'cycle', 'low frequency'],
  info: {
    overview: 'Generates a continuous oscillating value at a given frequency, amplitude, and offset. Supports sine, square, triangle, and sawtooth waveforms. Commonly used to animate parameters like color, position, or shader uniforms over time.',
    tips: [
      'Use the offset control to shift the output range so it stays positive when feeding into parameters that do not accept negative values.',
      'Square waveform at low frequency works well as an on/off toggle signal.',
      'Connect the output to a map-range node to rescale the LFO to any arbitrary range.',
    ],
    pairsWith: ['map-range', 'shader', 'smooth', 'blend', 'color-correction'],
  },
}
