# LATCH Security Model — Custom Nodes, Connections & Models (2026-06-28)

The *mechanism* (not just the requirement) for letting custom/community nodes use
register-once connections and AI models without the credential-theft failure that
burned n8n. **Phase 2 deliverable** (`ROADMAP`); fulfills EXTENSIBILITY §0.5 #2 and
`strategy/02` #2 / `strategy/06` §7.

## The threat (verified, not hypothetical)

The **2026 n8n supply-chain attack** shipped malicious community nodes that
exfiltrated **decrypted** OAuth tokens at runtime because "there is no sandboxing or
isolation between node code and the n8n runtime." ComfyUI had two confirmed malware
incidents (credential stealer + a cryptominer via a transitive dep). The root cause
is identical everywhere: **node code runs with full privileges and is handed live
credentials.** LATCH's `defineProtocol`/`defineModel` *convenience* — a node asking
the registry for a live, authenticated connection — is exactly this surface.

LATCH has a **structural advantage** (the web sandbox: no `fs`, no `exec`, no native
spawn) — lean on it. But it has a residual hole: **a node can still `fetch()` to an
attacker's server.** So the design must ensure a malicious node **never possesses a
credential to exfiltrate**, and constrain where untrusted nodes can talk.

## Principle: the broker holds the secret; the node gets a capability handle

`ctx.connection()` must **never return the credential.** It returns a **scoped
capability handle** bound to one approved protocol + endpoint:

```ts
interface ConnectionHandle {
  send(message): void          // routed through the broker; node never sees the token
  subscribe(cb): () => void
  readonly status: ConnectionStatus
  // NO token / no config / no URL with embedded auth exposed
}
```

The ConnectionManager (the broker) holds the secret, performs auth, and proxies
send/receive. A node can spam its approved channel, but it cannot read the secret,
cannot retarget the connection, and cannot enumerate other connections. This neuters
the n8n exfiltration class for *credentials* (the highest-value secret).

## Capability declaration + user approval

1. **Declare:** a node's `defineNode` manifest lists exactly what it needs —
   `connections: [{ protocol: 'mqtt' }]`, `models: [{ task: 'object-detection' }]`,
   `requires: ['camera']`. This is the capability manifest (already part of
   `NodeSpec`, EXTENSIBILITY §3).
2. **Approve (untrusted nodes only):** the first time an **untrusted** node instance
   requests a capability, show a one-time approval ("*Node 'X' wants to use your MQTT
   connection 'broker-1'. Allow?*"), remembered per (flow, node-type, capability).
   Built-in and user-authored-local nodes are pre-trusted (see tiers); only
   distributed/community nodes prompt.
3. **Enforce:** `ctx.connection()` / model access throws if the capability wasn't
   declared + approved. No blanket access.

## Trust tiers

| Tier | Source | Default capabilities | `fetch`/network |
|------|--------|---------------------|-----------------|
| **Core** | shipped built-ins | all (vetted in-repo) | unrestricted |
| **Local** | user-authored in `custom-nodes/` (you wrote it) | all, no prompt | unrestricted |
| **Community** | installed from a share/registry | **none until approved**; capability-gated | **CSP `connect-src` allowlist** (only declared protocol endpoints + same-origin) |

The Community tier is where the prompts + the CSP `connect-src` restriction apply —
constraining the residual `fetch`-to-attacker hole for the only code we didn't write.
(Core/Local are your own code; restricting them buys little and hurts usability.)

## Constraining the residual `fetch` hole (Community tier)

The web sandbox stops `fs`/`exec` but not arbitrary `fetch`. For Community nodes:
- Run their executor under a **CSP `connect-src` allowlist** derived from their
  declared capabilities (the broker's endpoints + same-origin assets) — a network
  egress firewall. A node that declares only MQTT can't POST your data to
  evil.example. (Enforced via the page CSP for web; the Electron build can use
  session request filtering for stronger guarantees.)
- Honest limit (state it): a Community node still *sees* the data flowing through it
  and could exfiltrate via an *allowed* channel; CSP + capability-scoping raise the
  bar and stop the credential-theft + arbitrary-egress classes, but **no in-process
  model fully sandboxes a node that legitimately processes sensitive data.** The
  ultimate mitigations are trust/provenance + (future) running Community executors in
  a Web Worker with a message-port-only capability surface.

## Provenance / distribution

- Community nodes carry a manifest (author, version, declared capabilities, hash).
- The install UX shows the capability list **before** install ("this node will be
  able to: use MQTT connections; download the YOLO model") — informed consent, the
  thing every burned ecosystem lacked.
- A future signed-author / verified tier can layer on top; don't gate on it for v1.

## Model access (same shape)

`defineModel` access is capability-gated too: a node declares `models:[{task}]`; the
registry resolves + lazy-loads; the node gets inference results, not the model
weights or any cloud key (LATCH ML is in-browser, so there's usually no key — but the
same no-blanket-access rule holds for any future hosted model).

## What this fulfills

EXTENSIBILITY §0.5 #2 (capability-scoped + user-approved + trust tier) and `strategy/
06` §4/§7 (the highest-severity security gap) — moving them from "requirement" to a
buildable mechanism: **broker-holds-secret + capability-manifest + per-tier approval
+ Community CSP egress allowlist**, with the honest residual limit stated.

## Implementation order (within Phase 2)

1. `ConnectionHandle` (no-secret) return from `ctx.connection()` + broker proxying.
2. Capability declaration enforcement (throw on undeclared).
3. Trust-tier tagging (Core/Local/Community) on registration.
4. Community approval prompt + per-(flow,type,capability) memory.
5. Community CSP `connect-src` allowlist (web) / session filter (Electron).
6. Install-time capability disclosure UX.
