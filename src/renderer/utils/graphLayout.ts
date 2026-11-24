/**
 * Dependency-free layered (Sugiyama-style) DAG layout for the node canvas — the
 * pure core of "Tidy graph" (see composables/useAutoArrange.ts).
 *
 * Pipeline (left → right data flow, matching LATCH's input-left/output-right ports):
 *   1. cycle breaking   — DFS (seeded in current x order) reverses feedback edges
 *   2. layering         — longest path from sources; sources then pulled next to
 *                         their first consumer so a lone constant doesn't sit 5
 *                         columns away from what it feeds
 *   3. dummy nodes      — edges spanning >1 layer get virtual waypoints so they
 *                         take part in crossing reduction (and keep space free)
 *   4. ordering         — seeded from current y (preserves the user's mental map),
 *                         then alternating barycenter sweeps, keeping the order
 *                         with the fewest crossings
 *   5. coordinates      — x per layer from the widest node in each layer; y from
 *                         neighbour-median alignment with order-preserving overlap
 *                         resolution
 *   6. components       — each weakly-connected component laid out separately and
 *                         stacked; isolated nodes packed in a wrapping row below
 *
 * Pure: no Vue / store imports, so it is unit-tested directly.
 */

export interface LayoutNodeInput {
  id: string
  width: number
  height: number
  /** Current position — seeds ordering so a re-tidy is stable and familiar. */
  x?: number
  y?: number
}

export interface LayoutEdgeInput {
  source: string
  target: string
  /** Index of the source port among the node's outputs (refines ordering). */
  sourcePort?: number
  /** Index of the target port among the node's inputs (refines ordering). */
  targetPort?: number
}

export interface LayeredLayoutOptions {
  /** Horizontal gap between layers (px). */
  layerGap?: number
  /** Vertical gap between nodes in a layer (px). */
  nodeGap?: number
  /** Vertical gap between stacked components (px). */
  componentGap?: number
  /** Top-left of the arranged block. Defaults to the inputs' current top-left. */
  origin?: { x: number; y: number }
  /** Snap output positions to this grid (px). 0/undefined = no snapping. */
  snap?: number
  /** Barycenter sweeps for crossing reduction. */
  sweeps?: number
}

export type Point = { x: number; y: number }

const DUMMY_HEIGHT = 8
const PORT_EPS = 0.001

interface Vertex {
  id: string
  w: number
  h: number
  dummy: boolean
  layer: number
  order: number
  seedY: number
  y: number
}

interface DirEdge { u: string; v: string; up: number; vp: number }

/** Count edge crossings between two adjacent layers (positions are order indices). */
function countCrossings(edges: DirEdge[], pos: Map<string, number>): number {
  let c = 0
  for (let i = 0; i < edges.length; i++) {
    const a = edges[i]
    const au = pos.get(a.u)! + a.up * PORT_EPS
    const av = pos.get(a.v)! + a.vp * PORT_EPS
    for (let j = i + 1; j < edges.length; j++) {
      const b = edges[j]
      const bu = pos.get(b.u)! + b.up * PORT_EPS
      const bv = pos.get(b.v)! + b.vp * PORT_EPS
      if ((au - bu) * (av - bv) < 0) c++
    }
  }
  return c
}

/** Weakly-connected components, each sorted by seed position. */
function components(ids: string[], edges: { source: string; target: string }[]): string[][] {
  const parent = new Map(ids.map(id => [id, id]))
  const find = (a: string): string => {
    let r = a
    while (parent.get(r) !== r) r = parent.get(r)!
    let c = a
    while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n }
    return r
  }
  for (const e of edges) {
    const a = find(e.source), b = find(e.target)
    if (a !== b) parent.set(a, b)
  }
  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const r = find(id)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(id)
  }
  return [...groups.values()]
}

