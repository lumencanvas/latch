import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'map-range',
  name: 'Map Range',
  version: '1.0.0',
  category: 'math',
  description: 'Remap a value from one range to another',
  icon: 'arrow-right-left',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value', required: true }],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [
    { id: 'inMin', type: 'number', label: 'In Min', default: 0 },
    { id: 'inMax', type: 'number', label: 'In Max', default: 1 },
    { id: 'outMin', type: 'number', label: 'Out Min', default: 0 },
    { id: 'outMax', type: 'number', label: 'Out Max', default: 100 },
  ],
  info: {
    overview: 'Rescales a value from one numeric range to another. For example, an input in the 0-1 range can be mapped to 0-100. The mapping is linear and does not clamp, so values outside the input range will extrapolate.',
    tips: [
      'Follow with a clamp node if you need to prevent extrapolation beyond the output range.',
      'Use remap instead if you need built-in clamping and easing options.',
    ],
    pairsWith: ['clamp', 'remap', 'lerp', 'smooth', 'in-range'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const inMin = (ctx.controls.get('inMin') as number) ?? 0
  const inMax = (ctx.controls.get('inMax') as number) ?? 1
  const outMin = (ctx.controls.get('outMin') as number) ?? 0
  const outMax = (ctx.controls.get('outMax') as number) ?? 100

  // Normalize to 0-1 then scale to output range
  const normalized = inMax !== inMin ? (value - inMin) / (inMax - inMin) : 0
  const result = normalized * (outMax - outMin) + outMin

  return new Map([['result', result]])
}

export default defineNode({ definition, executor, pure: true })
