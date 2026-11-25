import { useFlowsStore } from '@/stores/flows'
import { useNodesStore, type NodeDefinition } from '@/stores/nodes'
import { useUIStore } from '@/stores/ui'
import { useRuntimeStore } from '@/stores/runtime'
import { useAgentStore } from '@/stores/agent'
import { useHistoryStore } from '@/stores/history'
import { useFlowHistory } from '@/composables/useFlowHistory'
import { useAutoArrange } from '@/composables/useAutoArrange'
import { coerceControlValue } from '@/utils/controlValue'
import { getPlatform } from '@/utils/platform'
import { flowSnippets } from '@/data/flow-snippets'
import { snippetOffsetToCenter, snippetToInsertableNodes } from '@/utils/snippets'
import { CODE_DISABLED_KEY } from '@/services/security/flowTrust'
import { REDACTED_SECRET } from '@/services/connections/redactSecrets'
import { parseEndpoint } from '@/services/fileFormat'
import { ToolError, type AgentTool, type ToolContext, type XY } from '../types'
import {
  checkConnection,
  codeKeyFor,
  createNodeData,
  describePorts,
  effectiveControls,
  effectivePorts,
  freeSpotRightOf,
  getActiveFlowOrThrow,
  getDefOrThrow,
  getNodeOrThrow,
  isSecretControl,
  assertSecretStaysHome,
  shaderPortsFor,
  nodeType,
} from '../helpers'

const POS = { type: 'object' as const, properties: { x: { type: 'number' as const }, y: { type: 'number' as const } }, required: ['x', 'y'] }
const CONTROLS = { type: 'object' as const, additionalProperties: true, maxItems: 60, description: 'Control values by control id (see latch_get_node_type).' }
const ID = { type: 'string' as const, maxLength: 64 }

const CODE_NOTE = 'Code nodes stay disabled until the person clicks "Enable code" on the node.'

interface ControlReport {
  applied: Record<string, unknown>
  clamped: Array<{ id: string; requested: unknown; applied: unknown }>
  rejected: Array<{ id: string; error: string }>
}

/** Validate control values for a node type. Unknown ids and `_` ids are rejected, not dropped silently. */
function checkControls(def: NodeDefinition, data: Record<string, unknown>, values: Record<string, unknown>): ControlReport {
  const controls = effectiveControls(def, data)
  const report: ControlReport = { applied: {}, clamped: [], rejected: [] }
  for (const [id, raw] of Object.entries(values)) {
    const c = controls.find((x) => x.id === id)
    if (id.startsWith('_') || !c) {
      report.rejected.push({ id, error: `not a control of ${def.name}${controls.length ? ` (controls: ${controls.map((x) => x.id).join(', ')})` : ''}` })
      continue
    }
    // The masked placeholder from a read, written back, means "leave the saved secret alone".
    if (raw === REDACTED_SECRET && isSecretControl(c)) continue
    const r = coerceControlValue(c, raw)
    if (!r.ok) { report.rejected.push({ id, error: r.error }); continue }
    report.applied[id] = r.value
    if (r.clamped) report.clamped.push({ id, requested: raw, applied: r.value })
  }
  return report
}

function requireAvailable(def: NodeDefinition) {
  if (!def.platforms.includes(getPlatform())) throw new ToolError(`${def.name} isn't available on ${getPlatform()} (only ${def.platforms.join(', ')}).`)
}

function center(ctx: ToolContext): XY {
  return ctx.env.viewCenter?.() ?? { x: 200, y: 200 }
}

function strictControls(def: NodeDefinition, data: Record<string, unknown>, values: Record<string, unknown> | undefined, where: string) {
  const report = checkControls(def, data, values ?? {})
  if (report.rejected.length) {
    throw new ToolError(`${where}: ${report.rejected.map((r) => `${r.id}: ${r.error}`).join('; ')}`)
  }
  return report
}

function selectAndFrame(ctx: ToolContext, nodeIds: string[]) {
  if (nodeIds.length === 0) return
  useUIStore().selectNodes(nodeIds)
  ctx.env.frame?.(nodeIds)
}

