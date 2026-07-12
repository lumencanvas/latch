import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'string-starts-ends',
  name: 'Starts/Ends With',
  version: '1.0.0',
  category: 'string',
  description: 'Check if string starts or ends with substring',
  icon: 'arrow-right-from-line',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'string', label: 'Input' },
    { id: 'search', type: 'string', label: 'Search' },
  ],
  outputs: [
    { id: 'startsWith', type: 'boolean', label: 'Starts With' },
    { id: 'endsWith', type: 'boolean', label: 'Ends With' },
  ],
  controls: [
    { id: 'caseSensitive', type: 'toggle', label: 'Case Sensitive', default: true },
  ],
  tags: ['prefix', 'suffix', 'starts', 'ends', 'begins'],
  info: {
    overview: 'Tests whether a string starts or ends with a given substring. Outputs separate booleans for each check. Supports case-sensitive and case-insensitive comparison.',
    tips: [
      'Use this to detect file extensions by checking if a path ends with ".png" or ".jpg".',
      'Connect the boolean outputs to a Gate node to route data based on prefix or suffix matches.',
    ],
    pairsWith: ['string-contains', 'string-slice', 'gate', 'string-match'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''
  const search = (ctx.inputs.get('search') as string) ?? ''
  const caseSensitive = (ctx.controls.get('caseSensitive') as boolean) ?? true

  if (!input || !search) {
    return new Map([
      ['startsWith', 0],
      ['endsWith', 0],
    ])
  }

  let startsWith: boolean
  let endsWith: boolean

  if (caseSensitive) {
    startsWith = input.startsWith(search)
    endsWith = input.endsWith(search)
  } else {
    const lowerInput = input.toLowerCase()
    const lowerSearch = search.toLowerCase()
    startsWith = lowerInput.startsWith(lowerSearch)
    endsWith = lowerInput.endsWith(lowerSearch)
  }

  return new Map([
    ['startsWith', startsWith ? 1 : 0],
    ['endsWith', endsWith ? 1 : 0],
  ])
}

export default defineNode({ definition, executor })
