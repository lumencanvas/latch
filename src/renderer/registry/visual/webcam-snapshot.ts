import type { NodeDefinition } from '../types'

export const webcamSnapshotNode: NodeDefinition = {
  id: 'webcam-snapshot',
  name: 'Webcam Snapshot',
  version: '1.0.0',
  category: 'visual',
  description: 'Capture snapshots from webcam on trigger',
  icon: 'camera',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'trigger', type: 'trigger', label: 'Capture' }],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'imageData', type: 'data', label: 'Image Data' },
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
    { id: 'captured', type: 'trigger', label: 'Captured' },
  ],
  controls: [
    {
      id: 'device',
      type: 'select',
      label: 'Camera',
      default: 'default',
      props: { deviceType: 'video-input' },
    },
    {
      id: 'resolution',
      type: 'select',
      label: 'Resolution',
      default: '720p',
      props: {
        options: [
          { value: '480p', label: '480p (640x480)' },
          { value: '720p', label: '720p (1280x720)' },
          { value: '1080p', label: '1080p (1920x1080)' },
        ],
      },
    },
    {
      id: 'mirror',
      type: 'toggle',
      label: 'Mirror',
      default: false,
    },
  ],
  tags: ['webcam snapshot', 'snapshot', 'still', 'capture', 'freeze', 'photo', 'camera'],
  info: {
    overview: 'Captures a single still frame from the webcam each time it receives a trigger. Unlike the continuous webcam node, this only updates on demand. Outputs the captured texture, raw image data, and dimensions.',
    tips: [
      'Connect an interval node to the trigger input to capture frames at a controlled rate lower than full video.',
      'Use the captured trigger output to chain actions that should happen only after a new frame is taken.',
      'The imageData output carries raw pixel data suitable for analysis nodes or the function node.',
    ],
    pairsWith: ['interval', 'blend', 'shader', 'start', 'color-correction'],
  },
}
