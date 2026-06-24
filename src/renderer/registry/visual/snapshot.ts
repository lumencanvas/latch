import type { NodeDefinition } from '../types'

export const snapshotNode: NodeDefinition = {
  id: 'snapshot',
  name: 'Snapshot',
  version: '1.0.0',
  category: 'visual',
  description: 'Latch and hold a still frame from any texture feed on trigger',
  icon: 'camera',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'source', type: 'texture', label: 'Source' },
    { id: 'trigger', type: 'trigger', label: 'Capture' },
  ],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'imageData', type: 'data', label: 'Image Data' },
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
    { id: 'captured', type: 'trigger', label: 'Captured' },
  ],
  controls: [
    {
      id: 'continuous',
      type: 'toggle',
      label: 'Continuous',
      description: 'Capture every frame instead of only on trigger',
      default: false,
    },
    {
      id: 'mirror',
      type: 'toggle',
      label: 'Mirror',
      default: false,
    },
  ],
  tags: ['snapshot', 'still', 'capture', 'freeze', 'hold', 'latch', 'frame'],
  info: {
    overview:
      'Captures and holds a still frame from any texture input. On each trigger pulse it latches the current source frame and keeps emitting it until the next capture. Enable Continuous to pass frames through live. Outputs the held texture, raw image data, and dimensions.',
    tips: [
      'Wire any texture-producing node (shader, webcam, video) into Source and a trigger into Capture.',
      'Use the Captured output to chain actions that should run only when a new frame is latched.',
      'Continuous mode turns this into a mirror/passthrough; leave it off to freeze on demand.',
    ],
    pairsWith: ['webcam', 'shader', 'interval', 'object-detection-live', 'blend'],
  },
}
