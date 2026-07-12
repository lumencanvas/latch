import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { receiveExecutor } from '@/engine/executors/messaging'

const definition: NodeDefinition = {
  id: 'receive',
  name: 'Receive',
  version: '1.0.0',
  category: 'messaging',
  description: 'Receive values from a named channel',
  icon: 'inbox',
  platforms: ['web', 'electron'],
  inputs: [],
  outputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'changed', type: 'trigger', label: 'Changed' },
  ],
  controls: [
    { id: 'channel', type: 'text', label: 'Channel', default: 'default' },
  ],
  info: {
    overview: 'Listens on a named channel and outputs whatever value a Send node publishes to that channel. This lets you pass data between distant parts of a flow without drawing long connections. The "Changed" trigger fires each time a new value arrives.',
    tips: [
      'The channel name is case-sensitive, so "Volume" and "volume" are different channels.',
      'Use descriptive channel names to keep large flows readable.',
      'Multiple Receive nodes can listen on the same channel to fan out a value.',
    ],
    pairsWith: ['send', 'gate', 'monitor', 'latch'],
  },
}

export default defineNode({ definition, executor: receiveExecutor })
