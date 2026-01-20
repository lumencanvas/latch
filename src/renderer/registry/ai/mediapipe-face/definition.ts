import type { NodeDefinition } from '../../types'

export const mediapipeFaceNode: NodeDefinition = {
  id: 'mediapipe-face',
  name: 'Face Mesh',
  version: '1.0.0',
  category: 'ai',
  description: 'Detect face landmarks and blendshapes using MediaPipe',
  icon: 'smile',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'video', type: 'video', label: 'Video' },
  ],
  outputs: [
    { id: 'landmarks', type: 'data', label: 'Landmarks (468 pts)' },
    { id: 'blendshapes', type: 'data', label: 'Blendshapes' },
    { id: 'headRotation', type: 'data', label: 'Head Rotation' },
    { id: 'pitch', type: 'number', label: 'Pitch' },
    { id: 'yaw', type: 'number', label: 'Yaw' },
    { id: 'roll', type: 'number', label: 'Roll' },
    { id: 'faceBox', type: 'data', label: 'Face Box' },
    { id: 'mouthOpen', type: 'number', label: 'Mouth Open' },
    { id: 'eyeBlinkLeft', type: 'number', label: 'Eye Blink L' },
    { id: 'eyeBlinkRight', type: 'number', label: 'Eye Blink R' },
    { id: 'browRaise', type: 'number', label: 'Brow Raise' },
    { id: 'smile', type: 'number', label: 'Smile' },
    { id: 'detected', type: 'boolean', label: 'Detected' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    {
      id: 'enabled',
      type: 'toggle',
      label: 'Enabled',
      default: true,
    },
    {
      id: 'showOverlay',
      type: 'toggle',
      label: 'Overlay',
      default: true,
    },
    {
      id: 'overlayColor',
      type: 'color',
      label: 'Color',
      default: '#00ff00',
    },
    {
      id: 'lineWidth',
      type: 'slider',
      label: 'Line Width',
      default: 1,
      props: { min: 0.5, max: 3, step: 0.5 },
    },
    {
      id: 'meshMode',
      type: 'select',
      label: 'Style',
      default: 'mesh',
      props: {
        options: [
          { value: 'mesh', label: 'Mesh' },
          { value: 'contours', label: 'Contours' },
          { value: 'points', label: 'Points' },
          { value: 'bbox', label: 'Bounding Box' },
        ],
      },
    },
    {
      id: 'showExpressions',
      type: 'toggle',
      label: 'Show Expressions',
      default: true,
    },
  ],
}
