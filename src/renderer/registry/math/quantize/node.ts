import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'quantize',
  name: 'Quantize',
  version: '1.0.0',
  category: 'math',
  description: 'Round value to nearest step',
  icon: 'grid',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value' }],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [
    { id: 'step', type: 'number', label: 'Step', default: 1, props: { min: 0, step: 0.01 } },
    { id: 'mode', type: 'select', label: 'Mode', default: 'round', props: { options: ['round', 'floor', 'ceil'] } },
  ],
  tags: ['quantize', 'snap', 'round', 'grid', 'step'],
  info: {
    overview: 'Rounds a value to the nearest multiple of the specified step size. For example, with a step of 0.25, the value 0.3 becomes 0.25 and 0.4 becomes 0.5. Useful for snapping continuous signals to discrete levels.',
    tips: [
      'Set the step to 1 for standard integer rounding.',
      'Use floor / ceil mode to always snap down / up instead of to the nearest step.',
      'Use with smooth to get stepped output that still transitions smoothly between levels.',
    ],
    pairsWith: ['smooth', 'map-range', 'step', 'select', 'clamp'],
  },
}

/** Decimal places in `step` (0.25 → 2, 1e-7 → 7), capped at toFixed's useful range. */
function stepDecimals(step: number): number {
  const [mant, exp] = step.toExponential().split('e')
  const mantDecimals = (mant.split('.')[1] ?? '').length
  return Math.min(Math.max(mantDecimals - Number(exp), 0), 20)
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = ctx.num('value', 0)
  const step = Math.abs(ctx.num('step', 1))
  const mode = (ctx.controls.get('mode') as string) ?? 'round'

  if (step === 0) {
    return new Map([['result', value]])
  }

  const snap = mode === 'floor' ? Math.floor : mode === 'ceil' ? Math.ceil : Math.round
  // Round to the step's own decimal places to strip float dust (0.1-steps gave
  // 0.30000000000000004) without losing precision on large values (a significant-digit
  // round turned the timestamp 1732345678123 into 1732345678120).
  const result = Number((snap(value / step) * step).toFixed(stepDecimals(step)))

  return new Map([['result', result]])
}

export default defineNode({ definition, executor, pure: true })
