import { describe, it, expect } from 'vitest'
import { PURE_NODE_TYPES } from '@/engine/ExecutionEngine'
import { COLOCATED_PURE_NODE_TYPES } from '@/registry/nodeRegistry'

/**
 * Gate for the dirty-mode pure-skip set (ROADMAP Phase 1: exact equality to the
 * canonical literal set — 27 ids as of later-73, when atan2/min/max landed).
 *
 * `PURE_NODE_TYPES` is the engine's allow-list of executors that are verified pure
 * functions of (inputs, controls) and may therefore be SKIPPED in dirty mode when
 * their inputs/controls are unchanged. A wrong *addition* here is the only dangerous
 * direction — it can make a node that secretly reads time/state/random go stale — so
 * the set must never grow by accident. This pins it against silent drift: changing it
 * requires editing this canonical literal too, which forces the "read the executor
 * first" discipline documented on the set.
 *
 * The set is still hand-maintained. `COLOCATED_PURE_NODE_TYPES` is derived from the
 * co-located specs' `pure:true` (Phase 6 co-location is underway — the pure math nodes
 * are now co-located) and will eventually REPLACE this literal; until then the subset
 * invariant below guarantees the two sources can never contradict the engine.
 */

// The canonical pure set — second, independent witness of ExecutionEngine.ts. Keep
// sorted within groups for readability; equality is order-independent.
const CANONICAL_PURE_NODE_TYPES = [
  'constant',
  // arithmetic
  'add', 'subtract', 'multiply', 'divide', 'modulo', 'power', 'abs',
  // two-input comparison (co-located Phase-5 primitives)
  'min', 'max',
  // ranges / shaping
  'map-range', 'clamp', 'lerp', 'step', 'smoothstep', 'remap', 'quantize', 'wrap',
  // misc math
  'trig', 'atan2', 'vector-math',
  // logic / routing
  'compare', 'and', 'or', 'not', 'select', 'switch',
] as const

describe('PURE_NODE_TYPES gate', () => {
  it('is exactly the canonical 27-id set', () => {
    expect(PURE_NODE_TYPES.size).toBe(27)
    expect(CANONICAL_PURE_NODE_TYPES).toHaveLength(27)
    // No duplicates slipped into the witness list.
    expect(new Set(CANONICAL_PURE_NODE_TYPES).size).toBe(27)
    // Exact membership equality (order-independent).
    expect([...PURE_NODE_TYPES].sort()).toEqual([...CANONICAL_PURE_NODE_TYPES].sort())
  })

  it('excludes the known-impure nodes (the dangerous direction)', () => {
    // Documented exclusions: module state / time / randomness. A regression that
    // added any of these would let dirty mode freeze a node that must run every frame.
    for (const impure of ['gate', 'smooth', 'random', 'counter', 'metronome', 'timer']) {
      expect(PURE_NODE_TYPES.has(impure)).toBe(false)
    }
  })

  it('never contradicts the pure:true-derived set (the Phase-6 derivation bridge)', () => {
    // Any co-located node flagged `pure:true` must also be in the engine's allow-list,
    // or the spec and the engine disagree. Now live (Phase 6 co-located the pure math
    // nodes + atan2/min/max): this catches a co-located pure node missing from the set.
    for (const id of COLOCATED_PURE_NODE_TYPES) {
      expect(PURE_NODE_TYPES.has(id), `co-located pure node "${id}" missing from PURE_NODE_TYPES`).toBe(true)
    }
  })
})
