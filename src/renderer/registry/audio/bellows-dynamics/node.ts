import { makeFxNode } from '../bellows-fx/makeFxNode'

export default makeFxNode({
  id: 'bellows-dynamics',
  name: 'Bellows Dynamics',
  description: "Compressor, limiter, noise gate and transient shaper from bellowsjs",
  icon: 'activity',
  effects: ['compressor', 'limiter', 'gate', 'transient'],
  modInputs: [],
  info: {
    overview:
      "Controls loudness over time. The Compressor evens out levels (Threshold, Ratio, Attack, Release, Makeup), the Limiter stops peaks going over a Ceiling, the Gate silences anything below its Threshold, and the Transient Shaper boosts or softens the attack and the sustain of each hit independently.",
    tips: [
      "A compressor at Ratio 4 with Threshold around -18 dB glues a mix together.",
      "Put the Limiter last before Audio Output to keep a live patch from clipping.",
    ],
    pairsWith: ['bellows-instrument', 'audio-output', 'gain'],
  },
  tags: ['compressor', 'limiter', 'gate', 'transient', 'dynamics'],
})
