import type { NodeDefinition } from '../types'

export const featureExtractionNode: NodeDefinition = {
  id: 'feature-extraction',
  name: 'Text Embed',
  version: '1.0.0',
  category: 'ai',
  description: 'Convert text to embedding vectors',
  icon: 'hash',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'text', type: 'string', label: 'Text' },
    { id: 'trigger', type: 'trigger', label: 'Extract' },
  ],
  outputs: [
    { id: 'embedding', type: 'data', label: 'Embedding' },
    { id: 'dimensions', type: 'number', label: 'Dimensions' },
    { id: 'loading', type: 'boolean', label: 'Loading' },
  ],
  controls: [],
  tags: ['text embed', 'feature extraction', 'embedding', 'embed', 'vector', 'similarity', 'nlp', 'ai'],
  info: {
    overview: 'Converts text into a numeric embedding vector using a transformer model. The resulting high-dimensional vector captures semantic meaning, making it useful for similarity comparisons and clustering. Runs entirely in the browser.',
    tips: [
      'Connect the trigger input to control when extraction runs, since it can be computationally expensive.',
      'Use the dimensions output to verify the embedding size matches what downstream nodes expect.',
    ],
    pairsWith: ['sentiment-analysis', 'string-template', 'text-generation', 'monitor'],
  },
}
