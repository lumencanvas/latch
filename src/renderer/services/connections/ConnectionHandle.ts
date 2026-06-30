/**
 * `ConnectionHandle` — the no-secret capability surface a node gets for an approved
 * connection (SECURITY_MODEL_2026-06-28 step 1; impl decision
 * CONNECTION_HANDLE_IMPL_2026-06-29).
 *
 * The broker (ConnectionManager) holds the adapter + its config (incl. credentials);
 * a node receives only this handle, which forwards a curated set of safe operations
 * and NEVER exposes the config / url / token / the raw adapter. For Core-tier
 * built-in nodes this is hygiene (they could be trusted with the adapter); it becomes
 * the credential-theft mitigation once untrusted Community nodes are handed the same
 * API with the secret withheld — and being the contract from the start, that needs no
 * breaking change later (POLICIES §2).
 *
 * Typed per protocol (the protocols genuinely differ — MQTT pub/sub, WS duplex, HTTP
 * request/response): one base interface extended per protocol. Resolve via
 * `ctx.connection<MqttHandle>({ protocol: 'mqtt' })`.
 */

import type { ConnectionAdapter, ConnectionStatus, ConnectionStatusInfo } from './types'
// Type-only — no runtime dependency on the heavy adapter modules.
import type { MqttAdapterImpl } from './adapters/MqttAdapter'
import type { HttpAdapterImpl } from './adapters/HttpAdapter'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Base capability surface: identity + status, no secret. */
export interface ConnectionHandle {
  readonly protocol: string
  readonly status: ConnectionStatus
  onStatusChange(cb: (status: ConnectionStatusInfo) => void): () => void
}

export interface MqttHandle extends ConnectionHandle {
  subscribe(topic: string, qos?: 0 | 1 | 2): void
  unsubscribe(topic: string): void
  onMessage(cb: (message: { topic?: string; data: unknown }) => void): () => void
  publish(topic: string, data: unknown, opts?: { qos?: 0 | 1 | 2; retain?: boolean }): void
}

export interface WebSocketHandle extends ConnectionHandle {
  onMessage(cb: (message: { data: unknown }) => void): () => void
  send(data: unknown): Promise<void>
}

export interface HttpHandle extends ConnectionHandle {
  request(opts: {
    method: HttpMethod
    path: string
    headers?: Record<string, string>
    body?: unknown
  }): Promise<unknown>
  executeTemplate(
    templateId: string,
    params: Record<string, unknown>,
    opts?: { headers?: Record<string, string>; body?: unknown }
  ): Promise<unknown>
}

/** Base handle: closes over the adapter, exposes only protocol + live status + status events. */
function createBaseHandle(adapter: ConnectionAdapter): ConnectionHandle {
  return {
    protocol: adapter.protocol,
    get status() {
      return adapter.status
    },
    onStatusChange: (cb) => adapter.onStatusChange(cb),
  }
}

/** MQTT handle: forwards subscribe/unsubscribe/publish/onMessage; no config reachable. */
function createMqttHandle(adapter: MqttAdapterImpl): MqttHandle {
  return {
    protocol: adapter.protocol,
    get status() {
      return adapter.status
    },
    onStatusChange: (cb) => adapter.onStatusChange(cb),
    subscribe: (topic, qos = 0) => adapter.subscribe(topic, qos),
    unsubscribe: (topic) => adapter.unsubscribe(topic),
    onMessage: (cb) => adapter.onMessage(cb),
    publish: (topic, data, opts) => adapter.publish(topic, data, opts),
  }
}

/** WebSocket handle: forwards send/onMessage (a single duplex channel, no topics). */
function createWebSocketHandle(adapter: ConnectionAdapter): WebSocketHandle {
  return {
    protocol: adapter.protocol,
    get status() {
      return adapter.status
    },
    onStatusChange: (cb) => adapter.onStatusChange(cb),
    onMessage: (cb) => adapter.onMessage(cb),
    send: (data) => adapter.send(data),
  }
}

/** HTTP handle: forwards request/executeTemplate (request/response; baseUrl + auth headers stay hidden). */
function createHttpHandle(adapter: HttpAdapterImpl): HttpHandle {
  return {
    protocol: adapter.protocol,
    get status() {
      return adapter.status
    },
    onStatusChange: (cb) => adapter.onStatusChange(cb),
    request: (opts) => adapter.request(opts),
    executeTemplate: (templateId, params, opts) => adapter.executeTemplate(templateId, params, opts),
  }
}

/**
 * Wrap a broker-held adapter in its protocol's no-secret handle (mqtt/websocket/http).
 * Any other protocol (osc/clasp/ble/…) gets the base handle until it grows a typed
 * surface. The adapter is closed over, never returned or exposed.
 */
export function createConnectionHandle(adapter: ConnectionAdapter): ConnectionHandle {
  switch (adapter.protocol) {
    case 'mqtt':
      return createMqttHandle(adapter as MqttAdapterImpl)
    case 'websocket':
      return createWebSocketHandle(adapter)
    case 'http':
      return createHttpHandle(adapter as HttpAdapterImpl)
    default:
      return createBaseHandle(adapter)
  }
}
