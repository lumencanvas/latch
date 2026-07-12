import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { startExecutor } from '@/engine/executors/timing'

const definition: NodeDefinition = {
  id: 'start',
  name: 'Start',
  version: '1.0.0',
  category: 'timing',
  description: 'Fires once when flow starts running',
  icon: 'play',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [{ id: 'trigger', type: 'trigger', label: 'Trigger' }],
  controls: [],
  info: {
    overview: 'Fires a single trigger when the flow begins running. This is useful for initialization tasks like loading assets, setting default values, or kicking off a sequence that should begin automatically.',
    tips: [
      'Connect to a delay node if you need initialization to happen slightly after startup rather than immediately.',
      'Use it to trigger an image-loader or video-player so media is ready as soon as the flow starts.',
      'Only fires once per flow start; stopping and restarting the flow will fire it again.',
    ],
    pairsWith: ['delay', 'image-loader', 'video-player', 'toggle', 'counter'],
  },
}

export default defineNode({ definition, executor: startExecutor })
