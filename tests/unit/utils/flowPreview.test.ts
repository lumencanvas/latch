import { describe, it, expect } from 'vitest'
import { flowToPreview } from '@/utils/flowPreview'

const node = (id: string, x: number, y: number, type = 't') => ({ id, type, position: { x, y } })

describe('flowToPreview', () => {
  it('returns an empty model (but keeps the box size) for a flow with no nodes', () => {
    const p = flowToPreview([], [], { width: 100, height: 60 })
    expect(p).toEqual({ width: 100, height: 60, nodes: [], edges: [] })
  })

  it('projects every node inside the padded box', () => {
    const p = flowToPreview(
      [node('a', 0, 0), node('b', 500, 0), node('c', 250, 400)],
      [],
      { width: 120, height: 72, padding: 8, radius: 5 },
    )
    expect(p.nodes).toHaveLength(3)
    for (const n of p.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(8 + 5 - 0.001)
      expect(n.x).toBeLessThanOrEqual(120 - 8 - 5 + 0.001)
      expect(n.y).toBeGreaterThanOrEqual(8 + 5 - 0.001)
      expect(n.y).toBeLessThanOrEqual(72 - 8 - 5 + 0.001)
    }
  })

  it('colours each node via the injected resolver', () => {
    const p = flowToPreview(
      [node('a', 0, 0, 'audio'), node('b', 100, 0, 'math')],
      [],
      { getColor: (t) => (t === 'audio' ? '#22C55E' : '#000') },
    )
    expect(p.nodes[0].color).toBe('#22C55E')
    expect(p.nodes[1].color).toBe('#000')
  })

  it('maps each edge to a line between its endpoints\' projected centers', () => {
    const p = flowToPreview(
      [node('a', 0, 0), node('b', 500, 0)],
      [{ source: 'a', target: 'b' }],
      { width: 120, height: 72 },
    )
    expect(p.edges).toHaveLength(1)
    const [a, b] = p.nodes
    expect(p.edges[0]).toEqual({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  })

  it('drops edges whose endpoints are not both in the node set', () => {
    const p = flowToPreview(
      [node('a', 0, 0), node('b', 100, 0)],
      [{ source: 'a', target: 'ghost' }, { source: 'a', target: 'b' }],
    )
    expect(p.edges).toHaveLength(1)
  })

  it('centres a single node without NaN/Infinity (zero span is guarded)', () => {
    const p = flowToPreview([node('only', 42, 42)], [], { width: 100, height: 60 })
    expect(p.nodes).toHaveLength(1)
    expect(Number.isFinite(p.nodes[0].x)).toBe(true)
    expect(Number.isFinite(p.nodes[0].y)).toBe(true)
    // A lone node sits at the box centre.
    expect(p.nodes[0].x).toBeCloseTo(50, 5)
    expect(p.nodes[0].y).toBeCloseTo(30, 5)
  })

  it('preserves aspect ratio with a uniform scale (a wide flow stays wide)', () => {
    // Wider than tall in flow space → horizontal spread should exceed vertical.
    const p = flowToPreview(
      [node('a', 0, 0), node('b', 1000, 0), node('c', 0, 100)],
      [],
      { width: 120, height: 120, padding: 0, radius: 0 },
    )
    const spreadX = Math.max(...p.nodes.map(n => n.x)) - Math.min(...p.nodes.map(n => n.x))
    const spreadY = Math.max(...p.nodes.map(n => n.y)) - Math.min(...p.nodes.map(n => n.y))
    expect(spreadX).toBeGreaterThan(spreadY)
  })
})
