import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { Node, Edge } from '@vue-flow/core'
import { ExecutionEngine, shouldRenderFrame, clampDelta, MAX_FRAME_DELTA } from '@/engine/ExecutionEngine'
import type { ExecutionContext } from '@/engine/ExecutionEngine'
import { useRuntimeStore } from '@/stores/runtime'

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

describe('dirty execution mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('defaults to full mode and round-trips setExecutionMode', () => {
    const engine = new ExecutionEngine()
    expect(engine.getExecutionMode()).toBe('full')
    engine.setExecutionMode('dirty')
    expect(engine.getExecutionMode()).toBe('dirty')
  })

  it('skips a pure node when unchanged and re-runs it on a control edit', async () => {
    const engine = new ExecutionEngine()
    let calls = 0
    // 'constant' is a verified pure type; a counting executor proves skip/run.
    engine.registerExecutor('constant', (ctx) => {
      calls++
      return new Map<string, unknown>([['value', ctx.controls.get('value')]])
    })
    engine.setExecutionMode('dirty')

    const k = node('k', 'constant', { value: 1 })
    engine.updateGraph([k], [])

    await engine.executeFrame() // first frame: runs
    expect(calls).toBe(1)
    expect(engine.getOutputValue('k', 'value')).toBe(1)

    await engine.executeFrame() // unchanged: skipped
    expect(calls).toBe(1)

    ;(k.data as Record<string, unknown>).value = 9 // user edits the control
    await engine.executeFrame() // control changed: re-runs
    expect(calls).toBe(2)
    expect(engine.getOutputValue('k', 'value')).toBe(9)
  })

  it('propagates input changes downstream and idles stable subgraphs', async () => {
    const engine = new ExecutionEngine()
    const calls = { src: 0, dn: 0 }
    engine.registerExecutor('constant', (ctx) => {
      calls.src++
      return new Map<string, unknown>([['value', ctx.controls.get('value')]])
    })
    engine.registerExecutor('add', (ctx) => {
      calls.dn++
      return new Map<string, unknown>([['result', ((ctx.inputs.get('a') as number) ?? 0) + 1]])
    })
    engine.setExecutionMode('dirty')

    const src = node('s', 'constant', { value: 5 })
    const dn = node('d', 'add')
    engine.updateGraph([src, dn], [edge('s', 'd', 'value', 'a')])

    await engine.executeFrame()
    expect(calls).toEqual({ src: 1, dn: 1 })
    expect(engine.getOutputValue('d', 'result')).toBe(6)

    await engine.executeFrame() // stable: both skipped
    expect(calls).toEqual({ src: 1, dn: 1 })

    ;(src.data as Record<string, unknown>).value = 10
    await engine.executeFrame() // source changed: source + downstream re-run
    expect(calls).toEqual({ src: 2, dn: 2 })
    expect(engine.getOutputValue('d', 'result')).toBe(11)
  })

  it('always runs non-pure (unclassified) node types every frame', async () => {
    const engine = new ExecutionEngine()
    let calls = 0
    engine.registerExecutor('mystery-type', () => {
      calls++
      return new Map<string, unknown>([['out', calls]])
    })
    engine.setExecutionMode('dirty')
    engine.updateGraph([node('m', 'mystery-type')], [])

    await engine.executeFrame()
    await engine.executeFrame()
    await engine.executeFrame()
    expect(calls).toBe(3) // not in the pure allowlist -> never skipped
  })
})

