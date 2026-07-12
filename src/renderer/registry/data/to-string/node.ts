import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'to-string',
  name: 'To String',
  version: '1.0.0',
  category: 'data',
  description: 'Convert any value to string',
  icon: 'type',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'any', label: 'Value' }],
  outputs: [{ id: 'result', type: 'string', label: 'Result' }],
  controls: [
    {
      id: 'format',
      type: 'select',
      label: 'Format',
      default: 'default',
      props: { options: ['default', 'json', 'fixed'] },
    },
    { id: 'precision', type: 'number', label: 'Precision', default: 2 },
  ],
  tags: ['convert', 'string', 'format', 'stringify'],
  info: {
    overview: 'Converts any value to a string representation. Supports default conversion, JSON serialization, and fixed-precision numeric formatting. The precision control applies only in fixed mode.',
    tips: [
      'Use json format mode for objects and arrays to get a complete string representation.',
      'Use fixed mode with a precision of 0 to display whole numbers without decimal places.',
    ],
    pairsWith: ['to-number', 'json-stringify', 'format-number', 'array-join'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const format = (ctx.controls.get('format') as string) ?? 'default'
  const precision = (ctx.controls.get('precision') as number) ?? 2

  let result: string

  switch (format) {
    case 'json':
      try {
        result = JSON.stringify(value, null, 2)
      } catch {
        result = String(value)
      }
      break
    case 'fixed':
      if (typeof value === 'number') {
        result = value.toFixed(precision)
      } else {
        result = String(value)
      }
      break
    default:
      if (value === null) {
        result = 'null'
      } else if (value === undefined) {
        result = 'undefined'
      } else if (typeof value === 'object') {
        try {
          result = JSON.stringify(value)
        } catch {
          result = String(value)
        }
      } else {
        result = String(value)
      }
  }

  return new Map<string, unknown>([['result', result]])
}

export default defineNode({ definition, executor })
