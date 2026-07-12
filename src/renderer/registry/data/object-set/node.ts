import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { setByPath } from '../pathHelpers'

const definition: NodeDefinition = {
  id: 'object-set',
  name: 'Object Set',
  version: '1.0.0',
  category: 'data',
  description: 'Set property on object (returns new object)',
  icon: 'pen-square',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'object', type: 'data', label: 'Object' },
    { id: 'path', type: 'string', label: 'Path' },
    { id: 'value', type: 'any', label: 'Value' },
  ],
  outputs: [{ id: 'result', type: 'data', label: 'Result' }],
  controls: [
    { id: 'defaultPath', type: 'text', label: 'Path', default: '', props: { placeholder: 'data.name' } },
  ],
  tags: ['object', 'set', 'property', 'path', 'modify'],
  info: {
    overview: 'Sets a property on an object at a given dot-notation path and returns a new object with the change applied. The original object is not mutated. Intermediate path segments are created automatically if they do not exist.',
    tips: [
      'Use dot-notation paths like "user.settings.theme" to set deeply nested values in one step.',
      'Chain with Object Get to read, modify, and write back a single property.',
    ],
    pairsWith: ['object-get', 'object-merge', 'object-create', 'json-stringify'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const obj = ctx.inputs.get('object') ?? {}
  const pathInput = ctx.inputs.get('path') as string | undefined
  const defaultPath = (ctx.controls.get('defaultPath') as string) ?? ''
  const value = ctx.inputs.get('value')

  const path = pathInput ?? defaultPath

  if (!path) {
    return new Map<string, unknown>([['result', obj]])
  }

  const result = setByPath(obj, path, value)
  return new Map<string, unknown>([['result', result]])
}

export default defineNode({ definition, executor })