describe('deferred (fire-and-latch) async execution', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0))

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('non-deferred async executors are still awaited (default behavior unchanged)', async () => {
    const engine = new ExecutionEngine()
    engine.registerExecutor('aio', async () => new Map<string, unknown>([['out', 'ready']]))
    engine.updateGraph([node('a', 'aio')], [])
    await engine.executeFrame()
    expect(engine.getOutputValue('a', 'out')).toBe('ready') // available the same frame
  })

  it('a deferred async node does not block the frame and does not storm', async () => {
    const engine = new ExecutionEngine()
    let resolveIt!: () => void
    const exec = vi.fn(
      () =>
        new Promise<Map<string, unknown>>((res) => {
          resolveIt = () => res(new Map<string, unknown>([['out', 'DONE']]))
        }),
    )
    engine.registerExecutor('slow', exec)
    engine.setDeferredNodeTypes(['slow'])
    expect(engine.getDeferredNodeTypes().has('slow')).toBe(true)
    engine.updateGraph([node('s', 'slow')], [])

    await engine.executeFrame() // fires, returns cached (empty) — frame does not block
    expect(exec).toHaveBeenCalledTimes(1)
    expect(engine.getOutputValue('s', 'out')).toBeUndefined()

    await engine.executeFrame() // still in flight: must NOT fire again
    expect(exec).toHaveBeenCalledTimes(1)

    resolveIt()
    await flush()
    expect(engine.getOutputValue('s', 'out')).toBe('DONE') // applied out-of-band

    await engine.executeFrame() // in-flight cleared: may fire again
    expect(exec).toHaveBeenCalledTimes(2)
  })

  it('drops a deferred result that resolves after stop()', async () => {
    const engine = new ExecutionEngine()
    let resolveIt!: () => void
    engine.registerExecutor(
      'slow',
      () =>
        new Promise<Map<string, unknown>>((res) => {
          resolveIt = () => res(new Map<string, unknown>([['out', 'LATE']]))
        }),
    )
    engine.setDeferredNodeTypes(['slow'])
    engine.updateGraph([node('s', 'slow')], [])
    await engine.executeFrame()
    engine.stop()
    resolveIt()
    await flush()
    expect(engine.getNodeOutputs('s')).toBeUndefined() // not applied; stop() cleared outputs
  })

  it('propagates a deferred result to a downstream pure node in dirty mode', async () => {
    const engine = new ExecutionEngine()
    let resolveIt!: () => void
    engine.registerExecutor(
      'slow',
      () =>
        new Promise<Map<string, unknown>>((res) => {
          resolveIt = () => res(new Map<string, unknown>([['out', 5]]))
        }),
    )
    let addCalls = 0
    engine.registerExecutor('add', (ctx) => {
      addCalls++
      return new Map<string, unknown>([['result', ((ctx.inputs.get('a') as number) ?? 0) + 1]])
    })
    engine.setExecutionMode('dirty')
    engine.setDeferredNodeTypes(['slow'])
    engine.updateGraph([node('s', 'slow'), node('d', 'add')], [edge('s', 'd', 'out', 'a')])

    await engine.executeFrame() // slow fires (empty), add runs with default -> 1
    expect(engine.getOutputValue('d', 'result')).toBe(1)
    const callsAfterFrame1 = addCalls

    await engine.executeFrame() // slow pending (stable empty), add idle
    expect(addCalls).toBe(callsAfterFrame1)

    resolveIt()
    await flush()

    await engine.executeFrame() // slow result landed -> add re-runs with 5 -> 6
    expect(engine.getOutputValue('d', 'result')).toBe(6)
    expect(addCalls).toBe(callsAfterFrame1 + 1)
  })
})

describe('frame timing helpers', () => {
  it('clampDelta caps the per-frame delta at MAX_FRAME_DELTA', () => {
    expect(clampDelta(0.016)).toBe(0.016)
    expect(clampDelta(5)).toBe(MAX_FRAME_DELTA)
    expect(clampDelta(5, 1)).toBe(1)
  })

  it('shouldRenderFrame is always true when uncapped (targetFps <= 0)', () => {
    expect(shouldRenderFrame(1000, 999, 0)).toBe(true)
    expect(shouldRenderFrame(1000, 1000, -1)).toBe(true)
  })

  it('shouldRenderFrame respects the interval when capped', () => {
    // 30fps -> ~33.3ms interval, 1ms tolerance.
    expect(shouldRenderFrame(1000, 1000, 30)).toBe(false) // 0ms elapsed
    expect(shouldRenderFrame(1010, 1000, 30)).toBe(false) // 10ms < 32.3
    expect(shouldRenderFrame(1040, 1000, 30)).toBe(true) // 40ms >= 32.3
  })
})

