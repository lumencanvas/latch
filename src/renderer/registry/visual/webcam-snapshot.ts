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
}
