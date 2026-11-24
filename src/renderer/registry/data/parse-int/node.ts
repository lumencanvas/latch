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
    { id: 'radix', type: 'number', label: 'Radix', default: 10, props: { min: 2, max: 36, step: 1 } },
    { id: 'default', type: 'number', label: 'Default', default: 0 },
  ],
  tags: ['parse', 'integer', 'hex', 'binary', 'convert'],
  info: {
    overview: 'Parses a string into an integer with configurable radix (base). Supports decimal, hexadecimal, binary, and other bases. Returns the parsed integer and a validity flag.',
    tips: [
      'Set the radix to 16 to parse hex strings — a leading "#" or "0x" is accepted (e.g. "#ff0000").',
      'With radix 2 or 8 the "0b" / "0o" prefixes are accepted too.',
      'Use the valid output to catch and handle non-numeric input before it reaches downstream nodes.',
    ],
    pairsWith: ['parse-float', 'to-number', 'format-number', 'expression'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const raw = ctx.str('value', '').trim()
  // Radix outside 2-36 made parseInt return NaN for EVERY input with no feedback.
  const radix = Math.max(2, Math.min(36, Math.floor(ctx.num('radix', 10))))
  // Strip the conventional base prefixes (keeping a sign): '#ff0000' / '0x1f' for 16,
  // '0b1010' for 2, '0o17' for 8 — parseInt only understands '0x' itself, and '0b1010'
  // silently parsed as 0.
  const prefix = radix === 16 ? /^([+-]?)(?:#|0x)/i : radix === 2 ? /^([+-]?)0b/i : radix === 8 ? /^([+-]?)0o/i : null
  const value = prefix ? raw.replace(prefix, '$1') : raw
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
