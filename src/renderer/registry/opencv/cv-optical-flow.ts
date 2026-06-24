import type { NodeDefinition } from '../types'

export const cvOpticalFlowNode: NodeDefinition = {
  id: 'cv-optical-flow',
  name: 'CV Optical Flow',
  version: '1.0.0',
  category: 'visual',
  description: 'Dense Farneback optical flow visualized as a motion field',
  icon: 'wind',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'source', type: 'texture', label: 'Source' }],
  outputs: [
    { id: 'texture', type: 'texture', label: 'Flow' },
    { id: 'motion', type: 'number', label: 'Motion' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    { id: 'winSize', type: 'slider', label: 'Window Size', default: 15, props: { min: 3, max: 51, step: 2 } },
    { id: 'levels', type: 'number', label: 'Pyramid Levels', default: 3, props: { min: 1, max: 6 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 2, props: { min: 1, max: 60 } },
  ],
  tags: ['opencv', 'cv', 'optical flow', 'farneback', 'motion', 'movement', 'flow', 'vision'],
  info: {
    overview:
      'Computes dense optical flow (OpenCV.js Farneback, CPU) between consecutive frames and renders it as the classic flow field: hue encodes motion direction and brightness encodes speed. Also outputs the mean motion magnitude as a number for triggering on movement.',
    tips: [
      'Hold the camera still — only moving regions light up.',
      'Larger Window Size smooths the flow but costs more CPU; raise Frame Interval if it stutters.',
      'Drive a gate or envelope from the Motion output to react to movement in the scene.',
    ],
    pairsWith: ['webcam', 'cv-blur', 'main-output', 'gate'],
  },
}
