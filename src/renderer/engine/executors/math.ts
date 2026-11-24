/**
 * Math node executors — the impure remainder. `random` is non-deterministic. The
 * pure math nodes (add … divide, abs/clamp/map-range/modulo/power/trig/vector-math
 * and the advanced lerp … wrap set) plus the stateful `smooth` are co-located in
 * registry/math/<node>/node.ts (Phase 6).
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState } from '../nodeState'

/** Deterministic hash of a seed → [0, 1). */
export function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/** Held value for `on-trigger` mode (auto gc/dispose; Stop→Play draws a fresh value). */
export const randomHeld = defineNodeState<number>({ label: 'random' })

export const randomExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const min = ctx.num('min', 0)
  const max = ctx.num('max', 1)
  const mode = (ctx.controls.get('mode') as string) ?? 'every-frame'
  const integer = (ctx.controls.get('integer') as boolean) ?? false

  const scale = (u: number) => {
    if (!integer) return u * (max - min) + min
    // Uniform integer in [min, max] inclusive.
    const lo = Math.ceil(Math.min(min, max))
    const hi = Math.floor(Math.max(min, max))
    return hi < lo ? lo : lo + Math.min(hi - lo, Math.floor(u * (hi - lo + 1)))
  }

  // A connected seed gives a deterministic value per seed (same seed → same value).
  const seedRaw = ctx.inputs.get('seed')
  if (seedRaw !== undefined) {
    return new Map([['result', scale(seededUnit(ctx.num('seed', 0)))]])
  }

  if (mode === 'on-trigger') {
    // Draw once, then hold until the Trigger input's rising edge.
    const fire = ctx.trig('trigger')
    let held = randomHeld.get(ctx.nodeId)
    if (held === undefined || fire) {
      held = Math.random()
      randomHeld.set(ctx.nodeId, held)
    }
    return new Map([['result', scale(held)]])
  }

  return new Map([['result', scale(Math.random())]])
}
