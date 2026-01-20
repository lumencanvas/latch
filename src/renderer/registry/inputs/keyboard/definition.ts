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
}
