/**
 * Pure grid-packing logic for the Control Panel performance surface
 * (views/ControlPanelView.vue). The ui store owns persistence; everything that
 * decides WHERE a tile goes lives here so it can be unit-tested without Pinia.
 *
 * Coordinates are grid cells (0-based). A layout entry's `nodeId` is the tile
 * KEY: a node id for whole-node tiles, or `${nodeId}:${controlId}` for a single
 * exposed control (node ids are nanoid — no ':' — so the split is unambiguous).
 */

/** Position and size for a tile in the control panel grid. */
export interface ControlLayout {
  /** Tile key — node id, or `${nodeId}:${controlId}` for an exposed control. */
  nodeId: string
  x: number // Grid column (0-based)
  y: number // Grid row (0-based)
  w: number // Width in grid units
  h: number // Height in grid units
  manuallyPlaced?: boolean // True if user has dragged this control
}

export interface GridRect { x: number; y: number; w: number; h: number }

export interface LayoutItem { key: string; nodeType: string; size?: { w: number; h: number } }

/** Node types that are placed after everything else, full-row (keyboards). */
const BOTTOM_TYPES = new Set(['keyboard'])

// Node type priorities (higher = placed first, better position)
export const NODE_TYPE_PRIORITY: Record<string, number> = {
  'main-output': 100, // Top, prominent
  'oscilloscope': 90,
  'monitor': 85,
  'knob': 50,
  'slider': 50,
  'trigger': 50,
  'constant': 50,
  'lfo': 50,
  'envelope-visual': 45,
  'parametric-eq': 45,
  'wavetable': 45,
  'synth': 45,
  'gamepad-visual': 42,
  'xy-pad': 40,
  'exposed-control': 30, // single controls exposed from the Properties panel
  'keyboard': 10, // Bottom, low priority = placed last
}

// Default sizes per node type (grid units)
export const NODE_TYPE_DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  'main-output': { w: 6, h: 5 },
  'oscilloscope': { w: 5, h: 3 },
  'monitor': { w: 3, h: 2 },
  'keyboard': { w: 10, h: 2 }, // Wide, short
  'xy-pad': { w: 4, h: 4 },
  'knob': { w: 3, h: 3 },
  'slider': { w: 2, h: 4 },
  'trigger': { w: 2, h: 2 },
  'constant': { w: 3, h: 2 },
  'lfo': { w: 4, h: 3 },
  'envelope-visual': { w: 5, h: 3 },
  'parametric-eq': { w: 5, h: 4 },
  'wavetable': { w: 4, h: 3 },
  'synth': { w: 4, h: 4 },
  'gamepad-visual': { w: 5, h: 4 },
  'exposed-control': { w: 4, h: 2 },
}

/** Default tile size for one exposed control, by its control type. */
export function exposedControlSize(controlType: string): { w: number; h: number } {
  switch (controlType) {
    case 'toggle':
    case 'trigger':
    case 'color':
      return { w: 3, h: 2 }
    case 'text':
    case 'textarea':
      return { w: 5, h: 2 }
    default:
      return { w: 4, h: 2 }
  }
}

export function defaultSize(nodeType: string): { w: number; h: number } {
  return NODE_TYPE_DEFAULT_SIZE[nodeType] ?? { w: 4, h: 3 }
}

export function typePriority(nodeType: string): number {
  return NODE_TYPE_PRIORITY[nodeType] ?? 50
}

export function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function collides(layouts: readonly ControlLayout[], rect: GridRect, excludeKey?: string): boolean {
  for (const l of layouts) {
    if (l.nodeId === excludeKey) continue
    if (rectsOverlap(rect, l)) return true
  }
  return false
}

export function bottomOf(layouts: readonly ControlLayout[]): number {
  let max = 0
  for (const l of layouts) max = Math.max(max, l.y + l.h)
  return max
}

