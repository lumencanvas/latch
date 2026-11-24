import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFlowsStore } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'

/**
 * Control Panel layout persistence. The layout list is GLOBAL (localStorage,
 * keyed by tile id), so every operation must stay scoped to the panel's own
 * tiles and never clobber another flow's arrangement.
 */
describe('ui store — control panel layout', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  const stored = () => JSON.parse(localStorage.getItem('latch-control-layout') ?? '[]') as Array<{ nodeId: string }>

  it('autoLayoutAll replaces only the given tiles (other flows keep their layout)', () => {
    const ui = useUIStore()
    ui.updateControlLayout('other-flow-node', { x: 7, y: 9, w: 3, h: 3 })
    ui.autoLayoutAll([{ id: 'a', nodeType: 'knob' }, { id: 'b', nodeType: 'slider' }], 12)
    expect(ui.controlPanelLayout.find(l => l.nodeId === 'other-flow-node')).toMatchObject({ x: 7, y: 9 })
    expect(ui.controlPanelLayout.map(l => l.nodeId).sort()).toEqual(['a', 'b', 'other-flow-node'])
    expect(stored()).toHaveLength(3)
  })

  it('ensureControlLayouts packs new tiles around this panel only, writes once, is idempotent', () => {
    const ui = useUIStore()
    // A tile from another flow sitting at the origin must not push new tiles away.
    ui.updateControlLayout('elsewhere', { x: 0, y: 0, w: 4, h: 4 })
    const added = ui.ensureControlLayouts([{ key: 'k', nodeType: 'knob' }], 12)
    expect(added).toBe(true)
    expect(ui.controlPanelLayout.find(l => l.nodeId === 'k')).toMatchObject({ x: 0, y: 0, w: 3, h: 3 })
    expect(ui.ensureControlLayouts([{ key: 'k', nodeType: 'knob' }], 12)).toBe(false)
  })

  it('placeControlTile: a move onto a neighbour settles in the nearest free cell', () => {
    const ui = useUIStore()
    ui.autoLayoutAll([{ id: 'a', nodeType: 'knob' }, { id: 'b', nodeType: 'knob' }], 12)
    const scope = new Set(['a', 'b'])
    const a = ui.controlPanelLayout.find(l => l.nodeId === 'a')!
    const placed = ui.placeControlTile('b', { x: a.x, y: a.y, w: 3, h: 3 }, 12, scope, 'move')!
    expect(ui.checkCollision(placed.x, placed.y, placed.w, placed.h, 'b')).toBe(false)
    expect(placed.manuallyPlaced).toBe(true)
  })

  it('placeControlTile: an overlapping resize is rejected, a free one applies (clamped to the grid)', () => {
    const ui = useUIStore()
    ui.updateControlLayout('a', { x: 0, y: 0, w: 3, h: 3 })
    ui.updateControlLayout('b', { x: 3, y: 0, w: 3, h: 3 })
    const scope = new Set(['a', 'b'])
    ui.placeControlTile('a', { x: 0, y: 0, w: 5, h: 3 }, 12, scope, 'resize')
    expect(ui.controlPanelLayout.find(l => l.nodeId === 'a')!.w).toBe(3)
    ui.placeControlTile('b', { x: 3, y: 0, w: 40, h: 4 }, 12, scope, 'resize')
    expect(ui.controlPanelLayout.find(l => l.nodeId === 'b')).toMatchObject({ w: 9, h: 4 })
  })

  it('exposeControl persists (it used to be lost on reload)', () => {
    const ui = useUIStore()
    ui.exposeControl('n1', 'gain', 'Gain')
    const saved = JSON.parse(localStorage.getItem('clasp-exposed-controls') ?? '[]')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ id: 'n1:gain', nodeId: 'n1', controlId: 'gain' })
  })

  it('cleanupExposedControls keeps controls whose node lives in another flow, and prunes stale tiles', () => {
    const flows = useFlowsStore()
    const ui = useUIStore()
    flows.createFlow('A')
    const a = flows.addNode('constant', { x: 0, y: 0 })!
    flows.createFlow('B')
    const b = flows.addNode('constant', { x: 0, y: 0 })!
    ui.exposeControl(a.id, 'value', 'Value')
    ui.exposeControl(b.id, 'value', 'Value')
    ui.exposeControl('deleted-node', 'value', 'Value')
    ui.updateControlLayout(`${a.id}:value`, { x: 0, y: 0 })
    ui.updateControlLayout('deleted-node:value', { x: 4, y: 0 })
    ui.updateControlLayout('deleted-node', { x: 8, y: 0 })

    // Caller (EditorView/PropertiesPanel) passes only the ACTIVE flow (B) ids.
    ui.cleanupExposedControls(flows.activeNodes.map(n => n.id))

    expect(ui.exposedControls.map(c => c.nodeId).sort()).toEqual([a.id, b.id].sort())
    expect(ui.controlPanelLayout.map(l => l.nodeId)).toEqual([`${a.id}:value`])
  })
})

describe('duplicateFlow gives the copy its own node ids and Control Panel', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('remaps nodes/edges, copies tiles + exposed controls, and moving one tile leaves the other', () => {
    const flows = useFlowsStore()
    const ui = useUIStore()
    const src = flows.createFlow('Orig')
    src.nodes.push(
      { id: 'n1', type: 'custom', position: { x: 0, y: 0 }, data: { nodeType: 'constant' } },
      { id: 'n2', type: 'custom', position: { x: 200, y: 0 }, data: { nodeType: 'monitor' } },
    )
    src.edges.push({ id: 'e1', source: 'n1', target: 'n2', sourceHandle: 'value', targetHandle: 'value' })
    ui.updateControlLayout('n1', { x: 2, y: 3, w: 2, h: 2 })
    ui.exposeControl('n2', 'label', 'Label')
    ui.updateControlLayout('n2:label', { x: 5, y: 1, w: 2, h: 1 })

    const copy = flows.duplicateFlow(src.id, (m) => ui.cloneControlPanelForNodes(m))!
    const [c1, c2] = copy.nodes
    expect(c1.id).not.toBe('n1')
    expect(c2.id).not.toBe('n2')
    expect(copy.edges[0]).toMatchObject({ source: c1.id, target: c2.id })
    expect(copy.edges[0].id).not.toBe('e1')

    expect(ui.controlPanelLayout.find(l => l.nodeId === c1.id)).toMatchObject({ x: 2, y: 3 })
    expect(ui.controlPanelLayout.find(l => l.nodeId === `${c2.id}:label`)).toMatchObject({ x: 5, y: 1 })
    expect(ui.exposedControls.some(c => c.nodeId === c2.id && c.controlId === 'label')).toBe(true)

    ui.updateControlLayout(c1.id, { x: 9, y: 9, w: 2, h: 2 })
    expect(ui.controlPanelLayout.find(l => l.nodeId === 'n1')).toMatchObject({ x: 2, y: 3 })
  })
})
