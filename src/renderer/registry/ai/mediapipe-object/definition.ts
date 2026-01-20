import type { NodeDefinition } from '../../types'

export const mediapipeObjectNode: NodeDefinition = {
  id: 'mediapipe-object',
  name: 'Object Detection (MediaPipe)',
  version: '1.0.0',
  category: 'ai',
  description: 'Detect objects in video using MediaPipe EfficientDet',
  icon: 'scan',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'video', type: 'video', label: 'Video' },
  ],
  outputs: [
    { id: 'detections', type: 'data', label: 'Detections' },
    { id: 'count', type: 'number', label: 'Count' },
    { id: 'filtered', type: 'data', label: 'Filtered' },
    { id: 'topLabel', type: 'string', label: 'Top Label' },
    { id: 'topConfidence', type: 'number', label: 'Top Confidence' },
    { id: 'topBox', type: 'data', label: 'Top Bounding Box' },
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
      id: 'minConfidence',
      type: 'slider',
      label: 'Min Confidence',
      default: 0.5,
      props: { min: 0, max: 1, step: 0.05 },
    },
    {
      id: 'maxResults',
      type: 'slider',
      label: 'Max Results',
      default: 10,
      props: { min: 1, max: 20, step: 1 },
    },
    {
      id: 'labelFilter',
      type: 'text',
      label: 'Label Filter',
      default: '',
      props: { placeholder: 'e.g., person, car' },
    },
    {
      id: 'showOverlay',
      type: 'toggle',
      label: 'Overlay',
      default: true,
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
      id: 'showLabels',
      type: 'toggle',
      label: 'Show Labels',
      default: true,
    },
  ],
}
