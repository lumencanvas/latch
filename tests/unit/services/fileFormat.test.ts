import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  FORMAT,
  FORMAT_VERSION,
  endpoint,
  parseEndpoint,
  serializeDocument,
  serializeExport,
  migrateDocument,
  migrateToExport,
  migrateNode,
  migrateDocumentNodes,
  validateDocument,
  isV2,
  isMulti,
  type LatchFlowDoc,
  type NodeMigrationResolver,
} from '@/services/fileFormat'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal legacy v1.0 single-flow export (the `exportFlow` shape). */
function legacySingle() {
  return {
    version: '1.0',
    name: 'Tiny',
    description: 'd',
    nodes: [
      {
        id: 'n_a',
        type: 'add', // Vue Flow type happens to equal nodeType here
        position: { x: 10, y: 20 },
        dimensions: { width: 160, height: 96 },
        computedPosition: { x: 10, y: 20, z: 0 },
        selected: true,
        dragging: false,
        data: { label: 'Add', nodeType: 'add', definition: { id: 'add', version: '1.0.0' }, a: 1, b: 2 },
      },
      {
        id: 'n_b',
        type: 'custom',
        position: { x: 300, y: 20 },
        data: { label: 'Monitor', nodeType: 'monitor' },
      },
    ],
    edges: [
      {
        id: 'e1',
        type: 'animated',
        source: 'n_a',
        sourceHandle: 'result',
        target: 'n_b',
        targetHandle: 'value',
        data: {},
        sourceNode: { id: 'n_a', data: {} },
        targetNode: { id: 'n_b', data: {} },
        sourceX: 1,
      },
    ],
    exportedAt: '2026-01-01T00:00:00.000Z',
  }
}

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

describe('endpoint helpers', () => {
  it('builds and parses node:port round-trip', () => {
    expect(endpoint('n_a', 'result')).toBe('n_a:result')
    expect(parseEndpoint('n_a:result')).toEqual({ node: 'n_a', port: 'result' })
  })

  it('keeps slash-joined subflow ids intact (no split on /)', () => {
    const ep = endpoint('inst1/inst2/osc', 'out')
    expect(ep).toBe('inst1/inst2/osc:out')
    expect(parseEndpoint(ep)).toEqual({ node: 'inst1/inst2/osc', port: 'out' })
  })

  it('handles a null/missing handle as empty port', () => {
    expect(endpoint('n_a', null)).toBe('n_a:')
    expect(parseEndpoint('n_a:')).toEqual({ node: 'n_a', port: '' })
  })
})

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

