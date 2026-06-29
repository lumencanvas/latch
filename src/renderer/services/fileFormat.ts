/**
 * LATCH `.latch` v2 file format — pure (de)serialization, migration & validation.
 *
 * This module is intentionally framework- and store-agnostic: it imports no
 * registry, no Pinia store, and nothing that performs I/O or generates random
 * ids. Everything here is a pure function of its inputs so the round-trip /
 * legacy / missing-node guarantees can be unit-tested deterministically (the
 * Phase-0 CI gates in `POLICIES_2026-06-28.md`).
 *
 * The format separates LOGIC (the only part that affects execution; diff-reviewed
 * in PRs) from LAYOUT (editor-only positions/sizes/colors), so moving a node
 * never churns a logic diff. See `docs/plans/FILE_FORMAT_SPEC_2026-06-28.md`.
 *
 * Wiring into the flows store (export/import) is a separate, later step — this
 * module ships alongside the existing v1.0 path without changing any behavior.
 */

export const FORMAT = 'latch-flow' as const
export const FORMAT_VERSION = 2 as const

// ---------------------------------------------------------------------------
// v2 types
// ---------------------------------------------------------------------------

/** A subflow boundary port, carried through verbatim. */
export interface PortRecord {
  id: string
  name: string
  type: string
  nodeId: string
}

/** A single node's LOGIC. Layout lives separately in `LayoutSection`. */
export interface NodeRecord {
  /** Stable, opaque id. Never reused after delete; never split on any delimiter. */
  id: string
  /** Registry id (the `nodeType`), NOT the Vue Flow component type. */
  type: string
  /** The node's `defineNode.version` when saved; drives per-node migration. */
  version: number
  /** ONLY control values. Serialized with deterministic key order. */
  controls: Record<string, unknown>
}

/** An edge as a pair of `"node:port"` endpoint strings. */
export interface EdgeRecord {
  id: string
  from: string
  to: string
}

export interface FlowSection {
  id: string
  name: string
  kind: 'main' | 'subflow'
  /** User-facing flow metadata, preserved across round-trips. */
  description?: string
  /** Palette icon/category — meaningful when a subflow is reused as a node. */
  icon?: string
  category?: string
  nodes: NodeRecord[]
  edges: EdgeRecord[]
  /** Present only for subflows. */
  ports?: { inputs: PortRecord[]; outputs: PortRecord[] }
}

export interface LayoutNode {
  x: number
  y: number
  w?: number
  h?: number
  color?: string | null
  /** A user-customized node label (cosmetic). Default labels are not stored. */
  label?: string
}

export interface LayoutSection {
  nodes: Record<string, LayoutNode>
  viewport?: { x: number; y: number; zoom: number }
}

export interface AppInfo {
  createdWith?: string
  savedWith?: string
}

/** A single-flow `.latch` document. Unknown top-level keys are preserved. */
export interface LatchFlowDoc {
  format: typeof FORMAT
  formatVersion: number
  app?: AppInfo
  flow: FlowSection
  layout: LayoutSection
  /** Forward-compat: any unrecognized top-level keys are round-tripped. */
  [extra: string]: unknown
}

/** A multi-flow export envelope wrapping several documents. */
export interface LatchExportDoc {
  format: typeof FORMAT
  formatVersion: number
  app?: AppInfo
  activeFlowId?: string
  exportedFlows: LatchFlowDoc[]
  [extra: string]: unknown
}

// ---------------------------------------------------------------------------
// Edge endpoint helpers — `"node:port"`
// ---------------------------------------------------------------------------

/**
 * Build a `"node:port"` endpoint. Node ids and port ids never contain `:`
 * (nanoid alphabet is `[A-Za-z0-9_-]`; subflow-expanded ids join with `/`, never
 * `:`), so `:` is an unambiguous, stable delimiter.
 */
export function endpoint(nodeId: string, portId: string | null | undefined): string {
  return `${nodeId}:${portId ?? ''}`
}

