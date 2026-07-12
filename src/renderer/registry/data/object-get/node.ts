import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getByPath } from '../pathHelpers'

const definition: NodeDefinition = {
  id: 'object-get',
  name: 'Object Get',
  version: '1.0.0',
  category: 'data',
  description: 'Get property from object by path',
  icon: 'braces',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'object', type: 'data', label: 'Object' },
    { id: 'path', type: 'string', label: 'Path' },
  ],
  outputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'found', type: 'boolean', label: 'Found' },
  ],
  controls: [
    { id: 'defaultPath', type: 'text', label: 'Path', default: '', props: { placeholder: 'data.items[0].name' } },
    { id: 'default', type: 'text', label: 'Default', default: '' },
  ],
  tags: ['object', 'get', 'property', 'path', 'access'],
  info: {
    overview: 'Reads a value from an object using a dot-notation path such as "data.items[0].name". Returns the value and a boolean indicating whether the path resolved successfully. A default value can be specified for missing paths.',
    tips: [
      'Use bracket notation in the path to access array indices, like "items[2].id".',
      'Check the found output before using the value to handle missing data gracefully.',
    ],
    pairsWith: ['object-set', 'object-has', 'json-parse', 'gate'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const obj = ctx.inputs.get('object')
  const pathInput = ctx.inputs.get('path') as string | undefined
  const defaultPath = (ctx.controls.get('defaultPath') as string) ?? ''
  const defaultVal = (ctx.controls.get('default') as string) ?? ''
  const outputs = new Map<string, unknown>()

  const path = pathInput ?? defaultPath

  const { value, found } = getByPath(obj, path)

  if (found) {
    outputs.set('value', value)
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
