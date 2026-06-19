import type { NodeDefinition } from '../types'

export const imageClassificationNode: NodeDefinition = {
  id: 'image-classification',
  name: 'Classify Image',
  version: '1.0.0',
  category: 'ai',
  description: 'Classify images using Vision Transformer',
  icon: 'scan',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'image', type: 'data', label: 'Image' },
    { id: 'trigger', type: 'trigger', label: 'Classify' },
  ],
  outputs: [
    { id: 'labels', type: 'data', label: 'Labels' },
    { id: 'topLabel', type: 'string', label: 'Top Label' },
    { id: 'topScore', type: 'number', label: 'Top Score' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [
    { id: 'topK', type: 'number', label: 'Top K', default: 5, props: { min: 1, max: 10 } },
    { id: 'interval', type: 'number', label: 'Frame Interval', default: 30, props: { min: 1, max: 120 } },
  ],
  tags: ['image classification', 'classify', 'recognition', 'vit', 'vision', 'label', 'ai'],
  info: {
    overview: 'Classifies images using a Vision Transformer model and returns ranked labels with confidence scores. Outputs the top K predictions along with the highest-scoring label and its score. Useful for sorting, filtering, or reacting to visual content.',
    tips: [
      'Lower the Top K value to reduce noise when you only care about the most likely class.',
      'Connect the topLabel output to a Gate node to trigger actions only when a specific class is detected.',
    ],
    pairsWith: ['webcam', 'object-detection', 'image-captioning', 'gate'],
  },
}
