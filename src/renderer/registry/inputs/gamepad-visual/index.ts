import GamepadVisualNode from './GamepadVisualNode.vue'
import type { NodeDefinition } from '../../types'

export { GamepadVisualNode }

export const gamepadVisualNode: NodeDefinition = {
  id: 'gamepad-visual',
  name: 'Visual Gamepad',
  version: '1.0.0',
  category: 'inputs',
  description: 'A controller you can see and play — visualizes an incoming ControllerState and outputs your touches',
  icon: 'gamepad-2',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'state', type: 'data', label: 'State' },
  ],
  outputs: [
    { id: 'state', type: 'data', label: 'State' },
    { id: 'connected', type: 'boolean', label: 'Connected' },
  ],
  // No declared controls: the interactive state lives in node.data.interactive
  // (written by the component) and the engine exposes all node.data to the executor.
  controls: [],
  tags: ['gamepad', 'controller', 'virtual', 'input', 'visual'],
  info: {
    overview:
      'Shows a live controller that lights up from a ControllerState wired into its input, and is itself playable — click or touch the buttons and drag the sticks to generate a ControllerState on its output. Add it to the Control Panel to use it as a virtual controller during a performance.',
    tips: [
      'Wire a Gamepad node’s State in to mirror a physical pad.',
      'Click/touch buttons and drag the sticks to play; the output is input + your touches.',
      'Add it to the Control Panel for a big, playable pad.',
    ],
    pairsWith: ['gamepad', 'emulator'],
  },
}
