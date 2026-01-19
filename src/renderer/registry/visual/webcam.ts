import type { NodeDefinition } from '../types'

export const webcamNode: NodeDefinition = {
  id: 'webcam',
  name: 'Webcam',
  version: '1.0.0',
  category: 'visual',
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
}