/**
 * Split a `"node:port"` endpoint back into its parts. Splits on the LAST `:` so
 * that node ids containing other characters stay intact; in practice neither
 * side contains a `:` so there is exactly one.
 */
export function parseEndpoint(ep: string): { node: string; port: string } {
  const i = ep.lastIndexOf(':')
  if (i < 0) return { node: ep, port: '' }
  return { node: ep.slice(0, i), port: ep.slice(i + 1) }
}

// ---------------------------------------------------------------------------
// Deterministic serialization
// ---------------------------------------------------------------------------

/**
 * Recursively sort object keys (arrays keep their order) so JSON.stringify
 * produces byte-identical output for value-equal inputs. Used for the free-form
 * `controls` map and `layout` entries.
 */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(src).sort()) out[key] = sortDeep(src[key])
    return out
  }
  return value
}

function canonicalNode(n: NodeRecord): Record<string, unknown> {
  // Canonical field order: id, type, version, controls (controls keys sorted).
  return { id: n.id, type: n.type, version: n.version, controls: sortDeep(n.controls ?? {}) }
}

function canonicalEdge(e: EdgeRecord): Record<string, unknown> {
  return { id: e.id, from: e.from, to: e.to }
}

function byId<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

function canonicalFlow(flow: FlowSection): Record<string, unknown> {
  const out: Record<string, unknown> = { id: flow.id, name: flow.name, kind: flow.kind }
  if (flow.description !== undefined) out.description = flow.description
  if (flow.icon !== undefined) out.icon = flow.icon
  if (flow.category !== undefined) out.category = flow.category
  out.nodes = byId(flow.nodes).map(canonicalNode)
  out.edges = byId(flow.edges).map(canonicalEdge)
  if (flow.ports) {
    out.ports = {
      inputs: byId(flow.ports.inputs).map((p) => sortDeep(p)),
      outputs: byId(flow.ports.outputs).map((p) => sortDeep(p)),
    }
  }
  return out
}

function canonicalLayout(layout: LayoutSection): Record<string, unknown> {
  const nodes: Record<string, unknown> = {}
  for (const id of Object.keys(layout.nodes).sort()) {
    const ln = layout.nodes[id]
    const entry: Record<string, unknown> = { x: ln.x, y: ln.y }
    if (ln.w !== undefined) entry.w = ln.w
    if (ln.h !== undefined) entry.h = ln.h
    if (ln.color !== undefined) entry.color = ln.color
    if (ln.label !== undefined) entry.label = ln.label
    nodes[id] = entry
  }
  const out: Record<string, unknown> = { nodes }
  if (layout.viewport) {
    out.viewport = { x: layout.viewport.x, y: layout.viewport.y, zoom: layout.viewport.zoom }
  }
  return out
}

/** Keys the canonical document orders explicitly; everything else is appended sorted. */
const DOC_RESERVED = new Set(['format', 'formatVersion', 'app', 'flow', 'layout'])
const EXPORT_RESERVED = new Set(['format', 'formatVersion', 'app', 'activeFlowId', 'exportedFlows'])

function appendExtras(out: Record<string, unknown>, doc: Record<string, unknown>, reserved: Set<string>): void {
  for (const key of Object.keys(doc).sort()) {
    if (!reserved.has(key)) out[key] = sortDeep(doc[key])
  }
}

function canonicalDoc(doc: LatchFlowDoc): Record<string, unknown> {
  const out: Record<string, unknown> = { format: FORMAT, formatVersion: doc.formatVersion }
  if (doc.app) out.app = sortDeep(doc.app)
  out.flow = canonicalFlow(doc.flow)
  out.layout = canonicalLayout(doc.layout)
  appendExtras(out, doc, DOC_RESERVED)
  return out
}

