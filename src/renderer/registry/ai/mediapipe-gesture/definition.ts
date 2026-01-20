import type { NodeDefinition } from '../../types'

export const mediapipeGestureNode: NodeDefinition = {
  id: 'mediapipe-gesture',
  name: 'Gesture Recognition',
  version: '1.0.0',
  category: 'ai',
  description: 'Recognize hand gestures using MediaPipe',
  icon: 'hand',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'video', type: 'video', label: 'Video' },
  ],
  outputs: [
    { id: 'gesture', type: 'string', label: 'Gesture' },
    { id: 'confidence', type: 'number', label: 'Confidence' },
    { id: 'landmarks', type: 'data', label: 'Landmarks' },
    { id: 'handedness', type: 'string', label: 'Hand' },
    { id: 'handCount', type: 'number', label: 'Hand Count' },
    { id: 'allGestures', type: 'data', label: 'All Gestures' },
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
      id: 'overlayColor',
      type: 'color',
      label: 'Overlay Color',
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
      id: 'confidenceThreshold',
      type: 'slider',
      label: 'Min Confidence',
      default: 0.5,
      props: { min: 0, max: 1, step: 0.05 },
    },
  ],
}
