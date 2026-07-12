import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'object-keys',
  name: 'Object Keys',
  version: '1.0.0',
  category: 'data',
  description: 'Get array of object keys',
  icon: 'key',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'object', type: 'data', label: 'Object' }],
  outputs: [
    { id: 'keys', type: 'array', label: 'Keys' },
    { id: 'count', type: 'number', label: 'Count' },
  ],
  controls: [],
  tags: ['object', 'keys', 'properties', 'enumerate'],
  info: {
    overview: 'Extracts all property names from an object and returns them as an array of strings. Also outputs the total number of keys. Useful for inspecting object structure or iterating over properties.',
    tips: [
      'Feed the keys array into Array Contains to check for a specific property by name.',
      'Use the count output to detect empty objects without inspecting individual keys.',
    ],
    pairsWith: ['object-values', 'object-entries', 'array-contains', 'array-length'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const obj = ctx.inputs.get('object')
  const outputs = new Map<string, unknown>()

  if (obj === null || obj === undefined || typeof obj !== 'object' || Array.isArray(obj)) {
    outputs.set('keys', [])
    outputs.set('count', 0)
    return outputs
  }

  const keys = Object.keys(obj)
  outputs.set('keys', keys)
  outputs.set('count', keys.length)
  return outputs
}

export default defineNode({ definition, executor })
