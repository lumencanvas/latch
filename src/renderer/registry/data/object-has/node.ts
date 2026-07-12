import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { getByPath } from '../pathHelpers'

const definition: NodeDefinition = {
  id: 'object-has',
  name: 'Object Has',
  version: '1.0.0',
  category: 'data',
  description: 'Check if object has property',
  icon: 'check-square',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'object', type: 'data', label: 'Object' },
    { id: 'path', type: 'string', label: 'Path' },
  ],
  outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
  controls: [
    { id: 'defaultPath', type: 'text', label: 'Path', default: '', props: { placeholder: 'data.name' } },
  ],
  tags: ['object', 'has', 'property', 'exists', 'check'],
  info: {
    overview: 'Checks whether an object contains a property at a given dot-notation path. Returns true if the path exists, false otherwise. Useful for validating data shape before accessing values.',
    tips: [
      'Use this before Object Get to avoid passing undefined into downstream nodes.',
      'Connect the result to a Gate to conditionally route data based on property existence.',
    ],
    pairsWith: ['object-get', 'gate', 'compare', 'json-parse'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const obj = ctx.inputs.get('object')
  const pathInput = ctx.inputs.get('path') as string | undefined
  const defaultPath = (ctx.controls.get('defaultPath') as string) ?? ''

  const path = pathInput ?? defaultPath
  const { found } = getByPath(obj, path)

  return new Map<string, unknown>([['result', found ? 1 : 0]])
}

export default defineNode({ definition, executor })
