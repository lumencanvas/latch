import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
// Load the SFC component map before '@/registry' (circular-init hazard under happy-dom).
import '@/registry/components'
import { initializeNodeRegistry } from '@/registry'
import { useFlowsStore } from '@/stores/flows'
import { useHistoryStore } from '@/stores/history'
import { useAgentStore } from '@/stores/agent'
import { getAgentToolRegistry, setAgentConsentResolver, annotationsFor, revertAgentChanges } from '@/services/agentTools'
import { validateSchema } from '@/services/agentTools/schema'
import { coerceControlValue, snapClamp } from '@/utils/controlValue'
import { REDACTED_SECRET } from '@/services/connections/redactSecrets'
import { CODE_DISABLED_KEY } from '@/services/security/flowTrust'
import type { ToolResult } from '@/services/agentTools/types'

const reg = getAgentToolRegistry()

async function call(name: string, input: unknown = {}) {
  return reg.invoke(name, input, { transport: 'test' })
}
function json(r: ToolResult): Record<string, unknown> {
  const t = r.content.find((c) => c.type === 'text') as { text: string } | undefined
  return JSON.parse(t?.text ?? 'null')
}
function text(r: ToolResult): string {
  return (r.content[0] as { text: string }).text
}

beforeAll(() => {
  setActivePinia(createPinia())
  initializeNodeRegistry()
})

beforeEach(() => {
  // Keep the node registry (in the nodes store) but reset everything else.
  const flows = useFlowsStore()
  flows.flows = []
  flows.createFlow('Agent test')
  useHistoryStore().$reset?.()
  const agent = useAgentStore()
  agent.setMode('edit')
  agent.endSession()
  agent.audit = []
  setAgentConsentResolver(async () => 'once')
})

afterEach(() => setAgentConsentResolver(null))

describe('agent tool manifest (contract)', () => {
  it('names, descriptions, schemas and annotations follow the rules', () => {
    const tools = reg.list()
    expect(tools.length).toBeGreaterThanOrEqual(30)
    for (const t of tools) {
      expect(t.name).toMatch(/^latch_[a-z_]{3,60}$/)
      expect(t.description.length).toBeGreaterThan(20)
      expect(t.description.length).toBeLessThanOrEqual(400)
      expect(t.inputSchema.type).toBe('object')
      expect(t.inputSchema.additionalProperties).not.toBe(true)
      const a = annotationsFor(t)
      expect(a.readOnlyHint).toBe(t.tier === 'read' || t.tier === 'sensitive-read')
      expect(a.consequentialHint).toBe(t.tier === 'run' || t.tier === 'consequential')
    }
    // No tool may delete flows, enable code, or touch credentials.
    const names = tools.map((t) => t.name)
    for (const banned of ['latch_delete_flow', 'latch_enable_code', 'latch_eval']) expect(names).not.toContain(banned)
  })
})

describe('schema validator', () => {
  const schema = { type: 'object' as const, properties: { n: { type: 'integer' as const, minimum: 1, maximum: 5 }, s: { type: 'string' as const, maxLength: 3 } }, required: ['n'] }
  it('reports the path of the first problem', () => {
    expect(validateSchema(schema, { n: 2 })).toBeNull()
    expect(validateSchema(schema, {})).toBe('input.n: required')
    expect(validateSchema(schema, { n: 9 })).toBe('input.n: expected a number ≤ 5')
    expect(validateSchema(schema, { n: 1.5 })).toBe('input.n: expected an integer')
    expect(validateSchema(schema, { n: 1, s: 'long' })).toBe('input.s: at most 3 characters')
    expect(validateSchema(schema, { n: 1, x: 1 })).toMatch(/input\.x: unknown property/)
  })
})

