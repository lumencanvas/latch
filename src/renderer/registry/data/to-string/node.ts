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
    { id: 'precision', type: 'number', label: 'Precision', default: 2, props: { min: 0, max: 20, step: 1 }, when: { format: 'fixed' } },
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

/** Typed arrays / ArrayBuffers serialize as `{"0":12,…}`; render them as plain arrays. */
function normalizeBytes(v: unknown): unknown {
  if (v instanceof ArrayBuffer) return Array.from(new Uint8Array(v))
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return Array.from(v as unknown as ArrayLike<number>)
  return v
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const format = (ctx.controls.get('format') as string) ?? 'default'
  // toFixed throws RangeError outside 0-100 — every frame — so clamp.
  const precision = Math.max(0, Math.min(100, Math.floor(ctx.num('precision', 2))))

  let result: string

  switch (format) {
    case 'json':
      try {
        // JSON.stringify(undefined) is undefined (not a string): fall back to String().
        result = JSON.stringify(normalizeBytes(value), null, 2) ?? String(value)
      } catch {
        result = String(value)
      }
      break
    case 'fixed':
      // Numeric strings format too (a "3.14159" string from an `any` source).
      if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))) {
        result = Number(value).toFixed(precision)
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
          result = JSON.stringify(normalizeBytes(value)) ?? String(value)
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