/** Lay out ONE connected component; returns positions relative to (0,0) + its size. */
function layoutComponent(
  nodeIds: string[],
  nodeById: Map<string, LayoutNodeInput>,
  rawEdges: LayoutEdgeInput[],
  opts: Required<Pick<LayeredLayoutOptions, 'layerGap' | 'nodeGap' | 'sweeps'>>,
): { pos: Map<string, Point>; width: number; height: number } {
  const idSet = new Set(nodeIds)
  const seedX = (id: string) => nodeById.get(id)?.x ?? 0
  const seedY = (id: string) => nodeById.get(id)?.y ?? 0

  // ---- 1. cycle breaking (DFS in seed-x order; back edges get reversed) ----
  const out = new Map<string, LayoutEdgeInput[]>()
  for (const id of nodeIds) out.set(id, [])
  for (const e of rawEdges) if (idSet.has(e.source) && idSet.has(e.target)) out.get(e.source)!.push(e)
  const state = new Map<string, 0 | 1 | 2>() // 0 new, 1 on stack, 2 done
  const reversed = new Set<LayoutEdgeInput>()
  const order = [...nodeIds].sort((a, b) => seedX(a) - seedX(b) || seedY(a) - seedY(b))
  for (const root of order) {
    if (state.get(root)) continue
    // Iterative DFS so a long chain can't blow the stack.
    const stack: Array<{ id: string; i: number }> = [{ id: root, i: 0 }]
    state.set(root, 1)
    while (stack.length) {
      const top = stack[stack.length - 1]
      const outs = out.get(top.id)!
      if (top.i < outs.length) {
        const e = outs[top.i++]
        const s = state.get(e.target) ?? 0
        if (s === 1) reversed.add(e)
        else if (s === 0) { state.set(e.target, 1); stack.push({ id: e.target, i: 0 }) }
      } else {
        state.set(top.id, 2)
        stack.pop()
      }
    }
  }
  const dag: DirEdge[] = []
  for (const e of rawEdges) {
    if (!idSet.has(e.source) || !idSet.has(e.target)) continue
    if (reversed.has(e)) dag.push({ u: e.target, v: e.source, up: e.targetPort ?? 0, vp: e.sourcePort ?? 0 })
    else dag.push({ u: e.source, v: e.target, up: e.sourcePort ?? 0, vp: e.targetPort ?? 0 })
  }

  // ---- 2. longest-path layering (Kahn topo order) ----
  const indeg = new Map(nodeIds.map(id => [id, 0]))
  const succ = new Map<string, DirEdge[]>(nodeIds.map(id => [id, []]))
  const pred = new Map<string, DirEdge[]>(nodeIds.map(id => [id, []]))
  for (const e of dag) {
    indeg.set(e.v, indeg.get(e.v)! + 1)
    succ.get(e.u)!.push(e)
    pred.get(e.v)!.push(e)
  }
  const layer = new Map<string, number>()
  const queue = order.filter(id => indeg.get(id) === 0)
  for (const id of queue) layer.set(id, 0)
  while (queue.length) {
    const u = queue.shift()!
    for (const e of succ.get(u)!) {
      layer.set(e.v, Math.max(layer.get(e.v) ?? 0, layer.get(u)! + 1))
      indeg.set(e.v, indeg.get(e.v)! - 1)
      if (indeg.get(e.v) === 0) queue.push(e.v)
    }
  }
  // Pull pure sources rightwards to sit just before their nearest consumer.
  for (const id of nodeIds) {
    if (pred.get(id)!.length > 0 || succ.get(id)!.length === 0) continue
    const minChild = Math.min(...succ.get(id)!.map(e => layer.get(e.v) ?? 0))
    layer.set(id, Math.max(0, minChild - 1))
  }

  // ---- 3. vertices + dummy waypoints for long edges ----
  const V = new Map<string, Vertex>()
  for (const id of nodeIds) {
    const n = nodeById.get(id)!
    V.set(id, { id, w: n.width, h: n.height, dummy: false, layer: layer.get(id) ?? 0, order: 0, seedY: seedY(id), y: 0 })
  }
  const segs: DirEdge[] = []
  let dummySeq = 0
  for (const e of dag) {
    const lu = layer.get(e.u) ?? 0, lv = layer.get(e.v) ?? 0
    if (lv - lu <= 1) { segs.push(e); continue }
    let prev = e.u
    let prevPort = e.up
    for (let l = lu + 1; l < lv; l++) {
      const did = `\u0000dummy${dummySeq++}`
      // Interpolate the seed so dummies start between their endpoints.
      const t = (l - lu) / (lv - lu)
      V.set(did, { id: did, w: 0, h: DUMMY_HEIGHT, dummy: true, layer: l, order: 0, seedY: seedY(e.u) * (1 - t) + seedY(e.v) * t, y: 0 })
      segs.push({ u: prev, v: did, up: prevPort, vp: 0 })
      prev = did
      prevPort = 0
    }
    segs.push({ u: prev, v: e.v, up: prevPort, vp: e.vp })
  }

  const maxLayer = Math.max(0, ...[...V.values()].map(v => v.layer))
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => [])
  for (const v of V.values()) layers[v.layer].push(v.id)
  for (const L of layers) L.sort((a, b) => V.get(a)!.seedY - V.get(b)!.seedY)

  const segIn = new Map<string, DirEdge[]>()
  const segOut = new Map<string, DirEdge[]>()
  for (const id of V.keys()) { segIn.set(id, []); segOut.set(id, []) }
  for (const s of segs) { segOut.get(s.u)!.push(s); segIn.get(s.v)!.push(s) }
  // Segments grouped by the layer of their upper endpoint (for crossing counts).
  const segsByLayer: DirEdge[][] = layers.map(() => [])
  for (const s of segs) segsByLayer[V.get(s.u)!.layer].push(s)

  // ---- 4. crossing reduction ----
  const posOf = (ls: string[][]) => {
    const m = new Map<string, number>()
    for (const L of ls) L.forEach((id, i) => m.set(id, i))
    return m
  }
  const totalCrossings = (ls: string[][]) => {
    const p = posOf(ls)
    let c = 0
    for (let l = 0; l < ls.length - 1; l++) c += countCrossings(segsByLayer[l], p)
    return c
  }
  let best = layers.map(L => [...L])
  let bestC = totalCrossings(best)
  const cur = layers.map(L => [...L])
  for (let sweep = 0; sweep < opts.sweeps && bestC > 0; sweep++) {
    const down = sweep % 2 === 0
    const pos = posOf(cur)
    const range = down
      ? Array.from({ length: cur.length - 1 }, (_, i) => i + 1)
      : Array.from({ length: cur.length - 1 }, (_, i) => cur.length - 2 - i)
    for (const l of range) {
      const bary = new Map<string, number>()
      cur[l].forEach((id, i) => {
        const nbrs = down
          ? segIn.get(id)!.map(s => pos.get(s.u)! + s.up * PORT_EPS)
          : segOut.get(id)!.map(s => pos.get(s.v)! + s.vp * PORT_EPS)
        bary.set(id, nbrs.length ? nbrs.reduce((a, b) => a + b, 0) / nbrs.length : i)
      })
      // Stable sort by barycenter; nodes without neighbours keep their slot value.
      cur[l] = cur[l]
        .map((id, i) => ({ id, i }))
        .sort((a, b) => bary.get(a.id)! - bary.get(b.id)! || a.i - b.i)
        .map(o => o.id)
      cur[l].forEach((id, i) => pos.set(id, i))
    }
    const c = totalCrossings(cur)
    if (c < bestC) { bestC = c; best = cur.map(L => [...L]) }
  }

  // ---- 5. coordinates ----
  // x: each layer is as wide as its widest real node.
  const layerX: number[] = []
  let xAcc = 0
  for (let l = 0; l < best.length; l++) {
    layerX.push(xAcc)
    const w = Math.max(0, ...best[l].map(id => V.get(id)!.w))
    xAcc += w + opts.layerGap
  }
  // y: initial stack, then neighbour-median alignment with order-preserving packing.
  const gapFor = (a: Vertex, b: Vertex) => (a.dummy || b.dummy ? opts.nodeGap / 2 : opts.nodeGap)
  for (const L of best) {
    let y = 0
    L.forEach((id, i) => {
      const v = V.get(id)!
      if (i > 0) y += gapFor(V.get(L[i - 1])!, v)
      v.y = y
      y += v.h
    })
  }
  const center = (id: string) => V.get(id)!.y + V.get(id)!.h / 2
  const pack = (L: string[], desired: Map<string, number>) => {
    // Two order-preserving placements — push overlaps DOWN from the top, and UP
    // from the bottom — then average them. Both satisfy the linear spacing
    // constraints, so their mean does too, and it isn't biased toward either end.
    const down: number[] = []
    for (let i = 0; i < L.length; i++) {
      const v = V.get(L[i])!
      let y = desired.get(v.id)!
      if (i > 0) { const p = V.get(L[i - 1])!; y = Math.max(y, down[i - 1] + p.h + gapFor(p, v)) }
      down.push(y)
    }
    const up: number[] = new Array(L.length)
    for (let i = L.length - 1; i >= 0; i--) {
      const v = V.get(L[i])!
      let y = desired.get(v.id)!
      if (i < L.length - 1) { const n = V.get(L[i + 1])!; y = Math.min(y, up[i + 1] - gapFor(v, n) - v.h) }
      up[i] = y
    }
    L.forEach((id, i) => { V.get(id)!.y = (down[i] + up[i]) / 2 })
  }
  for (let iter = 0; iter < 4; iter++) {
    const down = iter % 2 === 0
    const range = down
      ? Array.from({ length: best.length - 1 }, (_, i) => i + 1)
      : Array.from({ length: best.length - 1 }, (_, i) => best.length - 2 - i)
    for (const l of range) {
      const desired = new Map<string, number>()
      for (const id of best[l]) {
        const v = V.get(id)!
        const nb = down ? segIn.get(id)!.map(s => center(s.u)) : segOut.get(id)!.map(s => center(s.v))
        if (!nb.length) { desired.set(id, v.y); continue }
        nb.sort((a, b) => a - b)
        const mid = nb.length % 2 ? nb[(nb.length - 1) / 2] : (nb[nb.length / 2 - 1] + nb[nb.length / 2]) / 2
        desired.set(id, mid - v.h / 2)
      }
      pack(best[l], desired)
    }
  }

  // Normalise to (0,0) over REAL nodes only.
  const real = nodeIds.map(id => V.get(id)!)
  const minY = Math.min(...real.map(v => v.y))
  const pos = new Map<string, Point>()
  let width = 0, height = 0
  for (const v of real) {
    const x = layerX[v.layer]
    const y = v.y - minY
    pos.set(v.id, { x, y })
    width = Math.max(width, x + v.w)
    height = Math.max(height, y + v.h)
  }
  return { pos, width, height }
}

