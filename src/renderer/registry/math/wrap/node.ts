import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'wrap',
  name: 'Wrap',
  version: '1.0.0',
  category: 'math',
  description: 'Wrap value to stay within range',
  icon: 'repeat',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value' }],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [
    { id: 'min', type: 'number', label: 'Min', default: 0 },
    { id: 'max', type: 'number', label: 'Max', default: 1 },
  ],
  tags: ['wrap', 'modulo', 'loop', 'cycle', 'circular'],
  info: {
    overview: 'Wraps a value so it always stays within the specified min/max range, looping around when it exceeds a boundary. Unlike clamp, which stops at the edges, wrap cycles the value back to the other end of the range. Ideal for circular quantities like angles or repeating patterns.',
    tips: [
      'Use for angle values that need to stay in the 0-360 or -180 to 180 range.',
      'Combine with an incrementing counter to create a looping index.',
    ],
    pairsWith: ['clamp', 'modulo', 'time', 'add', 'map-range'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const min = (ctx.controls.get('min') as number) ?? 0
  const max = (ctx.controls.get('max') as number) ?? 1

  const range = max - min

  if (range === 0) {
    return new Map([['result', min]])
  }

  // Proper wrap that handles negatives correctly
  const result = ((value - min) % range + range) % range + min

  return new Map([['result', result]])
}

export default defineNode({ definition, executor, pure: true })
