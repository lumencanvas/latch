import type { NodeDefinition } from '../types'
import { withModelSelect } from './modelSelect'

const definition: NodeDefinition = {
  id: 'object-detection',
  name: 'Detect Objects',
  version: '1.0.0',
  category: 'ai',
  description: 'Detect and locate objects in images',
  icon: 'box',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'image', type: 'data', label: 'Image' },
    { id: 'trigger', type: 'trigger', label: 'Detect' },
  ],
  outputs: [
    { id: 'objects', type: 'data', label: 'Objects' },
    { id: 'count', type: 'number', label: 'Count' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
    { id: 'progress', type: 'number', label: 'Progress' },
    { id: 'done', type: 'trigger', label: 'Done' },
    { id: 'error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'threshold', type: 'slider', label: 'Threshold', default: 0.5, props: { min: 0.1, max: 1, step: 0.05 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 30, props: { min: 1, max: 120 } },
  ],
  tags: ['object detection', 'detect', 'yolo', 'bounding box', 'vision', 'ai'],
  info: {
    overview: 'Detects and locates objects in images using a transformer-based model. Returns a list of detected objects with bounding boxes, labels, and confidence scores. The threshold control filters out low-confidence detections.',
    tips: [
      'Lower the threshold to catch more objects at the cost of more false positives.',
      'Use the count output to trigger logic only when a certain number of objects are in the scene.',
    ],
    pairsWith: ['webcam', 'image-classification', 'mediapipe-object', 'gate'],
  },
}

// Registry-populated model select via the shared AI seam (default '' = task default).
export const objectDetectionNode: NodeDefinition = withModelSelect(definition, 'object-detection')
