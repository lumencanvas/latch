import { defineNode } from '@/engine/defineNode'
import { defineNodeState } from '@/engine/nodeState'
import type { NodeDefinition } from '@/stores/nodes'
import type { ExecutionContext, NodeExecutorFn } from '@/engine/ExecutionEngine'

/**
 * `smooth` — first co-located STATEFUL node (ROADMAP Phase 6). Unlike the pure
 * math nodes, its per-node state store (`smoothState`, a `defineNodeState`) lives
 * here too: the eager `nodeRegistry` glob loads this module at startup, so the
 * store self-registers its gc/dispose into the engine's generic lifecycle loop
 * exactly as it did from `executors/math.ts`. The store + executor are re-exported
 * from the `@/engine/executors` barrel (see `executors/index.ts`) to preserve the
 * governed public-export contract and the `smooth.test.ts` import.
 */

const definition: NodeDefinition = {
  id: 'smooth',
  name: 'Smooth',
  version: '1.0.0',
  category: 'math',
  description: 'Smooth value changes over time',
  icon: 'trending-up',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'value', type: 'number', label: 'Value' },
  ],
  outputs: [
    { id: 'result', type: 'number', label: 'Result' },
  ],
  controls: [
    { id: 'factor', type: 'slider', label: 'Factor', default: 0.1, props: { min: 0.01, max: 1, step: 0.01 } },
  ],
  info: {
    overview: 'Applies exponential smoothing to a value, gradually moving the output toward the input over time. Lower factor values produce slower, smoother transitions while higher values track the input more closely. Useful for dampening noisy or jittery signals.',
    tips: [
      'Start with a factor around 0.1 and adjust based on how responsive you need the output to be.',
      'Place after any sensor or rapidly changing input to remove noise.',
    ],
    pairsWith: ['lerp', 'clamp', 'map-range', 'lfo', 'remap'],
  },
}

// Per-node smoothing state (previous output). Outputs aren't fed back as inputs,
// so the previous value must live here, not in controls/outputs. defineNodeState
// auto-registers gc/dispose with the engine's generic lifecycle loop.
export const smoothState = defineNodeState<number>({ label: 'smooth' })

export const smoothExecutor: NodeExecutorFn = (ctx: ExecutionContext) => {
  const stored = smoothState.get(ctx.nodeId)
  // A non-numeric / NaN frame HOLDS the current output (fallback = previous) instead of
  // snapping toward 0; the accumulator can never be poisoned by NaN.
  const target = ctx.num('value', stored ?? 0)
  const factor = Math.max(0, Math.min(1, ctx.num('factor', 0.1)))

  // First frame (no stored state) initializes to the target, then eases toward it.
  const prev = stored ?? target
  // Frame-rate-independent exponential smoothing: `factor` is the per-frame blend at 60 fps.
  // The old linear `factor * dt * 60` over-corrected at low fps (dt 0.25 s, factor 0.1 →
  // alpha 1.5, clamped to 1 = no smoothing at all).
  const alpha = 1 - Math.pow(1 - factor, Math.max(0, ctx.deltaTime) * 60)
  const smoothed = prev + (target - prev) * alpha
  smoothState.set(ctx.nodeId, Number.isFinite(smoothed) ? smoothed : target)

  return new Map<string, unknown>([['result', smoothed]])
}

export default defineNode({ definition, executor: smoothExecutor })