/** First free top-left (scan rows top→bottom, columns left→right). Never fails. */
export function findFirstValidPosition(
  layouts: readonly ControlLayout[],
  w: number,
  h: number,
  cols: number,
  excludeKey?: string,
): { x: number; y: number } {
  const ww = Math.max(1, Math.min(w, cols))
  const limit = bottomOf(layouts) + 1
  for (let y = 0; y <= limit; y++) {
    for (let x = 0; x <= cols - ww; x++) {
      if (!collides(layouts, { x, y, w: ww, h }, excludeKey)) return { x, y }
    }
  }
  return { x: 0, y: bottomOf(layouts) }
}

/**
 * Nearest free spot to a desired rect (Manhattan distance, ties → upper-left).
 * Used when a drag/keyboard move would land on another tile: instead of
 * stacking tiles on top of each other, the tile settles in the closest gap.
 */
export function findNearestFreePosition(
  layouts: readonly ControlLayout[],
  rect: GridRect,
  cols: number,
  excludeKey?: string,
): { x: number; y: number } {
  const w = Math.max(1, Math.min(rect.w, cols))
  const tx = Math.max(0, Math.min(rect.x, cols - w))
  const ty = Math.max(0, rect.y)
  const others = layouts.filter(l => l.nodeId !== excludeKey)
  if (!collides(others, { x: tx, y: ty, w, h: rect.h })) return { x: tx, y: ty }
  const maxY = Math.max(ty, bottomOf(others)) + 1
  let best: { x: number; y: number; d: number } | null = null
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x <= cols - w; x++) {
      const d = Math.abs(x - tx) + Math.abs(y - ty)
      if (best && d >= best.d) continue
      if (!collides(others, { x, y, w, h: rect.h })) best = { x, y, d }
    }
  }
  return best ? { x: best.x, y: best.y } : { x: 0, y: bottomOf(others) }
}

/** Clamp a rect into the grid (min size, never wider than `cols`, never off the left/top). */
export function clampRect(rect: GridRect, cols: number, minW = 2, minH = 2): GridRect {
  const w = Math.max(Math.min(minW, cols), Math.min(rect.w, cols))
  const h = Math.max(minH, rect.h)
  return { x: Math.max(0, Math.min(rect.x, cols - w)), y: Math.max(0, rect.y), w, h }
}

/** Place one new item into existing layouts (bottom-type items go on a new bottom row). */
export function placeItem(layouts: readonly ControlLayout[], item: LayoutItem, cols: number): ControlLayout {
  const size = item.size ?? defaultSize(item.nodeType)
  const w = Math.max(1, Math.min(cols, size.w))
  if (BOTTOM_TYPES.has(item.nodeType)) {
    return { nodeId: item.key, x: 0, y: bottomOf(layouts), w, h: size.h, manuallyPlaced: false }
  }
  const { x, y } = findFirstValidPosition(layouts, w, size.h, cols)
  return { nodeId: item.key, x, y, w, h: size.h, manuallyPlaced: false }
}

/**
 * Fresh layout for `items`: priority order (high first, input order breaks
 * ties), first-fit packing, bottom-type items last on their own rows.
 */
export function autoLayout(items: readonly LayoutItem[], cols: number): ControlLayout[] {
  const sorted = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => typePriority(b.item.nodeType) - typePriority(a.item.nodeType) || a.i - b.i)
    .map(o => o.item)
  const out: ControlLayout[] = []
  for (const item of sorted) out.push(placeItem(out, item, cols))
  return out
}

/** True when any tile hangs off the right edge of a `cols`-wide grid. */
export function needsReflow(layouts: readonly ControlLayout[], cols: number): boolean {
  return layouts.some(l => l.x + l.w > cols)
}

/**
 * Transient (never persisted) re-pack for a grid narrower than the saved one —
 * a phone/tablet showing a desktop-authored panel. Reading order (row, then
 * column) is preserved; widths are clamped to the grid.
 */
export function reflow(layouts: readonly ControlLayout[], cols: number): ControlLayout[] {
  const sorted = [...layouts].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: ControlLayout[] = []
  for (const l of sorted) {
    const w = Math.min(cols, l.w)
    const { x, y } = findFirstValidPosition(out, w, l.h, cols)
    out.push({ ...l, x, y, w })
  }
  return out
}

/** The node id a tile key refers to. */
export function tileNodeId(key: string): string {
  const i = key.indexOf(':')
  return i === -1 ? key : key.slice(0, i)
}
