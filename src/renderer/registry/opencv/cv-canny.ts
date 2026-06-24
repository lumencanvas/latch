import type { NodeDefinition } from '../types'

export const cvCannyNode: NodeDefinition = {
  id: 'cv-canny',
  name: 'CV Canny Edges',
  version: '1.0.0',
  category: 'visual',
  description: 'Detect edges with the OpenCV.js Canny detector',
  icon: 'activity',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    { id: 'lowThreshold', type: 'slider', label: 'Low Threshold', default: 50, props: { min: 0, max: 255, step: 1 } },
    { id: 'highThreshold', type: 'slider', label: 'High Threshold', default: 150, props: { min: 0, max: 255, step: 1 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 2, props: { min: 1, max: 60 } },
  ],
  tags: ['opencv', 'cv', 'canny', 'edges', 'edge detection', 'outline', 'vision'],
  info: {
    overview:
      'Runs the Canny edge detector (OpenCV.js, CPU) and outputs a white-on-black edge texture. The low/high thresholds control the hysteresis: lower values find more edges.',
    tips: [
      'Keep the high threshold roughly 2-3x the low threshold for clean edges.',
      'Feed a blurred source (CV Blur) first to suppress noise edges.',
    ],
    pairsWith: ['cv-blur', 'cv-grayscale', 'cv-contours', 'main-output'],
  },
}
