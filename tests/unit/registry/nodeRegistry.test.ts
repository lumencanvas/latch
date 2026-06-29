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

  it('every co-located id is a real legacy node id (no orphans)', () => {
    const legacy = new Set(allNodes.map((n) => n.id))
    for (const id of colocatedNodeIds) expect(legacy.has(id)).toBe(true)
  })

  it('count guard: co-located set never exceeds the legacy node set', () => {
    expect(colocatedNodeIds.length).toBeLessThanOrEqual(allNodes.length)
    // TODO(phase6): tighten to `toBe(allNodes.length)` once every node has a
    // co-located node.ts — that is the POLICIES count-equality CI gate.
  })

  it('derived pure set is a subset of the co-located ids', () => {
    for (const id of COLOCATED_PURE_NODE_TYPES) expect(colocatedNodeIds).toContain(id)
  })
})
