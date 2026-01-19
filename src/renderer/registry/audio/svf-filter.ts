import type { NodeDefinition } from '../types'

export const svfFilterNode: NodeDefinition = {
  id: 'svf-filter',
  name: 'SVF Filter',
  version: '1.0.0',
  category: 'audio',
  description: 'State Variable Filter with multiple outputs',
  icon: 'filter',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'cutoff', type: 'number', label: 'Cutoff' },
    { id: 'resonance', type: 'number', label: 'Resonance' },
  ],
  outputs: [
    { id: 'lowpass', type: 'audio', label: 'Lowpass' },
    { id: 'highpass', type: 'audio', label: 'Highpass' },
    { id: 'bandpass', type: 'audio', label: 'Bandpass' },
    { id: 'notch', type: 'audio', label: 'Notch' },
  ],
  controls: [
    {
      id: 'cutoff',
      type: 'number',
      label: 'Cutoff (Hz)',
      default: 1000,
      props: { min: 20, max: 20000, step: 1 },
    },
    {
      id: 'resonance',
      type: 'slider',
      label: 'Resonance',
      default: 0.5,
      props: { min: 0, max: 1, step: 0.01 },
    },
    {
      id: 'drive',
      type: 'slider',
      label: 'Drive',
      default: 0,
      props: { min: 0, max: 2, step: 0.01 },
    },
  ],
}
