import { describe, it, expect } from 'vitest'
import { collectSpecs } from '@/registry/nodeRegistry'
import { defineNode, defineNodes, type NodeSpec } from '@/engine/defineNode'
import type { NodeExecutorFn } from '@/engine/ExecutionEngine'

/**
 * Multi-node unit support (Workstream A5): one file may register MANY nodes by
 * default-exporting `defineNodes([...])` (a `nodes.ts` family) instead of a single
 * `defineNode(...)` (`node.ts`). The registry collector flattens `NodeSpec[]` defaults and
 * applies the same dup-id / missing-default guards per spec. This pins that behaviour with
 * fixtures (no real registry file, so the live count is untouched).
 */

const exec: NodeExecutorFn = () => new Map()
const mk = (id: string): NodeSpec => ({ definition: { id } as NodeSpec['definition'], executor: exec })

describe('defineNodes — one unit, many nodes', () => {
  it('brands each spec in the family (returns the array)', () => {
    const family = defineNodes([mk('a'), mk('b'), mk('c')])
    expect(family).toHaveLength(3)
    expect(family.map((s) => s.definition.id)).toEqual(['a', 'b', 'c'])
  })

  it('a single defineNode is unchanged (byte-identical passthrough for non-model nodes)', () => {
    const spec = mk('solo')
    expect(defineNode(spec)).toBe(spec)
  })
})

describe('collectSpecs — flatten node.ts + nodes.ts defaults', () => {
  it('registers a single-spec default (node.ts)', () => {
    const { specsById, missingDefault, duplicateIds } = collectSpecs({ './x/node.ts': mk('x') })
    expect(Object.keys(specsById)).toEqual(['x'])
    expect(missingDefault).toEqual([])
    expect(duplicateIds).toEqual([])
  })

  it('flattens an ARRAY default (nodes.ts family) into individual specs', () => {
    const { specsById } = collectSpecs({ './fam/nodes.ts': [mk('p'), mk('q'), mk('r')] })
    expect(Object.keys(specsById).sort()).toEqual(['p', 'q', 'r'])
  })

  it('mixes node.ts and nodes.ts across files', () => {
    const { specsById } = collectSpecs({
      './one/node.ts': mk('one'),
      './fam/nodes.ts': [mk('two'), mk('three')],
    })
    expect(Object.keys(specsById).sort()).toEqual(['one', 'three', 'two'])
  })

  it('flags a missing default, an empty family, and a malformed spec', () => {
    const bad = { definition: { id: 'z' } } as unknown as NodeSpec // no executor
    const { missingDefault, specsById } = collectSpecs({
      './named-only/node.ts': undefined,
      './empty/nodes.ts': [],
      './malformed/node.ts': bad,
    })
    expect(missingDefault.sort()).toEqual(['./empty/nodes.ts', './malformed/node.ts', './named-only/node.ts'])
    expect(Object.keys(specsById)).toEqual([])
  })

  it('detects a duplicate id whether from two files or within/across a family', () => {
    const { duplicateIds } = collectSpecs({
      './a/node.ts': mk('dup'),
      './b/nodes.ts': [mk('ok'), mk('dup')],
    })
    expect(duplicateIds).toEqual(['dup'])
  })
})
