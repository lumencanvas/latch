import type { NodeDefinition } from '../types'

export const cvThresholdNode: NodeDefinition = {
  id: 'cv-threshold',
  name: 'CV Threshold',
  version: '1.0.0',
  category: 'visual',
  description: 'Binarize a feed with fixed, Otsu, or adaptive thresholding',
  icon: 'sliders',
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
      default: 'binary',
      props: {
        options: [
          { value: 'binary', label: 'Fixed' },
          { value: 'otsu', label: 'Otsu (auto)' },
          { value: 'adaptive', label: 'Adaptive' },
        ],
      },
    },
    {
      id: 'threshold',
      type: 'slider',
      label: 'Threshold',
      default: 127,
      props: { min: 0, max: 255, step: 1 },
      visibleWhen: { controlId: 'mode', value: 'binary' },
    },
    {
      id: 'blockSize',
      type: 'number',
      label: 'Block Size',
      default: 11,
      props: { min: 3, max: 99 },
      visibleWhen: { controlId: 'mode', value: 'adaptive' },
    },
    {
      id: 'c',
      type: 'number',
      label: 'Constant',
      default: 2,
      props: { min: -20, max: 20 },
      visibleWhen: { controlId: 'mode', value: 'adaptive' },
    },
    { id: 'invert', type: 'toggle', label: 'Invert', default: false },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 2, props: { min: 1, max: 60 } },
  ],
  tags: ['opencv', 'cv', 'threshold', 'binary', 'otsu', 'adaptive', 'mask', 'vision'],
  info: {
    overview:
      'Converts the source to grayscale and binarizes it (OpenCV.js, CPU). Fixed uses a manual cutoff, Otsu picks the cutoff automatically, and Adaptive computes a local threshold per region — best for uneven lighting.',
    tips: [
      'Use Adaptive mode for documents or scenes with uneven lighting.',
      'Enable Invert to swap foreground/background for masking.',
    ],
    pairsWith: ['cv-contours', 'cv-morphology', 'cv-grayscale', 'main-output'],
  },
}
