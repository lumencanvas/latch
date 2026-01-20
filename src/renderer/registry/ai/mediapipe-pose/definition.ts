import type { NodeDefinition } from '../../types'

export const mediapipePoseNode: NodeDefinition = {
  id: 'mediapipe-pose',
  name: 'Pose Estimation',
  version: '1.0.0',
  category: 'ai',
  description: 'Detect body pose landmarks using MediaPipe',
  icon: 'accessibility',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'video', type: 'video', label: 'Video' },
  ],
  outputs: [
    { id: 'landmarks', type: 'data', label: 'Landmarks (33 pts)' },
    { id: 'worldLandmarks', type: 'data', label: 'World Landmarks' },
    { id: 'visibility', type: 'data', label: 'Visibility' },
    // Key body points for easy access
    { id: 'nose', type: 'data', label: 'Nose' },
    { id: 'leftShoulder', type: 'data', label: 'Left Shoulder' },
    { id: 'rightShoulder', type: 'data', label: 'Right Shoulder' },
    { id: 'leftElbow', type: 'data', label: 'Left Elbow' },
    { id: 'rightElbow', type: 'data', label: 'Right Elbow' },
    { id: 'leftWrist', type: 'data', label: 'Left Wrist' },
    { id: 'rightWrist', type: 'data', label: 'Right Wrist' },
    { id: 'leftHip', type: 'data', label: 'Left Hip' },
    { id: 'rightHip', type: 'data', label: 'Right Hip' },
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
      id: 'vizMode',
      type: 'select',
      label: 'Style',
      default: 'skeleton',
      props: {
        options: [
          { value: 'skeleton', label: 'Skeleton' },
          { value: 'points', label: 'Points' },
          { value: 'bbox', label: 'Bounding Box' },
        ],
      },
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
      default: 2,
      props: { min: 1, max: 5, step: 0.5 },
    },
    {
      id: 'pointSize',
      type: 'slider',
      label: 'Point Size',
      default: 4,
      props: { min: 2, max: 10, step: 1 },
    },
    {
      id: 'showVisibility',
      type: 'toggle',
      label: 'Fade by Visibility',
      default: true,
    },
  ],
}
