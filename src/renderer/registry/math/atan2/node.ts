import { defineNode } from '@/engine/defineNode'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

/**
 * `atan2` — two-argument arctangent (born co-located, ROADMAP Phase 5 primitive).
 * Unlike the single-input `atan` in the `trig` node, this is quadrant-aware: it takes
 * separate Y and X components and returns the full-circle angle in radians (−π…π),
 * so it recovers the true heading of a vector (e.g. mouse/velocity direction).
 */

const definition: NodeDefinition = {
  id: 'atan2',
  name: 'Atan2',
  version: '1.0.0',
  category: 'math',
  description: 'Quadrant-aware angle (radians) from Y and X components',
  icon: 'triangle',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'y', type: 'number', label: 'Y' },
    { id: 'x', type: 'number', label: 'X' },
  ],
  outputs: [{ id: 'result', type: 'number', label: 'Angle' }],
  controls: [],
  info: {
    overview:
      'Computes atan2(Y, X) — the angle of the vector (X, Y) measured from the positive X axis, in radians from −π to π. Unlike a plain arctangent it uses the signs of both inputs to return the correct quadrant, so it never loses direction.',
    tips: [
      'Feed a delta (target − current) on each axis to get the heading toward a point.',
      'Pipe the result into sin/cos (Trig) or a degrees conversion for rotation values.',
    ],
    pairsWith: ['trig', 'vector-math', 'subtract', 'multiply'],
  },
}

const executor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const y = (ctx.inputs.get('y') as number) ?? 0
  const x = (ctx.inputs.get('x') as number) ?? 0
  return new Map([['result', Math.atan2(y, x)]])
}

export default defineNode({ definition, executor, pure: true })
