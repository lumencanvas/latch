# Connection Access Implementation Decision — `ctx.connection()` + `ConnectionHandle` (2026-06-29)

**Status: AWAITING MAINTAINER SIGN-OFF.** No code written. This memo pins the concrete
implementation of ROADMAP step 6b's `ctx.connection()` helper against the *no-secret
`ConnectionHandle`* shape chosen by the maintainer (2026-06-29), grounding
`SECURITY_MODEL_2026-06-28.md` step 1 in the real executor code. The companion design
(threat model, trust tiers, CSP) is `SECURITY_MODEL_2026-06-28.md`; this is the
buildable plan for the *first* security step (no-secret handle + broker proxy +
executor migration). It deliberately scopes OUT the Community-tier approval/CSP work.

---

## 1. What the real executors actually use (verified)

`mqtt.ts`, `websocket.ts`, `http.ts` each copy the same ~50-line block: a
`getXAdapter(id)` (→ `connectionsStore.getAdapter(id)`, cast by `adapter.protocol`)
+ `ensureConnected(id)` (throttled auto-connect, `RECONNECT_THROTTLE_MS = 2000`, reset
on success) + per-node `defineNodeState` stores whose `dispose` releases listeners.
The protocol-specific calls they make on the adapter:

| Protocol | Methods called on the adapter | Reads |
|---|---|---|
| MQTT (`mqtt.ts:150,153,180,31`) | `subscribe(topic, qos)`, `onMessage(cb) → unsub`, `publish(topic, data, {qos})`, `unsubscribe(topic)` | `status` |
| WebSocket (`websocket.ts:130,143`) | `onMessage(cb) → unsub`, `send(data)` | `status` |
| HTTP (`http.ts:163,173`) | `request({method,path,headers,body})`, `executeTemplate(templateId, params, opts)` | `status` |

Plus the shared store calls: `getAdapter(id)`, `connect(id)` (`stores/connections.ts`).
**Key fact:** built-in executors already hold the raw adapter today — including
`MqttAdapterImpl.mqttConfig` with `username`/`password`. So for **Core-tier built-ins**
the handle adds *no* new exposure; its value is (a) killing the copy-paste, (b) being
the forward-compatible contract so untrusted Community nodes can later be handed the
*same* API with the credential withheld — no breaking change (POLICIES §2).

**Design tension this resolves:** the three protocols are NOT uniform — MQTT is
topic pub/sub, WS is a single duplex channel, HTTP is request/response (plus a
no-connection `fetch` fallback at `http.ts:132` that must stay). A single flat handle
can't model all three cleanly. → **protocol-specific typed handles over one base.**

---

## 2. The `ConnectionHandle` contract (no secret crosses the boundary)

```ts
// services/connections/ConnectionHandle.ts (new)
export interface ConnectionHandle {
  readonly protocol: string
  readonly status: ConnectionStatus        // safe to read
  onStatusChange(cb: (s: ConnectionStatusInfo) => void): () => void
  // NO config, NO url, NO token, NO connectionId-with-embedded-auth, NO raw adapter
}

export interface MqttHandle extends ConnectionHandle {
  subscribe(topic: string, qos?: 0|1|2): void
  unsubscribe(topic: string): void
  onMessage(cb: (m: { topic?: string; data: unknown }) => void): () => void
  publish(topic: string, data: unknown, opts?: { qos?: 0|1|2; retain?: boolean }): void
}
export interface WebSocketHandle extends ConnectionHandle {
  onMessage(cb: (m: { data: unknown }) => void): () => void
  send(data: unknown): Promise<void>
}
export interface HttpHandle extends ConnectionHandle {
  request(opts: { method: HttpMethod; path: string; headers?: Record<string,string>; body?: unknown }): Promise<unknown>
  executeTemplate(templateId: string, params: Record<string,unknown>, opts?: { headers?: Record<string,string>; body?: unknown }): Promise<unknown>
}
```

The broker (`ConnectionManager`) holds the adapter+config and returns a **thin
forwarding wrapper** that closes over the adapter and exposes only the methods above.
The wrapper is constructed once per (connectionId) and cached, with its message/status
listeners tracked so they are released on disconnect/dispose. **It never returns `this`
adapter and never has a `config`/`url`/`token` getter** — that is the entire security
property for step 1.

> Honest scope (state plainly, per `strategy/05`): for **Core/Local** (your own) nodes
> this is mostly hygiene — they could be trusted with the adapter. The credential-theft
> mitigation only *bites* once Community nodes exist and are handed a handle instead of
> an adapter. Steps 2–6 of `SECURITY_MODEL` (capability declaration enforcement,
> per-tier approval, CSP `connect-src`) are **NOT in this step** — they layer on later.

---

## 3. `ctx.connection()` — signature + wiring

```ts
// added to ExecutionContext (ExecutionEngine.ts:75-93)
connection<T extends ConnectionHandle = ConnectionHandle>(opts?: {
  controlId?: string     // where the selected connection id lives (default 'connectionId')
  protocol?: string      // optional assert: returned handle's protocol must match
}): T | null             // null when unselected / wrong protocol / adapter unavailable
```

