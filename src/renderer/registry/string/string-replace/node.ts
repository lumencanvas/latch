import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'string-replace',
  name: 'String Replace',
  version: '1.0.0',
  category: 'string',
  description: 'Replace text in a string',
  icon: 'replace',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'string', label: 'Input' },
    { id: 'search', type: 'string', label: 'Search' },
    { id: 'replace', type: 'string', label: 'Replace' },
  ],
  outputs: [
    { id: 'result', type: 'string', label: 'Result' },
    { id: '_error', type: 'string', label: 'Error' },
  ],
  controls: [
    { id: 'search', type: 'text', label: 'Search', default: '' },
    { id: 'replace', type: 'text', label: 'Replace', default: '' },
    { id: 'useRegex', type: 'toggle', label: 'Use Regex', default: false },
    { id: 'replaceAll', type: 'toggle', label: 'Replace All', default: true },
  ],
  info: {
    overview: 'Replaces occurrences of a search string or regex pattern within the input. Can replace the first match or all matches. The search and replace values can come from either the controls or the connected inputs.',
    tips: [
      'Enable the Use Regex toggle to use patterns like \\d+ for matching numbers.',
      'Connect dynamic search and replace values from other nodes to do data-driven substitution.',
    ],
    pairsWith: ['string-match', 'string-contains', 'string-template', 'string-concat'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''

  // Use nullish coalescing to properly handle empty string inputs
  // If search input is connected (even as empty string), use it; otherwise fall back to control
  const searchInput = ctx.inputs.get('search')
  const replaceInput = ctx.inputs.get('replace')

  const search = searchInput !== undefined
    ? (searchInput as string)
    : ((ctx.controls.get('search') as string) ?? '')
  const replace = replaceInput !== undefined
    ? (replaceInput as string)
    : ((ctx.controls.get('replace') as string) ?? '')
  const useRegex = (ctx.controls.get('useRegex') as boolean) ?? false
  const replaceAll = (ctx.controls.get('replaceAll') as boolean) ?? true

  const outputs = new Map<string, unknown>()

  if (!input || !search) {
    outputs.set('result', input)
    return outputs
  }

  let result: string
  try {
    if (useRegex) {
      const flags = replaceAll ? 'g' : ''
      const regex = new RegExp(search, flags)
      result = input.replace(regex, replace)
    } else {
      if (replaceAll) {
        result = input.split(search).join(replace)
      } else {
        result = input.replace(search, replace)
      }
    }
  } catch {
    // Invalid regex
    result = input
    outputs.set('_error', 'Invalid regex pattern')
  }

  outputs.set('result', result)
  return outputs
}

export default defineNode({ definition, executor })
