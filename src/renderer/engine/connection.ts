/**
 * `ctx.connection()` resolution — one shared implementation of the per-frame
 * connection lookup the mqtt/ws/http executors used to each copy
 * (CONNECTION_HANDLE_IMPL_2026-06-29).
 *
 * Resolves the selected connection id from a control/input, returns a no-secret
 * {@link ConnectionHandle} (the broker holds the credential), and auto-connects with
 * a single shared throttle so a persistently-failing connection isn't re-dialed every
 * frame. Synchronous + fire-and-forget connect: the handle is returned immediately and
 * the executor serves last-value until `handle.status === 'connected'` (the existing
 * behavior; the old code's awaited connect could block a frame — this no longer does).
 *
 * Kept out of `ExecutionEngine` proper so the engine's connection-store dependency is
 * isolated here. CLASP is exempt (keeps its own `ClaspConnection` layer).
 */

import { useConnectionsStore } from '@/stores/connections'
import { createConnectionHandle } from '@/services/connections/ConnectionHandle'
import type { ConnectionHandle } from '@/services/connections/ConnectionHandle'
import type { ConnectionAdapter } from '@/services/connections/types'
import { isPreTrusted, type TrustTier } from '@/services/security/trust'

export interface ConnectionResolveOptions {
  /** Control/input id holding the selected connection (default `'connectionId'`). */
  controlId?: string
  /** If set, the resolved adapter's protocol must match (else `null`). */
  protocol?: string
}

/**
 * The requesting node's capability context (SECURITY_MODEL step 2). Resolved by the
 * engine from the AUTHORITATIVE registry definition (never the node's embedded copy, so
 * a community node can't spoof its tier or declarations via its flow file). Omitted →
 * no gating (the pre-step-2 behavior; kept for direct/test callers).
 */
export interface ConnectionCapabilityContext {
  /** The node's trust tier. Only `community` is gated; `core`/`local` bypass. */
  readonly trust: TrustTier
  /** Protocols the node DECLARED in its manifest (`definition.connections[].protocol`). */
  readonly declaredProtocols: readonly string[]
}

// Throttle auto-connect attempts per connection (~once / 2s) instead of every frame.
const lastConnectAttempt = new Map<string, number>()
const RECONNECT_THROTTLE_MS = 2000

// One handle per adapter instance — avoids per-frame allocation; WeakMap so a removed
// connection's handle is collectable.
const handleCache = new WeakMap<ConnectionAdapter, ConnectionHandle>()

/**
 * Resolve the no-secret connection handle for the current node. `read(id)` is the
 * context's `input ?? control` reader. Returns `null` when no connection is selected,
 * the adapter is unavailable, or its protocol doesn't match `opts.protocol`.
 */
export function resolveConnectionHandle<T extends ConnectionHandle = ConnectionHandle>(
  read: (id: string) => unknown,
  opts?: ConnectionResolveOptions,
  cap?: ConnectionCapabilityContext
): T | null {
  const id = (read(opts?.controlId ?? 'connectionId') as string) || ''
  if (!id) return null

  let store: ReturnType<typeof useConnectionsStore>
  try {
    store = useConnectionsStore()
  } catch {
    return null
  }

  const adapter = store.getAdapter(id)
  if (!adapter) return null
  if (opts?.protocol && adapter.protocol !== opts.protocol) return null

  // SECURITY_MODEL step 2: a community node may only reach a connection whose protocol it
  // DECLARED in its manifest. Core/local nodes are pre-trusted and bypass. Undeclared →
  // deny (null) BEFORE auto-connecting; executors already surface a null handle on an
  // error port. (Step 4 will additionally require user approval for declared protocols.)
  if (cap && !isPreTrusted(cap.trust) && !cap.declaredProtocols.includes(adapter.protocol)) {
    return null
  }

  if (adapter.status !== 'connected') {
    const now = Date.now()
    if (now - (lastConnectAttempt.get(id) ?? 0) >= RECONNECT_THROTTLE_MS) {
      lastConnectAttempt.set(id, now)
      void store.connect(id).catch((e) => console.warn('[connection] auto-connect failed:', e))
    }
  } else {
    lastConnectAttempt.delete(id)
  }

  let handle = handleCache.get(adapter)
  if (!handle) {
    handle = createConnectionHandle(adapter)
    handleCache.set(adapter, handle)
  }
  return handle as T
}
