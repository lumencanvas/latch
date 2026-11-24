import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFlowsStore } from '@/stores/flows'
import { useHistoryStore } from '@/stores/history'
import { useUIStore } from '@/stores/ui'
import { useAutoArrange, estimateNodeSize } from '@/composables/useAutoArrange'
import { useFlowHistory } from '@/composables/useFlowHistory'

describe('useAutoArrange', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  function setup() {
    const flows = useFlowsStore()
    const ui = useUIStore()
    flows.createFlow('Test')
    // Deliberately messy: c ← b ← a placed right-to-left and overlapping.
    const a = flows.addNode('constant', { x: 900, y: 40 })!
    const b = flows.addNode('constant', { x: 450, y: 40 })!
    const c = flows.addNode('constant', { x: 0, y: 40 })!
    flows.addEdge(a.id, 'value', b.id, 'value')
    flows.addEdge(b.id, 'value', c.id, 'value')
    const size = () => ({ width: 160, height: 60 })
    return { flows, ui, a, b, c, arrange: useAutoArrange({ getDimensions: size }).arrange }
  }

  const pos = (id: string) => useFlowsStore().activeNodes.find(n => n.id === id)!.position

  it('arranges the whole flow left→right in wire order, as ONE undo step', () => {
    const { flows, a, b, c, arrange } = setup()
    const history = useHistoryStore()
    const before = history.undoStackSize(flows.activeFlowId!)
    expect(arrange()).toBeGreaterThan(0)
    expect(pos(a.id).x).toBeLessThan(pos(b.id).x)
    expect(pos(b.id).x).toBeLessThan(pos(c.id).x)
    expect(history.undoStackSize(flows.activeFlowId!)).toBe(before + 1)
    expect(flows.activeFlow!.dirty).toBe(true)

    useFlowHistory().undo()
    expect(pos(a.id)).toEqual({ x: 900, y: 40 })
    expect(pos(c.id)).toEqual({ x: 0, y: 40 })
  })

  it('arranges only the selection (2+ selected) and leaves other nodes alone', () => {
    const { ui, a, b, c, arrange } = setup()
    ui.selectNodes([a.id, b.id])
    arrange()
    expect(pos(c.id)).toEqual({ x: 0, y: 40 })
    expect(pos(a.id).x).toBeLessThan(pos(b.id).x)
  })

  it('is a no-op (no history entry) when already tidy', () => {
    const { flows, arrange } = setup()
    arrange()
    const history = useHistoryStore()
    const n = history.undoStackSize(flows.activeFlowId!)
    expect(arrange()).toBe(0)
    expect(history.undoStackSize(flows.activeFlowId!)).toBe(n)
  })

  it('snaps to the canvas grid when snap-to-grid is on', () => {
    const { ui, arrange, a, b } = setup()
    ui.snapToGrid = true
    ui.gridSize = 20
    arrange()
    for (const id of [a.id, b.id]) {
      expect(pos(id).x % 20).toBe(0)
      expect(pos(id).y % 20).toBe(0)
    }
  })

  it('estimates unmeasured sizes from ports/controls', () => {
    const big = estimateNodeSize({ inputs: Array(12).fill({ id: 'i', type: 'number' }), outputs: [], controls: [] } as never)
    const small = estimateNodeSize({ inputs: [{ id: 'i', type: 'number' }], outputs: [], controls: [] } as never)
    expect(big.height).toBeGreaterThan(small.height)
  })
})
