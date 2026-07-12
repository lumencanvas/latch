/**
 * Math node executors — the stateful/impure remainder. `smooth` keeps per-node
 * state via defineNodeState; `random` is non-deterministic. The pure math nodes
 * (add … divide, abs/clamp/map-range/modulo/power/trig/vector-math and the
 * advanced lerp … wrap set) are co-located in registry/math/<node>/node.ts (Phase 6).
 */
import type { ExecutionContext, NodeExecutorFn } from '../ExecutionEngine'
import { defineNodeState } from '../nodeState'

// Per-node smoothing state (previous output). Outputs aren't fed back as inputs,
// so the previous value must live here, not in controls/outputs. defineNodeState
// auto-registers gc/dispose with the engine's generic lifecycle loop.
export const smoothState = defineNodeState<number>({ label: 'smooth' })

export const smoothExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const target = (ctx.inputs.get('value') as number) ?? 0
  const rawFactor = (ctx.controls.get('factor') as number) ?? 0.1
  // Guard against NaN and invalid values
  const factor = Number.isFinite(rawFactor) ? rawFactor : 0.1

  // First frame (no stored state) initializes to the target, then eases toward it.
  const prev = smoothState.get(ctx.nodeId) ?? target
  const smoothed = prev + (target - prev) * Math.min(1, factor * ctx.deltaTime * 60)
  smoothState.set(ctx.nodeId, smoothed)

  return new Map<string, unknown>([['result', smoothed]])
}

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
