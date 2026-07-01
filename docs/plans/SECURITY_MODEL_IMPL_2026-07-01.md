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

## Sequencing
1. Step 3 trust field (additive, testable). 2. Step 2 gate (dormant for Core/Local).
3. Step 4 grant store + resolver. 4. `capabilities-of` helper (step-6 core). 5. Document
step-5 isolation requirement in-code; the Community-Worker sandbox is the follow-on.
Each step: `typecheck` + `lint` + `test:unit` green; adversarially audit the gate before commit.
