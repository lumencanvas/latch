import type { NodeDefinition } from '../types'

export const cvMorphologyNode: NodeDefinition = {
  id: 'cv-morphology',
  name: 'CV Morphology',
  version: '1.0.0',
  category: 'visual',
  description: 'Erode, dilate, open, or close with OpenCV.js',
  icon: 'maximize',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Texture' },
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    {
      id: 'operation',
      type: 'select',
      label: 'Operation',
      default: 'dilate',
      props: {
        options: [
          { value: 'erode', label: 'Erode' },
          { value: 'dilate', label: 'Dilate' },
          { value: 'open', label: 'Open' },
          { value: 'close', label: 'Close' },
          { value: 'gradient', label: 'Gradient' },
        ],
      },
    },
    { id: 'kernel', type: 'slider', label: 'Kernel Size', default: 3, props: { min: 1, max: 31, step: 2 } },
    { id: 'iterations', type: 'number', label: 'Iterations', default: 1, props: { min: 1, max: 10 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 2, props: { min: 1, max: 60 } },
  ],
  tags: ['opencv', 'cv', 'morphology', 'erode', 'dilate', 'open', 'close', 'mask', 'vision'],
  info: {
    overview:
      'Applies a morphological operation (OpenCV.js, CPU). Erode shrinks bright regions, Dilate grows them, Open removes small specks, Close fills small holes, and Gradient outlines shapes. Best applied to a thresholded/binary mask.',
    tips: [
      'Open then Close is a common way to clean a binary mask.',
      'Pair with CV Threshold to refine a mask before finding contours.',
    ],
    pairsWith: ['cv-threshold', 'cv-contours', 'cv-canny', 'main-output'],
  },
}
