/**
 * Math node executors — the impure remainder. `random` is non-deterministic. The
 * pure math nodes (add … divide, abs/clamp/map-range/modulo/power/trig/vector-math
 * and the advanced lerp … wrap set) plus the stateful `smooth` are co-located in
 * registry/math/<node>/node.ts (Phase 6).
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'

export const randomExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const min = (ctx.controls.get('min') as number) ?? 0
  const max = (ctx.controls.get('max') as number) ?? 1
  const seed = ctx.inputs.get('seed') !== undefined

  // If seed input is connected, use it for deterministic random
  if (seed) {
    const seedValue = ctx.inputs.get('seed') as number
    const x = Math.sin(seedValue * 12.9898) * 43758.5453
    const random = x - Math.floor(x)
    return new Map([['result', random * (max - min) + min]])
  }

  return new Map([['result', Math.random() * (max - min) + min]])
}
