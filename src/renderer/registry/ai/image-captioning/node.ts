import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { withModelSelect } from '@/registry/ai/modelSelect'
import { imageCaptioningExecutor } from '@/engine/executors/ai'

const definition: NodeDefinition = {
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
    { id: 'progress', type: 'number', label: 'Progress' },
    { id: 'done', type: 'trigger', label: 'Done' },
    { id: 'error', type: 'string', label: 'Error' },
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

// Gains a registry-populated `model` select via the shared AI-registry seam (behavior
// preserved from the pre-co-location def); the standardized model outputs it already
// declares dedup to no-ops.
export default defineNode({ definition: withModelSelect(definition, 'image-to-text'), executor: imageCaptioningExecutor })
