# WebMCP / Agent Tools — Implementation Plan

**Status:** Phases 1–2 implemented in 1.5.0 (see “Implementation status” below and docs/AGENT_ACCESS.md) · **Date:** 2026-11-25 · **Scope:** web (latch.design) + Electron desktop
**One-line goal:** let an AI agent in or alongside the browser discover and call LATCH tools
(inspect the node catalog, build and edit graphs, play and stop, read values and errors, capture
the main output, manage flows), with consent, undo and secret safety built into the design.

## Implementation status (1.5.0)

- **Done:** the registry pipeline (mode gate, schema validation, rate limits, default-deny consent,
  serial queue, 30 s timeout, 64 KB result cap, activity log), 36 tools across the five tiers,
  per-flow “revert agent changes” checkpoints, code nodes forced disabled, secret masking, the
  header menu and consent dialog, native WebMCP with the `@w3c/webmcp-polyfill` fallback, and the
  local relay (the vendored, pinned `widget.js` loaded from blob scripts, so it also works under
  the Electron CSP).
- **Changed from the plan:** we use `@w3c/webmcp-polyfill` instead of `@mcp-b/global`, because the
  relay widget reads `document.modelContext` directly. We use our own loader instead of the
  relay's `embed.js`, which also drops its "reload the page" message. There is no Electron MCP
  server (Phase 3), because the relay covers desktop too (`--widget-origin app://latch`).
  `controlValue.ts` is shared with ControlRenderer.
- **Verified:** with a real MCP client over the relay against `npm run dev` in Chrome: tool
  listing, create flow, build graph, validate, play (after consent), runtime state, node output
  reads, a refused bad wire, a clamped control and undo. `capture_output` has not been tested
  end to end, and neither has Electron.
- **Open:** the Phase 4 items, Electron verification, and whether a Main Output capture should
  also be offered without the flow playing.

---

## 1. Research findings (state of the art, late Nov 2026)

### 1.1 The WebMCP spec (W3C Web Machine Learning CG)

Source: the Draft Community Group Report, **dated 24 Nov 2026**: <https://webmachinelearning.github.io/webmcp/>

