import type { NodeDefinition } from '../types'

export const audioDelayNode: NodeDefinition = {
  id: 'audio-delay',
  name: 'Delay',
  version: '1.0.0',
  category: 'audio',
  description: 'Add delay/echo effect',
  icon: 'repeat',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'time', type: 'number', label: 'Time' },
  ],
  outputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  controls: [
    { id: 'time', type: 'number', label: 'Delay (s)', default: 0.25 },
    { id: 'feedback', type: 'number', label: 'Feedback', default: 0.5 },
    { id: 'wet', type: 'number', label: 'Wet', default: 0.5 },
  ],
  tags: ['delay', 'echo', 'feedback', 'repeat', 'effect'],
  info: {
    overview: 'Adds a delay or echo effect to the audio signal. The feedback control determines how many times the delayed signal repeats, and the wet control blends between dry and delayed audio.',
    tips: [
      'Set feedback below 0.5 for a clean slapback echo, or above 0.7 for long, building repeats.',
      'Automate the delay time input for tape-style pitch warble effects.',
      'Use a short delay (under 30ms) with no feedback to create a simple doubling or comb filter effect.',
    ],
    pairsWith: ['reverb', 'gain', 'filter', 'audio-output'],
  },
}
