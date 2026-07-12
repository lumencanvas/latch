import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'string-split',
  name: 'String Split',
  version: '1.0.0',
  category: 'string',
  description: 'Split string into parts',
  icon: 'scissors',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'input', type: 'string', label: 'Input' },
  ],
  outputs: [
    { id: 'parts', type: 'array', label: 'Parts' },
    { id: 'first', type: 'string', label: 'First' },
    { id: 'count', type: 'number', label: 'Count' },
  ],
  controls: [
    { id: 'separator', type: 'text', label: 'Separator', default: ',' },
    { id: 'limit', type: 'number', label: 'Limit', default: 0, props: { min: 0 } },
  ],
  info: {
    overview: 'Splits a string into an array of parts using a separator. Outputs the array, the first element, and the total count of parts. An optional limit controls the maximum number of splits.',
    tips: [
      'Split by newline to break multi-line text into individual lines.',
      'Use the count output to determine how many tokens were found before processing the array.',
    ],
    pairsWith: ['string-concat', 'string-replace', 'string-contains', 'json-parse'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const input = (ctx.inputs.get('input') as string) ?? ''
  const separator = (ctx.controls.get('separator') as string) ?? ','
  const limit = (ctx.controls.get('limit') as number) ?? 0

  const outputs = new Map<string, unknown>()

  if (!input) {
    outputs.set('parts', [])
    outputs.set('first', '')
    outputs.set('count', 0)
    return outputs
  }

  // Handle empty separator - return whole string as single element instead of splitting into characters
  if (separator === '') {
    outputs.set('parts', [input])
    outputs.set('first', input)
    outputs.set('count', 1)
    return outputs
  }

  const parts = limit > 0 ? input.split(separator, limit) : input.split(separator)

  outputs.set('parts', parts)
  outputs.set('first', parts[0] ?? '')
  outputs.set('count', parts.length)

  return outputs
}

export default defineNode({ definition, executor })
