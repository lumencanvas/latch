/**
 * Golden / equivalence harness for the execution engine (Phase 2).
 *
 * Runs a flow through a real ExecutionEngine (all built-in executors registered)
 * for a fixed number of frames with deterministic time, and captures a
 * serializable snapshot of every node's outputs each frame.
 *
 * Two uses:
 *  - Golden snapshots of the CURRENT engine — a regression oracle so the dirty-
 *    flag rewrite can be proven not to change observable behavior.
 *  - Equivalence checks — run the same flow in two engine configurations
 *    (e.g. full vs change-driven) and deep-equal the per-frame snapshots.
 *
 * NOTE: not a *.test file, so vitest does not collect it as a suite.
 */
import { vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { Node, Edge } from '@vue-flow/core'
import { ExecutionEngine } from '@/engine/ExecutionEngine'
import { builtinExecutors } from '@/engine/executors'

export interface FlowDef {
  nodes: Node[]
  edges: Edge[]
}

export interface RunOptions {
  frames?: number
  /** Milliseconds of (mocked) wall-clock advance per frame. */
  stepMs?: number
  /** Hook to configure the engine before the run (e.g. set execution mode). */
  configure?: (engine: ExecutionEngine) => void
  /**
   * Namespace applied to node ids for this run. Executor state is module-global
   * keyed by nodeId, so two runs of the same flow (e.g. full vs dirty) use
   * distinct prefixes to avoid cross-run state leakage. Snapshots are keyed by
   * the ORIGINAL (unprefixed) id so runs remain comparable.
   */
  idPrefix?: string
  /** If provided, the executed-node count for each frame is pushed here. */
  executedPerFrame?: number[]
}

/** One frame's outputs: nodeId -> outputHandle -> serializable value. */
export type FrameSnapshot = Record<string, Record<string, unknown>>

let nodeSeq = 0
export function mkNode(id: string, nodeType: string, data: Record<string, unknown> = {}): Node {
  return {
    id,
    type: 'default',
    position: { x: (nodeSeq++ % 10) * 120, y: 0 },
    data: { nodeType, ...data },
  } as unknown as Node
}

export function mkEdge(source: string, sourceHandle: string, target: string, targetHandle: string): Edge {
  return {
    id: `${source}.${sourceHandle}->${target}.${targetHandle}`,
    source,
    target,
    sourceHandle,
    targetHandle,
  } as unknown as Edge
}

/** Reduce a value to something stable and JSON-snapshot-friendly. */
function serialize(value: unknown): unknown {
  if (value === undefined) return null
  const t = typeof value
  if (value === null || t === 'number' || t === 'string' || t === 'boolean') {
    // Normalize -0 and round floats so tiny FP drift doesn't churn snapshots.
    if (t === 'number') {
      const n = value as number
      if (Object.is(n, -0)) return 0
      return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : String(n)
    }
    return value
  }
  if (Array.isArray(value)) return value.map(serialize)
  // Opaque objects (textures, audio nodes, etc.) — record presence, not identity.
  return `[${(value as object).constructor?.name ?? 'object'}]`
}

function captureOutputs(engine: ExecutionEngine, nodes: Node[], prefix: string): FrameSnapshot {
  const snap: FrameSnapshot = {}
  for (const node of nodes) {
    const outputs = engine.getNodeOutputs(node.id)
    const entry: Record<string, unknown> = {}
    if (outputs) {
      for (const [handle, val] of outputs) entry[handle] = serialize(val)
    }
    // Key by the original (unprefixed) id so prefixed runs stay comparable.
    snap[node.id.slice(prefix.length)] = entry
  }
  return snap
}

function applyPrefix(flow: FlowDef, prefix: string): FlowDef {
  if (!prefix) return flow
  return {
    nodes: flow.nodes.map((n) => ({ ...n, id: prefix + n.id })),
    edges: flow.edges.map((e) => ({
      ...e,
      id: prefix + (e.id as string),
      source: prefix + e.source,
      target: prefix + e.target,
    })) as Edge[],
  }
}

// ---------------------------------------------------------------------------
// Canonical flows — shared by the golden snapshots and the full-vs-dirty
// equivalence tests. All use module-state-free node types so two runs don't
// interfere (id-prefixing in runFlow also isolates state defensively).
// ---------------------------------------------------------------------------

/** Pure arithmetic — outputs constant across frames (no time/state). 4 nodes. */
export function pureStaticFlow(): FlowDef {
  return {
    nodes: [
      mkNode('c1', 'constant', { value: 5 }),
      mkNode('c2', 'constant', { value: 3 }),
      mkNode('sum', 'add'),
      mkNode('cl', 'clamp', { min: 0, max: 10 }),
    ],
    edges: [
      mkEdge('c1', 'value', 'sum', 'a'),
      mkEdge('c2', 'value', 'sum', 'b'),
      mkEdge('sum', 'result', 'cl', 'value'),
    ],
  }
}

/** Time-driven — Time changes every frame and propagates downstream. */
export function timeDrivenFlow(): FlowDef {
  return {
    nodes: [
      mkNode('t', 'time'),
      mkNode('mr', 'map-range', { inMin: 0, inMax: 1, outMin: 0, outMax: 100 }),
      mkNode('cl', 'clamp', { min: 0, max: 50 }),
    ],
    edges: [mkEdge('t', 'time', 'mr', 'value'), mkEdge('mr', 'result', 'cl', 'value')],
  }
}

/** LFO-driven — continuous oscillator multiplied by a constant. */
export function lfoFlow(): FlowDef {
  return {
    nodes: [
      mkNode('lfo', 'lfo', { frequency: 2, amplitude: 10, offset: 0, waveform: 'sine' }),
      mkNode('k', 'constant', { value: 2 }),
      mkNode('mul', 'multiply'),
    ],
    edges: [mkEdge('lfo', 'value', 'mul', 'a'), mkEdge('k', 'value', 'mul', 'b')],
  }
}

/** Diamond — one source fans out to two ops that reconverge at a comparison. 5 nodes. */
export function diamondFlow(): FlowDef {
  return {
    nodes: [
      mkNode('a', 'constant', { value: 5 }),
      mkNode('b', 'constant', { value: 2 }),
      mkNode('sum', 'add'),
      mkNode('prod', 'multiply'),
      mkNode('cmp', 'compare', { operator: '<' }),
    ],
    edges: [
      mkEdge('a', 'value', 'sum', 'a'),
      mkEdge('b', 'value', 'sum', 'b'),
      mkEdge('a', 'value', 'prod', 'a'),
      mkEdge('b', 'value', 'prod', 'b'),
      mkEdge('sum', 'result', 'cmp', 'a'),
      mkEdge('prod', 'result', 'cmp', 'b'),
    ],
  }
}

/** Mixed — time-driven source feeding a pure chain (some nodes idle, some not). */
export function mixedFlow(): FlowDef {
  return {
    nodes: [
      mkNode('t', 'time'),
      mkNode('k', 'constant', { value: 100 }),
      mkNode('mul', 'multiply'),
      mkNode('cl', 'clamp', { min: 0, max: 1 }),
    ],
    edges: [
      mkEdge('t', 'delta', 'mul', 'a'),
      mkEdge('k', 'value', 'mul', 'b'),
      mkEdge('mul', 'result', 'cl', 'value'),
    ],
  }
}

/**
 * Run a flow for N frames with deterministic time and return per-frame snapshots.
 */
export async function runFlow(flow: FlowDef, options: RunOptions = {}): Promise<FrameSnapshot[]> {
  const frames = options.frames ?? 6
  const stepMs = options.stepMs ?? 16
  const prefix = options.idPrefix ?? ''
  const engineFlow = applyPrefix(flow, prefix)

  setActivePinia(createPinia())
  const engine = new ExecutionEngine()
  for (const [type, fn] of Object.entries(builtinExecutors)) {
    engine.registerExecutor(type, fn)
  }
  options.configure?.(engine)
  engine.updateGraph(engineFlow.nodes, engineFlow.edges)

  // Deterministic clock: performance.now() returns a controlled, increasing value.
  let nowMs = 0
  const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => nowMs)

  const snapshots: FrameSnapshot[] = []
  try {
    for (let f = 0; f < frames; f++) {
      nowMs = (f + 1) * stepMs // start > 0 so frame deltas are stable
      await engine.executeFrame()
      snapshots.push(captureOutputs(engine, engineFlow.nodes, prefix))
      options.executedPerFrame?.push(engine.getLastFrameExecutedCount())
    }
  } finally {
    nowSpy.mockRestore()
  }
  return snapshots
}
