import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { sendExecutor } from '@/engine/executors/messaging'

const definition: NodeDefinition = {
  id: 'send',
  name: 'Send',
  version: '1.0.0',
  category: 'messaging',
  description: 'Send values to a named channel',
  icon: 'send',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'trigger', type: 'trigger', label: 'Send' },
  ],
  outputs: [],
  controls: [
    { id: 'channel', type: 'text', label: 'Channel', default: 'default' },
    { id: 'sendOnChange', type: 'toggle', label: 'Send on Change', default: true },
  ],
  info: {
    overview: 'Publishes a value to a named channel that any Receive node can pick up. Use it to avoid tangled connections across a large flow. With "Send on Change" enabled, it fires automatically whenever the input value updates.',
    tips: [
      'Disable "Send on Change" and use the trigger input when you need precise control over timing.',
      'Pair with multiple Receive nodes to broadcast one value to many places at once.',
    ],
    pairsWith: ['receive', 'trigger', 'changed', 'throttle'],
  },
}

export default defineNode({ definition, executor: sendExecutor })