function canonicalExport(doc: LatchExportDoc): Record<string, unknown> {
  const out: Record<string, unknown> = { format: FORMAT, formatVersion: doc.formatVersion }
  if (doc.app) out.app = sortDeep(doc.app)
  if (doc.activeFlowId !== undefined) out.activeFlowId = doc.activeFlowId
  out.exportedFlows = doc.exportedFlows.map(canonicalDoc)
  appendExtras(out, doc, EXPORT_RESERVED)
  return out
}

/** Serialize a single-flow document to canonical, byte-stable JSON. */
export function serializeDocument(doc: LatchFlowDoc): string {
  return JSON.stringify(canonicalDoc(doc), null, 2)
}

/** Serialize a multi-flow export envelope to canonical, byte-stable JSON. */
export function serializeExport(doc: LatchExportDoc): string {
  return JSON.stringify(canonicalExport(doc), null, 2)
}

// ---------------------------------------------------------------------------
// Legacy detection & migration (v1.0 single / v1.0.0 multi -> v2)
// ---------------------------------------------------------------------------

type AnyObj = Record<string, unknown>

const NON_CONTROL_DATA_KEYS = new Set(['label', 'nodeType', 'definition'])

function isObj(v: unknown): v is AnyObj {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/** True when `raw` is already a v2 document or export envelope. */
export function isV2(raw: unknown): boolean {
  return isObj(raw) && raw.format === FORMAT && typeof raw.formatVersion === 'number'
}

/** True when `raw` is a multi-flow shape (legacy `flows[]` or v2 `exportedFlows[]`). */
export function isMulti(raw: unknown): boolean {
  if (!isObj(raw)) return false
  return Array.isArray(raw.exportedFlows) || Array.isArray(raw.flows)
}

/**
 * True when `raw` plausibly is a LATCH flow file: a v2 document/export, a legacy
 * multi-flow envelope (`flows[]`), or a legacy single-flow export (top-level
 * `nodes[]`). Used to reject arbitrary JSON before it imports as an empty flow.
 */
export function looksLikeLatchFile(raw: unknown): boolean {
  if (isV2(raw)) return true
  if (!isObj(raw)) return false
  return Array.isArray(raw.flows) || Array.isArray(raw.exportedFlows) || Array.isArray(raw.nodes)
}

/**
 * Migrate one legacy (v1.0) Vue-Flow node into a v2 NodeRecord + its layout.
 * Control values are every `data` key that isn't `label`/`nodeType`/`definition`.
 * The embedded (stale) `definition` is dropped — it is resolved from the registry
 * at load by `type`.
 */
function migrateLegacyNode(raw: AnyObj): { node: NodeRecord; layout: LayoutNode } | null {
  const data = isObj(raw.data) ? raw.data : {}
  const type = (data.nodeType as string) ?? (typeof raw.type === 'string' && raw.type !== 'custom' ? (raw.type as string) : undefined)
  const id = raw.id as string
  if (!id || !type) return null

  const controls: Record<string, unknown> = {}
  for (const key of Object.keys(data)) {
    if (!NON_CONTROL_DATA_KEYS.has(key)) controls[key] = data[key]
  }

  // Prefer the persisted definition's version if present, else default to 1.
  const def = isObj(data.definition) ? data.definition : undefined
  const version = typeof def?.version === 'number' ? (def.version as number) : 1

  const pos = isObj(raw.position) ? raw.position : {}
  const dims = isObj(raw.dimensions) ? raw.dimensions : {}
  const layout: LayoutNode = { x: num(pos.x), y: num(pos.y) }
  if (typeof dims.width === 'number') layout.w = dims.width
  if (typeof dims.height === 'number') layout.h = dims.height
  if (typeof raw.color === 'string') layout.color = raw.color as string
  // Preserve a (possibly user-customized) label as cosmetic layout data.
  if (typeof data.label === 'string') layout.label = data.label as string

  return { node: { id, type, version, controls }, layout }
}

/** Migrate one legacy edge (drop all Vue-Flow cruft) into `node:port` form. */
function migrateLegacyEdge(raw: AnyObj): EdgeRecord | null {
  const source = raw.source as string
  const target = raw.target as string
  if (!source || !target) return null
  const id = (raw.id as string) ?? `${source}:${target}`
  return { id, from: endpoint(source, raw.sourceHandle as string | null), to: endpoint(target, raw.targetHandle as string | null) }
}

/** Convert one legacy flow object (`{id,name,nodes,edges,isSubflow,...}`) to a v2 doc. */
function migrateLegacyFlow(flow: AnyObj, app?: AppInfo): LatchFlowDoc {
  const rawNodes = Array.isArray(flow.nodes) ? (flow.nodes as AnyObj[]) : []
  const rawEdges = Array.isArray(flow.edges) ? (flow.edges as AnyObj[]) : []

  const nodes: NodeRecord[] = []
  const layoutNodes: Record<string, LayoutNode> = {}
  for (const rn of rawNodes) {
    const migrated = migrateLegacyNode(rn)
    if (!migrated) continue
    nodes.push(migrated.node)
    layoutNodes[migrated.node.id] = migrated.layout
  }

  const edges: EdgeRecord[] = []
  for (const re of rawEdges) {
    const migrated = migrateLegacyEdge(re)
    if (migrated) edges.push(migrated)
  }

  const isSubflow = flow.isSubflow === true
  const section: FlowSection = {
    id: (flow.id as string) ?? '',
    name: (flow.name as string) ?? 'Untitled Flow',
    kind: isSubflow ? 'subflow' : 'main',
    nodes,
    edges,
  }
  if (typeof flow.description === 'string') section.description = flow.description
  if (typeof flow.icon === 'string') section.icon = flow.icon
  if (typeof flow.category === 'string') section.category = flow.category
  if (isSubflow) {
    section.ports = {
      inputs: Array.isArray(flow.subflowInputs) ? (flow.subflowInputs as PortRecord[]) : [],
      outputs: Array.isArray(flow.subflowOutputs) ? (flow.subflowOutputs as PortRecord[]) : [],
    }
  }

  const doc: LatchFlowDoc = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    flow: section,
    layout: { nodes: layoutNodes },
  }
  if (app) doc.app = app
  return doc
}

