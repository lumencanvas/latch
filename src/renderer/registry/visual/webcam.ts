import type { NodeDefinition } from '../types'

export const webcamNode: NodeDefinition = {
  id: 'webcam',
  name: 'Webcam',
  version: '1.0.0',
  category: 'inputs',
  description: 'Capture video from camera',
  icon: 'camera',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'video', type: 'video', label: 'Video' },
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
  ],
  controls: [
    { id: 'enabled', type: 'toggle', label: 'Enabled', default: true },
    {
      id: 'device',
      type: 'select',
      label: 'Device',
      default: 'default',
      props: { deviceType: 'video-input' },
    },
  ],
  info: {
    overview: 'Streams live video from a camera and outputs it as a continuously updating texture. Also provides a raw video element and the current resolution. This is the primary node for getting real-time camera input into a visual flow.',
    tips: [
      'Disable the node when not in use to release the camera and free system resources.',
      'If you have multiple cameras, use the device selector to pick a specific one rather than relying on the default.',
      'The video element output can be fed into both shader and blend nodes simultaneously for parallel processing.',
    ],
    pairsWith: ['shader', 'blend', 'color-correction', 'displacement', 'texture-display'],
  },
}
