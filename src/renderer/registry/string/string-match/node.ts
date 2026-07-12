import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'string-match',
  name: 'Regex Match',
  version: '1.0.0',
  category: 'string',
  description: 'Match string against regex pattern',
  icon: 'regex',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'input', type: 'string', label: 'Input' }],
  outputs: [
    { id: 'match', type: 'boolean', label: 'Match' },
    { id: 'groups', type: 'array', label: 'Groups' },
    { id: 'fullMatch', type: 'string', label: 'Full Match' },
  ],
  controls: [
    { id: 'pattern', type: 'text', label: 'Pattern', default: '.*' },
    { id: 'flags', type: 'text', label: 'Flags', default: '' },
  ],
  tags: ['regex', 'pattern', 'match', 'extract'],
  info: {
    overview: 'Tests a string against a regular expression pattern and outputs whether it matched, the full match text, and any captured groups. Supports standard JavaScript regex flags like g, i, and m.',
    tips: [
      'Use capture groups in your pattern to extract specific parts of the input via the groups output.',
      'Add the "i" flag for case-insensitive matching.',
    ],
    pairsWith: ['string-replace', 'string-contains', 'string-split', 'gate'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''
  const pattern = (ctx.controls.get('pattern') as string) ?? '.*'
  const flags = (ctx.controls.get('flags') as string) ?? ''

  const outputs = new Map<string, unknown>()

  try {
    const regex = new RegExp(pattern, flags)
    const match = input.match(regex)

    if (match) {
      outputs.set('match', 1)
      outputs.set('groups', match.slice(1)) // Capture groups
      outputs.set('fullMatch', match[0])
    } else {
      outputs.set('match', 0)
      outputs.set('groups', [])
      outputs.set('fullMatch', '')
    }
  } catch {
    // Invalid regex
    outputs.set('match', 0)
    outputs.set('groups', [])
    outputs.set('fullMatch', '')
    outputs.set('_error', 'Invalid regex pattern')
  }

  return outputs
}

export default defineNode({ definition, executor })
