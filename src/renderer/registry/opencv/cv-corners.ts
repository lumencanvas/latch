import type { NodeDefinition } from '../types'

export const cvCornersNode: NodeDefinition = {
  id: 'cv-corners',
  name: 'CV Corners',
  version: '1.0.0',
  category: 'visual',
  description: 'Detect and mark Shi-Tomasi corner features with OpenCV.js',
  icon: 'crosshair',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'count', type: 'number', label: 'Count' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    { id: 'maxCorners', type: 'slider', label: 'Max Corners', default: 100, props: { min: 1, max: 1000, step: 1 } },
    { id: 'quality', type: 'slider', label: 'Quality', default: 0.01, props: { min: 0.001, max: 0.5, step: 0.001 } },
    { id: 'minDistance', type: 'slider', label: 'Min Distance', default: 10, props: { min: 1, max: 100, step: 1 } },
    { id: 'radius', type: 'slider', label: 'Marker Radius', default: 4, props: { min: 1, max: 20, step: 1 } },
    { id: 'color', type: 'color', label: 'Marker Color', default: '#ff3030' },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 2, props: { min: 1, max: 60 } },
  ],
  tags: ['opencv', 'cv', 'corners', 'features', 'shi-tomasi', 'keypoints', 'tracking', 'vision'],
  info: {
    overview:
      'Finds strong corner features (OpenCV.js Shi-Tomasi goodFeaturesToTrack, CPU) and draws a marker on each over the source frame. Outputs the annotated texture plus the corner count. Useful for tracking, motion analysis, or reactive visuals that respond to scene detail.',
    tips: [
      'Lower Quality to accept weaker corners (more points); raise it for only the strongest.',
      'Increase Min Distance to spread markers out and avoid clusters.',
      'Drive visuals from the Count output to react to how much detail/texture is in the scene.',
    ],
    pairsWith: ['webcam', 'cv-blur', 'cv-optical-flow', 'main-output'],
  },
}