- **The entry point moved from `navigator` to `document`.** The current IDL is
  `partial interface Document { [SecureContext, SameObject] readonly attribute ModelContext modelContext; }`.
  The change landed in spec PR #184 (<https://github.com/webmachinelearning/webmcp/pull/184>).
  Chrome 150 deprecated `navigator.modelContext` and keeps it as an alias that logs a warning
  (<https://byteiota.com/webmcp-chrome-150-navigator-modelcontext-deprecation/>). Angular already
  moved to the new surface (<https://github.com/angular/angular/commit/683172b39a602ac9ec15db69d22853433a67a084>).
  **Feature-detect `document.modelContext ?? navigator.modelContext`.**
- **`ModelContext` (an `EventTarget`) exposes:**
  - `registerTool(tool, { signal?, exposedTo? }): Promise<undefined>`
  - `getTools({ fromOrigins? })`
  - `executeTool(tool, input, { signal? }): Promise<DOMString>`
  - `waitForToolsUntil(promise)`
  - the events `toolchange`, `toolactivated` and `toolcancel`
- **Removed from the spec:** `unregisterTool` (a tool is now unregistered by aborting the
  `signal` passed at registration), and `provideContext` / `clearContext` (dropped Mar 2026; see
  <https://www.pkgstats.com/pkg:@mcp-b/global>).
- **Tool dictionary (`ModelContextTool`):**
  - `name`: required, 1 to 128 characters from `[A-Za-z0-9_.-]`
  - `title`: optional
  - `description`: required and non-empty
  - `inputSchema` / `outputSchema`: JSON Schema
  - `execute(input, { signal }) → Promise<any>`
  - `annotations`: `readOnlyHint`, `untrustedContentHint`, `consequentialHint` and `debugging`,
    all defaulting to false
- **Origin model:** by default a tool is visible only to same-origin documents in the same
  traversable. Cross-origin use needs three opt-ins: `allow="tools"` on the embedding frame, the
  provider's `exposedTo`, and the consumer's `fromOrigins`. The `tools` Permissions-Policy feature
  has a default allowlist of `'self'`, and `Permissions-Policy: tools=()` disables WebMCP entirely.
- **Consent:** the spec defines **no consent UI**. Consent is left to agents and user agents.
  `consequentialHint` is the hook an agent can use to require confirmation, and the spec says
  agents "cannot rely solely on site-asserted tool descriptions or annotations".
  **Consequence for LATCH:** any consent gate we want must be enforced in the app.
- **Security sections:** tool poisoning and output injection (prompt injection), misrepresented
  intent, over-parameterization, private browsing, and an input-length limits issue (#73, open).
- **Declarative API:** HTML form attributes (`toolname`, `tooldescription`, `toolautosubmit`)
  generate tools from `<form>`s
  (<https://byteiota.com/webmcp-chrome-150-navigator-modelcontext-deprecation/>,
  <https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8>). This is **not useful for
  LATCH**: our operations are graph mutations, not forms. We use the **imperative API only**.

### 1.2 Browser support

- **Chrome:**
  - Local testing uses the flag `chrome://flags/#enable-webmcp-testing`.
  - There is an origin trial from Chrome 149 (<https://developer.chrome.com/docs/ai/webmcp>).
    Third-party sources give the end as M156 or M162, so verify on chromestatus before signing up.
  - The Intent to Experiment says WebMCP requires **origin-isolated** documents
    (<https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8>).
  - MCP-B's README says native support needs **Chrome 155+**
    (<https://unpkg.com/@mcp-b/global@latest/README.md>).
  - Chrome's docs frame the API as "primarily for local browser workflows with a human in the loop".
  - Testing tools: the **Model Context Tool Inspector** extension (uses a Gemini key) and an
    "Example Agentic Chrome Extension".
- **Edge:** one third-party source claims Edge 147 ships native WebMCP
  (<https://www.webfuse.com/webmcp-cheat-sheet>). **Unverified.**
- **Firefox / Safari:** engaged but uncommitted.
- **LATCH is already well placed:** it serves `COOP: same-origin` + `COEP: credentialless`
  (`netlify.toml`, `vite.config.ts`). That is cross-origin isolation. Origin isolation
  (`Origin-Agent-Cluster`) is a separate property, and we should verify it during the spike.

### 1.3 MCP-B (polyfill, extension, desktop relay)

Repo: <https://github.com/WebMCP-org/npm-packages>

- **`@mcp-b/global` (v6):** the full runtime. It wraps native `document.modelContext` when
  present and otherwise installs the W3C polyfill. It adds an MCP bridge (`tabServer` postMessage
  transport with `allowedOrigins`, plus an `iframeServer`). It is idempotent, and
  `window.__webModelContextOptions = { autoInitialize: false }` defers setup. A third-party post
  puts it at about 285 KB, so it **must be lazy-loaded**
  (<https://dev.to/up2itnow0822/we-built-a-3kb-webmcp-polyfill-97x-smaller-than-mcp-bglobal-3kg4>).
- **Standards-only polyfill:** `@w3c/webmcp-polyfill`, plus `webmcp-types` for TypeScript.
  `@mcp-b/webmcp-polyfill` and `@mcp-b/webmcp-types` are **deprecated**.
- **MCP-B Chrome extension** (v1.0.4, May 2026, closed source) discovers page tools and hands
  them to in-browser agents
  (<https://chromewebstore.google.com/detail/mcp-b-extension/daohopfhkdelnpemnhlekblhnikhdhfa>).
- **`@mcp-b/webmcp-local-relay` (v5.x)** is the bridge to Claude Code, Claude Desktop and Cursor
  (<https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@5.1.0/README.md>):
  - The client runs `npx -y @mcp-b/webmcp-local-relay` as a **stdio MCP server**.
  - The page loads `embed.js`, which injects a hidden **widget iframe**. The widget opens
    `ws://127.0.0.1:9333` and forwards calls to the page's `document.modelContext`.
  - Tool names are sanitised to `[a-zA-Z0-9_]`. When two tabs register the same name, the relay
    adds a tab suffix.
  - `--widget-origin` restricts which page origins may connect, but it is **not local-process
    auth**.
  - Chrome 147+ may show a **Local Network Access** prompt before a public site can open the
    loopback socket.
- **Naming rule for LATCH:** use `latch_<verb>_<noun>`, lowercase with underscores only. These
  names survive relay sanitising unchanged and are valid in WebMCP and in MCP.

### 1.4 Electron

- Electron could carry Chromium's WebMCP code behind a feature switch, but **there is no agent
  inside the Electron app to consume it**. In-renderer WebMCP is therefore irrelevant on desktop.
- The right desktop surface is a **real MCP server in the main process**, built with
  `@modelcontextprotocol/sdk` (low-level `Server` with `ListTools` / `CallTool` handlers, because
  our schemas are plain JSON Schema rather than zod). It reuses the **same tool manifest**, which
  the renderer publishes over IPC, and forwards each call to the renderer registry.
- **Transport:**
  - Streamable HTTP on `127.0.0.1` with a bearer token. The MCP spec's Streamable HTTP security
    guidance requires validating `Origin` (to stop DNS rebinding) and binding to localhost.
  - Claude Code can connect over HTTP directly
    (`claude mcp add --transport http latch http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"`).
  - Stdio-only clients use `mcp-remote` or a small bundled stdio proxy.

---

## 2. Codebase findings: where the tool layer sits

| Concern | Existing API | Notes / traps |
|---|---|---|
| Graph state | `useFlowsStore()` (`stores/flows.ts`): `addNode`, `removeNode(s)`, `updateNodePosition`, `updateNodeData`, `addEdge`, `removeEdge(s)`, `insertSubgraph`, `serializeSelection`, `exportFlow`, `importFlow(s)`, `importFlowsWithTrustPrompt`, `createFlow`, `setActiveFlow` / `openFlow`, `closeFlow`, `renameFlow`, `duplicateFlow`, `deleteFlow` | **Every node and edge mutation targets `activeFlow` only.** `updateNodePosition` deliberately **doesn't mark dirty**, so call `markDirty()`. VueFlow is bound with `v-model:nodes/edges="flowsStore.activeFlow.*"` (EditorView.vue:1104), so store mutations render immediately. |
| Node data shape | EditorView `addNodeAtClientPoint` passes `{ label: def.name, nodeType, definition }` | Tools must build **the same data**. Extract a `createNodeData(def, overrides)` helper that EditorView and the tools share. Control values live flat on `node.data[controlId]`. Defaults are **not** written at creation; they're read from `definition.controls[].default`. |
| Catalog | `useNodesStore()`: `allDefinitions`, `getDefinition`, `byCategory`, `categories`, `categoryMeta`, `dataTypeMeta`; `fuzzySearch` | The registry is populated by `initializeNodeRegistry()` **in EditorView**, so tools must be installed after the editor mounts. |
| Ports | `NodeDefinition.inputs/outputs` + `node.data._dynamicInputs/_dynamicOutputs` (shader and others) + subflow instance ports | `utils/connections.getPortType` ignores dynamic ports. The tool layer needs an `effectivePorts(node)` helper. |
| Connection validation | `utils/connections.ts`: `validateConnection`, `areTypesCompatible`, `getPortType`; `utils/nodeSuggestions.suggestNodesForPort` | `validateConnection` **allows** connections when a definition or port is unknown (a lenient path for custom nodes). The agent wrapper must be **strict**: an unknown node, port or type is an error. |
| Control validation | `ControlRenderer.vue` `snapClamp` (step / min / max), `props.options` (string[] or `{value,label}[]`), control types `slider\|number\|toggle\|select\|text\|color\|connection\|asset-picker\|ble-pair\|code` | `snapClamp` is component-local. **Extract it to `utils/controlValue.ts`** so the UI and agents share one implementation (this also addresses the AUDIT_2026-06-28 "control min/max dropped" class). |
| Undo | `composables/useFlowHistory.ts`: `withHistory`, `startBatch`/`endBatch`, `recordParamEdit` (500 ms coalescing), `undo`/`redo`; `stores/history.ts` with **`maxHistorySize: 20`** | It works outside components (it only needs stores). **20 entries is too shallow for an agent session.** See §6 for the per-session "revert agent changes" snapshot. |
| Transport | `App.vue` `provide('executionControls', {start,stop,pause,resume,toggle})` from `useExecutionEngine()` | Only reachable through `inject`. Hand the tool layer the same object at install time. `start()` calls `audioManager.initialize()`, which **needs a user gesture**; an agent-triggered Play has none (§8). |
| Runtime reads | `useRuntimeStore()`: `status`, `fps`, `frameCount`, `errors[]` (max 100), `nodeMetrics` (`lastError`, `executionTime`, `outputValues`); `getExecutionEngine().getNodeOutputs(id)` / `getOutputValue(id, port)` | Values can be textures, audio nodes or large arrays. Summarise them, never serialise raw. `utils/formatPortValue` covers short display only. |
| Main output capture | `main-output` executor stores `_input_texture` (a `THREE.Texture`); `getThreeShaderRenderer().renderToCanvas(tex, canvas)` → `toDataURL` (the same path as `textureToDataExecutor`, `registry/visual/shared.ts:818`) | Known gotchas: three separate WebGL contexts, and video-backed textures sample black (see memory). Capture only through ThreeShaderRenderer. |
| Snippets | `data/flow-snippets.ts` (`flowSnippets`, 40 starters, `requires`, `setup`) + `utils/snippets.snippetToInsertableNodes` + `snippetOffsetToCenter` + `flowsStore.insertSubgraph` | The same path EditorView uses (lines 420–488). |
| File format | `services/fileFormat.ts` v2 (`latch-flow`, `endpoint()` / `parseEndpoint()` `"node:port"`, `validateDocument`) | **Use the v2 document as the agent-facing read format.** It is compact, stable, documented in FILE_FORMAT_SPEC, and it strips `definition`. |
| Import trust | `importFlowsWithTrustPrompt` → `summarizeFlowTrust` / `needsTrustPrompt` / `requestImportTrust` (injected resolver, defaults to `disable`) | Agent-supplied JSON is **untrusted external input** and must always go through this path. |
| Code-node trap | `updateNodeData`: editing a code node's `code`/`expression` **silently deletes `_codeDisabled`** (flows.ts:563–571) | If an agent writes `code`, that would re-enable a disabled node. The tool must re-stamp `_codeDisabled` (§7). |
| Secrets | `services/connections/redactSecrets.ts` (`SECRET_ID_RE`, `redactConfig`); `ConnectionManager` public API is already redacted | **Node data can hold secrets too**: `clasp-connection` has a `token` **text control** stored in `node.data` and exported in `.latch`. Agent reads must apply `SECRET_ID_RE` redaction to node controls. |
| UI | `useUIStore()`: `selectedNodes`, `setInspectedNode`, `removeFromSelection`, `notify(msg, level)` | Deleting a node through the store doesn't clean selection or inspection. Mirror EditorView `onNodesChange`. |
| Electron | `src/main/preload.ts` (minimal `electronAPI`, no generic channels), `src/main/security.ts` `handleTrusted` (top-frame and app-origin sender check), CSP in `src/main/protocol.ts` (`frame-src 'self' blob:`, `connect-src` open) | New IPC goes through `handleTrusted` with explicit, narrow channels. The CSP blocks a CDN relay iframe, so desktop uses the main-process MCP server instead. |

**Decision: the layer sits in the renderer**, as `src/renderer/services/agentTools/`. It is a
transport-agnostic registry of tool objects that call the stores and composables above. It is
installed from `EditorView` `onMounted` (where the registry, `project()` and the viewport exist)
and torn down on unmount. That means the control-panel route (`/controls`) exposes no tools,
which is intended.

---

## 3. Architecture

```
                 ┌──────────────────────── renderer ───────────────────────────┐
 Chrome native   │  adapters/webmcp.ts ──┐                                      │
 (document.      │                       │                                      │
  modelContext)  │  adapters/mcpb.ts  ───┤  (lazy @mcp-b/global: extension +    │
 MCP-B ext /     │   + public/webmcp/    │   self-hosted relay embed)           │
 local relay     │                       ▼                                      │
                 │            agentTools/registry.ts                            │
                 │   lookup → gate(mode/tier) → validate(schema) → rateLimit →  │
                 │   consent → mutex → execute → normalize → audit              │
                 │                       │                                      │
                 │      tools/{catalog,graph,controls,runtime,output,flows}.ts  │
                 │                       │                                      │
                 │   flows / nodes / runtime / ui stores · useFlowHistory ·     │
                 │   utils/connections · utils/controlValue · fileFormat ·      │
                 │   executionControls · ThreeShaderRenderer                    │
 Electron        │  adapters/electron.ts ◄── IPC (agentTools:invoke/result) ──┐ │
                 └────────────────────────────────────────────────────────────┼─┘
                 ┌─────────────── main ──────────────────┐                     │
 Claude Code /   │ mcpServer.ts (@modelcontextprotocol/   │ ── manifest + calls ┘
 Desktop/Cursor ─┤ sdk, Streamable HTTP 127.0.0.1 + token)│
                 └────────────────────────────────────────┘
```

### 3.1 Core types (`agentTools/types.ts`)

```ts
export type ToolTier = 'read' | 'sensitive-read' | 'edit' | 'run' | 'consequential'

export interface AgentTool<I = Record<string, unknown>> {
  name: `latch_${string}`              // [a-z_], ≤ 64 chars
  title: string
  description: string                  // ≤ 400 chars, imperative, states side effects
  inputSchema: JSONSchemaObject        // subset: type/properties/required/enum/min/max/maxLength/maxItems/additionalProperties:false
  tier: ToolTier
  untrustedOutput?: boolean            // → annotations.untrustedContentHint
  execute(input: I, ctx: ToolContext): Promise<ToolResult>
}

export interface ToolContext {
  transport: 'webmcp' | 'mcpb' | 'electron' | 'test'
  signal: AbortSignal
  stores: { flows; nodes; runtime; ui }      // injected for unit tests
  history: ReturnType<typeof useFlowHistory>
  execution: ExecutionControls                 // App.vue's provided object
  view: { project(p): XYPosition; center(): XYPosition }  // from EditorView
}

/** MCP CallToolResult shape. MCP-B and Electron pass it through; native WebMCP JSON-serialises it. */
export type ToolResult = { content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; isError?: boolean; structuredContent?: unknown }
```

Annotations are **derived from `tier`**, never hand-set:

| Tier | `readOnlyHint` | `consequentialHint` |
|---|---|---|
| `read` | true | false |
| `sensitive-read` | true | false |
| `edit` | false | false |
| `run` | false | true |
| `consequential` | false | true |

A contract test enforces this mapping.

### 3.2 Registry pipeline (`agentTools/registry.ts`)

`invoke(name, rawInput, ctx)` runs these steps in order:

1. **Lookup.** An unknown tool name returns `isError`.
2. **Mode gate.** Compare the session's agent mode (§7.1) with the tool's tier.
3. **Validate** with a small in-house JSON-Schema-subset validator, so we don't pull in ajv.
   Unknown properties are rejected (`additionalProperties: false`). Errors come back as
   `isError` with a precise message such as "controls.frequency: expected number ≤ 20000"; that
   is what lets agents self-correct.
4. **Rate limit** (§7.4).
5. **Consent.** Use an injected resolver, following the same pattern as `setImportTrustResolver`
   and `setGrantResolver`. **The default is deny**, so a test or an unmounted UI is secure.
6. **Mutex.** Calls run serially in a FIFO queue, so two agent calls never interleave inside one
   history batch. `history.flushParamEdit()` runs before each mutating call, so a user's
   in-flight slider burst commits first.
7. **Execute.** The tool runs inside `try/catch`. An error is returned as `isError` and never
   thrown into the transport.
8. **Normalise.** Results are JSON text, capped at 64 KB of text per result, with explicit
   `truncated: true` when the cap is hit.
9. **Audit.** Append `{ts, transport, tool, argsSummary, ok, ms}` to an in-memory ring of 200
   entries, which the activity drawer displays.

### 3.3 Adapters

- **`adapters/webmcp.ts`** (Phase 1):
  - Resolve `const mc = document.modelContext ?? navigator.modelContext`.
  - For each tool, call `mc.registerTool({...}, { signal })` using one shared
    `AbortController`. Aborting it unregisters everything, which is how the spec now does it.
  - **Register only while agent access is enabled.** When access is off, the tools are not even
    discoverable.
  - Leave `exposedTo` unset, so tools stay same-origin only.
  - Types come from the `webmcp-types` devDependency.
- **`adapters/mcpb.ts`** (Phase 2):
  - On an explicit user opt-in, `await import('@mcp-b/global')` with `autoInitialize: false`,
    then call `initializeWebModelContext({ transport: { tabServer: { allowedOrigins: [location.origin] }, iframeServer: false } })`.
  - Then reuse the WebMCP adapter, because `@mcp-b/global` wraps or provides `document.modelContext`.
  - For the **local relay**, **self-host** a pinned `embed.js` + `widget.html` under
    `public/webmcp/`. A same-origin iframe sidesteps the `COEP: credentialless` and CDN problems.
    Inject the script only when the user chooses "Connect desktop agent (local relay)". Document
    `--widget-origin https://latch.design` in the setup instructions.
- **`adapters/electron.ts` + `src/main/mcpServer.ts`** (Phase 3):
  - **Renderer:** publish the manifest (name, title, description, schema, annotations) through
    `electronAPI.agentTools.publish(manifest)`. Answer `onInvoke({id, name, args})` with
    `respond(id, result)`.
  - **Main:** run the MCP server and register tools from the manifest. Each `CallTool` sends to
    the renderer and waits with a timeout (default 30 s). Calls fail cleanly when the window is
    closed or the editor isn't mounted.
  - Every new channel goes through `handleTrusted`.

---

## 4. Tool catalogue

Conventions:

- Tools act on the **active flow** unless noted, matching the store's invariant.
- Endpoints use the file format's `"nodeId:portId"` string.
- Every mutating tool returns the created or affected IDs plus a fresh compact summary, so the
  agent doesn't need to re-read the whole flow.
- Schemas below are abbreviated: all objects are `additionalProperties: false`, and all strings
  have a `maxLength`.

### 4.1 Discovery: `read` tier, no prompt

| Tool | Input schema | Implementation |
|---|---|---|
| `latch_get_guide` | `{}` | A static authoring primer: what a flow is, the `"node:port"` convention, the **data-type compatibility matrix** (export `compatibilityMatrix` from `utils/connections.ts`), "visual chains end in `main-output`", control semantics, limits. Saves the agent dozens of exploratory calls. |
| `latch_get_app_info` | `{}` | Version, platform (`getPlatform()`), active flow id and name, runtime status, current agent mode, limits. |
| `latch_search_node_types` | `{ query?: string(≤100), category?: string, limit?: int 1..50 = 20 }` | `fuzzySearch(nodesStore.allDefinitions, q, d => [d.name, d.description, ...tags])` (the same keys as the palette). Returns `{id, name, category, description(≤160), platformAvailable}`. |
| `latch_list_categories` | `{}` | `nodesStore.categories` + `categoryMeta` labels + counts. |
| `latch_get_node_type` | `{ type: string }` | The full definition **minus `component` / `ui`**. Inputs and outputs with type, label, description, required, multiple and default. Controls with type, default, `min`/`max`/`step`, normalised `options[]` (values plus labels), `when` and `description`. Also `info`, `requires`, `connections`, `platforms`, and `available` (via `resolveNodeRequirement`). |
| `latch_suggest_nodes_for_port` | `{ endpoint: "node:port", direction: 'output'\|'input', limit?: 1..30 }` | `suggestNodesForPort` (the drag-wire-to-empty-space feature). |
| `latch_list_snippets` | `{ persona?: enum(SNIPPET_PERSONAS), category?: string }` | `flowSnippets` → `{id, name, description, persona, requires, setup, nodeCount}`. |
| `latch_get_flow` | `{ includeLayout?: bool = true }` | `JSON.parse(flowsStore.exportFlow())` (the v2 doc), then **secret redaction** of node controls (§7.3), then a `nodeCount`/`edgeCount` header. Text over the cap returns a summary plus `truncated`. `untrustedOutput: true`, because labels and names may come from imported files. |
| `latch_get_node` | `{ nodeId: string }` | The node's type, label, position, redacted control values, and **effective ports** (definition + `_dynamicInputs`/`_dynamicOutputs` + subflow ports) with connection state. Plus the incident edges and its runtime metrics (`lastError`, `executionTime`, `errorCount`). |
| `latch_list_flows` | `{}` | `flowsStore.flows` → `{id, name, open, isSubflow, nodeCount, dirty, active}`. `untrustedOutput`. |
| `latch_get_runtime_state` | `{ errorsLimit?: 1..50 = 10 }` | `runtimeStore.{status, fps, frameCount, errorCount}`, `recentErrors` with `nodeName` resolved from the flow, and the nodes whose `nodeMetrics.lastError` is set (soft errors included). Also an `audioSuspended` flag from the AudioContext state. `untrustedOutput`. |
| `latch_read_node_outputs` | `{ nodeIds: string[1..20], ports?: string[] }` | `engine.getNodeOutputs(id)`, then `summarizeValue()`: numbers, booleans and strings (≤2 KB) as-is; arrays as the first 64 items plus length; plain objects as JSON truncated at 4 KB; `THREE.Texture`/canvas as `{kind:'texture', width, height}`; audio as `{kind:'audio'}`. Keys starting with `_` are omitted. `untrustedOutput` (MQTT, HTTP or LLM strings). |
| `latch_validate_flow` | `{}` | A static lint: dangling edges, type-incompatible edges (strict validator), unknown types, missing required inputs, visual chain without `main-output`, code nodes disabled, unavailable-on-platform nodes. Reuses `fileFormat.validateDocument` + the strict connection check. |

### 4.2 Sensitive reads: `sensitive-read` tier, prompt once per session

| Tool | Input | Implementation |
|---|---|---|
| `latch_capture_output` | `{ nodeId?: string, maxSize?: 64..1024 = 512, format?: 'png'\|'jpeg' = 'jpeg' }` | Defaults to the first `main-output`. Read `engine.getOutputValue(id, '_input_texture')`, then `getThreeShaderRenderer().renderToCanvas` into a scratch canvas sized to `maxSize`, then `toDataURL`, returned as an MCP `image` part. Errors when stopped or when there's no texture. **Sensitive** because a webcam or screen feed may be in the frame. Limited to 2 per second. |
| `latch_list_connections` | `{}` | `{id, name, protocol, status}` only, so agents can fill a `connection` control. **Never config.** Built on top of the already-redacted public API. |

### 4.3 Graph editing: `edit` tier, one undo entry per call

Each tool is wrapped as `history.withHistory('Agent: <desc>', fn)`.

| Tool | Input | Implementation / validation |
|---|---|---|
| `latch_add_node` | `{ type, position?: {x,y}, label?: string(≤80), controls?: object }` | Validate that `type` exists and `available`; validate controls first (§5.2). `flowsStore.addNode(type, pos, createNodeData(def, {label, ...controls}))`. Without a `position`, place to the right of the flow's bounding box (or at `view.center()` on an empty flow). Code node types are created **disabled** (§7.2). Returns `{nodeId, ports}`. |
| `latch_build_graph` | `{ nodes: [{ ref: string, type, position?, label?, controls? }] (≤100), edges: [{ from: "ref\|nodeId:port", to: "ref\|nodeId:port" }] (≤200), layout?: 'auto'\|'none' = 'auto' }` | **The main efficiency tool.** It builds a whole patch in one atomic, all-or-nothing call: validate every node, control and edge first, then `insertSubgraph(nodes, internalEdges)`, then `addEdge` for edges to existing nodes, then `layeredLayout` when `layout:'auto'`. All of it is one `withHistory` entry. Returns a `ref → nodeId` map. |
| `latch_insert_snippet` | `{ snippetId, position?: {x,y} }` | `snippetToInsertableNodes` + `insertSubgraph` + `snippetOffsetToCenter` (the EditorView path). Returns `{nodeIds, requires, setup}`. |
| `latch_remove_nodes` | `{ nodeIds: string[1..50] }` | `flowsStore.removeNodes`, plus `uiStore.removeFromSelection` and clearing `inspectedNode` (as in `onNodesChange`). |
| `latch_move_nodes` | `{ moves: [{nodeId, x, y}] (≤100) }` | `updateNodePosition` per move, then `markDirty()` (positions skip dirty otherwise). |
| `latch_connect` | `{ from: "node:port", to: "node:port", replace?: bool = false }` | **Strict** `validateAgentConnection`: both nodes exist, both ports exist among the effective ports, the types are compatible (`areTypesCompatible`, with the Trigger special case via `getPortType`), not a self-loop, not a duplicate. If the target input isn't `multiple` and is already wired, the call errors unless `replace` (which removes the old edge in the same history entry). Then `flowsStore.addEdge`. |
| `latch_disconnect` | `{ edgeId? } \| { from, to }` (oneOf) | `removeEdge(s)`. |
| `latch_set_controls` | `{ nodeId, values: object (≤50 keys) }` | Per control (§5.2): coerce, clamp or snap, check options, then `updateNodeData(nodeId, values)`. Returns `{applied, clamped: [{id, requested, applied}], rejected}`. One history entry per call, deliberately **not** `recordParamEdit`, whose 500 ms coalescing would merge separate agent intents. |
| `latch_rename_node` | `{ nodeId, label: string(1..80) }` | `updateNodeData(nodeId, {label})`. |
| `latch_auto_arrange` | `{ scope?: 'all'\|'selection' = 'all' }` | `useAutoArrange().arrange(scope)` (already history-wrapped). |
| `latch_undo` / `latch_redo` | `{}` | `history.undo()` / `redo()`. Lets the agent back out its own mistakes. |
| `latch_select_nodes` | `{ nodeIds: string[] }` | `uiStore` selection + inspect the first node. Lets the agent point the user at something ("I selected the nodes I changed"). This is UI-only, so it doesn't count as a history entry. |

### 4.4 Transport: `run` tier, prompt once per session in "Ask" mode

| Tool | Input | Implementation |
|---|---|---|
| `latch_set_transport` | `{ state: 'play'\|'pause'\|'stop' }` | `execution.start/pause/resume/stop` (App.vue's `executionControls`). After `play`, wait about 2 frames and then return `latch_get_runtime_state`. That state includes `audioSuspended`; when it's true, the app shows a "Click to enable audio" chip (§8). **Capability check:** if the flow has nodes needing camera, microphone, network, hardware or models (`summarizeFlowTrust(...).capabilities` + `definition.requires`/`connections`) that were added by the agent this session, require consent once per capability per session. |

### 4.5 Flow management: `consequential` tier, prompt every call except where noted

| Tool | Input | Implementation |
|---|---|---|
| `latch_create_flow` | `{ name: string(1..80), open?: bool = true }` | `createFlow`. Tier `edit`; creating something new is harmless. |
| `latch_open_flow` | `{ flowId }` | `openFlow` (switches the visible tab). Tier `edit`. |
| `latch_rename_flow` | `{ flowId, name }` | `renameFlow`. Tier `edit`. |
| `latch_duplicate_flow` | `{ flowId }` | `duplicateFlow(id, uiStore.cloneControlPanelForNodes)`. Tier `edit`. |
| `latch_close_flow` | `{ flowId }` | `closeFlow` + persist the changed ids, as the tab bar does. Tier `edit`; the flow stays in the library. |
| `latch_export_flow` | `{ flowId? }` | `exportFlow(id)` with node secrets redacted. Tier `read`. |
| `latch_import_flow` | `{ json: string(≤2 MB), replace?: false }` | **Always `importFlowsWithTrustPrompt`.** If the file has code, the user sees the existing trust modal; the safe default is `disable`. `replace: true` is **not offered**. |
| ~~`latch_delete_flow`~~ | n/a | **Not exposed.** It can't be undone and it clears history. Revisit only with an in-app confirm plus soft-delete. |

**Deliberately absent:**

- connection create, edit or read (credentials)
- AI-settings and API keys
- custom-node loading
- `enableNodeCode`
- asset upload and file reads
- `exportAllFlows` / `promptImport` (file dialogs)
- any arbitrary-JS or "eval" tool

---

## 5. Validation

### 5.1 Connections

`agentTools/validate.ts::validateAgentConnection(flow, from, to)`:

1. Parse the endpoints with `fileFormat.parseEndpoint`.
2. Both nodes must exist. An unknown or placeholder node type (`_unknownType`) is an error.
3. Ports are checked against **effective ports** (definition ∪ `_dynamicInputs/_dynamicOutputs`
   ∪ subflow ports). An unknown port is an error. This differs from the UI's lenient
   `validateConnection`, which allows unknown ports.
4. The type check reuses `getPortType` (the dynamic Trigger output type) and `areTypesCompatible`.
   Failure messages reuse `dataTypeMeta` labels and add a hint, for example
   "number → texture is incompatible; try a converter such as 'value-to-color'". The hint comes
   from `suggestNodesForPort`.
5. Fan-in policy: see the open question in §10. Until it's resolved, follow `PortDefinition.multiple`.

### 5.2 Controls

Add a new shared `utils/controlValue.ts`, extracted from `ControlRenderer.vue` and used by both
the UI and agents. It exposes `coerceControlValue(control, raw) → { ok, value, clamped?, error? }`:

| Control type | Rule |
|---|---|
| `slider` / `number` | Finite number. `snapClamp` against `props.step/min/max` (only finite bounds). Report clamping instead of failing. |
| `toggle` | Boolean. `"true"`/`"false"`/`0`/`1` are coerced. |
| `select` | Must equal one of the normalised `props.options` values (string[] or `{value,label}[]`). The error lists the valid values. |
| `color` | `/^#[0-9a-f]{6}$/i`. |
| `text` | String ≤ 10 000. A control id matching `SECRET_ID_RE` is **write-only**: the agent may set it but never read it back. Optionally refuse it in Phase 1. |
| `connection` | Must be an id from `latch_list_connections`. |
| `asset-picker` | Must be an existing asset id (`assetsStore`). |
| `ble-pair` / hardware pickers | **Rejected.** Device pairing needs a user gesture (Web Bluetooth/Serial). The result tells the agent to ask the user. |
| `code` / shader source | String ≤ 50 000. GLSL (shader nodes) is allowed. JS code nodes go through §7.2. |
| `_dynamicControls` | Validated like their static counterparts. |
| Unknown control id | Error, listing valid ids. Ids prefixed `_` are always rejected. |

`when` / `visibleWhen` hidden controls are still settable. The result notes `hidden: true`, so
the agent knows the value currently has no effect.

---

## 6. Undo integration

- **One tool call = one history entry**, described as `Agent: Add LFO node`. Use
  `history.withHistory`, or `startBatch`/`endBatch` around multi-step tools. The AppHeader
  undo/redo tooltips then show agent actions naturally.
- `flushParamEdit()` runs before every mutating call (`beforeAction` already does this), so user
  slider bursts never merge with agent changes.
- **Session checkpoint.** `maxHistorySize` is 20, and an agent can easily make 50 edits. On the
  **first mutating call per flow per agent session**, store a deep snapshot
  (`createSnapshot(nodes, edges)`) in the agent session. The activity bar's **"Revert agent
  changes"** restores it as one new history entry, so the revert is itself undoable. The snapshot
  is dropped when the session ends. Memory cost is one flow snapshot, which `createSnapshot`
  already makes per edit.
- Consider raising `maxHistorySize` to 50 while an agent session is active (open question:
  memory).

---

## 7. Security model

### 7.1 Agent access modes and consent

- **Off by default.** A new Settings → "AI agent access" section, plus a header toggle, offers:
  - **Off.** No tools registered. This is the default.
  - **Read-only.** `read` tools only.
  - **Ask before changes.** `edit`, `run` and `sensitive-read` prompt once per session per tier.
    `consequential` prompts every time.
  - **Allow edits.** `edit` runs freely. `run` and `sensitive-read` still prompt once per
    session. `consequential` still prompts every time.
- **The mode is per tab and per session** (sessionStorage), so a forgotten tab never stays
  agent-writable across restarts. An optional "remember on this device" setting persists it
  through `localStorage`, wrapped in try/catch.
- **Prompts** use a new `AgentConsentModal`, reached through an injected resolver
  (`setAgentConsentResolver`). The **default denies**, matching the existing flowTrust and
  capabilityGrants pattern. Each prompt shows:
  - the tool title
  - an argument summary, with the JSON truncated
  - the transport (Chrome agent, browser extension, desktop agent)
  - the choices **Allow once · Allow for this session · Deny**
- **Agent activity bar.** This is non-modal, shown while any session is active, and live-region
  announced for accessibility. It reads: "An AI agent is connected (via …) · N changes ·
  [Activity] [Revert agent changes] [Pause] [Disconnect]".
  - **Pause** makes every tool return "paused by user".
  - **Disconnect** aborts the registration `AbortController`, so the tools disappear from the agent.
- **Visual attribution.** Nodes created or modified by the agent get a brief highlight, through
  a transient `uiStore` set that is not persisted.

### 7.2 Code execution

- Function and Expression nodes run JS in-origin through `new Function`, with access to
  IndexedDB, the network and the app. An agent, which may itself be prompt-injected, must
  **never be able to cause in-origin JS execution without an explicit user click**.
- Policy:
  - `latch_add_node` / `latch_build_graph` with a code type always stamp `_codeDisabled: true`.
  - `latch_set_controls` on a code node's `codeKey` re-stamps `_codeDisabled: true` after
    `updateNodeData`. This works around the auto-re-enable in `flows.ts:563–571`; a unit test
    pins the behaviour.
  - The result says: "code nodes stay disabled until the user clicks Enable code".
  - `enableNodeCode` is never exposed.
- Custom nodes (`trust: local|community`) keep their existing capability gating. Agents can
  instantiate them, but community capability prompts still fire for the user.

### 7.3 Secrets and data exposure

- **Connections:** only `{id, name, protocol, status}`. Never config, not even the redacted
  form, which has nothing an agent needs.
- **Node controls:** every read path (`get_flow`, `get_node`, `export_flow`) passes node data
  through `redactNodeSecrets(data, def)`. That function redacts
  `SECRET_ID_RE.test(control.id) || control.props?.type === 'password'` to `REDACTED_SECRET`.
  This covers the `clasp-connection` `token` text control.
- **No tools read:** settings or API keys, IndexedDB internals, `localStorage`, asset bytes,
  device lists, or anything else outside the graph and runtime.
- **The tool layer itself performs no network I/O.** The agent can still *build* network-capable
  flows (MQTT, HTTP, CLASP nodes). That egress is gated at `latch_set_transport` by the capability
  consent (§4.4). The existing per-node trust and capability machinery still applies.
- `latch_capture_output` is `sensitive-read`, because webcam, screen or other private media may
  be in the frame.

### 7.4 Rate limiting and size caps

- **Token buckets** per transport session:
  - `read`: 30/s with a burst of 60
  - mutating: 10/s with a burst of 30, and 600/min
  - `capture_output`: 2/s
  - Over the limit returns `isError: "rate limited, retry after N ms"`.
- **Payload caps:**
  - strings ≤ 10 k (code ≤ 50 k)
  - `build_graph` ≤ 100 nodes / 200 edges
  - import ≤ 2 MB
  - results ≤ 64 KB text
  - any mutating call is refused once the flow exceeds 2 000 nodes
- **The mutex** prevents concurrent mutation, and each call has a 30 s timeout tied to the
  `AbortSignal`.

### 7.5 Prompt injection and origins

- Tools that return user- or network-originated text set `untrustedContentHint`, and the text
  goes in **structured JSON fields**, never as instructions in prose.
- Tool descriptions are static strings in the bundle. Never interpolate flow content into them.
- **Native WebMCP:** no `exposedTo`, so tools stay same-origin. Optionally also send
  `Permissions-Policy: tools=(self)` from `netlify.toml` and `vite.config.ts`, which keeps
  third-party iframes out.
- **MCP-B:** `allowedOrigins: [location.origin]`. Relay setup docs pass
  `--widget-origin https://latch.design`.
- **Electron server:**
  - binds `127.0.0.1` only
  - user-configurable fixed port (default chosen once and stored)
  - 256-bit bearer token in `<userData>/mcp-token` with mode 0600, regenerable from Settings
  - **rejects any request that carries an `Origin` header** (a browser) unless it equals the
    app scheme, which defeats DNS rebinding and drive-by `fetch`
  - off by default, toggled in Settings, with a status indicator
  - every IPC hop goes through `handleTrusted`

---

## 8. Known behavioural constraints (designed in, not bugs)

- **Audio gesture.**
  - `audioManager.initialize()` (Tone start) needs user activation, and an agent-initiated Play
    has none. Visual and data flows run fine, but audio stays suspended.
  - Fix: `latch_set_transport` reports `audioSuspended`, and the activity bar shows a one-click
    "Enable audio" chip that calls `audioManager.initialize()` from a real click.
  - In Electron, an `autoplayPolicy: 'no-user-gesture-required'` webPreference could remove this.
    Treat it as a separate decision.
- **Device pairing** (BLE, Serial, HID, MIDI) and **camera/mic permission prompts** need the
  user. The tools report "needs user action" instead of trying.
- **Tools follow the active flow.** Agent edits to a non-active flow are not supported in v1, so
  the agent calls `latch_open_flow` first and the user sees the switch. This keeps history and
  the canvas consistent.
- **The editor must be mounted.** Tools register from EditorView. On `/controls` or during load,
  tools aren't registered, and the Electron server answers "LATCH editor not ready".

---

## 9. Testing strategy

1. **Unit tests per tool** (`tests/unit/services/agentTools/*.test.ts`):
   - Use a real Pinia with test definitions (`tests/helpers/testNode.ts`), invoke through
     `registry.invoke`, and assert on store state.
   - Cover:
     - happy path
     - schema errors
     - strict connection errors (unknown port, incompatible type, fan-in)
     - control clamping and option errors
     - **one history entry per call**, and revert-agent-changes
     - secrets redacted in `get_flow`, `get_node` and `export_flow` (the clasp `token` fixture)
     - **code nodes stay disabled** after `add_node` and `set_controls` (pins the `updateNodeData` trap)
     - tier gating per mode, consent default-deny, rate limiter, mutex ordering
   - Mind the component-test gotchas: import stores before `.vue` files.
2. **Contract test** (`tests/unit/contracts/agent-tools-manifest.test.ts`):
   - Every tool name matches `/^latch_[a-z_]{3,60}$/`.
   - The description is non-empty and ≤ 400 characters.
   - The schema is a valid subset with `additionalProperties: false`.
   - Annotations match the tier.
   - A manifest snapshot is kept, so any tool-surface change is a reviewed diff.
3. **Extracted utils:** `controlValue.test.ts`, which must match the old `ControlRenderer` scrub
   and clamp behaviour, and `effectivePorts.test.ts`.
4. **Adapter tests:**
   - A fake `document.modelContext` records `registerTool(tool, {signal})`, and aborting
     unregisters all tools.
   - A fallback test for `navigator.modelContext`.
   - Enabling and disabling the mode registers and unregisters.
   - `execute` returns a `CallToolResult`, and errors become `isError`.
5. **E2E with a mock agent** (Playwright + `npm run dev`, as in the smoke-test harness):
   - `page.addInitScript` installs a fake `document.modelContext` that records tools. The test
     toggles agent mode to "Allow edits", with the consent resolver auto-approving in test mode.
   - The test then drives this sequence:
     1. `latch_search_node_types{query:'shader'}`
     2. `latch_build_graph` (shader → main-output)
     3. `latch_set_transport{state:'play'}`
     4. `latch_get_runtime_state` shows no errors
     5. `latch_capture_output` returns a non-empty JPEG
     6. `latch_undo` restores the empty canvas
   - Filter webcam and MediaPipe noise as in the harness memory.
   - A second spec checks that `latch_import_flow` with a Function node shows the trust modal and
     imports the node disabled.
6. **Manual or native check** (per release, not CI): Chrome with `#enable-webmcp-testing` plus
   the Model Context Tool Inspector extension against `npm run dev`. Then MCP-B extension plus
   local relay with Claude Code. Use a Claude-in-Chrome tab, per maintainer preference.
7. **Electron:** an integration test starts `mcpServer.ts` with a stub renderer bridge and uses
   the MCP SDK `Client` over Streamable HTTP. It checks:
   - `listTools` matches the manifest
   - `callTool` round-trips
   - a missing or invalid token gives 401
   - a request with a browser `Origin` gives 403
   - a timeout gives a clean error

---

## 10. Phased rollout

Effort is in focused dev-days for one engineer who knows the codebase.

### Phase 0 — Spike (0.5 d)

- Register one hello tool on `npm run dev` (COOP/COEP on). Confirm it's visible in Chrome Canary
  or stable with `#enable-webmcp-testing` through the Tool Inspector.
- Confirm `document.modelContext` vs `navigator.modelContext` in the current Chrome.
- Check that origin isolation holds on Netlify and on the coi-serviceworker fallback.
- Confirm `@mcp-b/global` coexists with COEP `credentialless` when lazy-loaded.
- **Exit:** a go/no-go note added to this doc.

### Phase 1 — Core registry + native WebMCP: smallest useful (≈5–6 d)

- `agentTools/` core: types, registry pipeline, schema-subset validator, rate limiter, mutex,
  audit ring, consent resolver (default deny).
- Shared utils: `utils/controlValue.ts` (extracted), `effectivePorts`, `createNodeData`
  (EditorView refactored to use it), `redactNodeSecrets`, and an exported compatibility matrix.
- Tools:
  - read: `get_guide`, `get_app_info`, `search_node_types`, `get_node_type`, `list_snippets`,
    `get_flow`, `get_node`, `get_runtime_state`, `read_node_outputs`
  - edit: `add_node`, `build_graph`, `insert_snippet`, `remove_nodes`, `move_nodes`, `connect`,
    `disconnect`, `set_controls`, `undo`, `redo`
  - run: `set_transport`
- The WebMCP adapter (native, with the navigator fallback). An agent-mode toggle in Settings and
  the header, plus the activity bar with Revert / Pause / Disconnect.
- Unit and contract tests, plus the mock-agent e2e.
- **Why this is useful by itself:** it works today with Chrome's flag or origin trial, the Tool
  Inspector and Gemini-based extensions, and it already covers "describe this flow, build me X,
  tweak it, run it, why is it erroring?".

### Phase 2 — MCP-B + desktop agents against latch.design (≈3–4 d)

- Lazy `@mcp-b/global`, which brings the MCP-B extension.
- **Self-hosted local-relay** embed and widget under `public/webmcp/`, with an opt-in "Connect
  desktop agent" toggle and setup docs (`claude mcp add` snippet, `--widget-origin`, the LNA
  prompt). This gives **Claude Code / Claude Desktop / Cursor driving latch.design**.
- More tools: `capture_output`, `list_connections`, `validate_flow`, `suggest_nodes_for_port`,
  `auto_arrange`, `select_nodes`, `list_categories`.
- Flow tools: `list_flows`, `create_flow`, `open_flow`, `rename_flow`, `duplicate_flow`,
  `close_flow`, `export_flow`, `import_flow` (through the trust prompt).
- Transport capability-consent at play time, and an "Enable audio" chip.

### Phase 3 — Electron MCP server (≈5–7 d)

- `src/main/mcpServer.ts` (`@modelcontextprotocol/sdk`, Streamable HTTP, token plus Origin
  checks), the `agentTools:*` preload channels through `handleTrusted`, and the renderer
  `adapters/electron.ts` (manifest publish plus invoke and respond).
- Settings UI: enable, port, copy the `claude mcp add` command, regenerate the token. A stdio
  proxy script (or documented `mcp-remote`) for stdio-only clients.
- The integration test, plus a packaging check with Forge fuses and the CSP unchanged.

### Phase 4 — Polish (≈2–3 d, optional)

- An agent-attribution highlight on nodes, and a richer activity drawer with jump-to-node.
- Raise or decouple history depth for agent sessions.
- A `toolchange`-aware dynamic tool set (e.g. only expose `capture_output` when a `main-output`
  exists).
- Subflow tools, once SUBFLOW_RUNTIME work lands.
- Docs page "Driving LATCH with an AI agent".

**Total: ≈16–20 dev-days.** Phases 0 and 1 (≈6 d) ship value on their own.

---

## 11. Risks and open questions

1. **Spec churn (high).**
   - In 2026 the spec already moved `navigator` → `document`, removed `unregisterTool`, and
     dropped `provideContext`.
   - *Mitigation:* the adapter is about 80 lines and the registry is transport-agnostic, so
     re-target the adapter when the spec changes. Pin `webmcp-types` and re-run the Phase 0
     spike each Chrome milestone.
2. **Native reach is small today.** Native WebMCP needs a flag or origin trial, and agent
   consumers are few (Tool Inspector, extensions). It's **unverified whether Gemini in Chrome
   consumes page tools yet**. That's why Phase 2 (relay) and Phase 3 (Electron) carry most of the
   real-world value for Claude users.
3. **Relay plus COEP plus LNA.**
   - The relay widget is an iframe. Self-hosting keeps it same-origin; this needs verification
     under `COEP: credentialless` and the coi-serviceworker fallback.
   - Chrome 147+ LNA prompts the user before the loopback socket opens.
   - The relay itself has no local-process auth (its README says so). We must document that
     risk honestly.
4. **Fan-in semantics.** It's unclear whether the UI lets a second wire attach to a non-`multiple`
   input, or whether it replaces or rejects it. Read `onConnect` / VueFlow `ConnectionMode.Loose`
   behaviour and match it exactly in `latch_connect`.
   - Note: `onConnect` calls both VueFlow `addEdges` and `flowsStore.addEdge`. Check that the
     tool path, which is store-only, doesn't diverge.
5. **History depth of 20.** The session checkpoint covers this. The open question is whether to
   raise the global limit (memory vs usefulness).
6. **Audio gesture.** Agent-initiated audio can't start without a click. This needs a UX decision
   for the chip, and for whether Electron relaxes the autoplay policy.
7. **Should agents ever enable code?** The recommendation is **never**: the user clicks "Enable
   code". This needs maintainer sign-off.
8. **Polyfill choice and bundle cost.**
   - `@mcp-b/global` is about 285 KB (unverified third-party figure), so it must stay
     lazy-loaded.
   - `@w3c/webmcp-polyfill` is standards-only and lighter but has no extension or relay bridge.
   - Confirm current versions and licences on npm. The MCP-B extension is closed source; the npm
     packages need a licence check.
9. **Multiple LATCH tabs.**
   - Each tab registers its own tools, and the relay suffixes the names. The per-tab mode, off by
     default, keeps this sane.
   - Should enabling agent access in one tab disable it in the others? This could use a
     BroadcastChannel.
10. **Prompt injection through flows.** An imported flow's labels and snippet text could carry
    instructions to the agent. `untrustedContentHint`, structured output and app-side consent
    are the mitigations. Agent-level guardrails are outside our control.
11. **Performance.** `createSnapshot` JSON-clones the whole flow per call, and node data carries
    the full `definition` object. With rate limits that's acceptable. Profile `build_graph` with
    100 nodes in Phase 1.
12. **Electron port and token UX.** A fixed port is convenient for client config but collides
    with other apps. The proposal is a stored random port shown in Settings with a copyable
    config snippet.
13. **Edge native support** (the claimed Edge 147) is unverified. Test it if it's real; the same
    adapter should work.

---

## 12. Sources

- WebMCP spec (CG Draft, 24 Nov 2026): <https://webmachinelearning.github.io/webmcp/>
- Move `modelContext` to `Document`, spec PR #184: <https://github.com/webmachinelearning/webmcp/pull/184>
- Chrome developer docs, WebMCP: <https://developer.chrome.com/docs/ai/webmcp>
- Blink Intent to Experiment, WebMCP: <https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8>
- Chrome 150 `navigator.modelContext` deprecation: <https://byteiota.com/webmcp-chrome-150-navigator-modelcontext-deprecation/>
- Angular's move to `document.modelContext`: <https://github.com/angular/angular/commit/683172b39a602ac9ec15db69d22853433a67a084>
- WebMCP cheat sheet (Edge 147 claim, unverified): <https://www.webfuse.com/webmcp-cheat-sheet>
- MCP-B packages: <https://github.com/WebMCP-org/npm-packages>
- `@mcp-b/global` README: <https://unpkg.com/@mcp-b/global@latest/README.md>
- `@mcp-b/global` package stats and deprecation notes: <https://www.pkgstats.com/pkg:@mcp-b/global>
- `@mcp-b/webmcp-local-relay` README v5.1.0: <https://cdn.jsdelivr.net/npm/@mcp-b/webmcp-local-relay@5.1.0/README.md>
- MCP-B Chrome extension: <https://chromewebstore.google.com/detail/mcp-b-extension/daohopfhkdelnpemnhlekblhnikhdhfa>
- Polyfill size comparison (third-party): <https://dev.to/up2itnow0822/we-built-a-3kb-webmcp-polyfill-97x-smaller-than-mcp-bglobal-3kg4>
