import { describe, it, expect } from 'vitest'
import { layeredLayout, countLayoutOverlaps, type LayoutNodeInput, type LayoutEdgeInput } from '@/utils/graphLayout'

const N = (id: string, x = 0, y = 0, width = 160, height = 60): LayoutNodeInput => ({ id, x, y, width, height })
const E = (source: string, target: string, sourcePort = 0, targetPort = 0): LayoutEdgeInput => ({ source, target, sourcePort, targetPort })

/** Straight-line segment crossings between edges in a positioned layout (right-port → left-port). */
function crossings(nodes: LayoutNodeInput[], edges: LayoutEdgeInput[], pos: Map<string, { x: number; y: number }>) {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const seg = (e: LayoutEdgeInput) => {
    const a = byId.get(e.source)!, b = byId.get(e.target)!
    const pa = pos.get(a.id)!, pb = pos.get(b.id)!
    return [pa.x + a.width, pa.y + a.height / 2, pb.x, pb.y + b.height / 2] as const
  }
  const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (cy - ay) * (bx - ax) > (by - ay) * (cx - ax)
  let c = 0
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [x1, y1, x2, y2] = seg(edges[i])
      const [x3, y3, x4, y4] = seg(edges[j])
      if (edges[i].source === edges[j].source || edges[i].target === edges[j].target) continue
      if (ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) && ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4)) c++
    }
  }
  return c
}

