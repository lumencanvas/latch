import { describe, it, expect } from 'vitest'
import {
  autoLayout, collides, findFirstValidPosition, findNearestFreePosition, needsReflow, reflow,
  placeItem, clampRect, tileNodeId, rectsOverlap, type ControlLayout,
} from '@/utils/controlPanelLayout'

const L = (nodeId: string, x: number, y: number, w: number, h: number): ControlLayout => ({ nodeId, x, y, w, h })
const noOverlaps = (ls: ControlLayout[]) => ls.every((a, i) => ls.every((b, j) => i === j || !rectsOverlap(a, b)))

describe('controlPanelLayout', () => {
  it('first-fit finds the first gap scanning rows then columns', () => {
    const ls = [L('a', 0, 0, 4, 2), L('b', 6, 0, 6, 2)]
    expect(findFirstValidPosition(ls, 2, 2, 12)).toEqual({ x: 4, y: 0 })
    expect(findFirstValidPosition(ls, 3, 2, 12)).toEqual({ x: 0, y: 2 })
  })

  it('first-fit clamps a too-wide tile to the grid instead of failing', () => {
    expect(findFirstValidPosition([], 10, 2, 4)).toEqual({ x: 0, y: 0 })
  })

  it('autoLayout honours priority (main-output first, keyboard last on its own row) without overlaps', () => {
    const items = [
      { key: 'kb', nodeType: 'keyboard' }, { key: 'k1', nodeType: 'knob' },
      { key: 'out', nodeType: 'main-output' }, { key: 's1', nodeType: 'slider' }, { key: 'k2', nodeType: 'knob' },
    ]
    const ls = autoLayout(items, 12)
    expect(ls[0].nodeId).toBe('out')
    expect(ls[0]).toMatchObject({ x: 0, y: 0 })
    const kb = ls.find(l => l.nodeId === 'kb')!
    expect(kb.y).toBe(Math.max(...ls.filter(l => l.nodeId !== 'kb').map(l => l.y + l.h)))
    expect(noOverlaps(ls)).toBe(true)
    expect(ls.every(l => l.x + l.w <= 12)).toBe(true)
  })

  it('autoLayout keeps everything inside a narrow (phone) grid', () => {
    const items = ['main-output', 'keyboard', 'parametric-eq', 'knob', 'xy-pad'].map((t, i) => ({ key: `n${i}`, nodeType: t }))
    const ls = autoLayout(items, 4)
    expect(ls.every(l => l.x >= 0 && l.x + l.w <= 4)).toBe(true)
    expect(noOverlaps(ls)).toBe(true)
  })

  it('an explicit size overrides the type default (exposed controls)', () => {
    expect(placeItem([], { key: 'n:c', nodeType: 'exposed-control', size: { w: 3, h: 2 } }, 12)).toMatchObject({ w: 3, h: 2 })
  })

  it('nearest-free moves a dropped tile off another tile to the closest gap', () => {
    const ls = [L('a', 0, 0, 4, 2), L('b', 4, 0, 4, 2)]
    // Drop b onto a: nearest free spot for a 4×2 tile next to (0,0) excluding b itself.
    const p = findNearestFreePosition(ls, { x: 1, y: 0, w: 4, h: 2 }, 12, 'b')
    expect(collides(ls, { ...p, w: 4, h: 2 }, 'b')).toBe(false)
    expect(Math.abs(p.x - 1) + Math.abs(p.y)).toBeLessThanOrEqual(3)
  })

  it('nearest-free keeps a free target as-is (clamped into the grid)', () => {
    expect(findNearestFreePosition([], { x: 20, y: 3, w: 4, h: 2 }, 12)).toEqual({ x: 8, y: 3 })
  })

  it('clampRect enforces min size and the right edge', () => {
    expect(clampRect({ x: 10, y: -2, w: 1, h: 1 }, 12)).toEqual({ x: 10, y: 0, w: 2, h: 2 })
    expect(clampRect({ x: 0, y: 0, w: 30, h: 3 }, 12)).toEqual({ x: 0, y: 0, w: 12, h: 3 })
  })

  it('reflow re-packs a wide layout for a narrow grid, preserving reading order', () => {
    const wide = [L('a', 0, 0, 6, 3), L('b', 6, 0, 6, 3), L('c', 12, 0, 4, 2)]
    expect(needsReflow(wide, 6)).toBe(true)
    expect(needsReflow(wide, 16)).toBe(false)
    const r = reflow(wide, 6)
    expect(r.map(l => l.nodeId)).toEqual(['a', 'b', 'c'])
    expect(r.every(l => l.x + l.w <= 6)).toBe(true)
    expect(noOverlaps(r)).toBe(true)
    expect(r[1].y).toBeGreaterThanOrEqual(3)
  })

  it('tileNodeId maps exposed-control keys back to their node', () => {
    expect(tileNodeId('abc')).toBe('abc')
    expect(tileNodeId('abc:gain')).toBe('abc')
  })
})
