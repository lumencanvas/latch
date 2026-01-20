import type { NodeDefinition } from '../../types'

export const mediapipeSegmentationNode: NodeDefinition = {
  id: 'mediapipe-segmentation',
  name: 'Selfie Segmentation',
  version: '1.0.0',
  category: 'ai',
  description: 'Segment person from background using MediaPipe',
  icon: 'layers',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'video', type: 'video', label: 'Video' },
  ],
  outputs: [
    { id: 'mask', type: 'data', label: 'Mask' },
    { id: 'detected', type: 'boolean', label: 'Detected' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    {
      id: 'enabled',
      type: 'toggle',
      label: 'Enabled',
      default: true,
    },
    {
      id: 'showOverlay',
      type: 'toggle',
      label: 'Show Overlay',
      default: true,
    },
    {
      id: 'overlayMode',
      type: 'select',
      label: 'Overlay Mode',
      default: 'mask',
      props: {
        options: [
          { value: 'mask', label: 'Mask Only' },
          { value: 'cutout', label: 'Cutout' },
          { value: 'blur', label: 'Blur BG' },
        ],
      },
    },
    {
      id: 'overlayColor',
      type: 'color',
      label: 'Mask Color',
      default: '#00ff00',
    },
    {
      id: 'maskOpacity',
      type: 'slider',
      label: 'Mask Opacity',
      default: 0.5,
      props: { min: 0, max: 1, step: 0.05 },
    },
  ],
}
