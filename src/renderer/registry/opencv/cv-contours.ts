import type { NodeDefinition } from '../types'

export const cvContoursNode: NodeDefinition = {
  id: 'cv-contours',
  name: 'CV Contours',
  version: '1.0.0',
  category: 'visual',
  description: 'Find and draw contours, with bounding-box data output',
  icon: 'git-branch',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'contours', type: 'data', label: 'Contours' },
    { id: 'count', type: 'number', label: 'Count' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    { id: 'threshold', type: 'slider', label: 'Threshold', default: 127, props: { min: 0, max: 255, step: 1 } },
    { id: 'minArea', type: 'number', label: 'Min Area', default: 100, props: { min: 0, max: 100000 } },
    { id: 'color', type: 'color', label: 'Outline Color', default: '#00ff00' },
    { id: 'lineWidth', type: 'slider', label: 'Line Width', default: 2, props: { min: 1, max: 8, step: 1 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 2, props: { min: 1, max: 60 } },
  ],
  tags: ['opencv', 'cv', 'contours', 'shapes', 'blobs', 'outline', 'bounding box', 'vision'],
  info: {
    overview:
      'Thresholds the source, finds external contours (OpenCV.js, CPU), and draws them over the original frame. Outputs the annotated texture plus a list of contour bounding boxes and areas, filtered by Min Area to drop noise.',
    tips: [
      'Raise Min Area to ignore small noise blobs.',
      'Feed a clean binary mask (CV Threshold + CV Morphology) for the best contours.',
    ],
    pairsWith: ['cv-threshold', 'cv-morphology', 'cv-canny', 'main-output'],
  },
}
