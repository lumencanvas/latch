import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { changedExecutor } from '@/engine/executors/utility'

const definition: NodeDefinition = {
  id: 'changed',
  name: 'Changed',
  version: '1.0.0',
  category: 'logic',
  description: 'Only output when value changes from previous',
  icon: 'diff',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [
    { id: 'result', type: 'any', label: 'Result' },
    { id: 'changed', type: 'boolean', label: 'Changed' },
  ],
  controls: [],
  tags: ['detect', 'change', 'state', 'difference'],
  info: {
    overview: 'Passes the input value through only when it differs from the previous value. Also outputs a boolean indicating whether the value changed. Useful for triggering downstream logic only when data actually updates.',
    tips: [
      'Use the Changed boolean output to trigger other nodes selectively.',
      'Place before expensive operations to avoid redundant processing.',
    ],
    pairsWith: ['gate', 'sample-hold', 'pass-if', 'trigger'],
  },
}

export default defineNode({ definition, executor: changedExecutor })
