import { makeFxNode } from '../bellows-fx/makeFxNode'

export default makeFxNode({
  id: 'bellows-eq',
  name: 'Bellows EQ',
  description: "Six-band parametric EQ (low shelf, four bells, high shelf) from bellowsjs",
  icon: 'sliders',
  effects: ['eq'],
  modInputs: [],
  info: {
    overview:
      "A six-band parametric equalizer: a low shelf, four bell bands and a high shelf, each with its own frequency, gain and Q, and an on/off switch. A band at 0 dB passes audio untouched.",
    tips: [
      "Cut before you boost: a narrow bell cut removes a harsh resonance more cleanly than boosting everything else.",
    ],
    pairsWith: ['bellows-instrument', 'audio-input', 'audio-output'],
  },
  tags: ['eq', 'equalizer', 'tone'],
})
