import type { NodeDefinition } from '../types'

export const speechRecognitionNode: NodeDefinition = {
  id: 'speech-recognition',
  name: 'Speech to Text',
  version: '2.0.0',
  category: 'ai',
  description: 'Transcribe audio to text using Whisper with manual, continuous, or VAD modes',
  icon: 'mic',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'audio', type: 'audio', label: 'Audio' },
    { id: 'trigger', type: 'trigger', label: 'Transcribe' },
  ],
  outputs: [
    { id: 'text', type: 'string', label: 'Transcribed Text' },
    { id: 'partial', type: 'string', label: 'Partial Text' },
    { id: 'speaking', type: 'boolean', label: 'Speaking' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    {
      id: 'mode',
      type: 'select',
      label: 'Mode',
      default: 'manual',
      props: {
        options: [
          { value: 'manual', label: 'Manual (on trigger)' },
          { value: 'continuous', label: 'Continuous (auto-chunk)' },
          { value: 'vad', label: 'VAD (voice detection)' },
        ],
      },
    },
    {
      id: 'bufferDuration',
      type: 'number',
      label: 'Buffer Duration (s)',
      default: 5,
      props: { min: 1, max: 30, step: 1 },
    },
    {
      id: 'vadThreshold',
      type: 'number',
      label: 'VAD Threshold',
      default: 0.01,
      props: { min: 0.001, max: 0.1, step: 0.001 },
    },
    {
      id: 'vadSilenceDuration',
      type: 'number',
      label: 'Silence Duration (ms)',
      default: 500,
      props: { min: 100, max: 2000, step: 50 },
    },
    {
      id: 'chunkInterval',
      type: 'number',
      label: 'Chunk Interval (ms)',
      default: 3000,
      props: { min: 1000, max: 10000, step: 500 },
    },
  ],
  tags: ['speech recognition', 'stt', 'whisper', 'transcribe', 'voice', 'audio', 'ai'],
  info: {
    overview: 'Transcribes audio to text using the Whisper model. Supports three modes: manual transcription on trigger, continuous auto-chunking, and voice activity detection (VAD) that listens for speech and transcribes automatically. Runs entirely in the browser.',
    tips: [
      'Use VAD mode for hands-free transcription that only processes audio when someone is speaking.',
      'Increase the buffer duration in continuous mode to get longer, more coherent transcription chunks.',
    ],
    pairsWith: ['audio-input', 'sentiment-analysis', 'text-generation', 'string-template'],
  },
}
