import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import { typeOfExecutor } from '@/engine/executors/utility'

const definition: NodeDefinition = {
  id: 'type-of',
  name: 'Type Of',
  version: '1.0.0',
  category: 'logic',
  description: 'Get the type of a value',
  icon: 'tag',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [{ id: 'type', type: 'string', label: 'Type' }],
  controls: [],
  tags: ['type', 'typeof', 'check', 'inspect'],
  info: {
    overview: 'Reports the JavaScript type of the input value as a string, such as "number", "string", "boolean", or "object". Useful for debugging flows or for branching logic based on the kind of data arriving at a node.',
    tips: [
      'Feed the output into an equals node to branch based on specific types.',
      'Use during development to verify that connections are carrying the expected data types.',
    ],
    pairsWith: ['equals', 'switch', 'is-null', 'is-empty'],
  },
}

export default defineNode({ definition, executor: typeOfExecutor })
