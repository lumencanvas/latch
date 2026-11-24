import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'
import { parseLooseJson, sameValue } from '../../data/valueHelpers'

const definition: NodeDefinition = {
  id: 'equals',
  name: 'Equals',
  version: '1.0.0',
  category: 'logic',
  description: 'Type-agnostic equality comparison',
  icon: 'equal',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'a', type: 'any', label: 'A' },
    { id: 'b', type: 'any', label: 'B' },
  ],
  outputs: [{ id: 'result', type: 'boolean', label: 'Result' }],
  controls: [
    { id: 'strict', type: 'toggle', label: 'Strict (===)', default: true },
    { id: 'a', type: 'text', label: 'A (JSON or text)', default: '' },
    { id: 'b', type: 'text', label: 'B (JSON or text)', default: '' },
  ],
  tags: ['compare', 'equal', 'match', 'same'],
  info: {
    overview: 'Checks whether two values of any type are equal and outputs a boolean. Supports both strict (===) and loose (==) comparison modes. Unlike Compare, this works with strings, booleans, and other non-numeric types.',
    tips: [
      'Use strict mode to avoid unexpected type coercion.',
      'Pair with switch to branch on exact value matches.',
    ],
    pairsWith: ['compare', 'switch', 'gate', 'not', 'pass-if'],
  },
}

// Co-located (was utility.ts equalsExecutor). Fixes: a typed A/B control is parsed as JSON
// when it can be (so a wired 5 equals a typed "5" in strict mode — a text control could never
// produce a number before); deep compare no longer throws on cyclic values or depends on key
// order; NaN equals NaN.
const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  // A typed side is JSON-parsed only when the other side is a wired NON-string (so a wired 5
  // matches a typed "5"). Against a wired string — or another typed value — it stays text, so
  // saved flows comparing e.g. an MQTT payload "42" to a typed 42 keep matching.
  const wa = ctx.inputs.get('a')
  const wb = ctx.inputs.get('b')
  const typed = (raw: unknown, other: unknown) =>
    other !== undefined && typeof other !== 'string' ? parseLooseJson(raw) : (raw ?? '')
  const a = wa ?? typed(ctx.controls.get('a'), wb)
  const b = wb ?? typed(ctx.controls.get('b'), wa)
  const strict = (ctx.controls.get('strict') as boolean) ?? true

  // eslint-disable-next-line eqeqeq
  const result = strict ? sameValue(a, b) : sameValue(a, b) || a == b
  return new Map([['result', result ? 1 : 0]])
}

export default defineNode({ definition, executor })
