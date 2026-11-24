import { makeFxNode } from '../bellows-fx/makeFxNode'

export default makeFxNode({
  id: 'bellows-spectral',
  name: 'Bellows Spectral',
  description: "Pitch shift, spectral freeze, blur, robotize, whisper and denoise from bellowsjs",
  icon: 'layers',
  effects: ['pitchshift', 'freeze', 'blur', 'robot', 'whisper', 'denoise'],
  modInputs: ['semitones'],
  info: {
    overview:
      "Effects that work on the spectrum. Pitch Shift transposes without changing speed; Spectral Freeze holds the current sound as an endless drone while Freeze is on; Blur smears the spectrum into a wash; Robotize flattens pitch into a robot voice; Whisper removes pitch for a breathy whisper; Denoise removes steady background hiss.",
    tips: [
      "Wire a Button or Gate into Freeze (choose Spectral Freeze) to capture a moment of sound and hold it.",
      "Robotize or Whisper on a Bellows Singer, mic or speech changes the character of the voice.",
    ],
    pairsWith: ['bellows-singer', 'bellows-speak', 'audio-input', 'audio-output'],
  },
  tags: ['spectral', 'pitch', 'freeze', 'robot', 'whisper', 'vocoder'],
})