describe('layeredLayout', () => {
  it('returns nothing for an empty graph', () => {
    expect(layeredLayout([], []).size).toBe(0)
  })

  it('lays a chain out left→right in dependency order, in one row', () => {
    const nodes = [N('c', 0, 300), N('a', 500, 0), N('b', 200, 900)]
    const pos = layeredLayout(nodes, [E('a', 'b'), E('b', 'c')], { origin: { x: 0, y: 0 } })
    expect(pos.get('a')!.x).toBeLessThan(pos.get('b')!.x)
    expect(pos.get('b')!.x).toBeLessThan(pos.get('c')!.x)
    // Aligned: a straight chain shares one y.
    expect(pos.get('a')!.y).toBe(pos.get('b')!.y)
    expect(pos.get('b')!.y).toBe(pos.get('c')!.y)
    // Layer gap respected (width 160 + default gap 80).
    expect(pos.get('b')!.x - pos.get('a')!.x).toBe(240)
  })

  it('never overlaps nodes, including mixed sizes and fan-in/out', () => {
    const nodes = [
      N('src1', 0, 0, 140, 40), N('src2', 0, 50, 200, 200), N('src3', 0, 100, 120, 90),
      N('mix', 0, 0, 180, 300), N('fx1', 0, 0, 160, 60), N('fx2', 0, 0, 160, 120), N('out', 0, 0, 170, 80),
    ]
    const edges = [E('src1', 'mix', 0, 0), E('src2', 'mix', 0, 1), E('src3', 'mix', 0, 2), E('mix', 'fx1'), E('mix', 'fx2'), E('fx1', 'out'), E('fx2', 'out', 0, 1)]
    const pos = layeredLayout(nodes, edges)
    expect(countLayoutOverlaps(nodes, pos)).toBe(0)
  })

  it('handles cycles (feedback loops) without hanging or overlapping', () => {
    const nodes = [N('a', 0, 0), N('b', 300, 0), N('c', 600, 0)]
    const pos = layeredLayout(nodes, [E('a', 'b'), E('b', 'c'), E('c', 'a')])
    expect(pos.size).toBe(3)
    expect(countLayoutOverlaps(nodes, pos)).toBe(0)
    // The feedback edge is the one reversed: a stays first (seeded by current x).
    expect(pos.get('a')!.x).toBeLessThan(pos.get('c')!.x)
  })

  it('ignores self loops, duplicate edges and edges leaving the node set', () => {
    const nodes = [N('a'), N('b')]
    const pos = layeredLayout(nodes, [E('a', 'a'), E('a', 'b'), E('a', 'b'), E('b', 'outside')])
    expect(pos.get('a')!.x).toBeLessThan(pos.get('b')!.x)
    expect(pos.has('outside')).toBe(false)
  })

  it('removes an avoidable crossing', () => {
    // a1→b2 and a2→b1 cross when seeded in this y order; the layout should untangle it.
    const nodes = [N('a1', 0, 0), N('a2', 0, 100), N('b1', 300, 0), N('b2', 300, 100), N('c', 600, 50)]
    const edges = [E('a1', 'b2'), E('a2', 'b1'), E('b1', 'c'), E('b2', 'c', 0, 1)]
    const pos = layeredLayout(nodes, edges)
    expect(crossings(nodes, edges, pos)).toBe(0)
  })

  it('pulls a source next to its consumer instead of the far-left layer', () => {
    // a→b→c→d, and a lone constant k feeds d directly.
    const nodes = [N('a'), N('b'), N('c'), N('d'), N('k')]
    const pos = layeredLayout(nodes, [E('a', 'b'), E('b', 'c'), E('c', 'd'), E('k', 'd', 0, 1)])
    expect(pos.get('k')!.x).toBe(pos.get('c')!.x)
  })

  it('stacks disconnected components and packs isolated nodes below', () => {
    const nodes = [N('a', 0, 0), N('b', 0, 0), N('x', 0, 500), N('y', 0, 500), N('lone1', 0, 900), N('lone2', 0, 950)]
    const pos = layeredLayout(nodes, [E('a', 'b'), E('x', 'y')])
    expect(countLayoutOverlaps(nodes, pos)).toBe(0)
    const compBottom = Math.max(pos.get('x')!.y, pos.get('a')!.y) + 60
    expect(pos.get('lone1')!.y).toBeGreaterThanOrEqual(compBottom)
    expect(pos.get('lone1')!.y).toBe(pos.get('lone2')!.y) // same wrapping row
  })

  it('packs many components into columns instead of one tall stack', () => {
    const nodes: LayoutNodeInput[] = []
    const edges: LayoutEdgeInput[] = []
    for (let i = 0; i < 8; i++) {
      nodes.push(N(`a${i}`, 0, i * 100), N(`b${i}`, 300, i * 100))
      edges.push(E(`a${i}`, `b${i}`))
    }
    const pos = layeredLayout(nodes, edges)
    expect(countLayoutOverlaps(nodes, pos)).toBe(0)
    const ys = [...pos.values()].map(p => p.y)
    const xs = [...pos.values()].map(p => p.x)
    const h = Math.max(...ys) + 60 - Math.min(...ys)
    const w = Math.max(...xs) + 160 - Math.min(...xs)
    expect(h).toBeLessThan(8 * 60 + 7 * 60) // shorter than a single stacked column
    expect(w).toBeGreaterThan(400) // spread across 2+ columns
  })

  it('anchors at the current top-left by default (arranging a selection stays put)', () => {
    const nodes = [N('a', 400, 300), N('b', 900, 700)]
    const pos = layeredLayout(nodes, [E('a', 'b')])
    expect(Math.min(...[...pos.values()].map(p => p.x))).toBe(400)
    expect(Math.min(...[...pos.values()].map(p => p.y))).toBe(300)
  })

  it('snaps to the grid when asked', () => {
    const nodes = [N('a', 13, 7, 157, 61), N('b', 0, 0, 133, 47), N('c', 0, 0, 120, 33)]
    const pos = layeredLayout(nodes, [E('a', 'b'), E('a', 'c')], { snap: 20 })
    for (const p of pos.values()) {
      expect(p.x % 20).toBe(0)
      expect(p.y % 20).toBe(0)
    }
  })

  it('is deterministic and stable when re-run on its own output', () => {
    const nodes = [N('a', 0, 0), N('b', 0, 100), N('c', 0, 200), N('d', 0, 300)]
    const edges = [E('a', 'c'), E('b', 'c', 0, 1), E('c', 'd')]
    const first = layeredLayout(nodes, edges, { snap: 20 })
    const again = layeredLayout(nodes.map(n => ({ ...n, ...first.get(n.id)! })), edges, { snap: 20 })
    expect([...again.entries()]).toEqual([...first.entries()])
  })

  it('scales to a large graph quickly', () => {
    const nodes: LayoutNodeInput[] = []
    const edges: LayoutEdgeInput[] = []
    for (let i = 0; i < 300; i++) nodes.push(N(`n${i}`, (i % 20) * 50, Math.floor(i / 20) * 50))
    for (let i = 1; i < 300; i++) edges.push(E(`n${Math.floor((i - 1) / 2)}`, `n${i}`))
    const t = performance.now()
    const pos = layeredLayout(nodes, edges)
    expect(performance.now() - t).toBeLessThan(2000)
    expect(countLayoutOverlaps(nodes, pos)).toBe(0)
  })
})
