import { defineNode } from '@/engine/defineNode'
import { defineNodeState } from '@/engine/nodeState'
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
    { id: 'currency', type: 'text', label: 'Currency', default: 'USD', when: { style: 'currency' } },
    { id: 'decimals', type: 'number', label: 'Decimals', default: 2, props: { min: 0, max: 20, step: 1 } },
    { id: 'locale', type: 'text', label: 'Locale', default: '', props: { placeholder: 'en-US (blank = system)' } },
  ],
  tags: ['format', 'number', 'currency', 'percent', 'locale'],
  info: {
    overview: 'Formats a number as a locale-aware string with support for decimal, percent, and currency styles. You can control the number of decimal places and the currency code. The output is a display-ready string.',
    tips: [
      'Set the style to "currency" and specify a currency code like "EUR" or "JPY" for localized money formatting.',
      'Use the decimals control to round values for cleaner display output.',
      'Percent style expects a 0-1 fraction (0.25 → 25%).',
      'Leave Locale blank to use the system locale, or enter a tag like "de-DE" or "ja-JP".',
    ],
    pairsWith: ['to-number', 'parse-float', 'expression', 'to-string'],
  },
}

// Intl.NumberFormat construction is expensive; cache one per node keyed by its options.
const formatterCache = defineNodeState<{ key: string; nf: Intl.NumberFormat }>({ label: 'format-number' })

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.num('value', 0)
  const style = (ctx.controls.get('style') as string) ?? 'decimal'
  const currency = ((ctx.controls.get('currency') as string) ?? 'USD').trim() || 'USD'
  // Out-of-range decimals made Intl throw (RangeError), silently dropping ALL formatting.
  const decimals = Math.max(0, Math.min(20, Math.floor(ctx.num('decimals', 2))))
  const locale = ((ctx.controls.get('locale') as string) ?? '').trim()

  try {
    const key = `${locale}|${style}|${currency}|${decimals}`
    let fmt = formatterCache.get(ctx.nodeId)
    if (!fmt || fmt.key !== key) {
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
      fmt = { key, nf: new Intl.NumberFormat(locale || undefined, options) }
      formatterCache.set(ctx.nodeId, fmt)
    }
    return new Map<string, unknown>([['result', fmt.nf.format(value)]])
  } catch (e) {
    // Invalid locale tag / currency code: keep a readable value and surface why.
    return new Map<string, unknown>([
      ['result', String(value)],
      ['_error', e instanceof Error ? e.message : 'Invalid number format'],
    ])
  }
}

export default defineNode({ definition, executor })
