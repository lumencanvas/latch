import type { NodeDefinition } from '../types'

export const tapTempoNode: NodeDefinition = {
  id: 'tap-tempo',
  name: 'Tap Tempo',
  version: '1.0.0',
  category: 'timing',
  description: 'Derive BPM by tapping a trigger in time with the beat.',
  icon: 'hand',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'tap', type: 'trigger', label: 'Tap' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
  ],
  outputs: [
    { id: 'bpm', type: 'number', label: 'BPM' },
    { id: 'period', type: 'number', label: 'Period (s)' },
    { id: 'taps', type: 'number', label: 'Taps' },
  ],
  controls: [],
  tags: ['tap tempo', 'bpm', 'tempo', 'beat', 'timing', 'sync', 'metronome'],
  info: {
    overview:
      'Pulse the Tap input in time with a beat and it reports the tempo in BPM (and the beat period in seconds), averaged over your last few taps. Pause for more than ~2 seconds and the next tap starts a fresh count.',
    tips: [
      'Wire a Trigger button, MIDI note, or keyboard key into Tap to set tempo by hand.',
      'Feed BPM into a Metronome or LFO so the rest of the patch follows your tapped tempo.',
      'Pulse Reset to clear and start over.',
    ],
    pairsWith: ['trigger', 'metronome', 'lfo', 'beat-detect'],
  },
}
