import { makeFxNode } from '../bellows-fx/makeFxNode'

export default makeFxNode({
  id: 'bellows-filter',
  name: 'Bellows Filter',
  description: "Studio filter from bellowsjs: low/high/band-pass, notch, shelves and a Moog-style ladder, 12 or 24 dB",
  icon: 'filter',
  effects: ['filter'],
  modInputs: ['cutoff', 'resonance'],
  info: {
    overview:
      "Shapes the tone of any audio: cut the highs with a low-pass, thin out the lows with a high-pass, isolate a band, notch a frequency out, or boost and cut with a bell or shelf. The Ladder mode is a four-stage transistor-ladder low-pass with its own warm saturation (Drive), the classic resonant synth sweep. Cutoff glides smoothly, so wiring an LFO, envelope or slider into the Cutoff input sweeps without zipper noise.",
    tips: [
      "Wire an LFO or Envelope into Cutoff for a filter sweep; Resonance adds the whistle at the cutoff.",
      "Slope 24 dB cuts twice as steeply as 12 dB; the Ladder is always 24 dB.",
      "Wire Audio out on to an Audio Output (through more effects if you like) to hear it.",
    ],
    pairsWith: ['bellows-instrument', 'oscillator', 'lfo', 'envelope', 'audio-output'],
  },
  tags: ['filter', 'lowpass', 'highpass', 'ladder', 'eq'],
})
