import { describe, it, expect, vi } from 'vitest'
import {
  createConnectionHandle,
  type MqttHandle,
  type WebSocketHandle,
  type HttpHandle,
} from '@/services/connections/ConnectionHandle'
import type { ConnectionAdapter } from '@/services/connections/types'

/**
 * The ConnectionHandle is the no-secret capability surface (SECURITY_MODEL step 1):
 * it must forward the safe operations the executors use and must NOT expose the
 * adapter's config / credentials. These are the executable form of that invariant.
 */

// A fake MQTT adapter that DOES carry a secret — the handle must not surface it.
function fakeMqttAdapter() {
  return {
    protocol: 'mqtt',
    status: 'connected',
    connectionId: 'c1',
    // secrets that must never leak through the handle:
    config: { username: 'admin', password: 'hunter2' },
    mqttConfig: { username: 'admin', password: 'hunter2' },
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    publish: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    onStatusChange: vi.fn(() => () => {}),
  } as unknown as ConnectionAdapter
}

describe('ConnectionHandle — no-secret invariant', () => {
  it('does not expose config / credentials / the raw adapter', () => {
    const handle = createConnectionHandle(fakeMqttAdapter()) as MqttHandle & Record<string, unknown>

    // No secret-bearing field is reachable on the handle.
    for (const forbidden of ['config', 'mqttConfig', 'password', 'username', 'connectionId', 'adapter']) {
      expect(handle[forbidden]).toBeUndefined()
    }
    // Serializing the handle leaks nothing secret either.
    expect(JSON.stringify(handle ?? {})).not.toMatch(/hunter2|admin/)
  })

  it('exposes only the curated MQTT operations + live status', () => {
    const adapter = fakeMqttAdapter()
    const handle = createConnectionHandle(adapter) as MqttHandle

    expect(handle.protocol).toBe('mqtt')
    expect(handle.status).toBe('connected')

    handle.subscribe('a/b', 1)
    expect(adapter.subscribe).toHaveBeenCalledWith('a/b', 1)

    handle.publish('a/b', { x: 1 }, { qos: 2 })
    expect(adapter.publish).toHaveBeenCalledWith('a/b', { x: 1 }, { qos: 2 })

    handle.unsubscribe('a/b')
    expect(adapter.unsubscribe).toHaveBeenCalledWith('a/b')

    const off = handle.onMessage(() => {})
    expect(adapter.onMessage).toHaveBeenCalled()
    expect(typeof off).toBe('function')
  })

  it('status getter reflects live adapter status (not a snapshot)', () => {
    const adapter = fakeMqttAdapter()
    const handle = createConnectionHandle(adapter)
    expect(handle.status).toBe('connected')
    ;(adapter as unknown as { status: string }).status = 'reconnecting'
    expect(handle.status).toBe('reconnecting')
  })
})

describe('ConnectionHandle — websocket', () => {
  function fakeWsAdapter() {
    return {
      protocol: 'websocket',
      status: 'connected',
      config: { url: 'wss://secret@host', token: 'abc' },
      send: vi.fn(() => Promise.resolve()),
      onMessage: vi.fn(() => () => {}),
      onStatusChange: vi.fn(() => () => {}),
    } as unknown as ConnectionAdapter
  }

  it('exposes send/onMessage, hides config/token', () => {
    const adapter = fakeWsAdapter()
    const handle = createConnectionHandle(adapter) as WebSocketHandle & Record<string, unknown>
    for (const forbidden of ['config', 'token', 'url']) expect(handle[forbidden]).toBeUndefined()
    handle.send({ a: 1 })
    expect(adapter.send).toHaveBeenCalledWith({ a: 1 })
    expect(typeof handle.onMessage(() => {})).toBe('function')
    expect(JSON.stringify(handle)).not.toMatch(/secret|abc/)
  })
})

describe('ConnectionHandle — http', () => {
  function fakeHttpAdapter() {
    return {
      protocol: 'http',
      status: 'connected',
      config: { baseUrl: 'https://api', headers: { Authorization: 'Bearer SECRET' } },
      request: vi.fn(() => Promise.resolve({ ok: true })),
      executeTemplate: vi.fn(() => Promise.resolve({ ok: true })),
      onStatusChange: vi.fn(() => () => {}),
    } as unknown as ConnectionAdapter
  }

  it('exposes request/executeTemplate, hides config/auth headers', async () => {
    const adapter = fakeHttpAdapter()
    const handle = createConnectionHandle(adapter) as HttpHandle & Record<string, unknown>
    for (const forbidden of ['config', 'headers', 'baseUrl']) expect(handle[forbidden]).toBeUndefined()
    await handle.request({ method: 'GET', path: '/x' })
    expect((adapter as unknown as { request: ReturnType<typeof vi.fn> }).request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/x',
    })
    expect(JSON.stringify(handle)).not.toMatch(/SECRET/)
  })
})