- **Resolution:** read the id via `input ?? control` for `controlId` (default
  `'connectionId'`) — the exact precedence the executors use today
  (`mqtt.ts:93`). Empty id → `null`.
- **Auto-connect:** a single shared module-level throttle (`Map<id, ts>`,
  `RECONNECT_THROTTLE_MS = 2000`) replacing the three per-file copies; fire-and-forget
  `broker.connect(id)` when `status !== 'connected'`, reset on success. Returns the
  handle immediately (the executor checks `handle.status`, as it checks `adapter.status`
  today) — preserves the current "serve last value until connected" behavior.
- **Where it's built:** `ctx.connection` is added in `createExecutionContext`
  (`ExecutionEngine.ts:108`) like `num/bool/str`. The broker is resolved **lazily inside
  the method** via `useConnectionsStore()` (exactly how the executors do it today,
  `mqtt.ts:45`) — so `createExecutionContext` gains **no** eager store dependency and
  existing context-construction tests are unaffected. The method closes over
  `data.nodeId`, `data.inputs`, `data.controls`.

**CLASP stays exempt** (`clasp.ts` keeps its `ClaspConnection` layer); `ctx.connection()`
is purely additive — clasp executors are not touched.

---

## 4. Executor migration (behavior-identical)

Each of mqtt/ws/http: delete `getXAdapter` + `ensureConnected` + the per-file
`lastConnectAttempt`/`RECONNECT_THROTTLE_MS`; replace `const adapter = await
ensureConnected(id)` with `const conn = ctx.connection<MqttHandle>()`. The
per-node `defineNodeState` stores and their `dispose` callbacks (the leak-safe
teardown) are **unchanged** — they already hold `unsubscribe` closures, which now come
from `handle.onMessage`/`handle.subscribe` instead of the adapter. The subtle rewire
semantics must be preserved verbatim:
- MQTT `mqtt.ts:140-175`: replace listener on topic change but do NOT `adapter.unsubscribe`
  on rewire (only on `.delete()` full teardown); `!topic && existingSub` → `.delete()`.
- WS `websocket.ts:122-138`: `.delete()` on connection change (dispose unsubscribes).
- HTTP `http.ts`: request/executeTemplate via the handle; **keep the no-connection
  `fetch` fallback** (`executeDirectRequest`) exactly as-is.

The `disposeXNode`/`disposeAllXNodes`/`gcXState` exports stay (export-contract-pinned;
they delegate to the stores). `mqtt.ts:31`'s `getMqttAdapter(sub.connectionId)?.unsubscribe`
in the store `dispose` becomes `broker`-routed unsubscribe (the handle's `unsubscribe`,
captured in the sub entry).

---

## 5. Gate + verification

- **Subscribe/unsubscribe leak test** (the step-6b gate): create an mqtt/ws node in
  dirty mode, drive a subscribe, delete the node → assert the broker has zero residual
  listeners for that connection AND the per-node store is empty. Mutation-verify by
  reverting the `dispose` wiring.
- **No-secret assertion test:** `Object.keys(handle)` / property probes confirm no
  `config`/`url`/`token`/`password` is reachable from a handle (the security invariant
  as an executable check).
- Each step green (typecheck+lint+test:unit); **smoke** (mqtt/ws/http nodes if a flow
  exists, else boot→Play→Stop 0-error) since this is runtime-touching.

---

## 6. Trust tiers (tagging only, this step)

Tag each registered protocol/node with a `TrustTier` at registration time
(`'core'` for glob-collected built-ins, `'local'`/`'community'` for `CustomNodeLoader`).
This step only **records** the tier (so steps 2–6 have it to gate on); it does **not**
yet prompt, enforce capability declarations, or apply CSP. The built-in path is always
`core` → no behavior change.

---

## 7. Explicitly deferred (NOT this step)

Capability-declaration enforcement (throw on undeclared), Community approval prompt +
per-(flow,type,capability) memory, Community CSP `connect-src` allowlist / Electron
session filter, install-time capability disclosure UX (all `SECURITY_MODEL` steps 2–6);
adapter physical co-location into `protocols/<name>/`; BLE/Serial/MIDI drift fix.

---

## 8. Open questions for sign-off

1. **Handle granularity** — confirm protocol-specific typed handles (`MqttHandle` etc.)
   over a base, vs. a single flat handle with optional methods. (Recommend typed — the
   three protocols genuinely differ; §1.)
2. **`controlId` default** — every executor uses `'connectionId'` today; OK to bake that
   as the default and let a node override?
3. **HTTP `request`/`executeTemplate` on a "handle"** — these return data (not pub/sub).
   Fine to expose them on `HttpHandle` (still no-secret), or do you want HTTP left on the
   raw adapter for now since it's request/response, not a persistent channel?
4. **Scope of this PR** — land handle + `ctx.connection()` + migrate all three executors
   together, or handle + mqtt only first (smallest reviewable slice), then ws/http?
