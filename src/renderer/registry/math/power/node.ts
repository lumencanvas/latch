import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'power',
  name: 'Power/Root',
  version: '1.0.0',
  category: 'math',
  description: 'Power, root, and logarithm functions',
  icon: 'superscript',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'base', type: 'number', label: 'Base' },
    { id: 'exponent', type: 'number', label: 'Exponent' },
  ],
  outputs: [
    { id: 'result', type: 'number', label: 'Result' },
  ],
  controls: [
    {
      id: 'operation',
      type: 'select',
      label: 'Operation',
      default: 'Power',
      props: {
        options: ['Power', 'Sqrt', 'Cbrt', 'Log', 'Log10', 'Ln', 'Exp'],
      },
    },
    { id: 'exponent', type: 'number', label: 'Exponent', default: 2 },
  ],
  info: {
    overview: 'Applies power, root, and logarithmic functions to numeric values. Includes power, square root, cube root, natural log, log base 10, and exponential operations. Select the desired operation from the dropdown.',
    tips: [
      'Use Sqrt for distance calculations after summing squared components.',
      'Apply Log or Ln to compress large value ranges into smaller ones.',
    ],
    pairsWith: ['multiply', 'abs', 'map-range', 'trig'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const base = (ctx.inputs.get('base') as number) ?? 0
  const exponentInput = ctx.inputs.get('exponent') as number | undefined
  const exponentControl = (ctx.controls.get('exponent') as number) ?? 2
  const exponent = exponentInput ?? exponentControl
  const operation = (ctx.controls.get('operation') as string) ?? 'Power'

  let result: number
  switch (operation) {
    case 'Power':
      result = Math.pow(base, exponent)
      break
    case 'Sqrt':
      result = Math.sqrt(base)
      break
    case 'Cbrt':
      result = Math.cbrt(base)
      break
    case 'Log':
      result = Math.log(base) / Math.log(exponent) // Log base exponent
      break
    case 'Log10':
      result = Math.log10(base)
      break
    case 'Ln':
      result = Math.log(base)
      break
    case 'Exp':
      result = Math.exp(base)
      break
    default:
      result = Math.pow(base, exponent)
  }

  // Guard NaN *and* ±Infinity (e.g. log(0) = -Infinity, pow(0, -1) = Infinity) —
  // isNaN alone let infinities propagate downstream. (AUDIT §E.)
  return new Map([['result', Number.isFinite(result) ? result : 0]])
}

export default defineNode({ definition, executor, pure: true })
