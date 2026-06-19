import type { NodeDefinition } from '../types'

export const reverbNode: NodeDefinition = {
  id: 'reverb',
  name: 'Reverb',
  version: '1.0.0',
  category: 'audio',
  description: 'Add reverb effect',
  icon: 'waves',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio', required: true },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  controls: [
    { id: 'decay', type: 'slider', label: 'Decay', default: 1.5, props: { min: 0.1, max: 10, step: 0.1 } },
    { id: 'wet', type: 'slider', label: 'Wet', default: 0.5, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'preDelay', type: 'slider', label: 'Pre-Delay', default: 0.01, props: { min: 0, max: 0.1, step: 0.001 } },
  ],
  tags: ['reverb', 'room', 'space', 'ambience', 'hall', 'echo', 'effect'],
  info: {
    overview: 'Simulates the reflections of a physical space by applying a reverb tail to the audio signal. The decay control sets how long the reverb rings out, and the wet control blends between dry and reverberant audio.',
    tips: [
      'Keep wet below 0.3 for subtle room ambience, or push above 0.7 for atmospheric wash effects.',
      'Increase pre-delay slightly to preserve transient clarity before the reverb tail begins.',
      'Place reverb after delay in the signal chain for a cleaner echo-into-space effect.',
    ],
    pairsWith: ['audio-delay', 'gain', 'audio-output', 'filter'],
  },
}
