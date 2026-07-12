import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'object-merge',
  name: 'Object Merge',
  version: '1.0.0',
  category: 'data',
  description: 'Merge two objects (shallow merge)',
  icon: 'combine',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'data', label: 'A' },
    { id: 'b', type: 'data', label: 'B' },
  ],
  outputs: [{ id: 'result', type: 'data', label: 'Result' }],
  controls: [],
  tags: ['object', 'merge', 'combine', 'spread'],
  info: {
    overview: 'Performs a shallow merge of two objects, with properties from object B overriding those in object A when keys collide. Returns a new merged object. This is equivalent to a JavaScript spread operation.',
    tips: [
      'Use Object Create to build partial objects, then merge them together.',
      'Chain multiple Object Merge nodes to combine more than two objects.',
    ],
    pairsWith: ['object-create', 'object-set', 'object-keys', 'json-stringify'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const a = ctx.inputs.get('a')
  const b = ctx.inputs.get('b')

  const objA = (a && typeof a === 'object' && !Array.isArray(a)) ? a : {}
  const objB = (b && typeof b === 'object' && !Array.isArray(b)) ? b : {}

  const result = { ...objA, ...objB }
  return new Map<string, unknown>([['result', result]])
}

export default defineNode({ definition, executor })
