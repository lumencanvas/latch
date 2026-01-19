import type { NodeDefinition } from '../types'

export const pitchDetectNode: NodeDefinition = {
  id: 'pitch-detect',
  name: 'Pitch Detect',
  version: '1.0.0',
  category: 'audio',
  description: 'Detect pitch from audio input',
  icon: 'music',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  outputs: [
    { id: 'frequency', type: 'number', label: 'Frequency (Hz)' },
    { id: 'note', type: 'string', label: 'Note' },
    { id: 'octave', type: 'number', label: 'Octave' },
    { id: 'midi', type: 'number', label: 'MIDI' },
    { id: 'confidence', type: 'number', label: 'Confidence' },
  ],
  controls: [
    {
      id: 'minFreq',
      type: 'number',
      label: 'Min Freq',
      default: 50,
      props: { min: 20, max: 1000, step: 1 },
    },
    {
      id: 'maxFreq',
      type: 'number',
      label: 'Max Freq',
      default: 2000,
      props: { min: 100, max: 10000, step: 1 },
    },
  ],
}
