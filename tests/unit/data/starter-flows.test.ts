import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
// Load the SFC component map before '@/registry' (circular-init hazard under happy-dom;
// see nodeRegistry.test.ts).
import '@/registry/components'
import { allNodes } from '@/registry'
import { flowSnippets, STARTER_FLOW_IDS, type FlowSnippet } from '@/data/flow-snippets'
import { migrateToExport, parseEndpoint } from '@/services/fileFormat'
import { areTypesCompatible, getPortType } from '@/utils/connections'
import type { DataType, NodeDefinition } from '@/stores/nodes'

/**
 * Drift guard for every starter flow the app ships (the flow snippets + the bundled
 * public/sample-flow.json demo). Insertion goes through `flowsStore.addEdge`, which does
 * NOT validate ports — a renamed port id or a retyped port silently leaves a dangling,
 * dead wire in a "working" starter. This pins every node type, every edge handle and every
 * edge's type compatibility (using the app's own connection-compatibility rules) against
 * the LIVE node definitions, so a node refactor that breaks a starter fails here.
 */

const defs = new Map((allNodes as NodeDefinition[]).map((d) => [d.id, d]))
const getDef = (t: string) => defs.get(t)

interface FlatNode { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }
interface FlatEdge { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }
interface FlatFlow { name: string; nodes: FlatNode[]; edges: FlatEdge[] }

function fromSnippet(s: FlowSnippet): FlatFlow {
  return { name: `snippet:${s.id}`, nodes: s.nodes, edges: s.edges }
}

// Read the sample flow through the SAME migration path the app's import uses.
function sampleFlows(): FlatFlow[] {
  const raw = JSON.parse(readFileSync('public/sample-flow.json', 'utf-8'))
  return migrateToExport(raw).exportedFlows.map((doc) => ({
    name: `sample-flow:${doc.flow.name}`,
    nodes: doc.flow.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: { x: doc.layout.nodes[n.id]?.x ?? 0, y: doc.layout.nodes[n.id]?.y ?? 0 },
      data: n.controls ?? {},
    })),
    edges: doc.flow.edges.map((e) => {
      const f = parseEndpoint(e.from)
      const t = parseEndpoint(e.to)
      return { id: e.id, source: f.node, sourceHandle: f.port, target: t.node, targetHandle: t.port }
    }),
  }))
}

/** Every structural problem in one flow, as human-readable strings (empty = clean). */
function problems(flow: FlatFlow): string[] {
  const out: string[] = []
  const byId = new Map<string, FlatNode>()
  for (const n of flow.nodes) {
    if (byId.has(n.id)) out.push(`duplicate node id ${n.id}`)
    byId.set(n.id, n)
    if (!getDef(n.type)) out.push(`node ${n.id}: unregistered type "${n.type}"`)
  }
  const edgeIds = new Set<string>()
  const wired = new Set<string>()
  for (const e of flow.edges) {
    if (edgeIds.has(e.id)) out.push(`duplicate edge id ${e.id}`)
    edgeIds.add(e.id)
    const key = `${e.source}.${e.sourceHandle}->${e.target}.${e.targetHandle}`
    if (wired.has(key)) out.push(`duplicate edge ${key}`)
    wired.add(key)
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (!s || !t) { out.push(`edge ${e.id}: missing endpoint node`); continue }
    if (e.source === e.target) out.push(`edge ${e.id}: self-loop`)
    const sDef = getDef(s.type)
    const tDef = getDef(t.type)
    if (!sDef || !tDef) continue
    const sType = getPortType(sDef, e.sourceHandle, 'output', s.data)
    // A custom-GLSL Shader declares its uniform ports in data._dynamicInputs (what the shader
    // editor writes), so those count as real inputs.
    const dynIn = (t.data._dynamicInputs as Array<{ id: string; type: string }> | undefined)?.find((p) => p.id === e.targetHandle)
    const tType = getPortType(tDef, e.targetHandle, 'input', t.data) ?? (dynIn?.type as DataType | undefined)
    if (!sType) out.push(`edge ${e.id}: ${s.type} has no output "${e.sourceHandle}" (has ${sDef.outputs.map((p) => p.id).join(', ')})`)
    if (!tType) out.push(`edge ${e.id}: ${t.type} has no input "${e.targetHandle}" (has ${tDef.inputs.map((p) => p.id).join(', ')})`)
    if (sType && tType && !areTypesCompatible(sType as DataType, tType as DataType)) {
      out.push(`edge ${e.id}: ${s.type}.${e.sourceHandle} (${sType}) -> ${t.type}.${e.targetHandle} (${tType}) incompatible`)
    }
  }
  return out
}

