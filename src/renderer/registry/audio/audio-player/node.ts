import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { audioPlayerExecutor } from '@/engine/executors/audio'

const definition: NodeDefinition = {
  id: 'audio-player',
  name: 'Audio Player',
  version: '1.0.0',
  category: 'audio',
  description: 'Play audio files from URL',
  icon: 'play-circle',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'url', type: 'string', label: 'URL' },
    { id: 'play', type: 'trigger', label: 'Play' },
    { id: 'stop', type: 'trigger', label: 'Stop' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'playing', type: 'boolean', label: 'Playing' },
    { id: 'duration', type: 'number', label: 'Duration' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'url', type: 'text', label: 'URL', default: '' },
    { id: 'loop', type: 'toggle', label: 'Loop', default: false },
    { id: 'autoplay', type: 'toggle', label: 'Autoplay', default: false },
    { id: 'volume', type: 'slider', label: 'Volume (dB)', default: 0, props: { min: -40, max: 6, step: 1 } },
    { id: 'playbackRate', type: 'slider', label: 'Speed', default: 1, props: { min: 0.5, max: 2, step: 0.1 } },
  ],
  info: {
    overview: 'Loads and plays audio files from a URL. Supports looping, autoplay, volume, and playback speed controls. Outputs the audio signal along with playback state information like duration and loading status.',
    tips: [
      'Enable loop for continuous background music or ambient sound beds.',
      'Use the playing and duration outputs to synchronize other nodes with the audio timeline.',
      'Check the error output to detect broken URLs or unsupported formats.',
    ],
    pairsWith: ['audio-output', 'gain', 'audio-analyzer', 'reverb', 'beat-detect'],
  },
}

export default defineNode({ definition, executor: audioPlayerExecutor })
