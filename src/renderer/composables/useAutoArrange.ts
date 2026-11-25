import { useFlowsStore } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'
import { useNodesStore, type NodeDefinition } from '@/stores/nodes'
import { useFlowHistory } from '@/composables/useFlowHistory'
import { layeredLayout, type LayoutEdgeInput, type LayoutNodeInput } from '@/utils/graphLayout'

type Size = { width: number; height: number }
type Port = { id: string }

export interface AutoArrangeOptions {
  /** Measured size of a rendered node (Vue Flow `dimensions`); falls back to an estimate. */
  getDimensions?: (nodeId: string) => Size | undefined
  /** Called after a whole-flow arrange so the result is framed. */
  onArranged?: (arrangedIds: string[], scope: 'selection' | 'all') => void
}

/**
 * Size estimate for a node that hasn't been measured (off-screen nodes aren't
 * rendered — `only-render-visible-elements`). Mirrors BaseNode's sizing: a 32px
 * header, 22px per port row, ~30px per inline control (capped like the node body), plus the
 * texture preview.
 */
export function estimateNodeSize(def: NodeDefinition | undefined, data: Record<string, unknown> = {}): Size {
  const dynIn = (data._dynamicInputs as Port[] | undefined)?.length ?? 0
  const dynOut = (data._dynamicOutputs as Port[] | undefined)?.length ?? 0
  const ports = Math.max((def?.inputs.length ?? 0) + dynIn, (def?.outputs.length ?? 0) + dynOut, 1)
  const controls = Math.min(def?.controls.length ?? 0, 8)
  // Nodes with a texture output draw a ~120px preview above their controls, and render wider.
  const preview = def?.outputs.some(o => o.type === 'texture') ?? false
  const height = Math.max(40 + ports * 22, 40 + controls * 30) + (preview ? 120 : 0)
  const width = preview ? 240 : 170
  return { width, height }
}

function portIndex(ports: Port[], dyn: unknown, handle: string | null | undefined): number {
  if (!handle) return 0
  const i = ports.findIndex(p => p.id === handle)
  if (i >= 0) return i
  const j = ((dyn as Port[] | undefined) ?? []).findIndex(p => p.id === handle)
  return j >= 0 ? ports.length + j : 0
}

/**
 * "Tidy graph": layered left→right auto-arrange of the active flow (or the
 * current selection), recorded as ONE undo step via the flow history.
 */
export function useAutoArrange(options: AutoArrangeOptions = {}) {
  const flowsStore = useFlowsStore()
  const uiStore = useUIStore()
  const nodesStore = useNodesStore()
  const { withHistory } = useFlowHistory()

  /**
   * Arrange nodes. `'auto'` arranges the selection when 2+ nodes are selected,
   * otherwise the whole flow. Returns the number of nodes moved (0 = no-op).
   */
  function arrange(scope: 'auto' | 'selection' | 'all' = 'auto'): number {
    const flow = flowsStore.activeFlow
    if (!flow || flow.nodes.length === 0) return 0

    const selected = new Set(uiStore.selectedNodes)
    const useSelection = scope === 'selection' || (scope === 'auto' && selected.size >= 2)
    const nodes = useSelection ? flow.nodes.filter(n => selected.has(n.id)) : flow.nodes
    if (nodes.length < (useSelection ? 2 : 1)) return 0

    const defs = new Map<string, NodeDefinition | undefined>()
    const inputs: LayoutNodeInput[] = nodes.map(n => {
      const data = (n.data ?? {}) as Record<string, unknown>
      const def = nodesStore.getDefinition(data.nodeType as string)
      defs.set(n.id, def)
      const measured = options.getDimensions?.(n.id)
      const size = measured && measured.width > 0 && measured.height > 0 ? measured : estimateNodeSize(def, data)
      return { id: n.id, width: size.width, height: size.height, x: n.position.x, y: n.position.y }
    })
    const ids = new Set(inputs.map(n => n.id))
    const dataOf = new Map(nodes.map(n => [n.id, (n.data ?? {}) as Record<string, unknown>]))
    const edges: LayoutEdgeInput[] = flow.edges
      .filter(e => ids.has(e.source) && ids.has(e.target))
      .map(e => ({
        source: e.source,
        target: e.target,
        sourcePort: portIndex(defs.get(e.source)?.outputs ?? [], dataOf.get(e.source)?._dynamicOutputs, e.sourceHandle),
        targetPort: portIndex(defs.get(e.target)?.inputs ?? [], dataOf.get(e.target)?._dynamicInputs, e.targetHandle),
      }))

    const positions = layeredLayout(inputs, edges, {
      snap: uiStore.snapToGrid ? uiStore.gridSize : 0,
      layerGap: 80,
      nodeGap: 30,
    })

    const moved = nodes.filter(n => {
      const p = positions.get(n.id)
      return p && (p.x !== n.position.x || p.y !== n.position.y)
    })
    if (moved.length === 0) return 0

    const label = useSelection ? `Tidy ${nodes.length} nodes` : 'Tidy graph'
    withHistory(label, () => {
      for (const n of moved) flowsStore.updateNodePosition(n.id, { ...positions.get(n.id)! })
      // updateNodePosition skips dirty (it is the per-frame drag path) — mark once.
      flowsStore.markDirty()
    })
    options.onArranged?.(nodes.map(n => n.id), useSelection ? 'selection' : 'all')
    return moved.length
  }

  return { arrange }
}