/**
 * Normalize an already-v2 single document: fill defaults and guarantee the
 * canonical in-memory shape so re-serialization is idempotent.
 */
function normalizeV2Doc(raw: AnyObj): LatchFlowDoc {
  const flowRaw = isObj(raw.flow) ? raw.flow : {}
  const layoutRaw = isObj(raw.layout) ? raw.layout : {}
  const nodes = (Array.isArray(flowRaw.nodes) ? flowRaw.nodes : []) as NodeRecord[]
  const edges = (Array.isArray(flowRaw.edges) ? flowRaw.edges : []) as EdgeRecord[]

  const section: FlowSection = {
    id: (flowRaw.id as string) ?? '',
    name: (flowRaw.name as string) ?? 'Untitled Flow',
    kind: flowRaw.kind === 'subflow' ? 'subflow' : 'main',
    nodes: nodes.map((n) => ({ id: n.id, type: n.type, version: num(n.version, 1), controls: isObj(n.controls) ? n.controls : {} })),
    edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to })),
  }
  if (typeof flowRaw.description === 'string') section.description = flowRaw.description
  if (typeof flowRaw.icon === 'string') section.icon = flowRaw.icon
  if (typeof flowRaw.category === 'string') section.category = flowRaw.category
  if (isObj(flowRaw.ports)) {
    const p = flowRaw.ports as AnyObj
    section.ports = {
      inputs: Array.isArray(p.inputs) ? (p.inputs as PortRecord[]) : [],
      outputs: Array.isArray(p.outputs) ? (p.outputs as PortRecord[]) : [],
    }
  }

  const layoutNodes: Record<string, LayoutNode> = {}
  const lnRaw = isObj(layoutRaw.nodes) ? (layoutRaw.nodes as AnyObj) : {}
  for (const id of Object.keys(lnRaw)) {
    const ln = isObj(lnRaw[id]) ? (lnRaw[id] as AnyObj) : {}
    const entry: LayoutNode = { x: num(ln.x), y: num(ln.y) }
    if (typeof ln.w === 'number') entry.w = ln.w
    if (typeof ln.h === 'number') entry.h = ln.h
    if (ln.color !== undefined) entry.color = ln.color as string | null
    if (typeof ln.label === 'string') entry.label = ln.label
    layoutNodes[id] = entry
  }
  const layout: LayoutSection = { nodes: layoutNodes }
  if (isObj(layoutRaw.viewport)) {
    const v = layoutRaw.viewport as AnyObj
    layout.viewport = { x: num(v.x), y: num(v.y), zoom: num(v.zoom, 1) }
  }

  const doc: LatchFlowDoc = { format: FORMAT, formatVersion: num(raw.formatVersion, FORMAT_VERSION), flow: section, layout }
  if (isObj(raw.app)) doc.app = raw.app as AppInfo
  // Preserve unknown future top-level keys (forward compatibility).
  for (const key of Object.keys(raw)) {
    if (!DOC_RESERVED.has(key)) doc[key] = raw[key]
  }
  return doc
}

