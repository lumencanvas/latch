import EmulatorNode from './EmulatorNode.vue'
import { CORE_LIST } from '@/services/emulation/coreMap'
import { DEFAULT_EJS_DATA } from '@/services/emulation/emulatorjs'
import type { NodeDefinition } from '../../types'

export { EmulatorNode }

export const emulatorNode: NodeDefinition = {
  id: 'emulator',
  name: 'Emulator',
  version: '1.0.0',
  category: 'video',
  description: 'Run a retro game ROM with EmulatorJS — outputs video + audio and takes controller inlets',
  icon: 'gamepad-2',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'start', type: 'trigger', label: 'Start' },
    { id: 'stop', type: 'trigger', label: 'Stop' },
    { id: 'reset', type: 'trigger', label: 'Reset' },
    // Up to 4 controllers; the component shows exactly as many as the loaded core supports.
    { id: 'controller0', type: 'data', label: 'Player 1' },
    { id: 'controller1', type: 'data', label: 'Player 2' },
    { id: 'controller2', type: 'data', label: 'Player 3' },
    { id: 'controller3', type: 'data', label: 'Player 4' },
  ],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Video' },
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'running', type: 'boolean', label: 'Running' },
    { id: 'system', type: 'string', label: 'System' },
  ],
  controls: [
    { id: 'rom', type: 'asset-picker', label: 'ROM', default: null, props: { assetType: 'all' } },
    {
      id: 'core',
      type: 'select',
      label: 'System',
      default: 'auto',
      props: {
        options: [
          { value: 'auto', label: 'Auto-detect from file' },
          ...CORE_LIST.map((c) => ({ value: c.key, label: c.label })),
        ],
      },
    },
    { id: 'volume', type: 'number', label: 'Volume', default: 0.5, props: { min: 0, max: 1, step: 0.05 } },
    { id: 'pathToData', type: 'text', label: 'EmulatorJS data URL', default: DEFAULT_EJS_DATA },
  ],
  tags: ['emulator', 'emulatorjs', 'retro', 'game', 'rom', 'libretro', 'video'],
  info: {
    overview:
      'Runs a retro game ROM in the browser with EmulatorJS (libretro cores). Upload a ROM in the editor (stored in IndexedDB), pick a system (or auto-detect from the file), and Load. The emulator canvas is exposed as a Video texture and its sound as an Audio output, so you can route them through other nodes. It shows one controller inlet per player the core supports — feed them with the Gamepad node or a CLASP receive carrying a ControllerState. Resize the node to resize the emulator. Only one emulator can run at a time.',
    tips: [
      'Upload a ROM via the ROM picker, then press Load.',
      'Wire a Gamepad → Player 1, and Video → Main Output, Audio → Audio Output.',
      'A CLASP receive whose value is a ControllerState can drive a remote player.',
      'Drag the bottom-right corner to resize the emulator.',
    ],
    pairsWith: ['gamepad', 'gamepad-visual', 'main-output', 'audio-output'],
  },
}
