/**
 * Canonical trigger handling — one fired value and one edge detector.
 *
 * Today trigger handling has three inconsistent variants: inline level-tests
 * duplicated across executors, real edge detection via ad-hoc `lastHigh` state,
 * and trigger *values* that are sometimes `true`, sometimes `1`, sometimes a
 * timestamp. This standardizes all three.
 *
 * `risingEdge` is consumed by `latch`/`sample-hold` (the documented-edge-but-actually-
 * level Phase-0 fix) and by the engine's `ctx.trig` accessor. See
 * EXTENSIBILITY_ARCHITECTURE §5.1.
 */

import { defineNodeState } from './nodeState'

/** The one canonical "fired" value emitted by every trigger-producing node. */
export const TRIGGER = 1 as const

/**
 * Level test: is this value currently "high"? Accepts the legacy variants
 * (`true`, `1`, any positive number). Everything else is low.
 */
export function isHigh(value: unknown): boolean {
  if (value === true) return true
  if (typeof value === 'number') return value > 0
  return false
}

// Per-(node, key) "was high last time" state, GC'd automatically. The key is
// `${nodeId}::${key}`; keyToNodeId strips the suffix so a deleted node's edge
// state is collected. Neither node ids (nanoid / subflow `a/b`) nor caller keys
// contain `::`, so the split is unambiguous.
const edgeState = defineNodeState<boolean>({
  label: 'risingEdge',
  keyToNodeId: (k) => {
    const i = k.indexOf('::')
    return i < 0 ? k : k.slice(0, i)
  },
})

/**
 * Rising-edge detector: true only on the transition from low to high for the
 * given (`nodeId`, `key`). Independent state per key, so a node can track
 * several trigger inputs.
 */
export function risingEdge(nodeId: string, key: string, value: unknown): boolean {
  const compound = `${nodeId}::${key}`
  const high = isHigh(value)
  const wasHigh = edgeState.get(compound) ?? false
  edgeState.set(compound, high)
  return high && !wasHigh
}
