import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'remap',
  name: 'Remap',
  version: '1.0.0',
  category: 'math',
  description: 'Remap value with clamping and easing',
  icon: 'sliders-horizontal',
  platforms: ['web', 'electron'],
  inputs: [{ id: 'value', type: 'number', label: 'Value' }],
  outputs: [{ id: 'result', type: 'number', label: 'Result' }],
  controls: [
    { id: 'inMin', type: 'number', label: 'In Min', default: 0 },
    { id: 'inMax', type: 'number', label: 'In Max', default: 1 },
    { id: 'outMin', type: 'number', label: 'Out Min', default: 0 },
    { id: 'outMax', type: 'number', label: 'Out Max', default: 100 },
    { id: 'clamp', type: 'toggle', label: 'Clamp', default: true },
    {
      id: 'easing',
      type: 'select',
      label: 'Easing',
      default: 'linear',
      props: { options: ['linear', 'ease-in', 'ease-out', 'ease-in-out'] },
    },
  ],
  tags: ['remap', 'map', 'range', 'scale', 'easing'],
  info: {
    overview: 'Rescales a value from one range to another with optional clamping and easing. Unlike map-range, this node can clamp the output to the target range and apply ease-in, ease-out, or ease-in-out curves. Good for shaping sensor data or animation curves.',
    tips: [
      'Enable Clamp to prevent output from exceeding the target range.',
      'Use ease-in-out for natural-feeling transitions between value ranges.',
    ],
    pairsWith: ['map-range', 'smooth', 'lerp', 'clamp', 'smoothstep'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const value = (ctx.inputs.get('value') as number) ?? 0
  const inMin = (ctx.controls.get('inMin') as number) ?? 0
  const inMax = (ctx.controls.get('inMax') as number) ?? 1
  const outMin = (ctx.controls.get('outMin') as number) ?? 0
  const outMax = (ctx.controls.get('outMax') as number) ?? 100
  const clamp = (ctx.controls.get('clamp') as boolean) ?? true
  const easing = (ctx.controls.get('easing') as string) ?? 'linear'

  // Normalize to 0-1
  let t = inMax !== inMin ? (value - inMin) / (inMax - inMin) : 0

  // Clamp if enabled
  if (clamp) {
    t = Math.max(0, Math.min(1, t))
  }

  // Apply easing
  switch (easing) {
    case 'ease-in':
      t = t * t
      break
    case 'ease-out':
      t = 1 - (1 - t) * (1 - t)
      break
    case 'ease-in-out':
      t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      break
    // linear: no change
  }

  const result = t * (outMax - outMin) + outMin

  return new Map([['result', result]])
}

export default defineNode({ definition, executor, pure: true })