/** Control values a starter sets must be real controls, and select values real options. */
function controlProblems(flow: FlatFlow): string[] {
  const out: string[] = []
  const meta = new Set(['nodeType', 'label', 'definition'])
  for (const n of flow.nodes) {
    const def = getDef(n.type)
    if (!def) continue
    for (const [key, value] of Object.entries(n.data)) {
      if (meta.has(key) || key.startsWith('_')) continue
      const control = def.controls.find((c) => c.id === key)
      if (!control) { out.push(`${n.type}.${key}: not a control`); continue }
      const options = (control.props as { options?: Array<string | { value: unknown }> } | undefined)?.options
      if (control.type === 'select' && Array.isArray(options) && options.length > 0) {
        const values = options.map((o) => (typeof o === 'object' && o !== null ? o.value : o))
        if (!values.includes(value)) out.push(`${n.type}.${key}=${JSON.stringify(value)}: not one of ${JSON.stringify(values)}`)
      }
      const props = control.props as { min?: number; max?: number } | undefined
      if (typeof value === 'number' && props) {
        if (props.min !== undefined && value < props.min) out.push(`${n.type}.${key}=${value} < min ${props.min}`)
        if (props.max !== undefined && value > props.max) out.push(`${n.type}.${key}=${value} > max ${props.max}`)
      }
    }
  }
  return out
}

// Approximate on-canvas footprint of a node (BaseNode default width; height scales with
// the number of port rows). Generous enough to catch nodes dropped on top of each other.
const NODE_W = 200
function overlapProblems(flow: FlatFlow): string[] {
  const out: string[] = []
  const box = (n: FlatNode) => {
    const def = getDef(n.type)
    const rows = Math.max(def?.inputs.length ?? 1, def?.outputs.length ?? 1)
    return { x: n.position.x, y: n.position.y, w: NODE_W, h: 60 + rows * 18 }
  }
  for (let i = 0; i < flow.nodes.length; i++) {
    for (let j = i + 1; j < flow.nodes.length; j++) {
      const a = box(flow.nodes[i])
      const b = box(flow.nodes[j])
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        out.push(`${flow.nodes[i].id} (${flow.nodes[i].type}) overlaps ${flow.nodes[j].id} (${flow.nodes[j].type})`)
      }
    }
  }
  return out
}

const all: FlatFlow[] = [...flowSnippets.map(fromSnippet), ...sampleFlows()]

describe('starter flows — structural drift guard', () => {
  it('ships a meaningful set of starters', () => {
    expect(flowSnippets.length).toBeGreaterThanOrEqual(15)
  })

  it('snippet ids are unique', () => {
    const ids = flowSnippets.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(all.map((f) => [f.name, f] as const))('%s: types registered, handles exist, port types compatible', (_name, flow) => {
    expect(problems(flow)).toEqual([])
  })

  it.each(flowSnippets.map((s) => [s.id, fromSnippet(s)] as const))('%s: control values are valid', (_name, flow) => {
    expect(controlProblems(flow)).toEqual([])
  })

  it.each(flowSnippets.map((s) => [s.id, fromSnippet(s)] as const))('%s: nodes do not overlap', (_name, flow) => {
    expect(overlapProblems(flow)).toEqual([])
  })

  it.each(flowSnippets.map((s) => [s.id, s] as const))('%s: metadata is complete and consistent', (_id, s) => {
    expect(s.name.length).toBeGreaterThan(0)
    expect(s.description.length).toBeGreaterThan(10)
    // Every node is wired into the flow (no orphan dropped in by mistake).
    for (const n of s.nodes) {
      expect(s.edges.some((e) => e.source === n.id || e.target === n.id), `${s.id}: ${n.id} is unwired`).toBe(true)
    }
    // relatedNodes drives the node-explorer "used in snippets" list — keep it truthful.
    const types = new Set(s.nodes.map((n) => n.type))
    for (const r of s.relatedNodes) expect(types.has(r), `${s.id}: relatedNodes lists absent ${r}`).toBe(true)
    // Flows that touch a camera/mic/hardware/network must say so on their card.
    const needs = (t: string) => types.has(t)
    if (needs('webcam')) expect(s.requires).toContain('camera')
    if (needs('audio-input')) expect(s.requires).toContain('microphone')
    if (['midi-input', 'midi-output', 'ble-device', 'serial'].some(needs)) expect(s.requires).toContain('hardware')
    if (['mqtt', 'websocket', 'http-request', 'clasp-connection'].some(needs)) expect(s.requires).toContain('network')
  })

  it('every curated empty-canvas starter id resolves to a snippet', () => {
    expect(STARTER_FLOW_IDS.length).toBeGreaterThanOrEqual(4)
    expect(STARTER_FLOW_IDS.length).toBeLessThanOrEqual(6)
    for (const id of STARTER_FLOW_IDS) expect(flowSnippets.some((s) => s.id === id), id).toBe(true)
  })
})

describe('the guard itself', () => {
  it('flags a stale port id, an unknown type and an incompatible wire', () => {
    const bad: FlatFlow = {
      name: 'bad',
      nodes: [
        { id: 'a', type: 'lfo', position: { x: 0, y: 0 }, data: {} },
        { id: 'b', type: 'main-output', position: { x: 400, y: 0 }, data: {} },
        { id: 'c', type: 'definitely-not-a-node', position: { x: 800, y: 0 }, data: {} },
      ],
      edges: [
        { id: 'e1', source: 'a', sourceHandle: 'nope', target: 'b', targetHandle: 'texture' },
        { id: 'e2', source: 'a', sourceHandle: 'value', target: 'b', targetHandle: 'texture' },
      ],
    }
    const p = problems(bad)
    expect(p.some((m) => m.includes('unregistered type'))).toBe(true)
    expect(p.some((m) => m.includes('no output "nope"'))).toBe(true)
    expect(p.some((m) => m.includes('incompatible'))).toBe(true)
  })
})
