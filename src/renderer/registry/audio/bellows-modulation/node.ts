import { makeFxNode } from '../bellows-fx/makeFxNode'

export default makeFxNode({
  id: 'bellows-modulation',
  name: 'Bellows Modulation',
  description: "Chorus, flanger, phaser, tremolo, auto-pan, ring modulator and frequency shifter from bellowsjs",
  icon: 'git-merge',
  effects: ['chorus', 'flanger', 'phaser', 'tremolo', 'autopan', 'ringmod', 'freqshift'],
  modInputs: ['mix'],
  info: {
    overview:
      "Movement and color. Chorus thickens, Flanger and Phaser sweep a comb or notches through the sound, Tremolo and Auto-Pan pulse the volume and stereo position, the Ring Modulator multiplies the audio by a sine for metallic, bell-like tones, and the Frequency Shifter moves every partial by a fixed number of Hz for inharmonic, barber-pole effects.",
    tips: [
      "Ring Mod at a low frequency (under 20 Hz) becomes a choppy tremolo; higher is clangorous.",
      "A few Hz of Frequency Shift on a pad makes a slow, endless shimmer.",
    ],
    pairsWith: ['bellows-instrument', 'oscillator', 'audio-output'],
  },
  tags: ['chorus', 'flanger', 'phaser', 'tremolo', 'ringmod', 'modulation'],
})