describe('control values', () => {
  it('snaps and clamps numbers like the control UI', () => {
    expect(snapClamp({ props: { step: 0.01, min: 0, max: 1 } }, 0.12345)).toBe(0.12)
    expect(snapClamp({ props: { min: 0, max: 1, step: 0.1 } }, 7)).toBe(1)
    expect(coerceControlValue({ id: 'p', type: 'slider', label: 'p', props: { min: 0, max: 1, step: 0.01 } }, 3)).toEqual({ ok: true, value: 1, clamped: true })
  })
  it('checks select options and colours', () => {
    const sel = { id: 'w', type: 'select', label: 'w', props: { options: ['sine', { value: 'square', label: 'Square' }] } }
    expect(coerceControlValue(sel, 'square')).toEqual({ ok: true, value: 'square' })
    expect(coerceControlValue(sel, 'saw').ok).toBe(false)
    expect(coerceControlValue({ id: 'c', type: 'color', label: 'c' }, 'red').ok).toBe(false)
  })
})

describe('agent tools', () => {
  it('builds a graph in one undo step, with strict wiring', async () => {
    const r = await call('latch_build_graph', {
      nodes: [
        { ref: 'lfo', type: 'lfo', controls: { frequency: 0.5, waveform: 'triangle' } },
        { ref: 'map', type: 'map-range' },
        { ref: 'mon', type: 'monitor' },
      ],
      edges: [{ from: 'lfo:value', to: 'map:value' }, { from: 'map:result', to: 'mon:value' }],
    })
    expect(r.isError).toBeFalsy()
    const out = json(r) as { nodeIds: Record<string, string>; edgeCount: number }
    expect(out.edgeCount).toBe(2)
    const flow = useFlowsStore().activeFlow!
    expect(flow.nodes).toHaveLength(3)
    const lfo = flow.nodes.find((n) => n.id === out.nodeIds.lfo)!
    expect((lfo.data as Record<string, unknown>).frequency).toBe(0.5)
    expect((lfo.data as Record<string, unknown>).definition).toBeTruthy()
    expect(useHistoryStore().undoStacks.get(flow.id)).toHaveLength(1)

    await call('latch_undo')
    expect(useFlowsStore().activeFlow!.nodes).toHaveLength(0)
  })

  it('rejects the whole build when one wire is wrong', async () => {
    const r = await call('latch_build_graph', {
      nodes: [{ ref: 'lfo', type: 'lfo' }, { ref: 'out', type: 'main-output' }],
      edges: [{ from: 'lfo:value', to: 'out:texture' }],
    })
    expect(r.isError).toBe(true)
    expect(text(r)).toMatch(/Cannot wire Number/)
    expect(useFlowsStore().activeFlow!.nodes).toHaveLength(0)

    const bad = await call('latch_build_graph', { nodes: [{ ref: 'a', type: 'lfo' }], edges: [{ from: 'a:nope', to: 'a:frequency' }] })
    expect(text(bad)).toMatch(/cannot be wired to itself|has no output "nope"/)
  })

  it('rejects unknown controls and bad options instead of dropping them', async () => {
    const r = await call('latch_add_node', { type: 'lfo', controls: { frequncy: 2 } })
    expect(r.isError).toBe(true)
    expect(text(r)).toMatch(/frequncy: not a control of LFO/)
    const add = json(await call('latch_add_node', { type: 'lfo' })) as { nodeId: string }
    const set = await call('latch_set_controls', { nodeId: add.nodeId, values: { phase: 4 } })
    expect(json(set)).toMatchObject({ applied: { phase: 1 }, clamped: [{ id: 'phase', requested: 4, applied: 1 }] })
    expect((await call('latch_set_controls', { nodeId: add.nodeId, values: { waveform: 'noise' } })).isError).toBe(true)
  })

  it('refuses a second wire into a single input unless replace is set', async () => {
    const ids = (json(await call('latch_build_graph', {
      nodes: [{ ref: 'a', type: 'lfo' }, { ref: 'b', type: 'lfo' }, { ref: 'm', type: 'map-range' }],
      edges: [{ from: 'a:value', to: 'm:value' }],
    })) as { nodeIds: Record<string, string> }).nodeIds
    const second = await call('latch_connect', { from: `${ids.b}:value`, to: `${ids.m}:value` })
    expect(second.isError).toBe(true)
    const replaced = await call('latch_connect', { from: `${ids.b}:value`, to: `${ids.m}:value`, replace: true })
    expect(replaced.isError).toBeFalsy()
    const edges = useFlowsStore().activeFlow!.edges.filter((e) => e.target === ids.m)
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe(ids.b)
  })

  it('keeps code nodes disabled, even after the agent edits their code', async () => {
    const { nodeId } = json(await call('latch_add_node', { type: 'function' })) as { nodeId: string }
    const node = () => useFlowsStore().activeFlow!.nodes.find((n) => n.id === nodeId)!.data as Record<string, unknown>
    expect(node()[CODE_DISABLED_KEY]).toBe(true)
    const r = await call('latch_set_controls', { nodeId, values: { code: 'return { result: 1 }' } })
    expect(r.isError).toBeFalsy()
    expect(node().code).toBe('return { result: 1 }')
    expect(node()[CODE_DISABLED_KEY]).toBe(true)
  })

  it('masks secrets in every read', async () => {
    const { nodeId } = json(await call('latch_add_node', { type: 'clasp-connection', controls: { token: 'cpsk_supersecret' } })) as { nodeId: string }
    for (const r of [await call('latch_get_flow'), await call('latch_get_node', { nodeId }), await call('latch_export_flow')]) {
      expect(text(r)).not.toContain('cpsk_supersecret')
      expect(text(r)).toContain(REDACTED_SECRET)
    }
  })

  it('gates tools by mode and consent (default deny)', async () => {
    const agent = useAgentStore()
    agent.setMode('off')
    expect(text(await call('latch_get_flow'))).toMatch(/Agent access is off/)
    agent.setMode('read')
    expect((await call('latch_get_flow')).isError).toBeFalsy()
    expect(text(await call('latch_add_node', { type: 'lfo' }))).toMatch(/read-only/)

    agent.setMode('ask')
    setAgentConsentResolver(null) // nothing mounted: deny
    expect(text(await call('latch_add_node', { type: 'lfo' }))).toMatch(/declined/)
    setAgentConsentResolver(async () => 'session')
    expect((await call('latch_add_node', { type: 'lfo' })).isError).toBeFalsy()
    setAgentConsentResolver(null)
    // The session grant covers later edits without asking again.
    expect((await call('latch_add_node', { type: 'lfo' })).isError).toBeFalsy()
    expect(agent.audit.length).toBeGreaterThan(3)
  })

  it('pausing blocks every call', async () => {
    useAgentStore().setPaused(true)
    expect(text(await call('latch_get_flow'))).toMatch(/Paused/)
  })

  it('reverts all agent changes to a flow as one undoable step', async () => {
    const flows = useFlowsStore()
    flows.addNode('lfo', { x: 0, y: 0 }, { label: 'mine' })
    await call('latch_add_node', { type: 'monitor' })
    await call('latch_add_node', { type: 'constant' })
    expect(flows.activeFlow!.nodes).toHaveLength(3)
    expect(revertAgentChanges()).toBe(true)
    expect(flows.activeFlow!.nodes.map((n) => (n.data as Record<string, unknown>).label)).toEqual(['mine'])
    expect(useAgentStore().hasCheckpoint(flows.activeFlowId)).toBe(false)
  })

  it('validates and searches without changing anything', async () => {
    const s = json(await call('latch_search_node_types', { query: 'lfo', limit: 3 })) as { results: Array<{ type: string }> }
    expect(s.results.map((r) => r.type)).toContain('lfo')
    const t = json(await call('latch_get_node_type', { type: 'lfo' })) as { controls: Array<{ id: string; options?: unknown[] }> }
    expect(t.controls.find((c) => c.id === 'waveform')?.options).toContain('sine')
    await call('latch_add_node', { type: 'map-range' })
    const v = json(await call('latch_validate_flow')) as { problems: Array<{ kind: string }> }
    expect(v.problems.some((p) => p.kind === 'required-input')).toBe(true)
    expect(json(await call('latch_get_guide'))).toHaveProperty('typeCompatibility')
  })

  it('returns errors, never throws, for unknown tools and bad input', async () => {
    expect((await call('latch_nope')).isError).toBe(true)
    expect(text(await call('latch_get_node', {}))).toBe('input.nodeId: required')
    expect(text(await call('latch_get_node', { nodeId: 'missing' }))).toMatch(/No node "missing"/)
  })
})
