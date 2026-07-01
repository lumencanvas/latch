# SECURITY_MODEL steps 2–6 — Implementation Plan (2026-07-01)

Turns `SECURITY_MODEL_2026-06-28.md` steps 2–6 from requirement into a buildable
mechanism, grounded in a 5-area code map (connection broker, capability manifest,
custom/community nodes, CSP/egress, execution isolation). Step 1 (no-secret
`ConnectionHandle`) is already shipped.

## What the code actually looks like (load-bearing facts)

- **One choke point.** Every connection node reaches a handle only through
  `resolveConnectionHandle()` (`engine/connection.ts:42-76`), called by `ctx.connection`
  (`ExecutionEngine.ts:155-160`). A capability gate here covers all present + future
  connection nodes. The credential lives on the broker-held adapter; the handle never
  exposes it (step 1, confirmed).
- **The declaration already exists.** `NodeSpec.connections: {protocol, controlId,
  required}[]` (`defineNode.ts:44`) is where a node states which protocol it needs. It is
  **advisory only** today — nothing gates on it.
- **A tested enforcement pass exists but is dead code.** `ConnectionValidator` (error
  codes, per-node/per-flow) has **zero production imports** — step-2 enforcement was
  scaffolded then never wired. We reuse its intent at the handle gate.
- **No provenance anywhere.** Nothing on `NodeDefinition` (the store type all three
  registration paths funnel through, `stores/nodes.ts:83-107`) records origin. The only
  origin signal is `CustomNodeLoader.isCustomNode()` (Electron-only, private).
  `CUSTOM_NODE_TYPE_IDS` is **not** provenance — do not build tiers on it.
- **No isolation, no CSP.** Executors run inline on the main thread (`ExecutionEngine.ts:482`
  `executor(context)`); `new Function` in `compiler.ts` does **not** sandbox (it claims to
  — false). No CSP exists (only COOP/COEP for SharedArrayBuffer).

## Design — the enforcement spine (steps 3 → 2 → 4): BUILD NOW

Ordered so each step is additive and behavior-preserving. Every existing node is Core
(built-in) or Local (user-dropped); **zero Community nodes exist** (no install flow), so
the enforcement path is dormant → no regression. The spine is the real security win: it
structurally prevents a future community node from grabbing a connection it didn't
declare + the user didn't approve — the n8n credential-theft class.

### Step 3 — Trust-tier tagging (foundation)
- Add `trust?: TrustTier` (`'core' | 'local' | 'community'`) to the store `NodeDefinition`
  (`stores/nodes.ts`). Default `'core'` when unset (every built-in). Additive metadata.
- Stamp at registration: built-in paths → `'core'`; `CustomNodeLoader.loadNode` (file
  drop) → `'local'`; `loadFromCode` (future web import) → `'community'`.
- `validator.ts:validateDefinition` must whitelist the field (unknown fields are dropped).
- Pure metadata; unit-testable; changes no behavior.

### Step 2 — Capability enforcement at the choke point
- Thread node identity into the gate: `ctx.connection` passes `{ nodeId, definition }`
  (both already in scope in `createExecutionContext`) to `resolveConnectionHandle`.
- In `resolveConnectionHandle`, after the protocol match: resolve the node's tier.
  - **Core / Local → allow** (pre-trusted; your own code). Unchanged behavior.
  - **Community →** require the protocol be declared in `definition.connections[].protocol`
    AND granted (step 4). Undeclared → deny (return `null` — executors already handle a
    null handle by emitting an error port, e.g. `mqtt.ts:71-77`). No throw, graceful.
- CLASP stays exempt (its own `ClaspConnection` layer). Injected `TrustResolver` +
  `GrantResolver` keep the engine UI-agnostic (mirrors the model-select resolver seam).
- Unit-testable: fake community definition × {undeclared, declared-ungranted,
  declared-granted}.

### Step 4 — Approval + per-(scope) grant memory
- New Pinia store `capabilityGrants`: records `{ nodeType, capability }` grants (capability
  = `connection:<protocol>` / `model:<task>`), persisted like other settings. Consulted by
  the gate for Community nodes.
- Approval is an **injected resolver** (`requestGrant(nodeType, capability) → Promise<bool>`)
  so the engine never imports UI; a modal implements it in-app, headless tests auto-decide.