/**
 * Migrate any recognized input — legacy v1.0 single flow, legacy v1.0.0 multi
 * export, or a v2 document/export — to a normalized v2 single `LatchFlowDoc`.
 * For multi-flow input, returns the first flow; use {@link migrateToExport} to
 * keep all flows.
 */
export function migrateDocument(raw: unknown): LatchFlowDoc {
  const exported = migrateToExport(raw)
  return exported.exportedFlows[0] ?? emptyDoc()
}

/**
 * Migrate any recognized input to a normalized v2 export envelope (one or more
 * documents). This is the lossless entry point — single-flow input yields an
 * envelope with one document.
 */
export function migrateToExport(raw: unknown): LatchExportDoc {
  if (!isObj(raw)) return { format: FORMAT, formatVersion: FORMAT_VERSION, exportedFlows: [emptyDoc()] }

  const app = isObj(raw.app) ? (raw.app as AppInfo) : undefined

  // Already v2.
  if (isV2(raw)) {
    if (Array.isArray(raw.exportedFlows)) {
      const out: LatchExportDoc = {
        format: FORMAT,
        formatVersion: num(raw.formatVersion, FORMAT_VERSION),
        exportedFlows: (raw.exportedFlows as AnyObj[]).map(normalizeV2Doc),
      }
      if (app) out.app = app
      if (typeof raw.activeFlowId === 'string') out.activeFlowId = raw.activeFlowId
      for (const key of Object.keys(raw)) {
        if (!EXPORT_RESERVED.has(key)) out[key] = raw[key]
      }
      return out
    }
    return { format: FORMAT, formatVersion: FORMAT_VERSION, exportedFlows: [normalizeV2Doc(raw)] }
  }

  // Legacy multi-flow export (`{ version:'1.0.0', flows:[...] }`).
  if (Array.isArray(raw.flows)) {
    const docs = (raw.flows as AnyObj[]).map((f) => migrateLegacyFlow(f, app))
    const out: LatchExportDoc = { format: FORMAT, formatVersion: FORMAT_VERSION, exportedFlows: docs }
    if (app) out.app = app
    if (typeof raw.activeFlowId === 'string') out.activeFlowId = raw.activeFlowId
    return out
  }

  // Legacy single-flow export (`{ version:'1.0', name, nodes, edges }`).
  return { format: FORMAT, formatVersion: FORMAT_VERSION, exportedFlows: [migrateLegacyFlow(raw, app)] }
}

