import { describe, it, expect, beforeEach, vi } from 'vitest'
import { effectScope } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useNodesStore, type NodeDefinition } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'
import { useCanvasKeyboard, type CanvasKeyboardDeps } from '@/composables/useCanvasKeyboard'

/**
 * The canvas keyboard machine used to be ~485 lines inlined in EditorView (an
 * app-chrome SFC), so it was only ever browser-verifiable. Extracted into a
 * composable with injected Vue-Flow/history/toast deps, its logic is now unit
 * testable with mocked stores — this guards the extraction and the behaviour.
 */
function def(id: string, inputs: NodeDefinition['inputs'], outputs: NodeDefinition['outputs']): NodeDefinition {
  return {
    id, name: id, version: '1.0.0', category: 'data', description: '', icon: 'box',
    platforms: ['web', 'electron'], inputs, outputs, controls: [],
  }
}

function makeDeps(): CanvasKeyboardDeps {
  return {
    setCenter: vi.fn(),
    getViewport: () => ({ zoom: 1 }),
    flowToScreenCoordinate: (p) => ({ x: p.x, y: p.y }),
    addEdges: vi.fn(),
    startBatch: vi.fn(() => ({ id: 'snap' })) as unknown as CanvasKeyboardDeps['startBatch'],
    endBatch: vi.fn(),
    showConnectionError: vi.fn(),
  }
}

const key = (k: string, opts: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key: k, ...opts })

function setup() {
  setActivePinia(createPinia())
  const nodesStore = useNodesStore()
  const flowsStore = useFlowsStore()
  const uiStore = useUIStore()
  nodesStore.register(def('src', [], [{ id: 'out', type: 'number', label: 'Out' }]))
  nodesStore.register(def('tgt', [{ id: 'in', type: 'number', label: 'In' }], []))
  const flow = flowsStore.createFlow('t')
  flowsStore.setActiveFlow(flow.id)
  const src = flowsStore.addNode('src', { x: 0, y: 0 }, { nodeType: 'src', label: 'Src' })!
  const tgt = flowsStore.addNode('tgt', { x: 200, y: 0 }, { nodeType: 'tgt', label: 'Tgt' })!
  const deps = makeDeps()
  const scope = effectScope()
  let api!: ReturnType<typeof useCanvasKeyboard>
  scope.run(() => { api = useCanvasKeyboard(deps) })
  return { nodesStore, flowsStore, uiStore, srcId: src.id, tgtId: tgt.id, deps, api, stop: () => scope.stop() }
}

describe('useCanvasKeyboard — navigation', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('focus sets the cursor to the first node; arrows rove and wrap', () => {
    const { api, uiStore, srcId, tgtId, stop } = setup()
    api.onCanvasFocus()
    expect(uiStore.canvasCursor).toBe(srcId) // top-left first
    api.onCanvasKeydown(key('ArrowRight'))
    expect(uiStore.canvasCursor).toBe(tgtId)
    api.onCanvasKeydown(key('ArrowRight')) // wrap back to first
    expect(uiStore.canvasCursor).toBe(srcId)
    stop()
  })

  it('Enter selects the cursor node', () => {
    const { api, uiStore, srcId, stop } = setup()
    api.onCanvasFocus()
    api.onCanvasKeydown(key('Enter'))
    expect(uiStore.selectedNodes).toContain(srcId)
    stop()
  })
})

describe('useCanvasKeyboard — move', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('with a selection, an arrow nudges by grid step inside one history batch', () => {
    const { api, flowsStore, uiStore, srcId, deps, stop } = setup()
    uiStore.selectNodes([srcId])
    const before = flowsStore.activeNodes.find(n => n.id === srcId)!.position.x
    api.onCanvasKeydown(key('ArrowRight'))
    const after = flowsStore.activeNodes.find(n => n.id === srcId)!.position.x
    expect(after).toBe(before + uiStore.gridSize)
    expect(deps.startBatch).toHaveBeenCalledTimes(1) // one burst opened
    expect(deps.endBatch).not.toHaveBeenCalled()     // not yet closed
    // a non-move key ends the burst → one Move node entry
    api.onCanvasKeydown(key('x'))
    expect(deps.endBatch).toHaveBeenCalledWith({ id: 'snap' }, 'Move node')
    stop()
  })
})

describe('useCanvasKeyboard — wire', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('w → source auto-advances to a valid target and drafts the wire', () => {
    const { api, uiStore, srcId, tgtId, stop } = setup()
    api.onCanvasFocus()
    api.onCanvasKeydown(key('w'))
    expect(uiStore.wireDraft?.sourceId).toBe(srcId)
    expect(uiStore.canvasCursor).toBe(tgtId) // moved onto the candidate target
    stop()
  })

  it('Enter through target port commits a real edge and clears the draft', () => {
    const { api, flowsStore, uiStore, deps, stop } = setup()
    const edgesBefore = flowsStore.activeFlow!.edges.length
    api.onCanvasFocus()
    api.onCanvasKeydown(key('w'))      // → target-node
    api.onCanvasKeydown(key('Enter'))  // → target-port
    api.onCanvasKeydown(key('Enter'))  // → commit
    expect(deps.addEdges).toHaveBeenCalledTimes(1)
    expect(flowsStore.activeFlow!.edges.length).toBe(edgesBefore + 1)
    expect(uiStore.wireDraft).toBeNull()
    stop()
  })

  it('Escape cancels an in-progress wire', () => {
    const { api, uiStore, stop } = setup()
    api.onCanvasFocus()
    api.onCanvasKeydown(key('w'))
    expect(uiStore.wireDraft).not.toBeNull()
    api.onCanvasKeydown(key('Escape'))
    expect(uiStore.wireDraft).toBeNull()
    stop()
  })
})
