import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'format-number',
  name: 'Format Number',
  version: '1.0.0',
  category: 'data',
  description: 'Format number with locale and options',
  icon: 'coins',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value' }],
  outputs: [{ id: 'result', type: 'string', label: 'Result' }],
  controls: [
    {
      id: 'style',
      type: 'select',
      label: 'Style',
      default: 'decimal',
      props: { options: ['decimal', 'percent', 'currency'] },
    },
    { id: 'currency', type: 'text', label: 'Currency', default: 'USD' },
    { id: 'decimals', type: 'number', label: 'Decimals', default: 2 },
  ],
  tags: ['format', 'number', 'currency', 'percent', 'locale'],
  info: {
    overview: 'Formats a number as a locale-aware string with support for decimal, percent, and currency styles. You can control the number of decimal places and the currency code. The output is a display-ready string.',
    tips: [
      'Set the style to "currency" and specify a currency code like "EUR" or "JPY" for localized money formatting.',
      'Use the decimals control to round values for cleaner display output.',
    ],
    pairsWith: ['to-number', 'parse-float', 'expression', 'to-string'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const style = (ctx.controls.get('style') as string) ?? 'decimal'
  const currency = (ctx.controls.get('currency') as string) ?? 'USD'
  const decimals = (ctx.controls.get('decimals') as number) ?? 2

  try {
    const options: Intl.NumberFormatOptions = {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }

    if (style === 'percent') {
      options.style = 'percent'
    } else if (style === 'currency') {
      options.style = 'currency'
      options.currency = currency
    }

    const result = new Intl.NumberFormat('en-US', options).format(value)
    return new Map<string, unknown>([['result', result]])
  } catch {
    return new Map<string, unknown>([['result', String(value)]])
  }
}

export default defineNode({ definition, executor })
