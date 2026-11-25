import { describe, it, expect } from 'vitest'
import { snippetToInsertableNodes, snippetOffsetToCenter, groupSnippetsByPersona } from '@/utils/snippets'
import type { FlowSnippet } from '@/data/flow-snippets'
import type { NodeDefinition } from '@/stores/nodes'

// A snippet with a known and an unknown node type, plus extra per-node data.
const snippet = {
  id: 's', name: 'S', description: '', category: 'x', relatedNodes: [],
  nodes: [
    // A deliberately stale nodeType in data — the helper must stamp node.type over it.
    { id: 'sn-1', type: 'constant', position: { x: 0, y: 0 }, data: { nodeType: 'stale', value: 5 } },
    { id: 'sn-2', type: 'unknown-xyz', position: { x: 10, y: 20 }, data: {} },
  ],
  edges: [],
} as FlowSnippet

const getDef = (t: string): NodeDefinition | undefined =>
  t === 'constant' ? ({ name: 'Constant' } as NodeDefinition) : undefined

describe('snippetToInsertableNodes', () => {
  it('maps id/type/position and preserves the original per-node data (stamping nodeType)', () => {
    const r = snippetToInsertableNodes(snippet, getDef)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ id: 'sn-1', nodeType: 'constant', position: { x: 0, y: 0 } })
    expect(r[0].data.nodeType).toBe('constant')
    expect(r[0].data.value).toBe(5)
  })

  it('enriches with the definition label + reference when the type is known', () => {
    const r = snippetToInsertableNodes(snippet, getDef)
    expect(r[0].data.label).toBe('Constant')
    expect(r[0].data.definition).toBeDefined()
  })

  it('omits the label/definition keys entirely for an unknown type (no undefined refs)', () => {
    const r = snippetToInsertableNodes(snippet, getDef)
    // Assert the keys are absent, not merely undefined — the guard must not pollute
    // node data with an undefined definition reference.
    expect('label' in r[1].data).toBe(false)
    expect('definition' in r[1].data).toBe(false)
    expect(r[1].data.nodeType).toBe('unknown-xyz')
  })
})

describe('snippet label preservation', () => {
  it('keeps a snippet-authored label over the definition name', () => {
    const s = { ...snippet, nodes: [{ id: 'a', type: 'constant', position: { x: 0, y: 0 }, data: { label: 'BPM' } }] } as FlowSnippet
    expect(snippetToInsertableNodes(s, getDef)[0].data.label).toBe('BPM')
  })
})

describe('snippetOffsetToCenter', () => {
  it('centres the node bounding box (plus one node footprint) on the target point', () => {
    const s = { nodes: [{ position: { x: 0, y: 0 } }, { position: { x: 600, y: 200 } }] } as FlowSnippet
    // bbox = 0..800 x 0..320 → centre (400,160); target (1000,500) → offset (600,340)
    expect(snippetOffsetToCenter(s, { x: 1000, y: 500 })).toEqual({ x: 600, y: 340 })
  })
  it('handles an empty snippet', () => {
    expect(snippetOffsetToCenter({ nodes: [] }, { x: 5, y: 6 })).toEqual({ x: 5, y: 6 })
  })
})

describe('groupSnippetsByPersona', () => {
  it('groups in canonical persona order and drops empty groups', () => {
    const groups = groupSnippetsByPersona([
      { id: 'a', persona: '3D & games' },
      { id: 'b', persona: 'Start here' },
      { id: 'c', persona: '3D & games' },
    ] as Array<Pick<FlowSnippet, 'persona'> & { id: string }>)
    expect(groups.map((g) => g.persona)).toEqual(['Start here', '3D & games'])
    expect(groups[1].snippets.map((s) => s.id)).toEqual(['a', 'c'])
  })
})
