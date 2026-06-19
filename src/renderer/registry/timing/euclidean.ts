import type { NodeDefinition } from '../types'

export const euclideanNode: NodeDefinition = {
  id: 'euclidean',
  name: 'Euclidean Rhythm',
  version: '1.0.0',
  category: 'timing',
  description: 'Distribute N pulses evenly across M steps (Euclidean / Bjorklund pattern)',
  icon: 'circle-dot',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'step', type: 'number', label: 'Step' },
  ],
  outputs: [
    { id: 'gate', type: 'boolean', label: 'Gate' },
    { id: 'value', type: 'number', label: 'Value' },
    { id: 'pattern', type: 'array', label: 'Pattern' },
    { id: 'pulses', type: 'number', label: 'Pulses' },
  ],
  controls: [
    { id: 'steps', type: 'number', label: 'Steps', default: 8, props: { min: 1, max: 64, step: 1 } },
    { id: 'pulses', type: 'number', label: 'Pulses', default: 3, props: { min: 0, max: 64, step: 1 } },
    { id: 'rotation', type: 'number', label: 'Rotation', default: 0, props: { min: -64, max: 64, step: 1 } },
  ],
  tags: ['euclidean', 'rhythm', 'bjorklund', 'sequencer', 'pattern', 'pulses', 'beat', 'polyrhythm', 'gate', 'trigger'],
  info: {
    overview:
      'Generates a Euclidean rhythm — `pulses` onsets spread as evenly as possible across `steps` positions, the pattern behind countless world rhythms (E(3,8) is the tresillo, E(5,8) the cinquillo). Feed the Step input from a Counter (or Metronome → Counter) to walk the pattern; Gate/Value report whether the current step is a pulse, and Pattern outputs the full 0/1 array.',
    tips: [
      'Drive Step with a Counter clocked by a Metronome to play the rhythm in time.',
      'Try E(3,8), E(5,8), E(7,16) — small pulse counts over larger step counts give classic grooves.',
      'Use Rotation to shift where the pattern starts without changing its shape.',
      'Wire Gate into a trigger-driven node (sampler, flash, envelope) to sound or light each onset.',
    ],
    pairsWith: ['metronome', 'counter', 'trigger', 'envelope', 'step-sequencer'],
  },
}
