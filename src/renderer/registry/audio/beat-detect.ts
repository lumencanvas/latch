import type { NodeDefinition } from '../types'

export const beatDetectNode: NodeDefinition = {
  id: 'beat-detect',
  name: 'Beat Detect',
  version: '1.0.0',
  category: 'audio',
  description: 'Detect beats and estimate BPM',
  icon: 'activity',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio', required: true },
  ],
  outputs: [
    { id: 'beat', type: 'trigger', label: 'Beat' },
    { id: 'bpm', type: 'number', label: 'BPM' },
    { id: 'energy', type: 'number', label: 'Energy' },
  ],
  controls: [
    { id: 'sensitivity', type: 'slider', label: 'Sensitivity', default: 1.5, props: { min: 1, max: 3, step: 0.1 } },
    { id: 'minInterval', type: 'number', label: 'Min Interval (ms)', default: 200, props: { min: 50, max: 500 } },
    { id: 'decayRate', type: 'slider', label: 'Decay Rate', default: 0.95, props: { min: 0.8, max: 0.99, step: 0.01 } },
  ],
  tags: ['beat', 'beat detect', 'bpm', 'tempo', 'onset', 'kick', 'rhythm', 'audio reactive'],
  info: {
    overview: 'Analyzes an audio signal to detect rhythmic beats and estimate the tempo in BPM. Outputs a trigger on each detected beat, the current BPM estimate, and the instantaneous energy level.',
    tips: [
      'Lower sensitivity to reduce false triggers on complex, busy audio material.',
      'Increase min interval to reject double-triggers on fast transients.',
      'Connect the beat trigger to an envelope or visual parameter for beat-synced animations.',
    ],
    pairsWith: ['audio-player', 'audio-analyzer', 'envelope', 'gain'],
  },
}
