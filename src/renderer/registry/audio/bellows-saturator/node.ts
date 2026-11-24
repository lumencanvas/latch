import { makeFxNode } from '../bellows-fx/makeFxNode'

export default makeFxNode({
  id: 'bellows-saturator',
  name: 'Bellows Saturator',
  description: "4x oversampled saturation and wavefolding from bellowsjs",
  icon: 'zap',
  effects: ['saturator'],
  modInputs: ['drive'],
  info: {
    overview:
      "Adds warmth, grit or full distortion without harsh aliasing (it runs at four times the sample rate). Curves: Tanh for warm tape-like saturation, Soft Clip, a Wavefolder for west-coast style folding, and Chebyshev for added harmonics. Output level is compensated automatically as Drive rises; Tone tilts the result darker or brighter.",
    tips: [
      "Wire an LFO into Drive with the Wavefolder curve for evolving, metallic timbres.",
    ],
    pairsWith: ['bellows-instrument', 'oscillator', 'bellows-filter'],
  },
  tags: ['distortion', 'saturation', 'overdrive', 'wavefolder'],
})
