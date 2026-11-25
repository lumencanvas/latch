import type { Node } from '@vue-flow/core'
import * as THREE from 'three'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore, dataTypeMeta, type ControlDefinition, type DataType, type NodeDefinition, type PortDefinition } from '@/stores/nodes'
import { useRuntimeStore } from '@/stores/runtime'
import { areTypesCompatible, getPortType } from '@/utils/connections'
import { parseEndpoint } from '@/services/fileFormat'
import { REDACTED_SECRET } from '@/services/connections/redactSecrets'
import { CODE_DISABLED_KEY, CODE_NODE_TYPES, isCodeNodeType } from '@/services/security/flowTrust'
import { ToolError } from './types'

/** Shared helpers for the agent tools: ports, secrets, value summaries, node creation. */

// Same rule as connection configs (redactSecrets.ts), applied to node controls: the CLASP
// Connection node keeps its `token` in node data.
const SECRET_ID_RE = /pass(word|phrase)|token|secret|api[-_]?key|private[-_]?key/i

export interface EffectivePort { id: string; type: DataType; label: string; multiple?: boolean; required?: boolean; dynamic?: boolean }

type DynPort = { id: string; type: string; label?: string }

/** A node's ports as the canvas draws them: its definition's plus the ones it made at runtime. */
export function effectivePorts(def: NodeDefinition | undefined, data: Record<string, unknown>): { inputs: EffectivePort[]; outputs: EffectivePort[] } {
  const fromDef = (p: PortDefinition): EffectivePort => ({ id: p.id, type: p.type, label: p.label, ...(p.multiple ? { multiple: true } : {}), ...(p.required ? { required: true } : {}) })
  const fromDyn = (p: DynPort): EffectivePort => ({ id: p.id, type: p.type as DataType, label: p.label ?? p.id, dynamic: true })
  const merge = (base: EffectivePort[], dyn: DynPort[] | undefined) => {
    const out = [...base]
    for (const p of dyn ?? []) if (p && typeof p.id === 'string' && !out.some((q) => q.id === p.id)) out.push(fromDyn(p))
    return out
  }
  return {
    inputs: merge((def?.inputs ?? []).map(fromDef), data._dynamicInputs as DynPort[] | undefined),
    outputs: merge((def?.outputs ?? []).map(fromDef), data._dynamicOutputs as DynPort[] | undefined),
  }
}

/** All controls a node has, including ones a shader made from its uniforms. */
export function effectiveControls(def: NodeDefinition | undefined, data: Record<string, unknown>): ControlDefinition[] {
  const out = [...(def?.controls ?? [])]
  for (const c of (data._dynamicControls as ControlDefinition[] | undefined) ?? []) {
    if (c && typeof c.id === 'string' && !out.some((d) => d.id === c.id)) out.push(c)
  }
  return out
}

export function isSecretControl(c: Pick<ControlDefinition, 'id' | 'props'>): boolean {
  return SECRET_ID_RE.test(c.id) || (c.props as { type?: string } | undefined)?.type === 'password'
}

/** Control values of a node, with secrets masked. Internal (`_`) keys are left out. */
export function nodeControlValues(def: NodeDefinition | undefined, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const c of effectiveControls(def, data)) {
    if (!(c.id in data)) continue
    const v = data[c.id]
    out[c.id] = isSecretControl(c) && v !== '' && v !== undefined && v !== null ? REDACTED_SECRET : v
  }
  return out
}

/** Mask secret-looking control values in a v2 document's node records, in place. */
export function redactDocSecrets(doc: { flow?: { nodes?: Array<{ type: string; controls?: Record<string, unknown> }> } }) {
  const getDef = useNodesStore().getDefinition
  for (const n of doc.flow?.nodes ?? []) {
    if (!n.controls) continue
    const def = getDef(n.type)
    for (const key of Object.keys(n.controls)) {
      const c = def?.controls.find((d) => d.id === key) ?? { id: key }
      if (isSecretControl(c) && n.controls[key] !== '' && n.controls[key] != null) n.controls[key] = REDACTED_SECRET
    }
  }
}