describe('ExecutionEngine render-loop lifecycle', () => {
  let engine: ExecutionEngine
  let rafCb: ((t?: number) => unknown) | null
  let rafSpy: ReturnType<typeof vi.fn>
  let cancelSpy: ReturnType<typeof vi.fn>

  function setHidden(hidden: boolean) {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    engine = new ExecutionEngine()
    rafCb = null
    let id = 0
    rafSpy = vi.fn((cb: (t?: number) => unknown) => {
      rafCb = cb
      return ++id
    })
    cancelSpy = vi.fn()
    vi.stubGlobal('requestAnimationFrame', rafSpy)
    vi.stubGlobal('cancelAnimationFrame', cancelSpy)
    setHidden(false)
  })

  afterEach(() => {
    engine.stop()
    vi.unstubAllGlobals()
    setHidden(false)
  })

  it('start() marks running and schedules a frame', () => {
    const rt = useRuntimeStore()
    engine.start()
    expect(rt.isRunning).toBe(true)
    expect(rafSpy).toHaveBeenCalledTimes(1)
  })

  it('pauses ticking when the document is hidden, keeping running state', () => {
    const rt = useRuntimeStore()
    engine.start()
    rafSpy.mockClear()

    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(cancelSpy).toHaveBeenCalled()
    expect(rt.isRunning).toBe(true) // still "running", just not ticking
    expect(rafSpy).not.toHaveBeenCalled() // no new frame scheduled while hidden
  })

  it('resumes ticking (and resets timing) when the document becomes visible', () => {
    engine.start()
    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    rafSpy.mockClear()

    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(rafSpy).toHaveBeenCalledTimes(1) // loop rescheduled
  })

  it('does not auto-resume after a user-initiated pause', () => {
    engine.start()
    engine.pause()
    rafSpy.mockClear()

    // Visibility flapping must not restart a user-paused engine.
    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))

    expect(rafSpy).not.toHaveBeenCalled()
  })

  it('setTargetFps clamps invalid values to 0 (uncapped)', () => {
    engine.setTargetFps(30)
    expect(engine.getTargetFps()).toBe(30)
    engine.setTargetFps(-5)
    expect(engine.getTargetFps()).toBe(0)
    engine.setTargetFps(Number.NaN)
    expect(engine.getTargetFps()).toBe(0)
  })

  it('honors the FPS cap by skipping frames that arrive too soon', async () => {
    let count = 0
    engine.registerExecutor('rec', () => {
      count++
      return new Map<string, unknown>()
    })
    engine.updateGraph(
      [{ id: 'A', type: 'default', position: { x: 0, y: 0 }, data: { nodeType: 'rec' } } as unknown as Node],
      [],
    )
    engine.setTargetFps(30)
    engine.start()
    expect(rafCb).toBeTypeOf('function')

    await rafCb!(1000) // first frame executes
    expect(count).toBe(1)
    await rafCb!(1010) // too soon -> skipped
    expect(count).toBe(1)
    await rafCb!(1040) // enough elapsed -> executes
    expect(count).toBe(2)
  })

  it('does not spawn a second loop if hidden+shown while a frame is in flight', async () => {
    engine.registerExecutor('rec', () => new Map<string, unknown>())
    engine.updateGraph(
      [{ id: 'A', type: 'default', position: { x: 0, y: 0 }, data: { nodeType: 'rec' } } as unknown as Node],
      [],
    )
    engine.start()
    const staleLoop = rafCb! // the loop scheduled before hide

    // Tab hidden then shown — engine invalidates the old loop and schedules a new one.
    setHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    setHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
    const activeLoop = rafCb!
    expect(activeLoop).not.toBe(staleLoop)

    rafSpy.mockClear()
    // The stale loop finishing its in-flight frame must NOT re-arm (would double the rate).
    await staleLoop(1000)
    expect(rafSpy).not.toHaveBeenCalled()
    // The active loop re-arms normally.
    await activeLoop(1000)
    expect(rafSpy).toHaveBeenCalledTimes(1)
  })
})
