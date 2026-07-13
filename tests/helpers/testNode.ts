import { createExecutionContext, type ExecutionContext } from '@/engine/ExecutionEngine'
import { collectedLifecycles } from '@/engine/nodeState'
import type { NodeSpec } from '@/engine/defineNode'

/**
 * Isolated node-test helper (authoring DX). Run a co-located node's executor with a
 * FAITHFUL `ExecutionContext` — built by the engine's own `createExecutionContext`, so
 * `ctx.num/bool/str/trig/level` coerce exactly as they do at runtime (not a hand-rolled fake).
 * No engine, no graph, no upstream re-fire — just the one node.
 *
 * Usage (co-locate a `node.test.ts` next to `node.ts`):
 *   import spec from './node'
 *   import { runNode, resetNodeState } from '../../../../tests/helpers/testNode'
 *   beforeEach(resetNodeState)                       // only if the node is stateful
 *   const out = await runNode(spec, { inputs: { a: 1 }, controls: { min: 0 } })
 *   expect(out.get('result')).toBe(...)
 */
export interface RunNodeOptions {
  inputs?: Record<string, unknown>
  controls?: Record<string, unknown>
  nodeId?: string
  deltaTime?: number
  totalTime?: number
  frameCount?: number
}

/** Run `spec.executor` once and return its output Map. Handles sync and async executors. */
export async function runNode(spec: NodeSpec, opts: RunNodeOptions = {}): Promise<Map<string, unknown>> {
  const ctx: ExecutionContext = createExecutionContext({
    nodeId: opts.nodeId ?? 'test-node',
    inputs: new Map(Object.entries(opts.inputs ?? {})),
    controls: new Map(Object.entries(opts.controls ?? {})),
    definition: spec.definition,
    deltaTime: opts.deltaTime ?? 1 / 60,
    totalTime: opts.totalTime ?? 0,
    frameCount: opts.frameCount ?? 0,
  })
  return (await spec.executor(ctx)) as Map<string, unknown>
}

/**
 * Drive a stateful node across several frames with the SAME `nodeId` (state persists between
 * calls). Returns each frame's output Map. Call `resetNodeState()` first for a clean slate.
 */
export async function runFrames(
  spec: NodeSpec,
  frames: Array<Omit<RunNodeOptions, 'nodeId'>>,
  nodeId = 'test-node',
): Promise<Array<Map<string, unknown>>> {
  const out: Array<Map<string, unknown>> = []
  for (const f of frames) out.push(await runNode(spec, { ...f, nodeId }))
  return out
}

/**
 * Reset EVERY `defineNodeState` store (the same drain the engine runs on stop). Put in a
 * `beforeEach` when testing a stateful node so cases don't leak state into each other.
 */
export function resetNodeState(): void {
  for (const l of collectedLifecycles()) l.disposeAll()
}
