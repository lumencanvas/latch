import { makeFxNode } from '../bellows-fx/makeFxNode'

export default makeFxNode({
  id: 'bellows-delay',
  name: 'Bellows Delay',
  description: "Stereo, tape (wow, flutter, saturation, hiss) and four-tap delays from bellowsjs",
  icon: 'repeat',
  effects: ['delay', 'tapeDelay', 'multitap'],
  modInputs: ['mix'],
  info: {
    overview:
      "Echoes. Stereo Delay has separate left and right times with cross feedback for ping-pong. Tape Delay models a tape echo: wow and flutter wobble the pitch, saturation and tone darken each repeat, and feedback past 1.0 self-oscillates into a runaway. Multitap plays four taps with their own times and levels, smeared by Diffusion.",
    tips: [
      "Set left and right times to different values (e.g. 0.25 and 0.375 s) for a wide stereo bounce.",
      "Tape Delay with Feedback near 1 and a little Wow makes dub-style washes.",
    ],
    pairsWith: ['bellows-instrument', 'bellows-reverb', 'audio-output'],
  },
  tags: ['delay', 'echo', 'tape', 'dub'],
})
