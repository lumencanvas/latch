import { defineNode } from '@/engine/defineNode'
import { FORBIDDEN_KEYS } from '../pathHelpers'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'object-create',
  name: 'Object Create',
  version: '1.0.0',
  category: 'data',
  description: 'Create object from key/value pairs',
  icon: 'plus-square',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'key1', type: 'string', label: 'Key 1' },
    { id: 'value1', type: 'any', label: 'Value 1' },
    { id: 'key2', type: 'string', label: 'Key 2' },
    { id: 'value2', type: 'any', label: 'Value 2' },
    { id: 'key3', type: 'string', label: 'Key 3' },
    { id: 'value3', type: 'any', label: 'Value 3' },
  ],
  outputs: [{ id: 'result', type: 'data', label: 'Result' }],
  // Key controls so keys can be typed (a wired key input still wins).
  controls: [
    { id: 'key1', type: 'text', label: 'Key 1', default: '' },
    { id: 'key2', type: 'text', label: 'Key 2', default: '' },
    { id: 'key3', type: 'text', label: 'Key 3', default: '' },
  ],
  tags: ['object', 'create', 'build', 'construct'],
  info: {
    overview: 'Builds a new object from up to three key/value pairs. Type each key in its control (or wire a string into the key input); each value can be any type. Pairs with an empty key or no value are omitted.',
    tips: [
      'Leave a key empty to skip that pair and create objects with fewer properties.',
      'Chain with Object Merge to combine the result with an existing object.',
    ],
    pairsWith: ['object-merge', 'object-set', 'json-stringify', 'http-request'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const result: Record<string, unknown> = {}
  for (const i of [1, 2, 3]) {
    const key = ctx.str(`key${i}`, '').trim()
    const value = ctx.inputs.get(`value${i}`)
    // Skip unset pairs and prototype-polluting keys (`result.__proto__ = v` would swap the
    // result's prototype rather than create a property).
    if (!key || value === undefined || FORBIDDEN_KEYS.has(key)) continue
    result[key] = value
  }

  return new Map<string, unknown>([['result', result]])
}

export default defineNode({ definition, executor })
