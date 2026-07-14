import { describe, it, expect } from 'vitest'
import { PURE_NODE_TYPES } from '@/engine/ExecutionEngine'
import { COLOCATED_PURE_NODE_TYPES } from '@/registry/nodeRegistry'

/**
 * The engine currently consumes the hand-maintained `PURE_NODE_TYPES`; the derived
 * `COLOCATED_PURE_NODE_TYPES` (every node declaring `pure: true`) is slated to replace it
 * (nodeRegistry Phase 1). This guards the swap: the two sets MUST stay in parity so a node
 * marked pure in exactly one place can't silently drift (the `constant` divergence that this
 * test was added alongside — it was in the static set but its node.ts omitted `pure: true`).
 */
describe('pure-node-set parity', () => {
  it('the derived COLOCATED_PURE_NODE_TYPES matches the authoritative PURE_NODE_TYPES', () => {
    const authoritative = [...PURE_NODE_TYPES].sort()
    const derived = [...COLOCATED_PURE_NODE_TYPES].sort()
    expect(derived).toEqual(authoritative)
  })
})
