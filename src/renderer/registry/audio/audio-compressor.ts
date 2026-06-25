import type { NodeDefinition } from '../types'

export const audioCompressorNode: NodeDefinition = {
  id: 'audio-compressor',
  name: 'Compressor',
  version: '1.0.0',
  category: 'audio',
  description: 'Dynamic-range compressor / limiter — tames peaks and evens out levels.',
  icon: 'minimize-2',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'threshold', type: 'number', label: 'Threshold' },
  ],
  outputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'reduction', type: 'number', label: 'Reduction (dB)' },
  ],
  controls: [
    { id: 'threshold', type: 'slider', label: 'Threshold (dB)', default: -24, props: { min: -60, max: 0, step: 1 } },
    { id: 'ratio', type: 'slider', label: 'Ratio', default: 4, props: { min: 1, max: 20, step: 0.5 } },
    { id: 'attack', type: 'slider', label: 'Attack (s)', default: 0.003, props: { min: 0, max: 1, step: 0.001 } },
    { id: 'release', type: 'slider', label: 'Release (s)', default: 0.25, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'knee', type: 'slider', label: 'Knee (dB)', default: 30, props: { min: 0, max: 40, step: 1 } },
  ],
  tags: ['compressor', 'limiter', 'dynamics', 'audio', 'effect', 'mastering'],
  info: {
    overview:
      'Reduces the dynamic range of the signal: anything above the threshold is attenuated by the ratio. Use a high ratio (12–20) as a limiter to catch peaks, or a gentle ratio (2–4) to glue a mix together. The Reduction output reports current gain reduction in dB for metering.',
    tips: [
      'Set Threshold so only the loudest moments cross it, then dial Ratio for the amount of squash.',
      'Short Attack catches transients; longer Release sounds more natural.',
    ],
    pairsWith: ['audio-output', 'gain', 'audio-analyzer', 'beat-detect'],
  },
}
