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
    { id: 'default', type: 'number', label: 'Default', default: 0, props: { step: 0.01 } },
  ],
  tags: ['parse', 'float', 'decimal', 'convert'],
  info: {
    overview: 'Parses a string into a floating-point number. Returns the parsed value and a boolean indicating whether the conversion was valid. A configurable default is returned when parsing fails.',
    tips: [
      'Use the valid output to filter out non-numeric strings before performing math.',
      'It is lenient: leading numbers are read and trailing text ignored ("12.5px" → 12.5). Use To Number to reject such strings.',
    ],
    pairsWith: ['format-number', 'to-number', 'expression', 'compare'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.str('value', '')
  const defaultVal = (ctx.controls.get('default') as number) ?? 0
  const outputs = new Map<string, unknown>()

  const parsed = parseFloat(value)

  if (!Number.isFinite(parsed)) {
    outputs.set('result', defaultVal)
    outputs.set('valid', 0)
    return outputs
  }

  outputs.set('result', parsed)
  outputs.set('valid', 1)
  return outputs
}

export default defineNode({ definition, executor })
