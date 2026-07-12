import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'parse-int',
  name: 'Parse Int',
  version: '1.0.0',
  category: 'data',
  description: 'Parse string to integer with radix support',
  icon: 'binary',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'string', label: 'Value' }],
  outputs: [
    { id: 'result', type: 'number', label: 'Result' },
    { id: 'valid', type: 'boolean', label: 'Valid' },
  ],
  controls: [
    { id: 'radix', type: 'number', label: 'Radix', default: 10 },
    { id: 'default', type: 'number', label: 'Default', default: 0 },
  ],
  tags: ['parse', 'integer', 'hex', 'binary', 'convert'],
  info: {
    overview: 'Parses a string into an integer with configurable radix (base). Supports decimal, hexadecimal, binary, and other bases. Returns the parsed integer and a validity flag.',
    tips: [
      'Set the radix to 16 to parse hexadecimal color codes or other hex strings.',
      'Use the valid output to catch and handle non-numeric input before it reaches downstream nodes.',
    ],
    pairsWith: ['parse-float', 'to-number', 'format-number', 'expression'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as string) ?? ''
  const radix = (ctx.controls.get('radix') as number) ?? 10
  const defaultVal = (ctx.controls.get('default') as number) ?? 0
  const outputs = new Map<string, unknown>()

  const parsed = parseInt(value, radix)

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
