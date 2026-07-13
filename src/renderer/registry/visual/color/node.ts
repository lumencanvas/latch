import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'color',
  name: 'Color',
  version: '1.0.0',
  category: 'visual',
  description: 'Create RGBA color value',
  icon: 'palette',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'r', type: 'number', label: 'R' },
    { id: 'g', type: 'number', label: 'G' },
    { id: 'b', type: 'number', label: 'B' },
    { id: 'a', type: 'number', label: 'A' },
  ],
  outputs: [
    { id: 'color', type: 'data', label: 'Color' },
    { id: 'r', type: 'number', label: 'R' },
    { id: 'g', type: 'number', label: 'G' },
    { id: 'b', type: 'number', label: 'B' },
    { id: 'a', type: 'number', label: 'A' },
  ],
  controls: [
    { id: 'r', type: 'slider', label: 'R', default: 1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'g', type: 'slider', label: 'G', default: 1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'b', type: 'slider', label: 'B', default: 1, props: { min: 0, max: 1, step: 0.01 } },
    { id: 'a', type: 'slider', label: 'A', default: 1, props: { min: 0, max: 1, step: 0.01 } },
  ],
  tags: ['color', 'colour', 'rgb', 'rgba', 'swatch', 'picker', 'fill', 'solid', 'tint'],
  info: {
    overview: 'Creates an RGBA color value from individual channel sliders or numeric inputs. Outputs both the combined color object and separate R, G, B, A channel values. Useful as a color source for shaders and visual effects.',
    tips: [
      'Connect LFO nodes to individual channels to create animated color cycling without writing shader code.',
      'Use the separate channel outputs to feed different parts of a flow with the same base color values.',
      'Set alpha below 1.0 when using this as a tint layer through a blend node in normal mode.',
    ],
    pairsWith: ['shader', 'blend', 'lfo', 'color-correction', 'map-range'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const r = (ctx.inputs.get('r') as number) ?? (ctx.controls.get('r') as number) ?? 1
  const g = (ctx.inputs.get('g') as number) ?? (ctx.controls.get('g') as number) ?? 1
  const b = (ctx.inputs.get('b') as number) ?? (ctx.controls.get('b') as number) ?? 1
  const a = (ctx.inputs.get('a') as number) ?? (ctx.controls.get('a') as number) ?? 1

  const outputs = new Map<string, unknown>()
  outputs.set('color', [r, g, b, a])
  outputs.set('r', r)
  outputs.set('g', g)
  outputs.set('b', b)
  outputs.set('a', a)
  return outputs
}

export default defineNode({ definition, executor })