describe('format detection', () => {
  it('distinguishes v2 from legacy', () => {
    expect(isV2({ format: FORMAT, formatVersion: 2 })).toBe(true)
    expect(isV2(legacySingle())).toBe(false)
    expect(isMulti({ flows: [] })).toBe(true)
    expect(isMulti({ exportedFlows: [] })).toBe(true)
    expect(isMulti(legacySingle())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Migration: v1.0 single -> v2
// ---------------------------------------------------------------------------

describe('migrateDocument (legacy v1.0 single)', () => {
  const doc = migrateDocument(legacySingle())

  it('produces a v2 document envelope', () => {
    expect(doc.format).toBe(FORMAT)
    expect(doc.formatVersion).toBe(FORMAT_VERSION)
    expect(doc.flow.kind).toBe('main')
    expect(doc.flow.name).toBe('Tiny')
  })

  it('splits control values from layout and drops the embedded definition', () => {
    const add = doc.flow.nodes.find((n) => n.id === 'n_a')!
    expect(add.type).toBe('add')
    expect(add.version).toBe(1)
    expect(add.controls).toEqual({ a: 1, b: 2 })
    // label / nodeType / definition are NOT control values
    expect(add.controls).not.toHaveProperty('definition')
    expect(add.controls).not.toHaveProperty('label')
    expect(add.controls).not.toHaveProperty('nodeType')
  })

  it('moves position + dimensions into the layout section (label preserved cosmetically)', () => {
    expect(doc.layout.nodes['n_a']).toEqual({ x: 10, y: 20, w: 160, h: 96, label: 'Add' })
    expect(doc.layout.nodes['n_b']).toEqual({ x: 300, y: 20, label: 'Monitor' })
  })

  it('converts edges to node:port strings, stripping cruft', () => {
    expect(doc.flow.edges).toEqual([{ id: 'e1', from: 'n_a:result', to: 'n_b:value' }])
  })

  it('resolves nodeType from data even when Vue Flow type is "custom"', () => {
    expect(doc.flow.nodes.find((n) => n.id === 'n_b')!.type).toBe('monitor')
  })
})

// ---------------------------------------------------------------------------
// Migration: v1.0.0 multi -> v2 (the real bundled sample flow)
// ---------------------------------------------------------------------------

describe('migrateToExport (legacy v1.0.0 multi — public/sample-flow.json)', () => {
  const raw = JSON.parse(readFileSync('public/sample-flow.json', 'utf-8'))
  const exported = migrateToExport(raw)

  it('migrates every bundled flow to v2', () => {
    expect(exported.format).toBe(FORMAT)
    expect(exported.formatVersion).toBe(FORMAT_VERSION)
    expect(exported.exportedFlows.length).toBe(raw.flows.length)
    expect(exported.activeFlowId).toBe(raw.activeFlowId)
  })

  it('preserves node + edge counts and carries no embedded definitions', () => {
    const main = exported.exportedFlows[0]
    expect(main.flow.nodes.length).toBe(raw.flows[0].nodes.length) // 19
    expect(main.flow.edges.length).toBe(raw.flows[0].edges.length) // 18
    for (const n of main.flow.nodes) {
      expect(n.controls).not.toHaveProperty('definition')
      expect(typeof n.type).toBe('string')
      expect(typeof n.version).toBe('number')
    }
    // every migrated node has a layout entry
    for (const n of main.flow.nodes) expect(main.layout.nodes[n.id]).toBeDefined()
  })

  it('validates clean when every type is known and re-serializes as valid v2', () => {
    const main = exported.exportedFlows[0]
    const report = validateDocument(main, { isKnownType: () => true })
    expect(report.ok).toBe(true)
    expect(report.droppedEdgeIds).toEqual([])
    const reparsed = JSON.parse(serializeDocument(main))
    expect(reparsed.format).toBe(FORMAT)
    expect(reparsed.formatVersion).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Deterministic serialization
// ---------------------------------------------------------------------------

describe('deterministic serialization', () => {
  it('is byte-identical across load -> save -> load -> save', () => {
    const doc = migrateDocument(legacySingle())
    const once = serializeDocument(doc)
    const twice = serializeDocument(migrateDocument(JSON.parse(once)))
    expect(twice).toBe(once)
  })

  it('is independent of control key insertion order', () => {
    const base = migrateDocument(legacySingle())
    const shuffled: LatchFlowDoc = JSON.parse(JSON.stringify(base))
    // rebuild the controls object with reversed key order
    const add = shuffled.flow.nodes.find((n) => n.id === 'n_a')!
    add.controls = { b: 2, a: 1 }
    expect(serializeDocument(shuffled)).toBe(serializeDocument(base))
  })

  it('is independent of node/edge array order', () => {
    const base = migrateDocument(legacySingle())
    const reordered: LatchFlowDoc = JSON.parse(JSON.stringify(base))
    reordered.flow.nodes.reverse()
    expect(serializeDocument(reordered)).toBe(serializeDocument(base))
  })

  it('round-trips a multi-flow export envelope byte-identically', () => {
    const raw = JSON.parse(readFileSync('public/sample-flow.json', 'utf-8'))
    const once = serializeExport(migrateToExport(raw))
    const twice = serializeExport(migrateToExport(JSON.parse(once)))
    expect(twice).toBe(once)
  })
})

// ---------------------------------------------------------------------------
// Logic / layout isolation
// ---------------------------------------------------------------------------

describe('logic/layout isolation', () => {
  it('moving a node touches only the layout bytes, not the flow bytes', () => {
    const a = migrateDocument(legacySingle())
    const b: LatchFlowDoc = JSON.parse(JSON.stringify(a))
    b.layout.nodes['n_a'] = { ...b.layout.nodes['n_a'], x: 999, y: 999 }

    const sa = serializeDocument(a)
    const sb = serializeDocument(b)
    expect(sb).not.toBe(sa) // layout changed

    // The "flow" block (everything between "flow": and "layout":) is byte-identical.
    const flowBlock = (s: string) => s.slice(s.indexOf('"flow":'), s.indexOf('"layout":'))
    expect(flowBlock(sb)).toBe(flowBlock(sa))

    // The parsed logic is deep-equal; the layout is not.
    expect(JSON.parse(sb).flow).toEqual(JSON.parse(sa).flow)
    expect(JSON.parse(sb).layout).not.toEqual(JSON.parse(sa).layout)
  })
})

// ---------------------------------------------------------------------------
// Missing-node placeholder + validation
// ---------------------------------------------------------------------------

describe('validateDocument', () => {
  function docWithUnknown(): LatchFlowDoc {
    return {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      flow: {
        id: 'f1',
        name: 'F',
        kind: 'main',
        nodes: [
          { id: 'n_a', type: 'add', version: 1, controls: {} },
          { id: 'n_x', type: 'totally-made-up', version: 1, controls: { keep: 'me' } },
        ],
        edges: [{ id: 'e1', from: 'n_a:result', to: 'n_x:in' }],
      },
      layout: { nodes: { n_a: { x: 0, y: 0 }, n_x: { x: 100, y: 0 } } },
    }
  }

  it('reports an unknown type but PRESERVES the node and its wires', () => {
    const doc = docWithUnknown()
    const report = validateDocument(doc, { isKnownType: (t) => t === 'add' })
    expect(report.ok).toBe(true)
    expect(report.unknownNodeIds).toEqual(['n_x'])
    expect(report.droppedEdgeIds).toEqual([]) // edge to placeholder is kept
    // node + controls still present in the document (loader renders a placeholder)
    const ghost = doc.flow.nodes.find((n) => n.id === 'n_x')!
    expect(ghost.controls).toEqual({ keep: 'me' })
  })

  it('drops a dangling edge (endpoint to a non-existent node) with a warning', () => {
    const doc = docWithUnknown()
    doc.flow.edges.push({ id: 'e_dangle', from: 'n_a:result', to: 'ghost_node:in' })
    const report = validateDocument(doc)
    expect(report.droppedEdgeIds).toContain('e_dangle')
    expect(report.warnings.length).toBeGreaterThan(0)
    expect(report.stats.droppedEdges).toBe(1)
  })

  it('flags duplicate node ids as a fatal error', () => {
    const doc = docWithUnknown()
    doc.flow.nodes.push({ id: 'n_a', type: 'add', version: 1, controls: {} })
    const report = validateDocument(doc)
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => /Duplicate node id/.test(e))).toBe(true)
  })

  it('rejects a non-latch-flow document', () => {
    const report = validateDocument({ format: 'something-else' })
    expect(report.ok).toBe(false)
  })

  it('rejects a future formatVersion (load read-only)', () => {
    const report = validateDocument({ format: FORMAT, formatVersion: 999, flow: { nodes: [], edges: [] } })
    expect(report.ok).toBe(false)
    expect(report.errors.some((e) => /newer than supported/.test(e))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Per-node data versioning & migration (§10)
// ---------------------------------------------------------------------------

describe('node-data migration', () => {
  // `add` is now at v2: the old `a`/`b` controls were renamed to `lhs`/`rhs`.
  const resolver: NodeMigrationResolver = (type) => {
    if (type === 'add') {
      return {
        version: 2,
        migrate: (controls, from) => {
          if (from < 2 && ('a' in controls || 'b' in controls)) {
            const { a, b, ...rest } = controls
            return { ...rest, lhs: a, rhs: b }
          }
          return controls
        },
      }
    }
    if (type === 'monitor') return { version: 1 } // current, no migrate fn
    return undefined // unknown type -> placeholder, never migrated
  }

  it('upgrades an old-version node and re-stamps its version', () => {
    const old = { id: 'n_a', type: 'add', version: 1, controls: { a: 1, b: 2 } }
    const { node, migrated } = migrateNode(old, resolver)
    expect(migrated).toBe(true)
    expect(node.version).toBe(2)
    expect(node.controls).toEqual({ lhs: 1, rhs: 2 })
    // input not mutated
    expect(old.controls).toEqual({ a: 1, b: 2 })
  })

  it('leaves an already-current node untouched', () => {
    const cur = { id: 'n_b', type: 'monitor', version: 1, controls: { x: 1 } }
    const { node, migrated } = migrateNode(cur, resolver)
    expect(migrated).toBe(false)
    expect(node).toBe(cur)
  })

  it('never migrates an unknown (placeholder) type', () => {
    const ghost = { id: 'n_x', type: 'made-up', version: 1, controls: { keep: 'me' } }
    const { node, migrated } = migrateNode(ghost, resolver)
    expect(migrated).toBe(false)
    expect(node.controls).toEqual({ keep: 'me' })
  })

  it('migrates a whole document and counts upgraded nodes', () => {
    const doc: LatchFlowDoc = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      flow: {
        id: 'f',
        name: 'F',
        kind: 'main',
        nodes: [
          { id: 'n_a', type: 'add', version: 1, controls: { a: 5, b: 6 } },
          { id: 'n_b', type: 'monitor', version: 1, controls: {} },
          { id: 'n_x', type: 'made-up', version: 1, controls: {} },
        ],
        edges: [],
      },
      layout: { nodes: {} },
    }
    const { doc: out, migratedCount } = migrateDocumentNodes(doc, resolver)
    expect(migratedCount).toBe(1)
    expect(out.flow.nodes.find((n) => n.id === 'n_a')!.controls).toEqual({ lhs: 5, rhs: 6 })
    // original untouched
    expect(doc.flow.nodes.find((n) => n.id === 'n_a')!.controls).toEqual({ a: 5, b: 6 })
  })
})

// ---------------------------------------------------------------------------
// Forward compatibility
// ---------------------------------------------------------------------------

describe('forward compatibility', () => {
  it('preserves unknown future top-level keys through migrate + serialize', () => {
    const future = {
      format: FORMAT,
      formatVersion: FORMAT_VERSION,
      flow: { id: 'f', name: 'F', kind: 'main', nodes: [], edges: [] },
      layout: { nodes: {} },
      experimentalFeature: { hello: 'world' },
    }
    const round = migrateDocument(future)
    expect(round.experimentalFeature).toEqual({ hello: 'world' })
    expect(JSON.parse(serializeDocument(round)).experimentalFeature).toEqual({ hello: 'world' })
  })
})
