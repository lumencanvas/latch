import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { Node, Edge } from '@vue-flow/core'
import { ExecutionEngine } from '@/engine/ExecutionEngine'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

/**
 * Characterization tests for ExecutionEngine.
 *
 * These lock in the observable behavior (topological execution order, output
 * propagation along edges, value retrieval) so refactors of the internals —
 * e.g. replacing the O(n^2) per-frame node lookup with an O(1) Map — can be
 * proven to change nothing.
 */

// Minimal Node factory — the engine only reads `id` and `data.nodeType`
// (plus any extra data keys, which become controls).
function node(id: string, nodeType: string, data: Record<string, unknown> = {}): Node {
  return { id, type: 'default', position: { x: 0, y: 0 }, data: { nodeType, ...data } } as unknown as Node
}

function edge(source: string, target: string, sourceHandle = 'out', targetHandle = 'in'): Edge {
  return { id: `${source}->${target}`, source, target, sourceHandle, targetHandle } as unknown as Edge
}

describe('ExecutionEngine', () => {
  let engine: ExecutionEngine

  beforeEach(() => {
    setActivePinia(createPinia())
    engine = new ExecutionEngine()
  })

  it('executes nodes in topological order (A -> B -> C)', async () => {
    const order: string[] = []
    const record = (ctx: ExecutionContext) => {
      order.push(ctx.nodeId)
      return new Map<string, unknown>([['out', ctx.nodeId]])
    }
    engine.registerExecutor('rec', record)

    // Intentionally provide nodes out of dependency order to prove sorting.
    engine.updateGraph(
      [node('C', 'rec'), node('A', 'rec'), node('B', 'rec')],
      [edge('A', 'B'), edge('B', 'C')],
    )
    await engine.executeFrame()

    expect(order).toEqual(['A', 'B', 'C'])
  })

  it('propagates output values along edges into downstream inputs', async () => {
    let received: unknown = undefined

    engine.registerExecutor('source', () => new Map<string, unknown>([['out', 42]]))
    engine.registerExecutor('sink', (ctx: ExecutionContext) => {
      received = ctx.inputs.get('in')
      return new Map<string, unknown>()
    })

    engine.updateGraph(
      [node('s', 'source'), node('k', 'sink')],
      [edge('s', 'k', 'out', 'in')],
    )
    await engine.executeFrame()

    expect(received).toBe(42)
  })

  it('exposes outputs via getOutputValue / getNodeOutputs', async () => {
    engine.registerExecutor('src', () => new Map<string, unknown>([['out', 'hello'], ['n', 7]]))
    engine.updateGraph([node('x', 'src')], [])
    await engine.executeFrame()

    expect(engine.getOutputValue('x', 'out')).toBe('hello')
    expect(engine.getOutputValue('x', 'n')).toBe(7)
    expect(engine.getNodeOutputs('x')?.get('out')).toBe('hello')
    expect(engine.hasNodeOutputs('x')).toBe(true)
    expect(engine.hasNodeOutputs('missing')).toBe(false)
  })

  it('does not throw and yields no outputs for nodes without a registered executor', async () => {
    engine.updateGraph([node('orphan', 'unregistered-type')], [])
    await expect(engine.executeFrame()).resolves.toBeUndefined()
    expect(engine.getNodeOutputs('orphan')).toBeUndefined()
  })

  it('feeds controls (node.data keys) into the executor context', async () => {
    let seen: unknown
    engine.registerExecutor('cfg', (ctx: ExecutionContext) => {
      seen = ctx.controls.get('amount')
      return new Map<string, unknown>()
    })
    engine.updateGraph([node('c', 'cfg', { amount: 5 })], [])
    await engine.executeFrame()

    expect(seen).toBe(5)
  })

  it('merges multiple inputs into one node (diamond converges)', async () => {
    const inputs: Record<string, unknown> = {}
    engine.registerExecutor('a', () => new Map<string, unknown>([['out', 1]]))
    engine.registerExecutor('b', () => new Map<string, unknown>([['out', 2]]))
    engine.registerExecutor('join', (ctx: ExecutionContext) => {
      inputs.left = ctx.inputs.get('l')
      inputs.right = ctx.inputs.get('r')
      return new Map<string, unknown>()
    })

    engine.updateGraph(
      [node('a', 'a'), node('b', 'b'), node('j', 'join')],
      [edge('a', 'j', 'out', 'l'), edge('b', 'j', 'out', 'r')],
    )
    await engine.executeFrame()

    expect(inputs).toEqual({ left: 1, right: 2 })
  })

  it('re-sorts and reflects graph changes on the next frame', async () => {
    const order: string[] = []
    engine.registerExecutor('rec', (ctx) => { order.push(ctx.nodeId); return new Map() })

    engine.updateGraph([node('A', 'rec'), node('B', 'rec')], [edge('A', 'B')])
    await engine.executeFrame()
    expect(order).toEqual(['A', 'B'])

    // Inserting C between A and B must change the execution order next frame.
    order.length = 0
    engine.updateGraph(
      [node('A', 'rec'), node('B', 'rec'), node('C', 'rec')],
      [edge('A', 'C'), edge('C', 'B')],
    )
    await engine.executeFrame()
    expect(order).toEqual(['A', 'C', 'B'])
  })
})
