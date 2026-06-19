import type { NodeDefinition } from '../types'

export const imageCaptioningNode: NodeDefinition = {
  id: 'image-captioning',
  name: 'Caption Image',
  version: '1.0.0',
  category: 'ai',
  description: 'Generate captions for images',
  icon: 'image',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'image', type: 'data', label: 'Image' },
    { id: 'trigger', type: 'trigger', label: 'Caption' },
  ],
  outputs: [
    { id: 'caption', type: 'string', label: 'Caption' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 60, props: { min: 1, max: 300 } },
  ],
  tags: ['image captioning', 'caption', 'describe', 'vision', 'blip', 'ai'],
  info: {
    overview: 'Generates a natural language description of an image using a vision-language model. Takes image data as input and produces a text caption. The frame interval control limits how often captioning runs on video streams.',
    tips: [
      'Increase the frame interval when processing live video to reduce CPU and memory usage.',
      'Feed the caption output into Text Generate or Sentiment Analysis for further language processing.',
    ],
    pairsWith: ['webcam', 'image-classification', 'text-generation', 'sentiment-analysis'],
  },
}
