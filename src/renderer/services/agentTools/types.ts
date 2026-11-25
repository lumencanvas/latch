/**
 * Agent tools: LATCH's graph, catalog and transport exposed as MCP-style tools, so an AI agent
 * in (or beside) the browser can read and build flows. One registry, several transports:
 * native WebMCP (`document.modelContext`), the W3C polyfill, and the WebMCP local relay that
 * hands the same tools to desktop MCP clients such as Claude Code. See docs/plans/WEBMCP_PLAN.md.
 */

/** How much a tool can do, which decides whether it runs freely, asks first, or is refused. */
export type ToolTier = 'read' | 'sensitive-read' | 'edit' | 'run' | 'consequential'

/** Agent access, chosen by the person. Off by default and per tab. */
export type AgentMode = 'off' | 'read' | 'ask' | 'edit'

export type AgentTransport = 'webmcp' | 'relay' | 'test'

/** The subset of JSON Schema the in-house validator understands. */
export interface JSONSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean'
  description?: string
  properties?: Record<string, JSONSchema>
  required?: string[]
  additionalProperties?: boolean
  items?: JSONSchema
  enum?: readonly unknown[]
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  default?: unknown
}

export type ToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string }

/** MCP `CallToolResult`. The relay passes it through unchanged; native WebMCP JSON-serialises it. */
export interface ToolResult {
  content: ToolContent[]
  isError?: boolean
  structuredContent?: Record<string, unknown>
}

export interface XY { x: number; y: number }

/** Things only the mounted editor has, handed to the registry at install time. */
export interface ToolEnv {
  execution?: {
    start: () => void | Promise<void>
    stop: () => void
    pause: () => void
    resume: () => void
  }
  /** Centre of the visible canvas, in flow coordinates. */
  viewCenter?: () => XY
  /** Frame the given nodes (or everything) on the canvas. */
  frame?: (nodeIds?: string[]) => void
  /** A node's rendered size on the canvas, so auto-arrange spaces real (not estimated) boxes. */
  dimensions?: (nodeId: string) => { width: number; height: number } | undefined
}

export interface ToolContext {
  transport: AgentTransport
  signal: AbortSignal
  env: ToolEnv
}

export interface AgentTool<I = Record<string, unknown>> {
  /** `latch_<verb>_<noun>`: lowercase and underscores, so relay sanitising leaves it unchanged. */
  name: string
  title: string
  /** Static text (never interpolate flow content): imperative, states side effects. */
  description: string
  inputSchema: JSONSchema & { type: 'object' }
  tier: ToolTier
  /** The result carries text from flows, files, the network or models (prompt-injection hint). */
  untrustedOutput?: boolean
  /** Edit-tier tools that don't change the active flow's nodes or wires (flow tabs, renames): no revert checkpoint. */
  touchesGraph?: boolean
  /** The tool waits on the person (a dialog): no call timeout, the person is the timeout. */
  waitsForPerson?: boolean
  execute(input: I, ctx: ToolContext): Promise<ToolResult | Record<string, unknown>> | ToolResult | Record<string, unknown>
}

/** A tool error the agent should read (bad input, missing node): becomes `isError` text. */
export class ToolError extends Error {}

export interface ConsentRequest {
  tool: string
  title: string
  tier: ToolTier
  /** Truncated JSON of the arguments. */
  args: string
  transport: AgentTransport
  /** 'session': the answer may cover the rest of the session for this tier. */
  scope: 'once' | 'session'
  /** Aborts when the agent gives up on the call: the prompt should close as denied. */
  signal?: AbortSignal
}

export type ConsentDecision = 'once' | 'session' | 'deny'

export interface AuditEntry {
  id: number
  ts: number
  tool: string
  title: string
  transport: AgentTransport
  args: string
  ok: boolean
  ms: number
  error?: string
}
