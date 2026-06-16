import type { NodeDefinition } from '../../types'

// Node definition for the Gamepad input node. No custom component — renders with
// the generic BaseNode; all the work is in the executor (executors/gamepad.ts).
export const gamepadNode: NodeDefinition = {
  id: 'gamepad',
  name: 'Gamepad',
  version: '1.0.0',
  category: 'inputs',
  description: 'Read a physical game controller via the Web Gamepad API as a unified ControllerState',
  icon: 'gamepad-2',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [
    { id: 'state', type: 'data', label: 'State' },
    { id: 'connected', type: 'boolean', label: 'Connected' },
    { id: 'anyButton', type: 'trigger', label: 'Any Button' },
  ],
  controls: [
    {
      id: 'pad',
      type: 'select',
      label: 'Controller',
      default: 'auto',
      props: {
        options: [
          { value: 'auto', label: 'First connected' },
          { value: '0', label: 'Player 1' },
          { value: '1', label: 'Player 2' },
          { value: '2', label: 'Player 3' },
          { value: '3', label: 'Player 4' },
        ],
      },
    },
    {
      id: 'deadzone',
      type: 'number',
      label: 'Deadzone',
      default: 0.08,
      props: { min: 0, max: 0.5, step: 0.01 },
    },
  ],
  tags: ['gamepad', 'controller', 'input', 'joystick'],
  info: {
    overview:
      'Reads a connected game controller through the browser Gamepad API every frame and outputs a unified ControllerState — named buttons (0..1) and sticks (-1..1). After plugging in a pad, press any button once so the browser exposes it. Wire State into the Visual Gamepad, the Emulator node, or any logic.',
    tips: [
      'Choose "First connected" or pin a specific player slot.',
      'Raise Deadzone if the sticks drift while at rest.',
      'Wire State into a Monitor node to see the live values.',
    ],
    pairsWith: ['gamepad-visual', 'emulator', 'monitor'],
  },
}
