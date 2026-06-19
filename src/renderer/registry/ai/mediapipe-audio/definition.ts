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
      id: 'classifyInterval',
      type: 'number',
      label: 'Interval (ms)',
      default: 500,
      props: { min: 100, max: 5000, step: 100 },
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
  tags: ['audio classification', 'mediapipe', 'yamnet', 'sound', 'audio', 'ai'],
  info: {
    overview: 'Classifies audio input using the MediaPipe YamNet model, identifying sounds like speech, music, and environmental noise. Outputs the top category, confidence score, and convenience booleans for speech and music detection.',
    tips: [
      'Raise the min score threshold to filter out low-confidence classifications.',
      'Use the isSpeech output to trigger speech recognition only when someone is actually talking.',
    ],
    pairsWith: ['audio-input', 'speech-recognition', 'gate', 'monitor'],
  },
}