export const editTools: AgentTool<never>[] = [
  {
    name: 'latch_add_node',
    title: 'Add a node',
    description: 'Adds one node of a given type to the open flow, optionally with a position, label and control values. One undo step. For several nodes with wires, use latch_build_graph instead.',
    tier: 'edit',
    inputSchema: {
      type: 'object',
      properties: { type: { type: 'string', maxLength: 80 }, position: POS, label: { type: 'string', maxLength: 80 }, controls: CONTROLS },
      required: ['type'],
    },
    execute: (input: { type: string; position?: XY; label?: string; controls?: Record<string, unknown> }, ctx) => {
      const flow = getActiveFlowOrThrow()
      const def = getDefOrThrow(input.type)
      requireAvailable(def)
      const report = strictControls(def, {}, input.controls, input.type)
      const position = input.position ?? freeSpotRightOf(flow.nodes, center(ctx))
      const node = useFlowHistory().withHistory(`Agent: Add ${def.name}`, () =>
        useFlowsStore().addNode(def.id, position, createNodeData(def, { ...(input.label ? { label: input.label } : {}), ...report.applied })))
      if (!node) throw new ToolError('Could not add the node.')
      selectAndFrame(ctx, [node.id])
      const ports = effectivePorts(def, {})
      return {
        nodeId: node.id,
        inputs: describePorts(ports.inputs),
        outputs: describePorts(ports.outputs),
        ...(report.clamped.length ? { clamped: report.clamped } : {}),
        ...((node.data as Record<string, unknown>)[CODE_DISABLED_KEY] ? { note: CODE_NOTE } : {}),
      }
    },
  },
  {
    name: 'latch_build_graph',
    title: 'Build nodes and wires',
    description: 'Adds many nodes and wires to the open flow in one atomic, undoable step. Give each new node a short "ref"; edges join "ref:port" or "existingNodeId:port". Everything is checked first and nothing is added if anything is wrong. New nodes are laid out automatically unless positions are given.',
    tier: 'edit',
    inputSchema: {
      type: 'object',
      properties: {
        nodes: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            properties: { ref: { type: 'string', minLength: 1, maxLength: 40 }, type: { type: 'string', maxLength: 80 }, position: POS, label: { type: 'string', maxLength: 80 }, controls: CONTROLS },
            required: ['ref', 'type'],
          },
        },
        edges: {
          type: 'array',
          maxItems: 200,
          items: { type: 'object', properties: { from: { type: 'string', maxLength: 140 }, to: { type: 'string', maxLength: 140 } }, required: ['from', 'to'] },
        },
        layout: { type: 'string', enum: ['auto', 'none'], default: 'auto' },
      },
      required: ['nodes'],
    },
    execute: (input: {
      nodes: Array<{ ref: string; type: string; position?: XY; label?: string; controls?: Record<string, unknown> }>
      edges?: Array<{ from: string; to: string }>
      layout?: 'auto' | 'none'
    }, ctx) => {
      const flow = getActiveFlowOrThrow()
      const flows = useFlowsStore()
      const refs = new Map<string, { def: NodeDefinition; data: Record<string, unknown> }>()
      // 1. Validate every node.
      for (const n of input.nodes) {
        if (refs.has(n.ref)) throw new ToolError(`Duplicate ref "${n.ref}".`)
        if (flow.nodes.some((x) => x.id === n.ref)) throw new ToolError(`ref "${n.ref}" is also an existing node id; pick another ref.`)
        const def = getDefOrThrow(n.type)
        requireAvailable(def)
        const report = strictControls(def, {}, n.controls, `node "${n.ref}" (${n.type})`)
        refs.set(n.ref, { def, data: createNodeData(def, { ...(n.label ? { label: n.label } : {}), ...report.applied }) })
      }
      // 2. Validate every edge against new refs + existing nodes (strict ports and types).
      const pool = [
        ...flow.nodes.map((n) => ({ id: n.id, data: n.data as Record<string, unknown> })),
        ...[...refs].map(([ref, v]) => ({ id: ref, data: v.data })),
      ]
      const edges = (input.edges ?? []).map((e) => checkConnection(e.from, e.to, pool))
      for (const e of edges) {
        const existing = flow.nodes.find((n) => n.id === e.target)
        if (existing) assertSecretStaysHome(getDefOrThrow(nodeType(existing)), existing.data as Record<string, unknown>, e.targetHandle, e.target)
      }
      const seen = new Set<string>()
      for (const e of edges) {
        const key = `${e.target}:${e.targetHandle}`
        const multiple = e.targetPort.multiple
        const taken = seen.has(key) || flow.edges.some((x) => x.target === e.target && x.targetHandle === e.targetHandle)
        if (!multiple && taken) throw new ToolError(`Input ${key} already has a wire. Inputs take one wire unless marked multiple; disconnect the old one first.`)
        seen.add(key)
      }
      // 3. Apply as one undo step.
      const base = freeSpotRightOf(flow.nodes, center(ctx))
      const idMap = new Map<string, string>()
      const created = useFlowHistory().withHistory(`Agent: Build ${input.nodes.length} node${input.nodes.length === 1 ? '' : 's'}`, () => {
        const { nodeIds } = flows.insertSubgraph(
          input.nodes.map((n, i) => ({ id: n.ref, nodeType: refs.get(n.ref)!.def.id, position: n.position ?? { x: base.x + (i % 4) * 280, y: base.y + Math.floor(i / 4) * 200 }, data: refs.get(n.ref)!.data })),
          [],
        )
        input.nodes.forEach((n, i) => idMap.set(n.ref, nodeIds[i]))
        const edgeIds: string[] = []
        for (const e of edges) {
          const s = idMap.get(e.source) ?? e.source
          const t = idMap.get(e.target) ?? e.target
          const edge = flows.addEdge(s, e.sourceHandle, t, e.targetHandle)
          if (edge) edgeIds.push(edge.id)
        }
        const positioned = input.nodes.every((n) => n.position)
        if ((input.layout ?? 'auto') === 'auto' && !positioned && nodeIds.length > 1) {
          useUIStore().selectNodes(nodeIds)
          // Tidy records its own undo step; hold that back so the build stays ONE step.
          const history = useHistoryStore()
          history.setUndoingOrRedoing(true)
          try { useAutoArrange({ getDimensions: ctx.env.dimensions }).arrange('selection') } finally { history.setUndoingOrRedoing(false) }
        }
        return { nodeIds, edgeIds }
      })
      selectAndFrame(ctx, created.nodeIds)
      const disabled = input.nodes.filter((n) => codeKeyFor(n.type)).map((n) => idMap.get(n.ref))
      return {
        nodeIds: Object.fromEntries(idMap),
        edgeCount: created.edgeIds.length,
        ...(disabled.length ? { note: CODE_NOTE } : {}),
      }
    },
  },
  {
    name: 'latch_insert_snippet',
    title: 'Insert an example flow',
    description: 'Inserts a built-in example flow (from latch_list_snippets) into the open flow, centred in view. One undo step.',
    tier: 'edit',
    inputSchema: { type: 'object', properties: { snippetId: { type: 'string', maxLength: 80 }, position: POS }, required: ['snippetId'] },
    execute: (input: { snippetId: string; position?: XY }, ctx) => {
      getActiveFlowOrThrow()
      const snippet = flowSnippets.find((s) => s.id === input.snippetId)
      if (!snippet) throw new ToolError(`No example "${input.snippetId}". See latch_list_snippets.`)
      const getDef = useNodesStore().getDefinition
      const nodes = snippetToInsertableNodes(snippet, (t) => getDef(t)).map((n) => (codeKeyFor(n.nodeType) ? { ...n, data: { ...n.data, [CODE_DISABLED_KEY]: true } } : n))
      const { nodeIds } = useFlowHistory().withHistory(`Agent: Insert ${snippet.name}`, () =>
        useFlowsStore().insertSubgraph(nodes, snippet.edges, snippetOffsetToCenter(snippet, input.position ?? center(ctx))))
      selectAndFrame(ctx, nodeIds)
      return { nodeIds, requires: snippet.requires ?? [], ...(snippet.setup ? { setup: snippet.setup } : {}) }
    },
  },
  {
    name: 'latch_remove_nodes',
    title: 'Remove nodes',
    description: 'Removes nodes (and their wires) from the open flow. One undo step.',
    tier: 'edit',
    inputSchema: { type: 'object', properties: { nodeIds: { type: 'array', minItems: 1, maxItems: 50, items: ID } }, required: ['nodeIds'] },
    execute: (input: { nodeIds: string[] }) => {
      for (const id of input.nodeIds) getNodeOrThrow(id)
      const ui = useUIStore()
      useFlowHistory().withHistory(`Agent: Remove ${input.nodeIds.length} node${input.nodeIds.length === 1 ? '' : 's'}`, () => useFlowsStore().removeNodes(input.nodeIds))
      for (const id of input.nodeIds) {
        ui.removeFromSelection(id)
        if (ui.inspectedNode === id) ui.setInspectedNode(null)
      }
      return { removed: input.nodeIds.length }
    },
  },
  {
    name: 'latch_move_nodes',
    title: 'Move nodes',
    description: 'Moves nodes to new canvas positions. One undo step.',
    tier: 'edit',
    inputSchema: {
      type: 'object',
      properties: { moves: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', properties: { nodeId: ID, x: { type: 'number' }, y: { type: 'number' } }, required: ['nodeId', 'x', 'y'] } } },
      required: ['moves'],
    },
    execute: (input: { moves: Array<{ nodeId: string; x: number; y: number }> }) => {
      for (const m of input.moves) getNodeOrThrow(m.nodeId)
      const flows = useFlowsStore()
      useFlowHistory().withHistory('Agent: Move nodes', () => {
        for (const m of input.moves) flows.updateNodePosition(m.nodeId, { x: m.x, y: m.y })
        flows.markDirty()
      })
      return { moved: input.moves.length }
    },
  },
  {
    name: 'latch_auto_arrange',
    title: 'Tidy the layout',
    description: 'Lays out the whole open flow (or the given nodes) left to right by wiring, using the nodes\' real on-screen sizes. Run it after a big latch_build_graph to clear any overlaps. One undo step.',
    tier: 'edit',
    inputSchema: { type: 'object', properties: { nodeIds: { type: 'array', maxItems: 500, items: ID } } },
    execute: (input: { nodeIds?: string[] }, ctx) => {
      getActiveFlowOrThrow()
      const arrange = useAutoArrange({ getDimensions: ctx.env.dimensions })
      let n: number
      if (input.nodeIds?.length) {
        for (const id of input.nodeIds) getNodeOrThrow(id)
        useUIStore().selectNodes(input.nodeIds)
        n = arrange.arrange('selection')
      } else {
        n = arrange.arrange('all')
      }
      ctx.env.frame?.(input.nodeIds)
      return { arranged: n }
    },
  },
  {
    name: 'latch_connect',
    title: 'Wire two ports',
    description: 'Wires an output to an input ("nodeId:port" each). Fails with a reason if a node or port doesn\'t exist or the types don\'t match. An input that already has a wire is refused unless replace is true. One undo step.',
    tier: 'edit',
    inputSchema: {
      type: 'object',
      properties: { from: { type: 'string', maxLength: 140 }, to: { type: 'string', maxLength: 140 }, replace: { type: 'boolean', default: false } },
      required: ['from', 'to'],
    },
    execute: (input: { from: string; to: string; replace?: boolean }) => {
      const flow = getActiveFlowOrThrow()
      const c = checkConnection(input.from, input.to, flow.nodes.map((n) => ({ id: n.id, data: n.data as Record<string, unknown> })))
      const dst = getNodeOrThrow(c.target)
      assertSecretStaysHome(getDefOrThrow(nodeType(dst)), dst.data as Record<string, unknown>, c.targetHandle, c.target)
      const existing = flow.edges.filter((e) => e.target === c.target && e.targetHandle === c.targetHandle)
      if (existing.some((e) => e.source === c.source && e.sourceHandle === c.sourceHandle)) return { edgeId: existing.find((e) => e.source === c.source)!.id, note: 'Already wired.' }
      if (existing.length && !c.targetPort.multiple && !input.replace) {
        throw new ToolError(`Input ${input.to} already has a wire from ${existing[0].source}:${existing[0].sourceHandle}. Pass replace:true to swap it.`)
      }
      const flows = useFlowsStore()
      const edge = useFlowHistory().withHistory('Agent: Connect', () => {
        if (existing.length && !c.targetPort.multiple) flows.removeEdges(existing.map((e) => e.id))
        return flows.addEdge(c.source, c.sourceHandle, c.target, c.targetHandle)
      })
      return { edgeId: edge?.id ?? null, ...(existing.length && !c.targetPort.multiple ? { replaced: existing.map((e) => e.id) } : {}) }
    },
  },
  {
    name: 'latch_disconnect',
    title: 'Remove wires',
    description: 'Removes wires by edge id, or every wire into an input ("to") or between two ports ("from" and "to"). One undo step.',
    tier: 'edit',
    inputSchema: {
      type: 'object',
      properties: { edgeIds: { type: 'array', maxItems: 100, items: ID }, from: { type: 'string', maxLength: 140 }, to: { type: 'string', maxLength: 140 } },
    },
    execute: (input: { edgeIds?: string[]; from?: string; to?: string }) => {
      const flow = getActiveFlowOrThrow()
      let ids: string[] = []
      if (input.edgeIds?.length) {
        for (const id of input.edgeIds) if (!flow.edges.some((e) => e.id === id)) throw new ToolError(`No wire "${id}".`)
        ids = input.edgeIds
      } else if (input.to || input.from) {
        const a = input.from ? parseEndpoint(input.from) : null
        const b = input.to ? parseEndpoint(input.to) : null
        ids = flow.edges
          .filter((e) => (!a || (e.source === a.node && e.sourceHandle === a.port)) && (!b || (e.target === b.node && e.targetHandle === b.port)))
          .map((e) => e.id)
      } else {
        throw new ToolError('Give edgeIds, or from and/or to.')
      }
      if (ids.length === 0) return { removed: 0 }
      useFlowHistory().withHistory('Agent: Disconnect', () => useFlowsStore().removeEdges(ids))
      return { removed: ids.length }
    },
  },
  {
    name: 'latch_set_controls',
    title: 'Set control values',
    description: 'Sets control values on one node. Numbers are snapped to the control\'s step and clamped to its range (reported as clamped); unknown controls and bad values are rejected without changing anything. One undo step.',
    tier: 'edit',
    inputSchema: { type: 'object', properties: { nodeId: ID, values: CONTROLS }, required: ['nodeId', 'values'] },
    execute: (input: { nodeId: string; values: Record<string, unknown> }) => {
      const node = getNodeOrThrow(input.nodeId)
      const data = node.data as Record<string, unknown>
      const def = getDefOrThrow(nodeType(node))
      for (const id of Object.keys(input.values)) assertSecretStaysHome(def, data, id, node.id)
      const report = strictControls(def, data, input.values, def.name)
      const codeKey = codeKeyFor(def.id)
      const touchesCode = !!codeKey && codeKey in report.applied
      useFlowHistory().withHistory(`Agent: Set ${def.name} controls`, () => {
        // Writing a code node's source would otherwise re-enable it (flows.updateNodeData treats a
        // source edit as the person having read it). An agent edit must leave it disabled.
        const patch = touchesCode ? { ...report.applied, [CODE_DISABLED_KEY]: true } : { ...report.applied }
        // New shader code (or switching to the custom preset) re-derives its uniform ports.
        if ('code' in patch || 'preset' in patch) Object.assign(patch, shaderPortsFor(def.id, { ...data, ...patch }))
        useFlowsStore().updateNodeData(node.id, patch)
      })
      const controls = effectiveControls(def, data)
      const secret = Object.keys(report.applied).filter((id) => { const c = controls.find((x) => x.id === id); return c && isSecretControl(c) })
      return {
        applied: Object.fromEntries(Object.entries(report.applied).map(([k, v]) => [k, secret.includes(k) ? '(set)' : v])),
        ...(report.clamped.length ? { clamped: report.clamped } : {}),
        ...(touchesCode ? { note: CODE_NOTE } : {}),
      }
    },
  },
  {
    name: 'latch_rename_node',
    title: 'Rename a node',
    description: 'Changes a node\'s label on the canvas. One undo step.',
    tier: 'edit',
    inputSchema: { type: 'object', properties: { nodeId: ID, label: { type: 'string', minLength: 1, maxLength: 80 } }, required: ['nodeId', 'label'] },
    execute: (input: { nodeId: string; label: string }) => {
      getNodeOrThrow(input.nodeId)
      useFlowHistory().withHistory('Agent: Rename node', () => useFlowsStore().updateNodeData(input.nodeId, { label: input.label }))
      return { ok: true }
    },
  },
  {
    name: 'latch_select_nodes',
    title: 'Select nodes',
    description: 'Selects nodes on the canvas and frames them, to show the person what you changed. Doesn\'t change the flow.',
    tier: 'read',
    inputSchema: { type: 'object', properties: { nodeIds: { type: 'array', maxItems: 200, items: ID } }, required: ['nodeIds'] },
    execute: (input: { nodeIds: string[] }, ctx) => {
      for (const id of input.nodeIds) getNodeOrThrow(id)
      const ui = useUIStore()
      ui.selectNodes(input.nodeIds)
      if (input.nodeIds.length === 1) ui.setInspectedNode(input.nodeIds[0])
      ctx.env.frame?.(input.nodeIds)
      return { selected: input.nodeIds.length }
    },
  },
  {
    name: 'latch_undo',
    title: 'Undo',
    description: 'Undoes the last change to the open flow (yours or the person\'s).',
    tier: 'edit',
    inputSchema: { type: 'object', properties: {} },
    execute: () => {
      const h = useFlowHistory()
      const what = h.undoDescription.value
      if (!h.undo()) throw new ToolError('Nothing to undo.')
      return { undid: what }
    },
  },
  {
    name: 'latch_redo',
    title: 'Redo',
    description: 'Redoes the last undone change to the open flow.',
    tier: 'edit',
    inputSchema: { type: 'object', properties: {} },
    execute: () => {
      const h = useFlowHistory()
      const what = h.redoDescription.value
      if (!h.redo()) throw new ToolError('Nothing to redo.')
      return { redid: what }
    },
  },
  {
    name: 'latch_set_transport',
    title: 'Play, pause or stop',
    description: 'Plays, pauses or stops the open flow, then reports the runtime state. Playing runs everything in the flow, including camera, microphone, network and hardware nodes.',
    tier: 'run',
    inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['play', 'pause', 'stop'] } }, required: ['state'] },
    execute: async (input: { state: 'play' | 'pause' | 'stop' }, ctx) => {
      const exec = ctx.env.execution
      if (!exec) throw new ToolError('The LATCH editor is not ready.')
      const runtime = useRuntimeStore()
      if (input.state === 'stop') exec.stop()
      else if (input.state === 'pause') { if (runtime.isRunning) exec.pause() }
      else if (runtime.isPaused) exec.resume()
      else if (runtime.isStopped) {
        getActiveFlowOrThrow()
        // start() first unlocks audio, which waits for a click if the page has never had one. Don't
        // leave a start pending that would fire on some later click: report and let the agent retry.
        const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
        if (activation && !activation.hasBeenActive) {
          return { status: 'waiting', note: 'Browsers only allow sound after the person has clicked the page. Ask them to click anywhere on LATCH (or press Play), then call this again.' }
        }
        const started = Promise.resolve(exec.start())
        await Promise.race([started, new Promise((r) => setTimeout(r, 1500))])
        if (runtime.isStopped) {
          return { status: 'waiting', note: 'Playback will start once the person clicks anywhere on the LATCH page (browsers only allow sound after a click). Ask them to click.' }
        }
      }
      await new Promise((r) => setTimeout(r, 120))
      return { status: runtime.status, fps: Math.round(runtime.fps), errorCount: runtime.errors.length }
    },
  },
]

/** Restore the open flow to before agents first changed it, as one undoable step. */
export function revertAgentChanges(): boolean {
  const flows = useFlowsStore()
  const flow = flows.activeFlow
  if (!flow) return false
  const snap = useAgentStore().takeCheckpoint(flow.id)
  if (!snap) return false
  useFlowHistory().withHistory('Revert agent changes', () => {
    flow.nodes = JSON.parse(JSON.stringify(snap.nodes))
    flow.edges = JSON.parse(JSON.stringify(snap.edges))
    flows.markDirty()
  })
  return true
}
