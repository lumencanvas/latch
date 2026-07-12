import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { audioOutputExecutor } from '@/engine/executors/audio'

const definition: NodeDefinition = {
  id: 'audio-output',
  name: 'Audio Output',
  version: '1.0.0',
  category: 'audio',
  description: 'Output audio to speakers',
  icon: 'volume-2',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  outputs: [],
  controls: [
    { id: 'volume', type: 'number', label: 'Volume (dB)', default: 0 },
    { id: 'mute', type: 'toggle', label: 'Mute', default: false },
  ],
  info: {
    overview: 'Routes audio to the system speakers or headphones. This is the final destination node in any audio chain. Volume is set in decibels and a mute toggle silences output without disconnecting the graph.',
    tips: [
      'Start with the volume at -12 dB or lower to avoid unexpected loud output.',
      'Use the mute toggle for quick A/B testing without tearing down connections.',
      'Only one audio output node is needed per patch; connect a gain node before it for master volume control.',
    ],
    pairsWith: ['gain', 'reverb', 'filter', 'audio-player'],
  },
}

export default defineNode({ definition, executor: audioOutputExecutor })
