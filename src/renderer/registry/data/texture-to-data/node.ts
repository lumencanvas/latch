import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { textureToDataExecutor } from '@/engine/executors/visual'

const definition: NodeDefinition = {
  id: 'texture-to-data',
  name: 'Texture to Data',
  version: '1.0.0',
  category: 'data',
  description: 'Convert texture to image data for AI processing',
  icon: 'image-down',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'texture', type: 'texture', label: 'Texture', required: true },
    { id: 'trigger', type: 'trigger', label: 'Capture' },
  ],
  outputs: [
    { id: 'data', type: 'data', label: 'Image Data' },
    { id: 'width', type: 'number', label: 'Width' },
    { id: 'height', type: 'number', label: 'Height' },
  ],
  controls: [
    { id: 'format', type: 'select', label: 'Format', default: 'imageData', props: { options: ['imageData', 'base64', 'blob'] } },
    { id: 'continuous', type: 'toggle', label: 'Continuous', default: false },
  ],
  info: {
    overview: 'Converts a GPU texture into CPU-accessible image data in one of several formats: raw ImageData, base64, or blob. Supports both single-shot capture via trigger and continuous frame extraction. Also outputs the image dimensions.',
    tips: [
      'Enable continuous mode for real-time frame analysis, but be mindful of performance costs.',
      'Use base64 format when the image data needs to be sent as a string over HTTP or WebSocket.',
    ],
    pairsWith: ['http-request', 'json-stringify', 'websocket', 'expression'],
  },
}

export default defineNode({ definition, executor: textureToDataExecutor })