function emptyDoc(): LatchFlowDoc {
  return { format: FORMAT, formatVersion: FORMAT_VERSION, flow: { id: '', name: 'Untitled Flow', kind: 'main', nodes: [], edges: [] }, layout: { nodes: {} } }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationReport {
  ok: boolean
  errors: string[]
  warnings: string[]
  /** Node ids whose `type` is not in the registry (kept as placeholders, never dropped). */
  unknownNodeIds: string[]
  /** Edge ids dropped because an endpoint did not resolve to a real node/port. */
  droppedEdgeIds: string[]
  stats: { nodes: number; edges: number; unknownNodes: number; droppedEdges: number }
}

export interface ValidateOptions {
  /** Registry membership check. When omitted, every type is treated as known. */
  isKnownType?: (type: string) => boolean
  /**
   * Optional port-resolution check; return false when `port` is not a real
   * port of `node`. When omitted, only node existence is checked.
   */
  hasPort?: (nodeType: string, port: string, direction: 'in' | 'out') => boolean
}

/**
 * Validate a v2 document. Structural problems (wrong format, unsupported
 * version, duplicate ids, non-object controls) are fatal `errors`. Dangling
 * edges are dropped with a `warning` (don't fail the whole import). Unknown node
 * types are reported but PRESERVED — the loader renders them as placeholders so
 * a graph degrades, never shatters.
 *
 * Note: validation does not mutate `doc`; `droppedEdgeIds` tells the caller
 * which edges to omit when instantiating.
 */
export function validateDocument(doc: unknown, opts: ValidateOptions = {}): ValidationReport {
  const report: ValidationReport = {
    ok: true,
    errors: [],
    warnings: [],
    unknownNodeIds: [],
    droppedEdgeIds: [],
    stats: { nodes: 0, edges: 0, unknownNodes: 0, droppedEdges: 0 },
  }

  if (!isObj(doc) || doc.format !== FORMAT) {
    report.errors.push(`Not a ${FORMAT} document (missing or wrong "format")`)
    report.ok = false
    return report
  }
  const fv = doc.formatVersion
  if (typeof fv !== 'number') {
    report.errors.push('Missing numeric "formatVersion"')
    report.ok = false
    return report
  }
  if (fv > FORMAT_VERSION) {
    report.errors.push(`formatVersion ${fv} is newer than supported (${FORMAT_VERSION}); load read-only`)
    report.ok = false
    // Still report stats below where possible, but treat as a hard stop here.
    return report
  }

  const flow = isObj(doc.flow) ? doc.flow : undefined
  if (!flow) {
    report.errors.push('Missing "flow" section')
    report.ok = false
    return report
  }

  const nodes = (Array.isArray(flow.nodes) ? flow.nodes : []) as AnyObj[]
  const edges = (Array.isArray(flow.edges) ? flow.edges : []) as AnyObj[]
  report.stats.nodes = nodes.length
  report.stats.edges = edges.length

  const seen = new Set<string>()
  const nodeType = new Map<string, string>()
  for (const n of nodes) {
    const id = n.id as string
    const type = n.type as string
    if (!id || !type) {
      report.errors.push(`Node missing id/type: ${JSON.stringify(n).slice(0, 80)}`)
      report.ok = false
      continue
    }
    if (seen.has(id)) {
      report.errors.push(`Duplicate node id: ${id}`)
      report.ok = false
      continue
    }
    seen.add(id)
    nodeType.set(id, type)
    if (!isObj(n.controls)) {
      report.errors.push(`Node ${id} controls is not a plain object`)
      report.ok = false
    } else if (containsFunction(n.controls)) {
      report.errors.push(`Node ${id} controls contains a non-serializable value`)
      report.ok = false
    }
    if (opts.isKnownType && !opts.isKnownType(type)) {
      report.unknownNodeIds.push(id)
    }
  }
  report.stats.unknownNodes = report.unknownNodeIds.length

  for (const e of edges) {
    const id = (e.id as string) ?? '<no-id>'
    const from = parseEndpoint((e.from as string) ?? '')
    const to = parseEndpoint((e.to as string) ?? '')
    let drop = false
    if (!nodeType.has(from.node)) drop = true
    if (!nodeType.has(to.node)) drop = true
    // Only port-check when both endpoints resolve AND a checker is provided AND
    // neither endpoint is an unknown (placeholder) node — placeholders have no
    // known ports, so we keep their wires intact.
    if (!drop && opts.hasPort) {
      const fromType = nodeType.get(from.node)!
      const toType = nodeType.get(to.node)!
      const fromKnown = !opts.isKnownType || opts.isKnownType(fromType)
      const toKnown = !opts.isKnownType || opts.isKnownType(toType)
      if (fromKnown && !opts.hasPort(fromType, from.port, 'out')) drop = true
      if (toKnown && !opts.hasPort(toType, to.port, 'in')) drop = true
    }
    if (drop) {
      report.droppedEdgeIds.push(id)
      report.warnings.push(`Dropped dangling edge ${id} (${(e.from as string) ?? '?'} -> ${(e.to as string) ?? '?'})`)
    }
  }
  report.stats.droppedEdges = report.droppedEdgeIds.length

  return report
}

// ---------------------------------------------------------------------------
// Per-node data versioning & migration (EXTENSIBILITY §10)
// ---------------------------------------------------------------------------

/** What the registry knows about a node type's current data schema. */
export interface NodeMigrationInfo {
  /** The node's current `defineNode.version` (default 1). */
  version: number
  /**
   * Upgrade saved control data created at `from` to the current schema. May be
   * called once with the saved version; should be idempotent for already-current
   * data. Returns the upgraded controls (a new object).
   */
  migrate?: (controls: Record<string, unknown>, from: number) => Record<string, unknown>
}

/**
 * Resolve migration info for a node `type`. Returns `undefined` for an unknown
 * type (a placeholder) — placeholders are never migrated, only preserved.
 */
export type NodeMigrationResolver = (type: string) => NodeMigrationInfo | undefined

/**
 * Migrate a single node's data to the current schema for its type, in place on a
 * cloned record. A node whose saved `version` is below the registry's current
 * version is run through `migrate(controls, savedVersion)` and re-stamped.
 * Unknown types (no resolver hit) and already-current nodes pass through
 * untouched. Returns whether the node was changed.
 */
export function migrateNode(node: NodeRecord, resolver: NodeMigrationResolver): { node: NodeRecord; migrated: boolean } {
  const info = resolver(node.type)
  if (!info) return { node, migrated: false }
  const saved = num(node.version, 1)
  if (saved >= info.version) {
    // Already current — only re-stamp if the saved version was malformed/older-stamp.
    return saved === node.version ? { node, migrated: false } : { node: { ...node, version: info.version }, migrated: false }
  }
  const controls = info.migrate ? info.migrate({ ...node.controls }, saved) : node.controls
  return { node: { ...node, version: info.version, controls }, migrated: true }
}

/**
 * Apply {@link migrateNode} across a whole document, returning a new document and
 * the count of nodes upgraded (for the structured import report). Does not
 * mutate the input.
 */
export function migrateDocumentNodes(doc: LatchFlowDoc, resolver: NodeMigrationResolver): { doc: LatchFlowDoc; migratedCount: number } {
  let migratedCount = 0
  const nodes = doc.flow.nodes.map((n) => {
    const res = migrateNode(n, resolver)
    if (res.migrated) migratedCount++
    return res.node
  })
  return { doc: { ...doc, flow: { ...doc.flow, nodes } }, migratedCount }
}

function containsFunction(value: unknown, depth = 0): boolean {
  if (depth > 8) return false
  if (typeof value === 'function') return true
  if (Array.isArray(value)) return value.some((v) => containsFunction(v, depth + 1))
  if (value && typeof value === 'object') return Object.values(value).some((v) => containsFunction(v, depth + 1))
  return false
}
