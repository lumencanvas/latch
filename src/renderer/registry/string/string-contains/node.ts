import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'string-contains',
  name: 'String Contains',
  version: '1.0.0',
  category: 'string',
  description: 'Check if string contains a substring',
  icon: 'search',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'string', label: 'Input' },
    { id: 'search', type: 'string', label: 'Search' },
  ],
  outputs: [
    { id: 'result', type: 'boolean', label: 'Result' },
    { id: 'index', type: 'number', label: 'Index' },
  ],
  controls: [
    { id: 'caseSensitive', type: 'toggle', label: 'Case Sensitive', default: true },
  ],
  tags: ['contains', 'includes', 'search', 'find'],
  info: {
    overview: 'Checks whether a string contains a given substring and outputs a boolean result along with the index of the first match. Supports both case-sensitive and case-insensitive searching.',
    tips: [
      'Use the index output to find where the match starts, then feed it into String Slice to extract surrounding context.',
      'Turn off case sensitivity when searching user-provided text.',
    ],
    pairsWith: ['string-slice', 'string-match', 'string-replace', 'gate'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''
  const search = (ctx.inputs.get('search') as string) ?? ''
  const caseSensitive = (ctx.controls.get('caseSensitive') as boolean) ?? true

  if (!input || !search) {
    return new Map([
      ['result', 0],
      ['index', -1],
    ])
  }

  let result: boolean
  let index: number

  if (caseSensitive) {
    index = input.indexOf(search)
    result = index !== -1
  } else {
    index = input.toLowerCase().indexOf(search.toLowerCase())
    result = index !== -1
  }

  return new Map([
    ['result', result ? 1 : 0],
    ['index', index],
  ])
}

export default defineNode({ definition, executor })