- Model access (`ctx` model requests) reuses the same grant store + resolver.

## Design — steps 5 & 6: HONEST LIMITS (scaffold + document, don't fake)

### The boundary is isolation — the spine is defense-in-depth, not a wall (audit)

An adversarial red-team of the spine confirmed the honest limit up front: **without
execution isolation, the gate is not a boundary against actively malicious community
code.** Community executors run inline on the main thread with full ambient authority
(`compiler.ts` `new Function` is NOT a sandbox), so a malicious community node can:
- call `fetch` / `navigator.*` directly (never touching `ctx.connection`), and
- reach the credential-bearing adapter through ambient access (e.g. the connections
  store's `getAdapter`, whose adapter still holds `config`/`mqttConfig` with the
  password/token as readable properties).

So the accurate claim (strategy/05 don't-overclaim): the capability gate + no-secret
handle **stop accidental/undeclared misuse and are the enforcement layer that becomes a
real boundary once community executors are isolated** — they do **not** today confine a
malicious community node. The **priority follow-on** is therefore: (a) move adapter
credentials off enumerable properties into a broker-private `WeakMap` (so even the direct
`getAdapter` path can't read a secret), and (b) run `community`-tier executors in a Worker
with a message-port-only surface. Until both land, the honest posture is: **don't install
community nodes you don't trust** — the spine reduces damage, provenance/trust is the real
mitigation.

### Step 5 — Community `connect-src` egress: blocked on isolation
- **Web is a single document with one global CSP and community code shares the main-thread
  realm** — a CSP cannot tell which node issued a `fetch`, so per-node/per-tier egress is
  **not enforceable on web today**. And LATCH nodes legitimately talk to *arbitrary
  user-chosen endpoints* (any MQTT/HTTP/WS), so a restrictive whole-app `connect-src` would
  break the product. A permissive whole-app CSP buys ~no security.
- **The only real mechanism is per-node isolation:** run Community executors in a Web Worker
  with a message-port-only capability surface and **no ambient `fetch`** — then the worker's
  egress is what we hand it. Scaffold exists (`WorkerFacade`/`ai.worker.ts`) but running
  arbitrary executor *code* off-thread does not. This is a real, separable effort.
- **Electron** can additionally use `session.webRequest.onBeforeRequest` for a stronger
  process-level filter, but it's still session-global, not per-node.
- **Plan:** implement the trust/capability plumbing the isolation would key on (steps 2-4),
  document this limit in-code, and treat "Community-executor Worker sandbox + scoped egress"
  as the follow-on that actually delivers step 5. Do **not** ship a fake CSP.

### Step 6 — Install-time disclosure: needs an install/manifest system first
- No manifest (author/version/hash), no install/share/distribution exists; custom nodes are
  a manual folder drop (Electron). Full marketplace is new-feature scope.
- **Buildable now:** a `capabilities-of(definition)` helper (derive the human-readable
  permission list from `connections`/`requires`/`models`) + a disclosure hook at
  `loadFromCode`/`loadNode` that surfaces it before `register`. The manifest + install UX
  layer on top later.

## Follow-on design (from the isolation-feasibility map, 2026-07-01)

A code map of the community-executor execution path + the credential flow settled two things:

**Worker isolation is only partial — by physics, not effort.** ~9 executor categories
(visual/3d/shaders/video/audio/opencv/emulation/ai) are **fundamentally main-thread-bound**
(non-portable WebGL contexts, AudioContext, live `THREE.Texture`s — see the 3-WebGL-contexts
memory), so a community node in those categories **cannot** run in a Worker. Only the
~pure-compute half (math/logic/data/timing/string/…, ~100 nodes) is isolable, and even a
Worker keeps `fetch`/`WebSocket`/`importScripts` — you must *also* blank those inside the
worker + a `connect-src 'none'` CSP to stop egress, and `ctx.connection()` becomes an async
RPC back to the gated main-thread resolver (a real API change). So: Worker isolation is a
**partial** mitigation covering the low-value pure subset; the marquee categories are
structurally excluded and rely on trust/provenance. Don't advertise "sandboxed".

**The concrete credential leak is `getConnection`, not the adapter.** `ConnectionManager`
holds `connections: Map<id, BaseConnectionConfig>` where the config *is* the secret
(`MqttConnectionConfig.password`, `ClaspConnectionConfig.token`). Leak surfaces, all reachable
by ambient community code today: (1) `getConnection(id)`/`getConnections()` return the config
**with the secret**; (2) the field is TS-`private`, not runtime-private, so
`(getConnectionManager() as any).connections` reads it; (3) `stores/connections.ts` copies
configs into **reactive Pinia state**; (4) the adapter retains `this.config`/`mqttConfig`
(readable off a `getAdapter(id)` ref). The no-secret *handle* (step 1) is correct, but these
side channels bypass it.

**What Node-RED does (for reference).** Flows (`flows.json`) contain **no** secrets; credentials
live in a **separate, encrypted** `flows_cred.json` keyed by a `credentialSecret` (user-set or
auto-generated); password-typed fields are masked (`__PWRD__`) and never exposed in normal
operations or to the editor; the runtime recombines them. Its safety = **secret/flow separation +
encryption-at-rest + never handing secrets to the client.** A browser app can't fully match the
encryption-at-rest half (no secure key store outside Electron `safeStorage`), but the *don't hand
secrets around* half is very achievable — and is the higher-value, no-regression piece.

**DONE (2026-07-01) — public-API secret redaction (the achievable, Node-RED-aligned half).**
`ConnectionManager` now (`redactSecrets.ts`): (1) holds configs in a `#`-private map — not
reachable via `(mgr as any).connections`; (2) `getConnection*` + `connection-added/updated` events
return configs with secret fields (declared `props.type:'password'`, or secret-named) masked to a
placeholder — so node/community code and the reactive UI store never receive a real secret; (3)
`connect()` + `exportConnections()` read the raw private map, so auth + flow persistence are
unchanged; (4) `updateConnection` merge-preserves a masked field (Node-RED's `__PWRD__`) so a UI
round-trip can't erase a saved secret. Clasp's `token` is now a masked password field. Bounded
(one service + a helper), unit-tested + mutation-verified, zero regression.

**Residual (deliberately NOT over-engineered) — the honest limits:**
- The flow file still embeds the real secret (persistence). A browser can't encrypt-at-rest; Electron
  *could* route these through the `safeStorage`-backed `CredentialStore` (dead scaffolding today) — a
  follow-on, gated on whether flow-sharing-leaks-passwords is a real concern for the target users.
- The connected adapter still holds the secret on `this.config` (readable via `getAdapter(id)`), and a
  community executor has ambient `import()`/`fetch` — so **full** confinement still needs Worker
  isolation of pure-compute community nodes (per the map above). The redaction closes the broad,
  casual path; it is defense-in-depth, not a wall — which, per the "not perfectly hardened is OK"
  call, is the right stopping point until community distribution actually exists.

**Superseded recommendation (kept for context) — credential hardening (multi-surface):**
1. Store secrets in a truly-private structure (a `#`-private field or a module-private
   `Map`/`WeakMap`), never on the instance-reachable config or the adapter's enumerable props.
2. `getConnection*` + the store's reactive state expose only a **secret-redacted DTO**; the
   internal `connect()`/`createAdapter` path reads the real secret from the private store.
3. Adapter secrets (`MqttAdapter` username/password, clasp token) move to the private store too.
**Caveat that makes this a careful effort, not a quick one:** the UI add/edit flow round-trips
configs through the store — redaction must not drop a secret on save (credential *persistence*
regression), and the auth paths are hardware/broker-bound (verify by reasoning from the code +
unit-testing the redaction/private-storage seams, not headlessly). Residual after all this: the
browser `MemoryCredentialStore` still holds plaintext in memory — unavoidable without a backend.

Net: credential hardening first (it closes the real exfiltration path, independent of egress);
Worker-isolate pure community nodes second (partial, and gated behind a real want for community
distribution — no marketplace exists yet).

## Sequencing
1. Step 3 trust field (additive, testable). 2. Step 2 gate (dormant for Core/Local).
3. Step 4 grant store + resolver. 4. `capabilities-of` helper (step-6 core). 5. Document
step-5 isolation requirement in-code; the Community-Worker sandbox is the follow-on.
Each step: `typecheck` + `lint` + `test:unit` green; adversarially audit the gate before commit.
