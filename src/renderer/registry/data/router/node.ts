import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

const definition: NodeDefinition = {
  id: 'router',
  name: 'Router',
  version: '1.0.0',
  category: 'data',
  description: 'Route value to one of multiple outputs based on index',
  icon: 'git-branch',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'any', label: 'Value' },
    { id: 'route', type: 'number', label: 'Route' },
  ],
  outputs: [
    { id: 'out0', type: 'any', label: 'Out 0' },
    { id: 'out1', type: 'any', label: 'Out 1' },
    { id: 'out2', type: 'any', label: 'Out 2' },
    { id: 'out3', type: 'any', label: 'Out 3' },
  ],
  controls: [
    { id: 'route', type: 'number', label: 'Route', default: 0, props: { min: 0, max: 3, step: 1 } },
  ],
  tags: ['router', 'demux', 'switch', 'route', 'split'],
  info: {
    overview: 'Routes an input value to one of four outputs based on a numeric route index (the Route input, or the Route control when unwired; clamped to 0-3). Only the selected output receives the value; all others remain inactive. Useful for demultiplexing data streams or directing flow based on state.',
    tips: [
      'Connect a Counter node to the route input to cycle through outputs sequentially.',
      'Use an Expression node to compute the route index dynamically from input data.',
    ],
    pairsWith: ['counter', 'select', 'switch', 'gate'],
  },
}

// Co-located (was utility.ts routerExecutor): ctx.num maps NaN/±Infinity routes to the Route
// control instead of `out${NaN}` (which silenced all four outputs), and adds the control.
const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const ctl = Number(ctx.controls.get('route'))
  const route = Math.max(0, Math.min(3, Math.floor(ctx.num('route', Number.isFinite(ctl) ? ctl : 0))))
  return new Map<string, unknown>([[`out${route}`, ctx.inputs.get('value')]])
}

export default defineNode({ definition, executor })
