# Driving LATCH with an AI agent (WebMCP)

LATCH can offer its editor to AI agents as tools: read the open flow, search the node catalog,
build and wire nodes, set controls, play and stop, read values and errors, and capture what Main
Output shows. The tools follow [WebMCP](https://webmachinelearning.github.io/webmcp/), the W3C
community draft for pages that expose tools through `document.modelContext`.

Agent access is **off by default** and applies to one tab. It lasts until the tab is closed.

## Turning it on

Click the robot button in the header and pick a mode:

| Mode | What agents can do |
|---|---|
| Off | Nothing. No tools are registered. |
| Read only | Read flows, nodes, node types, output values and errors. Only read tools are listed. |
| Ask before changes | Everything below, but LATCH asks once (per session) before the first edit. |
| Allow edits | Edit freely. LATCH still asks before playing the flow or reading the output image, and every time before importing JSON. |

The same menu pauses agents, shows what they did, and **Revert agent changes** puts the open
flow back the way it was before an agent first changed it, as one undoable step. Revert stays
available after you turn agents off, until you close the tab. Pausing or lowering the mode also
stops calls that were already waiting for your answer or in line.

## Connecting Claude Code, Claude Desktop or Cursor

Desktop agents reach the tab through the WebMCP local relay
([`@mcp-b/webmcp-local-relay`](https://www.npmjs.com/package/@mcp-b/webmcp-local-relay)), a small
MCP server that runs on your computer and talks to the tab over a loopback WebSocket.

1. In the agent menu, turn on **Let desktop agents connect**.
2. Copy the command shown and run it once. For latch.design it is:
   ```sh
   claude mcp add latch -- npx -y @mcp-b/webmcp-local-relay@6.2.0 --widget-origin https://latch.design
   ```
   For other clients, add an MCP server that runs
   `npx -y @mcp-b/webmcp-local-relay@6.2.0 --widget-origin <the LATCH origin>`. Use
   `http://localhost:5173` for `npm run dev`, and `app://latch` for the desktop app.
3. Restart the agent. The `latch_*` tools appear while the tab is open with agent access on.
   Clients that don't refresh their tool list can use the relay's `webmcp_list_tools` and
   `webmcp_call_tool`.

Chrome may ask the page for local network access the first time. `--widget-origin` makes the
relay refuse every other site. The relay has no other authentication, so keep it bound to
loopback (the default).

## Tips for agents

- Custom Shader code: each `uniform float u_name;` becomes an input port as soon as the code is set,
  so `latch_build_graph` can wire it in the same step.
- Run `latch_auto_arrange` after a large build: it uses the nodes' real on-screen sizes.
- `latch_get_runtime_state` says `pageHidden` when the LATCH tab is hidden. LATCH stops rendering
  then, so values are from the last visible frame.

## Native WebMCP

Where the browser implements `document.modelContext` (Chrome with
`chrome://flags/#enable-webmcp-testing`, or the origin trial), LATCH registers on it directly, and
in-browser agents and inspector extensions can call the same tools. Elsewhere LATCH loads the W3C
polyfill (`@w3c/webmcp-polyfill`) only when agent access is turned on.

## Safety rules built in

- Code nodes (Function, Expression) are always created **disabled**, and stay disabled after an
  agent edits their code or imports them. Only a person clicking **Enable code** runs them.
- Secret-looking control values (tokens, passwords, API keys) are masked in every read, and
  saved connections are listed by name only. Writing the mask back leaves the saved value alone,
  and an agent can't change the URL, host or server of a node that holds a saved secret, by
  control or by wire.
- Importing JSON asks you every time; code in it arrives disabled.
- There is no tool to delete flows, change settings, read files or run arbitrary code.
- Each change an agent makes to a flow's nodes and wires is one undo step, labelled “Agent: …”. The
  activity list marks calls from desktop agents (through the relay). Calls are rate-limited and run one at a time. A prompt the agent
  gives up on closes by itself, and a call that timed out can't overlap the next one.
- Device pairing, camera and microphone permission, and starting audio need the person. If the
  page hasn't been clicked yet, a play request reports “waiting” and does nothing; it never
  starts later by itself.
- Numbers are clamped to a control's range and snapped only to a step the control declares, as
  if typed.
- Text that comes from flows, node outputs and the network is marked as untrusted content.

## Tool list

Read: `latch_get_guide`, `latch_get_app_info`, `latch_search_node_types`, `latch_list_categories`,
`latch_get_node_type`, `latch_suggest_nodes_for_port`, `latch_list_snippets`, `latch_get_flow`,
`latch_get_node`, `latch_list_flows`, `latch_get_runtime_state`, `latch_read_node_outputs`,
`latch_validate_flow`, `latch_export_flow`, `latch_select_nodes`, `latch_list_models`.

Asks first: `latch_capture_output`, `latch_list_connections`, `latch_set_transport`,
`latch_import_flow`.

Edit: `latch_add_node`, `latch_build_graph`, `latch_insert_snippet`, `latch_remove_nodes`,
`latch_move_nodes`, `latch_auto_arrange`, `latch_connect`, `latch_disconnect`,
`latch_set_controls`, `latch_rename_node`, `latch_undo`, `latch_redo`, `latch_create_flow`,
`latch_open_flow`, `latch_rename_flow`, `latch_duplicate_flow`, `latch_close_flow`.

The code lives in `src/renderer/services/agentTools/`, and the design in
`docs/plans/WEBMCP_PLAN.md`.
