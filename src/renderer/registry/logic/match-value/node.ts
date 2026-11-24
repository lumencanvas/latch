import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'match-value',
  name: 'Match Value',
  version: '1.0.0',
  category: 'logic',
  description: 'Check if input equals a specific value',
  icon: 'check-circle',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
  ],
  outputs: [
    { id: 'result', type: 'boolean', label: 'Match' },
    { id: 'value', type: 'any', label: 'Value' },
  ],
  controls: [
    { id: 'target', type: 'text', label: 'Target Value', default: '' },
    { id: 'type', type: 'select', label: 'Compare As', default: 'auto', props: { options: ['auto', 'number', 'string', 'boolean'] } },
  ],
  tags: ['match', 'compare', 'equal', 'check', 'filter'],
  info: {
    overview: 'Tests whether an input value matches a specific target value you type in. Supports automatic type detection or explicit type coercion. Passes the original value through so you can chain it with gates or other logic.',
    tips: [
      'Use "auto" mode to let the node guess the type — it tries number first, then boolean, then string.',
      'The value output passes the input through unchanged, making it easy to chain with a gate.',
    ],
    pairsWith: ['gate', 'switch', 'compare', 'equals', 'pass-if'],
  },
}

// Co-located (was utility.ts matchValueExecutor). Fixes: boolean comparisons used
// Boolean(value), so the STRING "false" matched target "true"; number mode treated null/''
// as 0 (matching target "0").
function toBool(v: unknown): boolean {
  if (typeof v === 'string') return ['true', '1', 'yes', 'on'].includes(v.trim().toLowerCase())
  return v === true || (typeof v === 'number' && v !== 0)
}
function toNum(v: unknown): number {
  if (v === null || v === undefined) return NaN
  if (typeof v === 'string' && v.trim() === '') return NaN
  return Number(v)
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.inputs.get('value')
  const target = String(ctx.controls.get('target') ?? '')
  const compareType = (ctx.controls.get('type') as string) ?? 'auto'

  if (target === '') {
    return new Map<string, unknown>([['result', 0], ['value', value]])
  }

  let result: boolean
  switch (compareType) {
    case 'number':
      result = toNum(value) === toNum(target)
      break
    case 'string':
      result = String(value ?? '') === target
      break
    case 'boolean':
      result = toBool(value) === toBool(target)
      break
    case 'auto':
    default: {
      const t = target.trim()
      if (t !== '' && Number.isFinite(Number(t))) result = toNum(value) === Number(t)
      else if (t === 'true' || t === 'false') result = toBool(value) === (t === 'true')
      else result = String(value ?? '') === target
    }
  }
  return new Map<string, unknown>([['result', result ? 1 : 0], ['value', value]])
}

export default defineNode({ definition, executor })
