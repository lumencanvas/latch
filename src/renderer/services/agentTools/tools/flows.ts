import { useFlowsStore } from '@/stores/flows'
import { usePersistence } from '@/composables/usePersistence'
import { useFlowLibrary } from '@/composables/useFlowLibrary'
import { ToolError, type AgentTool } from '../types'
import { redactDocSecrets } from '../helpers'

const ID = { type: 'string' as const, maxLength: 64 }
const MAX_IMPORT = 2 * 1024 * 1024

function flowOrThrow(id: string) {
  const flow = useFlowsStore().getFlowById(id)
  if (!flow || flow.isSubflow) throw new ToolError(`No flow "${id}". See latch_list_flows.`)
  return flow
}

export const flowTools: AgentTool<never>[] = [
  {
    name: 'latch_create_flow',
    title: 'Create a flow',
    description: 'Creates a new empty flow in a new tab and switches to it. Other tools then act on it.',
    tier: 'edit',
    touchesGraph: false,
    inputSchema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 80 } }, required: ['name'] },
    execute: async (input: { name: string }) => {
      const flow = useFlowsStore().createFlow(input.name.trim() || 'Untitled Flow')
      await usePersistence().saveFlow(flow.id)
      return { flowId: flow.id, name: flow.name }
    },
  },
  {
    name: 'latch_open_flow',
    title: 'Open a flow',
    description: 'Opens a flow from the library as the active tab (the person sees the switch). Other tools then act on it.',
    tier: 'edit',
    touchesGraph: false,
    inputSchema: { type: 'object', properties: { flowId: ID }, required: ['flowId'] },
    execute: async (input: { flowId: string }) => {
      const flow = flowOrThrow(input.flowId)
      await useFlowLibrary().openFlow(flow.id)
      return { flowId: flow.id, name: flow.name, nodeCount: flow.nodes.length }
    },
  },
  {
    name: 'latch_rename_flow',
    title: 'Rename a flow',
    description: 'Renames a flow in the library (open or closed).',
    tier: 'edit',
    touchesGraph: false,
    inputSchema: { type: 'object', properties: { flowId: ID, name: { type: 'string', minLength: 1, maxLength: 80 } }, required: ['flowId', 'name'] },
    execute: async (input: { flowId: string; name: string }) => {
      flowOrThrow(input.flowId)
      await useFlowLibrary().renameFlow(input.flowId, input.name)
      return { ok: true }
    },
  },
  {
    name: 'latch_duplicate_flow',
    title: 'Duplicate a flow',
    description: 'Copies a flow into a new tab and switches to the copy, so you can change it without touching the original.',
    tier: 'edit',
    touchesGraph: false,
    inputSchema: { type: 'object', properties: { flowId: ID }, required: ['flowId'] },
    execute: async (input: { flowId: string }) => {
      flowOrThrow(input.flowId)
      await useFlowLibrary().duplicateFlow(input.flowId)
      const active = useFlowsStore().activeFlow
      return { flowId: active?.id ?? null, name: active?.name ?? null }
    },
  },
  {
    name: 'latch_close_flow',
    title: 'Close a flow tab',
    description: 'Closes a flow\'s tab. The flow stays in the library and can be opened again; nothing is deleted.',
    tier: 'edit',
    touchesGraph: false,
    inputSchema: { type: 'object', properties: { flowId: ID }, required: ['flowId'] },
    execute: async (input: { flowId: string }) => {
      flowOrThrow(input.flowId)
      await useFlowLibrary().closeFlow(input.flowId)
      return { activeFlowId: useFlowsStore().activeFlowId }
    },
  },
  {
    name: 'latch_export_flow',
    title: 'Export a flow as JSON',
    description: 'Returns a flow (default: the open one) as LATCH file-format JSON, the same as Export. Secrets are masked.',
    tier: 'read',
    untrustedOutput: true,
    inputSchema: { type: 'object', properties: { flowId: ID } },
    execute: (input: { flowId?: string }) => {
      const flows = useFlowsStore()
      const id = input.flowId ?? flows.activeFlowId
      if (!id) throw new ToolError('No flow is open.')
      flowOrThrow(id)
      const doc = JSON.parse(flows.exportFlow(id))
      redactDocSecrets(doc)
      return { content: [{ type: 'text', text: JSON.stringify(doc) }] }
    },
  },
  {
    name: 'latch_import_flow',
    title: 'Import flow JSON',
    description: 'Opens LATCH file-format JSON as new flow tab(s), the same as Paste. The person is asked first. Code nodes in it arrive disabled until the person enables them. Never replaces existing flows.',
    tier: 'consequential',
    inputSchema: { type: 'object', properties: { json: { type: 'string', minLength: 2, maxLength: MAX_IMPORT } }, required: ['json'] },
    execute: async (input: { json: string }) => {
      const flows = useFlowsStore()
      const before = new Set(flows.flows.map((f) => f.id))
      const ok = await useFlowLibrary().importText(input.json, { untrusted: true })
      if (!ok) throw new ToolError('Not imported: the JSON isn\'t a valid LATCH flow file.')
      const added = flows.flows.filter((f) => !before.has(f.id)).map((f) => ({ id: f.id, name: f.name, nodeCount: f.nodes.length }))
      return { imported: added, activeFlowId: flows.activeFlowId }
    },
  },
]
