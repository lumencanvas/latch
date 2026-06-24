import type { NodeDefinition } from '../types'

export const cvGrayscaleNode: NodeDefinition = {
  id: 'cv-grayscale',
  name: 'CV Grayscale',
  version: '1.0.0',
  category: 'visual',
  description: 'Convert a feed to grayscale with OpenCV.js',
  icon: 'contrast',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 2, props: { min: 1, max: 60 } },
  ],
  tags: ['opencv', 'cv', 'grayscale', 'mono', 'desaturate', 'vision'],
  info: {
    overview:
      'Converts the source frame to grayscale using OpenCV.js (WASM, CPU). OpenCV downloads from a CDN on first use. Frame Interval throttles processing to skip frames on heavy feeds.',
    tips: ['Raise Frame Interval if a large live feed stutters.'],
    pairsWith: ['webcam', 'cv-canny', 'cv-threshold', 'main-output'],
  },
}
