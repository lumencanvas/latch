import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'trig',
  name: 'Trig',
  version: '1.0.0',
  category: 'math',
  description: 'Trigonometric functions',
  icon: 'waves',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'number', label: 'Value' },
  ],
  outputs: [
    { id: 'result', type: 'number', label: 'Result' },
  ],
  controls: [
    {
      id: 'function',
      type: 'select',
      label: 'Function',
      default: 'sin',
      props: {
        options: ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh'],
      },
    },
    { id: 'degrees', type: 'toggle', label: 'Use Degrees', default: false },
  ],
  info: {
    overview: 'Applies trigonometric functions including sin, cos, tan, and their inverses and hyperbolic variants. The input is treated as radians by default, but a toggle lets you work in degrees instead. Useful for circular motion, oscillation, and angle calculations.',
    tips: [
      'Enable Use Degrees if your angle source provides values in degrees rather than radians.',
      'Feed a time-based ramp into sin or cos to generate smooth oscillations.',
    ],
    pairsWith: ['multiply', 'add', 'time', 'lfo', 'power'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const fn = (ctx.controls.get('function') as string) ?? 'sin'
  const useDegrees = (ctx.controls.get('degrees') as boolean) ?? false

  // Convert to radians if needed
  const input = useDegrees ? (value * Math.PI) / 180 : value

  let result: number
  switch (fn) {
    case 'sin':
      result = Math.sin(input)
      break
    case 'cos':
      result = Math.cos(input)
      break
    case 'tan':
      result = Math.tan(input)
      break
    case 'asin':
      result = Math.asin(value) // asin/acos/atan take normalized values
      if (useDegrees) result = (result * 180) / Math.PI
      break
    case 'acos':
      result = Math.acos(value)
      if (useDegrees) result = (result * 180) / Math.PI
      break
    case 'atan':
      result = Math.atan(value)
      if (useDegrees) result = (result * 180) / Math.PI
      break
    case 'sinh':
      result = Math.sinh(input)
      break
    case 'cosh':
      result = Math.cosh(input)
      break
    case 'tanh':
      result = Math.tanh(input)
      break
    default:
      result = Math.sin(input)
  }

  return new Map([['result', result]])
}

export default defineNode({ definition, executor, pure: true })
