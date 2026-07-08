/**
 * Turn a flow's nodes + edges into a small, scalable schematic model for a
 * thumbnail — a bounding-box-fit projection of the node positions into a target
 * box, with each node a coloured dot and each edge a line between two dots.
 *
 * Pure and store-agnostic: node colour comes from an injected `getColor(type)`
 * resolver (same pattern as `snippetToInsertableNodes`), so the geometry is unit
 * testable and the util has no dependency on the registry. Consumed by the
 * empty-canvas starter cards now and the snippets tab later.
 */
export interface PreviewNode {
  x: number
  y: number
  r: number
  color: string
}

export interface PreviewEdge {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface FlowPreview {
  width: number
  height: number
  nodes: PreviewNode[]
  edges: PreviewEdge[]
}

interface FlowPreviewNodeInput {
  id: string
  type: string
  position: { x: number; y: number }
}

interface FlowPreviewEdgeInput {
  source: string
  target: string
}

interface FlowPreviewOptions {
  width?: number
  height?: number
  padding?: number
  /** Node dot radius, in target-box pixels. */
  radius?: number
  getColor?: (type: string) => string
}

const DEFAULT_COLOR = 'var(--color-neutral-400)'

export function flowToPreview(
  nodes: FlowPreviewNodeInput[],
  edges: FlowPreviewEdgeInput[],
  opts: FlowPreviewOptions = {},
): FlowPreview {
  const width = opts.width ?? 120
  const height = opts.height ?? 72
  const padding = opts.padding ?? 8
  const radius = opts.radius ?? 5
  const getColor = opts.getColor ?? (() => DEFAULT_COLOR)

  if (nodes.length === 0) {
    return { width, height, nodes: [], edges: [] }
  }

  const xs = nodes.map(n => n.position.x)
  const ys = nodes.map(n => n.position.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  // Real spans (0 for a single node or a perfectly axis-aligned row).
  const spanX = Math.max(...xs) - minX
  const spanY = Math.max(...ys) - minY

  // Inset the usable area by the padding and the dot radius so dots never clip.
  const innerW = Math.max(0, width - 2 * padding - 2 * radius)
  const innerH = Math.max(0, height - 2 * padding - 2 * radius)
  // Uniform scale preserves the flow's aspect ratio in the thumbnail. Guard the
  // divisor against a zero span so the scale is finite; a zero span then yields a
  // zero content size below, which centres the point.
  const scale = Math.min(innerW / Math.max(1, spanX), innerH / Math.max(1, spanY))

  // Centre the scaled content within the inner area (contentW/H are 0 when a span
  // is 0, so a lone node lands dead centre).
  const contentW = spanX * scale
  const contentH = spanY * scale
  const originX = padding + radius + (innerW - contentW) / 2
  const originY = padding + radius + (innerH - contentH) / 2

  const project = (p: { x: number; y: number }) => ({
    x: originX + (p.x - minX) * scale,
    y: originY + (p.y - minY) * scale,
  })

  const centers = new Map<string, { x: number; y: number }>()
  const previewNodes: PreviewNode[] = nodes.map((n) => {
    const c = project(n.position)
    centers.set(n.id, c)
    return { x: c.x, y: c.y, r: radius, color: getColor(n.type) }
  })

  const previewEdges: PreviewEdge[] = []
  for (const e of edges) {
    const a = centers.get(e.source)
    const b = centers.get(e.target)
    // Only draw edges whose endpoints are both present in this node set.
    if (a && b) previewEdges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
  }

  return { width, height, nodes: previewNodes, edges: previewEdges }
}