/** A node's data shaped the way the editor creates it (label + definition + nodeType). */
export function createNodeData(def: NodeDefinition, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const data: Record<string, unknown> = { label: def.name, nodeType: def.id, definition: def, ...extra }
  // Agents never get to run in-origin JavaScript: code nodes start disabled until the person
  // clicks "Enable code" on the node.
  if (isCodeNodeType(def.id)) data[CODE_DISABLED_KEY] = true
  return data
}

export function codeKeyFor(type: string): string | null {
  return isCodeNodeType(type) ? CODE_NODE_TYPES[type].codeKey : null
}

export function getActiveFlowOrThrow() {
  const flow = useFlowsStore().activeFlow
  if (!flow) throw new ToolError('No flow is open. Create one with latch_create_flow.')
  return flow
}

export function getNodeOrThrow(nodeId: string): Node {
  const flow = getActiveFlowOrThrow()
  const node = flow.nodes.find((n) => n.id === nodeId)
  if (!node) throw new ToolError(`No node "${nodeId}" in the open flow. Call latch_get_flow for node ids.`)
  return node as Node
}

export function nodeType(node: Node): string {
  return String((node.data as Record<string, unknown>)?.nodeType ?? '')
}

export function getDefOrThrow(type: string): NodeDefinition {
  const def = useNodesStore().getDefinition(type)
  if (!def) throw new ToolError(`Unknown node type "${type}". Use latch_search_node_types to find one.`)
  return def
}

/** A compact port list: "id (type)" plus extra flags. */
export function describePorts(ports: EffectivePort[]): Array<Record<string, unknown>> {
  return ports.map((p) => ({ id: p.id, type: p.type, label: p.label, ...(p.multiple ? { multiple: true } : {}), ...(p.required ? { required: true } : {}) }))
}

/** Check a wire the way an agent should be held to it: unknown nodes, ports and types are errors. */
export function checkConnection(from: string, to: string, nodes: Array<{ id: string; data: Record<string, unknown> }>): {
  source: string; sourceHandle: string; target: string; targetHandle: string; targetPort: EffectivePort
} {
  const getDef = useNodesStore().getDefinition
  const a = parseEndpoint(from)
  const b = parseEndpoint(to)
  if (!a.node || !a.port) throw new ToolError(`"${from}" is not a "nodeId:port" endpoint.`)
  if (!b.node || !b.port) throw new ToolError(`"${to}" is not a "nodeId:port" endpoint.`)
  if (a.node === b.node) throw new ToolError('A node cannot be wired to itself.')
  const src = nodes.find((n) => n.id === a.node)
  const dst = nodes.find((n) => n.id === b.node)
  if (!src) throw new ToolError(`No node "${a.node}".`)
  if (!dst) throw new ToolError(`No node "${b.node}".`)
  const srcType = String(src.data.nodeType)
  const dstType = String(dst.data.nodeType)
  const srcDef = getDef(srcType)
  const dstDef = getDef(dstType)
  if (!srcDef) throw new ToolError(`Node "${a.node}" has unknown type "${srcType}".`)
  if (!dstDef) throw new ToolError(`Node "${b.node}" has unknown type "${dstType}".`)
  const outs = effectivePorts(srcDef, src.data).outputs
  const ins = effectivePorts(dstDef, dst.data).inputs
  const out = outs.find((p) => p.id === a.port)
  const inp = ins.find((p) => p.id === b.port)
  if (!out) throw new ToolError(`${srcDef.name} (${a.node}) has no output "${a.port}". Outputs: ${outs.map((p) => `${p.id} (${p.type})`).join(', ') || 'none'}.`)
  if (!inp) throw new ToolError(`${dstDef.name} (${b.node}) has no input "${b.port}". Inputs: ${ins.map((p) => `${p.id} (${p.type})`).join(', ') || 'none'}.`)
  const outType = getPortType(srcDef, a.port, 'output', src.data) ?? out.type
  const inType = inp.type
  const triggerSpecial = srcDef.id === 'trigger' && inType === 'trigger'
  if (!triggerSpecial && !areTypesCompatible(outType, inType)) {
    const l = (t: DataType) => dataTypeMeta[t]?.label ?? t
    throw new ToolError(`Cannot wire ${l(outType)} (${from}) into ${l(inType)} (${to}). Put a converter between them; latch_suggest_nodes_for_port lists nodes that accept ${l(outType)}.`)
  }
  return { source: a.node, sourceHandle: a.port, target: b.node, targetHandle: b.port, targetPort: inp }
}

