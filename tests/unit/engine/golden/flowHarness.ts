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

function captureOutputs(engine: ExecutionEngine, nodes: Node[]): FrameSnapshot {
  const snap: FrameSnapshot = {}
  for (const node of nodes) {
    const outputs = engine.getNodeOutputs(node.id)
    const entry: Record<string, unknown> = {}
    if (outputs) {
      for (const [handle, val] of outputs) entry[handle] = serialize(val)
    }
    snap[node.id] = entry
  }
  return snap
}

/**
 * Run a flow for N frames with deterministic time and return per-frame snapshots.
 */
export async function runFlow(flow: FlowDef, options: RunOptions = {}): Promise<FrameSnapshot[]> {
  const frames = options.frames ?? 6
  const stepMs = options.stepMs ?? 16

  setActivePinia(createPinia())
  const engine = new ExecutionEngine()
  for (const [type, fn] of Object.entries(builtinExecutors)) {
    engine.registerExecutor(type, fn)
  }
  options.configure?.(engine)
  engine.updateGraph(flow.nodes, flow.edges)

  // Deterministic clock: performance.now() returns a controlled, increasing value.
  let nowMs = 0
  const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => nowMs)

  const snapshots: FrameSnapshot[] = []
  try {
    for (let f = 0; f < frames; f++) {
      nowMs = (f + 1) * stepMs // start > 0 so frame deltas are stable
      await engine.executeFrame()
      snapshots.push(captureOutputs(engine, flow.nodes))
    }
  } finally {
    nowSpy.mockRestore()
  }
  return snapshots
}
