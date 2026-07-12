import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { pitchDetectExecutor } from '@/engine/executors/audio'

const definition: NodeDefinition = {
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
  info: {
    overview: 'Analyzes an audio signal to estimate its fundamental pitch. Outputs the detected frequency in Hz, the musical note name, octave number, MIDI note value, and a confidence score indicating detection reliability.',
    tips: [
      'Narrow the min/max frequency range to improve accuracy for a known instrument or voice.',
      'Use the confidence output to gate downstream processing so only strong detections pass through.',
      'Feed the MIDI output into a synth node to create a pitch-following harmonizer.',
    ],
    pairsWith: ['audio-player', 'audio-analyzer', 'synth', 'oscillator'],
  },
}

export default defineNode({ definition, executor: pitchDetectExecutor })
