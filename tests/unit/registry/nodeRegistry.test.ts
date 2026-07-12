import { describe, it, expect } from 'vitest'
import { nodeSpecs, colocatedNodeIds, COLOCATED_PURE_NODE_TYPES } from '@/registry/nodeRegistry'
// Load the SFC component map standalone BEFORE '@/registry'. Importing '@/registry'
// re-exports './components' mid-evaluation (index.ts:72), which trips a happy-dom
// circular-init hazard (markRaw(undefined)); loading components first is the
// proven-safe order (mirrors stores/flows.ts). See EXTENSIBILITY §6 risk #3.
import '@/registry/components'
import { allNodes } from '@/registry'

/**
 * Guard tests for the auto-discovery glob (EXTENSIBILITY §6, POLICIES §1).
 *
 * These exist from the first commit. While zero `node.ts` files are co-located
 * the collected set is empty and these pass vacuously; as co-location proceeds
 * (Phase 6) they become the real gate. The dup-id and default-export guards run
 * at module load (the import below would throw) and so are meaningful immediately.
 */
describe('nodeRegistry auto-glob', () => {
  it('imports without throwing (no duplicate ids, no missing default exports)', () => {
    // Reaching here means the module-load guards in nodeRegistry.ts passed.
    expect(typeof nodeSpecs).toBe('object')
  })

  it('has no duplicate co-located node ids', () => {
    expect(new Set(colocatedNodeIds).size).toBe(colocatedNodeIds.length)
  })

  it('every co-located id resolves exactly once in allNodes (colocated-wins dedup holds)', () => {
    // The old form (colocated ⊆ allNodes ids) was tautological: allNodes.ts spreads
    // colocatedDefinitions in unconditionally, so it could never fail. It was also
    // premised on colocated ⊆ legacy, now false — migrated nodes are deleted from
    // their category barrel, and atan2/min/max were born co-located (never legacy).
    // The invariant with teeth: each co-located id appears in the live registry EXACTLY
    // once — a lingering legacy definition of the same id must be filtered out
    // (colocated-wins), never double-registered, and a co-located node is never dropped.
    const counts = new Map<string, number>()
    for (const n of allNodes) counts.set(n.id, (counts.get(n.id) ?? 0) + 1)
    for (const id of colocatedNodeIds) {
      expect(counts.get(id), `co-located id "${id}" not registered exactly once in allNodes`).toBe(1)
    }
  })

  it('count-equality gate: EVERY live node is co-located (Phase 6 complete)', () => {
    // POLICIES §1 count-equality CI gate. `allNodes` = legacy-barrel defs (now all empty) +
    // colocatedDefinitions; if any node were still legacy-only it would appear in `allNodes`
    // but not in `colocatedNodeIds`, so the lengths would diverge. Equality proves the whole
    // library is co-located — no legacy definition lingers, no id resolves twice.
    expect(colocatedNodeIds.length).toBe(allNodes.length)
    // Every allNodes id is a co-located id (belt-and-suspenders on the count check).
    const colocated = new Set(colocatedNodeIds)
    for (const d of allNodes) expect(colocated.has(d.id)).toBe(true)
  })

  it('derived pure set is a subset of the co-located ids', () => {
    for (const id of COLOCATED_PURE_NODE_TYPES) expect(colocatedNodeIds).toContain(id)
  })
})