/**
 * Compute tidy positions for `nodes`. Edges whose endpoints are not both in
 * `nodes` are ignored (so arranging a selection only considers internal wires).
 * Returns a new top-left position per node id; nodes are never resized.
 */
export function layeredLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  options: LayeredLayoutOptions = {},
): Map<string, Point> {
  const result = new Map<string, Point>()
  if (nodes.length === 0) return result
  const layerGap = options.layerGap ?? 80
  const nodeGap = options.nodeGap ?? 30
  const componentGap = options.componentGap ?? 60
  const sweeps = options.sweeps ?? 8
  const snap = options.snap ?? 0

  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const seen = new Set<string>()
  const cleanEdges = edges.filter(e => {
    if (e.source === e.target) return false
    if (!nodeById.has(e.source) || !nodeById.has(e.target)) return false
    const k = `${e.source}\u0000${e.target}\u0000${e.sourcePort ?? 0}\u0000${e.targetPort ?? 0}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  const origin = options.origin ?? {
    x: Math.min(...nodes.map(n => n.x ?? 0)),
    y: Math.min(...nodes.map(n => n.y ?? 0)),
  }

  const groups = components(nodes.map(n => n.id), cleanEdges)
  const minSeedY = (g: string[]) => Math.min(...g.map(id => nodeById.get(id)!.y ?? 0))
  const connected = groups.filter(g => g.length > 1).sort((a, b) => minSeedY(a) - minSeedY(b))
  const singles = groups.filter(g => g.length === 1).map(g => g[0])
    .sort((a, b) => (nodeById.get(a)!.y ?? 0) - (nodeById.get(b)!.y ?? 0) || (nodeById.get(a)!.x ?? 0) - (nodeById.get(b)!.x ?? 0))

  // Components are packed into COLUMNS (top→bottom, then a new column to the
  // right) aiming for a roughly 16:10 block — stacking every component in one
  // column made a typical multi-chain patch too tall to frame at min zoom.
  const laid = connected.map(g => layoutComponent(g, nodeById, cleanEdges, { layerGap, nodeGap, sweeps }))
  const area = laid.reduce((a, c) => a + (c.width + componentGap) * (c.height + componentGap), 0)
  const targetH = Math.max(...laid.map(c => c.height), Math.sqrt(area * 0.625), 0)
  let colX = 0, colW = 0, yAcc = 0, blockWidth = 0, blockHeight = 0
  for (const c of laid) {
    if (yAcc > 0 && yAcc + c.height > targetH) {
      colX += colW + componentGap * 2
      colW = 0
      yAcc = 0
    }
    for (const [id, p] of c.pos) result.set(id, { x: p.x + colX, y: p.y + yAcc })
    yAcc += c.height + componentGap
    colW = Math.max(colW, c.width)
    blockWidth = Math.max(blockWidth, colX + c.width)
    blockHeight = Math.max(blockHeight, yAcc)
  }
  yAcc = blockHeight

  // Isolated nodes: a wrapping row, no wider than the connected block (or ~4 nodes).
  if (singles.length) {
    const avgW = singles.reduce((a, id) => a + nodeById.get(id)!.width, 0) / singles.length
    const wrapAt = Math.max(blockWidth, (avgW + nodeGap) * 4)
    let x = 0, rowH = 0
    for (const id of singles) {
      const n = nodeById.get(id)!
      if (x > 0 && x + n.width > wrapAt) { x = 0; yAcc += rowH + nodeGap; rowH = 0 }
      result.set(id, { x, y: yAcc })
      x += n.width + nodeGap
      rowH = Math.max(rowH, n.height)
    }
  }

  const snapV = (v: number) => (snap > 0 ? Math.round(v / snap) * snap : Math.round(v))
  for (const [id, p] of result) result.set(id, { x: snapV(p.x + origin.x), y: snapV(p.y + origin.y) })
  return result
}

/** Number of overlapping node-rectangle pairs in a positioned layout (0 = clean). */
export function countLayoutOverlaps(
  nodes: LayoutNodeInput[],
  pos: Map<string, Point>,
): number {
  let c = 0
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i], pa = pos.get(a.id)!
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j], pb = pos.get(b.id)!
      if (pa.x < pb.x + b.width && pa.x + a.width > pb.x && pa.y < pb.y + b.height && pa.y + a.height > pb.y) c++
    }
  }
  return c
}
