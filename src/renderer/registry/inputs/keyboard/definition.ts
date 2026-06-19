import type { NodeDefinition } from '@/stores/nodes'

export const keyboardNode: NodeDefinition = {
  id: 'keyboard',
  name: 'Keyboard',
  version: '1.0.0',
  category: 'inputs',
  description: 'Virtual piano keyboard for MIDI note input',
  icon: 'piano',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [
    { id: 'note', type: 'number', label: 'Note' },
    { id: 'velocity', type: 'number', label: 'Velocity' },
    { id: 'noteOn', type: 'trigger', label: 'Note On' },
    { id: 'gate', type: 'boolean', label: 'Gate' },
  ],
  controls: [
    {
      id: 'numKeys',
      type: 'select',
      label: 'Keys',
      default: '25',
      props: { options: ['25', '49', '61', '88'] },
    },
    {
      id: 'startOctave',
      type: 'number',
      label: 'Start Octave',
      default: 3,
      props: { min: 0, max: 8 },
    },
    {
      id: 'octaveShift',
      type: 'number',
      label: 'Key Shift',
      default: 0,
      props: { min: -4, max: 4 },
    },
    {
      id: 'includeBlackKeys',
      type: 'toggle',
      label: 'Black Keys',
      default: true,
    },
    {
      id: 'velocitySensitive',
      type: 'toggle',
      label: 'Velocity',
      default: true,
    },
  ],
  tags: ['keyboard', 'piano', 'midi', 'notes', 'keys', 'music'],
  info: {
    overview: 'Provides an on-screen piano keyboard that outputs MIDI note numbers, velocity, note-on triggers, and a gate signal. You can configure the key range, starting octave, and whether black keys are visible. It works standalone or alongside a physical MIDI controller.',
    tips: [
      'Use the gate output to control an envelope node for shaping audio amplitude.',
      'Set velocity sensitivity to false for uniform note-on values when precision is not needed.',
      'Connect the note output to an oscillator frequency input through a MIDI-to-frequency expression.',
    ],
    pairsWith: ['oscillator', 'envelope', 'midi-input', 'gate'],
  },
}
