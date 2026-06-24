import type { NodeDefinition } from '../types'

export const cvBackgroundSubtractionNode: NodeDefinition = {
  id: 'cv-background-subtraction',
  name: 'CV Background Subtraction',
  version: '1.0.0',
  category: 'visual',
  description: 'Isolate moving foreground from a static background (OpenCV.js MOG2)',
  icon: 'layers',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Mask' },
    { id: 'foreground', type: 'number', label: 'Foreground' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    { id: 'history', type: 'number', label: 'History', default: 500, props: { min: 1, max: 5000 } },
    { id: 'varThreshold', type: 'slider', label: 'Sensitivity', default: 16, props: { min: 1, max: 100, step: 1 } },
    { id: 'detectShadows', type: 'toggle', label: 'Detect Shadows', default: true },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 2, props: { min: 1, max: 60 } },
  ],
  tags: ['opencv', 'cv', 'background subtraction', 'mog2', 'motion', 'foreground', 'mask', 'vision'],
  info: {
    overview:
      'Learns the static background of a feed over time (OpenCV.js MOG2, CPU) and outputs a white-on-black mask of the moving foreground, plus the foreground pixel ratio for reacting to overall motion. Keep the camera still so only moving subjects light up. The subtractor adapts continuously — History sets how fast it forgets.',
    tips: [
      'Hold the source steady; the model needs a few seconds to learn the background.',
      'Lower Sensitivity (varThreshold) to catch subtler motion at the cost of more noise.',
      'Drive a gate/envelope from the Foreground output to trigger on movement; pair with CV Morphology to clean the mask.',
    ],
    pairsWith: ['webcam', 'cv-morphology', 'cv-contours', 'main-output', 'gate'],
  },
}
