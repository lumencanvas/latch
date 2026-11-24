/**
 * CLASP connection bookkeeping across reconnects (D9) + trigger edges.
 *
 * - emit/bundle/get computed their rising edge AFTER the not-connected early return, so the
 *   first press after a reconnect was swallowed.
 * - A subscription was keyed only by (connectionId, pattern): after a reconnect (a NEW client)
 *   subscribe/gesture/video nodes kept a handler on the dead client and went silent.
 * - Only clasp-connection nodes were counted as subscribers; deleting one node could close a
 *   link other nodes still used, and a connection node itself was never released.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface FakeClient {
  connected: boolean
  session: string
  on: ReturnType<typeof vi.fn>
  emit: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  onDisconnect: (cb: () => void) => void
  onError: (cb: (e: Error) => void) => void
  cached: () => undefined
  _disconnect: () => void
}

const h = vi.hoisted(() => ({ clients: [] as unknown[], gate: null as Promise<void> | null }))

vi.mock('@clasp-to/core', () => {
  class ClaspBuilder {
    constructor(public url: string) {}
    name() { return this }
    reconnect() { return this }
    token() { return this }
    async connect() {
      if (h.gate) await h.gate
      let onDisc: (() => void) | null = null
      const c = {
        connected: true,
        session: `s${h.clients.length}`,
        on: vi.fn(() => vi.fn()),
        emit: vi.fn(),
        close: vi.fn(() => { c.connected = false }),
        onDisconnect: (cb: () => void) => { onDisc = cb },
        onError: () => {},
        cached: () => undefined,
        _disconnect: () => { c.connected = false; onDisc?.() },
      }
      h.clients.push(c)
      return c
    }
  }
  return { ClaspBuilder, Clasp: class {} }
})

vi.mock('@/stores/connections', () => ({ useConnectionsStore: () => ({ connections: [] }) }))

import {
  claspConnectionExecutor,
  claspEmitExecutor,
  claspSubscribeExecutor,
  disposeClaspNode,
  disposeAllClaspConnections,
} from '@/engine/executors/clasp'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const clients = () => h.clients as FakeClient[]

function ctx(nodeId: string, inputs: Record<string, unknown> = {}, controls: Record<string, unknown> = {}): ExecutionContext {
  return {
    nodeId,
    inputs: new Map(Object.entries(inputs)),
    controls: new Map(Object.entries(controls)),
    definition: { controls: [] } as unknown as ExecutionContext['definition'],
    deltaTime: 0,
    totalTime: 0,
    frameCount: 0,
  }
}

const CONN = { connectionId: 'c1', url: 'ws://x', reconnectDelay: 1, autoConnect: true, autoReconnect: true }
const connNode = () => claspConnectionExecutor(ctx('conn-node', {}, CONN))

describe('CLASP reconnect bookkeeping', () => {
  beforeEach(() => {
    disposeAllClaspConnections()
    h.clients.length = 0
  })

  it('the first emit press after a reconnect is sent (edge tracked while offline)', async () => {
    await connNode()
    const emit = (trigger: number) => claspEmitExecutor(ctx('emit1', { trigger, connectionId: 'c1', address: '/e' }))
    await emit(1)
    expect(clients()[0].emit).toHaveBeenCalledTimes(1)

    clients()[0]._disconnect()
    await emit(0) // released while offline
    await sleep(10) // backoff reconnect (reconnectDelay 1ms) → new client
    await connNode()
    expect(clients()).toHaveLength(2)

    await emit(1)
    expect(clients()[1].emit).toHaveBeenCalledTimes(1)
  })

  it('subscribe re-subscribes on the NEW client after a reconnect', async () => {
    await connNode()
    await claspSubscribeExecutor(ctx('sub1', { connectionId: 'c1', pattern: '/a/*' }))
    expect(clients()[0].on).toHaveBeenCalledTimes(1)

    clients()[0]._disconnect()
    await sleep(10)
    await connNode()
    await claspSubscribeExecutor(ctx('sub1', { connectionId: 'c1', pattern: '/a/*' }))
    expect(clients()[1].on).toHaveBeenCalledTimes(1)
  })

  it('deleting one user keeps a shared link open; the last user (incl. the connection node) closes it', async () => {
    await connNode()
    await claspSubscribeExecutor(ctx('subA', { connectionId: 'c1', pattern: '/a' }))
    await claspSubscribeExecutor(ctx('subB', { connectionId: 'c1', pattern: '/b' }))
    disposeClaspNode('subA')
    expect(clients()[0].close).not.toHaveBeenCalled()
    disposeClaspNode('subB')
    expect(clients()[0].close).not.toHaveBeenCalled() // connection node still holds it
    disposeClaspNode('conn-node')
    expect(clients()[0].close).toHaveBeenCalledTimes(1)
  })

  it('a held Disconnect does not get immediately undone by auto-connect', async () => {
    await connNode()
    await claspConnectionExecutor(ctx('conn-node', { disconnect: 1 }, CONN))
    await claspConnectionExecutor(ctx('conn-node', { disconnect: 1 }, CONN))
    await claspConnectionExecutor(ctx('conn-node', { disconnect: 0 }, CONN))
    expect(clients()).toHaveLength(1) // no auto re-dial after a manual disconnect
    const out = await claspConnectionExecutor(ctx('conn-node', { connect: 1 }, CONN))
    expect(clients()).toHaveLength(2)
    expect(out.get('connected')).toBe(true)
  })
})

describe('executor barrel does not statically import executors/clasp', () => {
  it('index.ts re-exports the CLASP helpers from the lightweight facade', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.resolve(__dirname, '../../../src/renderer/engine/executors/index.ts'), 'utf8')
    expect(src).not.toMatch(/from '\.\/clasp'/)
    expect(src).toMatch(/from '\.\/claspRuntime'/)
  })
})

describe('CLASP connect races (audit 2026-11-23)', () => {
  beforeEach(() => {
    disposeAllClaspConnections()
    h.clients.length = 0
    h.gate = null
  })

  it('a connect that resolves after the node is deleted closes its socket instead of resurrecting', async () => {
    let open!: () => void
    h.gate = new Promise<void>((r) => { open = r })
    const pending = connNode()
    await sleep(0)
    disposeClaspNode('conn-node') // last user gone while the handshake is in flight
    open()
    await pending
    await sleep(0)
    expect(clients()).toHaveLength(1)
    expect(clients()[0].close).toHaveBeenCalled()
  })

  it('a Connect press during an in-flight auto-connect shares the dial (no orphan client)', async () => {
    let open!: () => void
    h.gate = new Promise<void>((r) => { open = r })
    const b = connNode() // creates c1 and starts dialling
    await sleep(0)
    const a = claspSubscribeExecutor(ctx('s1', {}, { connectionId: 'c1', pattern: '/a' }))
    const c = claspConnectionExecutor(ctx('conn-node', { connect: true }, CONN)) // explicit Connect mid-handshake
    await sleep(0)
    open()
    await Promise.all([a, b, c])
    expect(clients()).toHaveLength(1)
  })

  it('a node that switches connectionId releases (and closes) the connection it left', async () => {
    await claspConnectionExecutor(ctx('n1', {}, { ...CONN, connectionId: 'A' }))
    expect(clients()).toHaveLength(1)
    await claspConnectionExecutor(ctx('n1', {}, { ...CONN, connectionId: 'B' }))
    expect(clients()[0].close).toHaveBeenCalled()
    expect(clients()[1].close).not.toHaveBeenCalled()
  })
})
