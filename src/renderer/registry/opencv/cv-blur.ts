import type { NodeDefinition } from '../types'

export const cvBlurNode: NodeDefinition = {
  id: 'cv-blur',
  name: 'CV Blur',
  version: '1.0.0',
  category: 'visual',
  description: 'Gaussian or median blur with OpenCV.js',
  icon: 'droplet',
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
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'gaussian',
      props: {
        options: [
          { value: 'gaussian', label: 'Gaussian' },
          { value: 'median', label: 'Median' },
        ],
      },
    },
    { id: 'kernel', type: 'slider', label: 'Kernel Size', default: 5, props: { min: 1, max: 51, step: 2 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 2, props: { min: 1, max: 60 } },
  ],
  tags: ['opencv', 'cv', 'blur', 'gaussian', 'median', 'smooth', 'denoise', 'vision'],
  info: {
    overview:
      'Blurs the source frame (OpenCV.js, CPU). Gaussian is a smooth low-pass blur; Median removes salt-and-pepper noise while preserving edges. Kernel size is forced to an odd value.',
    tips: [
      'Use Median to clean speckle noise before edge detection.',
      'Larger kernels blur more but cost more CPU — raise Frame Interval if needed.',
    ],
    pairsWith: ['cv-canny', 'cv-threshold', 'webcam', 'main-output'],
  },
}
