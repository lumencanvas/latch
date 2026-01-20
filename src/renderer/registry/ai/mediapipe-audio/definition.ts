import type { NodeDefinition } from '../../types'

export const mediapipeAudioNode: NodeDefinition = {
  id: 'mediapipe-audio',
  name: 'Audio Classifier',
  version: '1.0.0',
  category: 'ai',
  description: 'Classify audio using MediaPipe YamNet model',
  icon: 'audio-waveform',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
  ],
  outputs: [
    { id: 'category', type: 'string', label: 'Category' },
    { id: 'confidence', type: 'number', label: 'Confidence' },
    { id: 'categories', type: 'data', label: 'All Categories' },
    { id: 'isSpeech', type: 'boolean', label: 'Is Speech' },
    { id: 'isMusic', type: 'boolean', label: 'Is Music' },
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
      id: 'maxResults',
      type: 'slider',
      label: 'Max Results',
      default: 5,
      props: { min: 1, max: 20, step: 1 },
    },
    {
      id: 'scoreThreshold',
      type: 'slider',
      label: 'Min Score',
      default: 0.3,
      props: { min: 0, max: 1, step: 0.05 },
    },
  ],
}
