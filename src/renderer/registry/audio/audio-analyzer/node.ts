import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { audioAnalyzerExecutor } from '@/engine/executors/audio'

const definition: NodeDefinition = {
  id: 'audio-analyzer',
  name: 'Audio Analyzer',
  version: '1.0.0',
  category: 'audio',
  description: 'Analyze audio levels and frequencies',
  icon: 'bar-chart-2',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'audio', type: 'audio', label: 'Audio' }],
  outputs: [
    { id: 'level', type: 'number', label: 'Level' },
    { id: 'bass', type: 'number', label: 'Bass' },
    { id: 'mid', type: 'number', label: 'Mid' },
    { id: 'high', type: 'number', label: 'High' },
  ],
  controls: [
    { id: 'smoothing', type: 'number', label: 'Smoothing', default: 0.8 },
  ],
  info: {
    overview: 'Splits an incoming audio signal into level, bass, mid, and high frequency bands as numeric outputs. Use it to drive visuals, animations, or any parameter that should react to sound.',
    tips: [
      'Increase smoothing (closer to 1) for slower, more stable readings; decrease it for snappier response.',
      'Map the bass output to scale or brightness for kick-driven visual effects.',
      'Place this after a gain node to control the analysis input level independently of the output volume.',
    ],
    pairsWith: ['audio-player', 'gain', 'oscillator', 'beat-detect'],
  },
}

export default defineNode({ definition, executor: audioAnalyzerExecutor })