/** Summarise a runtime value for an agent: never raw textures, audio graphs or huge arrays. */
export function summarizeValue(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : String(v)
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.length > 2000 ? `${v.slice(0, 2000)}…(${v.length} chars)` : v
  if (typeof v === 'function') return { kind: 'function' }
  if (v instanceof THREE.Texture) {
    const img = v.image as { width?: number; height?: number; videoWidth?: number; videoHeight?: number } | undefined
    return { kind: 'texture', width: img?.width || img?.videoWidth || 0, height: img?.height || img?.videoHeight || 0 }
  }
  if (typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement) return { kind: 'texture', width: v.width, height: v.height }
  if (typeof HTMLVideoElement !== 'undefined' && v instanceof HTMLVideoElement) return { kind: 'video', width: v.videoWidth, height: v.videoHeight }
  if (typeof ImageData !== 'undefined' && v instanceof ImageData) return { kind: 'image', width: v.width, height: v.height }
  if (typeof AudioNode !== 'undefined' && v instanceof AudioNode) return { kind: 'audio' }
  if (typeof Blob !== 'undefined' && v instanceof Blob) return { kind: 'blob', size: v.size, type: v.type }
  if (ArrayBuffer.isView(v)) {
    const arr = Array.from(v as unknown as ArrayLike<number>)
    return { kind: 'typed-array', length: arr.length, first: arr.slice(0, 32).map((n) => Math.round(n * 1e4) / 1e4) }
  }
  if (v instanceof THREE.Object3D) return { kind: v.type || 'object3d', name: v.name || undefined }
  if (v && typeof v === 'object' && (v as { isMaterial?: boolean }).isMaterial) return { kind: 'material3d' }
  if (v && typeof v === 'object' && (v as { isBufferGeometry?: boolean }).isBufferGeometry) return { kind: 'geometry3d' }
  if (depth > 3) return { kind: 'object' }
  if (Array.isArray(v)) {
    const items = v.slice(0, 64).map((x) => summarizeValue(x, depth + 1))
    return v.length > 64 ? { kind: 'array', length: v.length, first: items } : items
  }
  if (typeof v === 'object') {
    const proto = Object.getPrototypeOf(v)
    if (proto !== Object.prototype && proto !== null) return { kind: (proto?.constructor?.name as string) || 'object' }
    const out: Record<string, unknown> = {}
    let n = 0
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k.startsWith('_')) continue
      if (++n > 40) { out['…'] = 'more keys omitted'; break }
      out[k] = summarizeValue(x, depth + 1)
    }
    return out
  }
  return String(v)
}

/** One-line state of a node for compact summaries. */
export function nodeBrief(node: Node): Record<string, unknown> {
  const data = node.data as Record<string, unknown>
  const metrics = useRuntimeStore().nodeMetrics.get(node.id)
  return {
    id: node.id,
    type: nodeType(node),
    label: data.label,
    ...(data[CODE_DISABLED_KEY] ? { codeDisabled: true } : {}),
    ...(metrics?.lastError ? { error: metrics.lastError } : {}),
  }
}

/** Place new nodes to the right of what's already in the flow (or at the view centre). */
export function freeSpotRightOf(nodes: Array<{ position: { x: number; y: number } }>, fallback: { x: number; y: number }): { x: number; y: number } {
  if (nodes.length === 0) return fallback
  const maxX = Math.max(...nodes.map((n) => n.position.x))
  const minY = Math.min(...nodes.map((n) => n.position.y))
  return { x: Math.round(maxX + 320), y: Math.round(minY) }
}
