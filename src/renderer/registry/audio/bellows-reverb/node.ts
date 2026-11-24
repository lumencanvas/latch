import { makeFxNode } from '../bellows-fx/makeFxNode'

export default makeFxNode({
  id: 'bellows-reverb',
  name: 'Bellows Reverb',
  description: "Hall (8-line FDN) and Plate (Dattorro) reverbs from bellowsjs",
  icon: 'waves',
  effects: ['fdn', 'plate'],
  modInputs: ['mix'],
  info: {
    overview:
      "Puts audio in a space. Hall is a modulated eight-line feedback delay network: Size and Decay set the room, Damping darkens the tail, Pre-Delay separates the dry sound from the reverb. Plate is the Dattorro plate, a dense bright classic for vocals and drums.",
    tips: [
      "Mix sets dry against wet: around 0.3 for a room, 1.0 for a pure reverb return.",
      "Long Decay with high Damping gives a dark, ambient wash.",
    ],
    pairsWith: ['bellows-instrument', 'bellows-singer', 'audio-output'],
  },
  tags: ['reverb', 'hall', 'plate', 'space'],
})
