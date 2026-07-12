import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'array-get',
  name: 'Array Get',
  version: '1.0.0',
  category: 'data',
  description: 'Get element at index',
  icon: 'list-ordered',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'array', type: 'array', label: 'Array' },
    { id: 'index', type: 'number', label: 'Index' },
  ],
  outputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'found', type: 'boolean', label: 'Found' },
  ],
  controls: [
    { id: 'default', type: 'text', label: 'Default', default: '' },
  ],
  tags: ['array', 'get', 'index', 'element', 'access'],
  info: {
    overview: 'Retrieves the element at a specific index in an array. Outputs the value and a boolean indicating whether the index was valid. You can set a default value to use when the index is out of bounds.',
    tips: [
      'Use negative indices to count from the end of the array.',
      'Set a meaningful default value to avoid passing undefined downstream.',
    ],
    pairsWith: ['array-length', 'array-contains', 'counter', 'expression'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const array = ctx.inputs.get('array')
  const index = Math.floor((ctx.inputs.get('index') as number) ?? 0)
  const defaultVal = (ctx.controls.get('default') as string) ?? ''
  const outputs = new Map<string, unknown>()

  if (!Array.isArray(array)) {
    outputs.set('value', defaultVal || undefined)
    outputs.set('found', 0)
    return outputs
  }

  // Support negative indexing
  const normalizedIndex = index < 0 ? array.length + index : index

  if (normalizedIndex >= 0 && normalizedIndex < array.length) {
    outputs.set('value', array[normalizedIndex])
    outputs.set('found', 1)
    return outputs
  }

  // Try to parse default as JSON
  let parsedDefault: unknown = defaultVal
  try {
    parsedDefault = JSON.parse(defaultVal)
  } catch {
    // Keep as string
  }

  outputs.set('value', parsedDefault)
  outputs.set('found', 0)
  return outputs
}

export default defineNode({ definition, executor })
