import type { NodeDefinition } from '../../types'

export const mediapipeHandNode: NodeDefinition = {
  id: 'mediapipe-hand',
  name: 'Hand Tracking',
  version: '1.0.0',
  category: 'ai',
  description: 'Detect and track hand landmarks using MediaPipe',
  icon: 'hand',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'video', type: 'video', label: 'Video' },
  ],
  outputs: [
    { id: 'landmarks', type: 'data', label: 'Landmarks' },
    { id: 'worldLandmarks', type: 'data', label: 'World Landmarks' },
    { id: 'handedness', type: 'string', label: 'Handedness' },
    { id: 'confidence', type: 'number', label: 'Confidence' },
    { id: 'gestureType', type: 'string', label: 'Gesture' },
    { id: 'fingerTips', type: 'data', label: 'Finger Tips' },
    { id: 'handCount', type: 'number', label: 'Hand Count' },
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
      id: 'handIndex',
      type: 'slider',
      label: 'Hand Index',
      default: 0,
      props: { min: 0, max: 1, step: 1 },
    },
    {
      id: 'showOverlay',
      type: 'toggle',
      label: 'Overlay',
      default: true,
    },
    {
      id: 'vizMode',
      type: 'select',
      label: 'Style',
      default: 'skeleton',
      props: {
        options: [
          { value: 'skeleton', label: 'Skeleton' },
          { value: 'mesh', label: 'Mesh' },
          { value: 'both', label: 'Both' },
          { value: 'bbox', label: 'Bounding Box' },
        ],
      },
    },
    {
      id: 'overlayColor',
      type: 'color',
      label: 'Color',
      default: '#00ff00',
    },
    {
      id: 'lineWidth',
      type: 'slider',
      label: 'Line Width',
      default: 2,
      props: { min: 1, max: 5, step: 0.5 },
    },
    {
      id: 'pointSize',
      type: 'slider',
      label: 'Point Size',
      default: 4,
      props: { min: 2, max: 10, step: 1 },
    },
    {
      id: 'colorByHand',
      type: 'toggle',
      label: 'Color by Hand',
      default: true,
    },
  ],
}
