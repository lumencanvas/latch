import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'parse-float',
  name: 'Parse Float',
  version: '1.0.0',
  category: 'data',
  description: 'Parse string to floating point number',
  icon: 'percent',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'string', label: 'Value' }],
  outputs: [
    { id: 'result', type: 'number', label: 'Result' },
    { id: 'valid', type: 'boolean', label: 'Valid' },
  ],
  controls: [
    { id: 'default', type: 'number', label: 'Default', default: 0 },
  ],
  tags: ['parse', 'float', 'decimal', 'convert'],
  info: {
    overview: 'Parses a string into a floating-point number. Returns the parsed value and a boolean indicating whether the conversion was valid. A configurable default is returned when parsing fails.',
    tips: [
      'Use the valid output to filter out non-numeric strings before performing math.',
      'Prefer this over To Number when you specifically need decimal precision from string input.',
    ],
    pairsWith: ['format-number', 'to-number', 'expression', 'compare'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as string) ?? ''
  const defaultVal = (ctx.controls.get('default') as number) ?? 0
  const outputs = new Map<string, unknown>()

  const parsed = parseFloat(value)

  if (isNaN(parsed)) {
    outputs.set('result', defaultVal)
    outputs.set('valid', 0)
    return outputs
  }

  outputs.set('result', parsed)
  outputs.set('valid', 1)
  return outputs
}

export default defineNode({ definition, executor })
