import { useAgentStore } from '@/stores/agent'
import { useFlowsStore } from '@/stores/flows'
import { createSnapshot } from '@/stores/history'
import { useFlowHistory } from '@/composables/useFlowHistory'
import { validateSchema } from './schema'
import {
  ToolError,
  type AgentMode,
  type AgentTool,
  type AgentTransport,
  type ConsentDecision,
  type ConsentRequest,
  type ToolEnv,
  type ToolResult,
  type ToolTier,
} from './types'

/**
 * The agent tool registry. Every call, whatever transport it came in on, goes through one
 * pipeline: lookup → mode gate → schema validation → rate limit → consent → serial queue →
 * execute → result cap → activity log. Transports (WebMCP, the relay) only adapt the shape.
 */

export const RESULT_TEXT_CAP = 64 * 1024
const CALL_TIMEOUT_MS = 30_000
const MAX_FLOW_NODES = 2000

const MUTATING: ReadonlySet<ToolTier> = new Set(['edit', 'run', 'consequential'])

export function isMutating(tier: ToolTier): boolean {
  return MUTATING.has(tier)
}

/** Annotations derive from the tier, never hand-set (a contract test pins this). */
export function annotationsFor(tool: AgentTool): { readOnlyHint: boolean; consequentialHint: boolean; untrustedContentHint: boolean } {
  return {
    readOnlyHint: tool.tier === 'read' || tool.tier === 'sensitive-read',
    consequentialHint: tool.tier === 'run' || tool.tier === 'consequential',
    untrustedContentHint: !!tool.untrustedOutput,
  }
}

/** Which tiers each mode allows at all ('ask' and 'edit' still prompt for some). */
const MODE_TIERS: Record<AgentMode, ReadonlySet<ToolTier>> = {
  off: new Set(),
  read: new Set(['read']),
  ask: new Set(['read', 'sensitive-read', 'edit', 'run', 'consequential']),
  edit: new Set(['read', 'sensitive-read', 'edit', 'run', 'consequential']),
}

/** null = no prompt; otherwise the prompt scope. */
function consentScope(mode: AgentMode, tier: ToolTier): 'once' | 'session' | null {
  if (tier === 'read') return null
  if (tier === 'consequential') return 'once'
  if (tier === 'edit') return mode === 'edit' ? null : 'session'
  return 'session' // sensitive-read, run
}

// ── consent resolver (injected by the mounted modal; default deny) ──────────────────────────
export type ConsentResolver = (req: ConsentRequest) => Promise<ConsentDecision>
const denyAll: ConsentResolver = async () => 'deny'
let consentResolver: ConsentResolver = denyAll
export function setAgentConsentResolver(fn: ConsentResolver | null) {
  consentResolver = fn ?? denyAll
}

// ── rate limiting: token buckets per class ──────────────────────────────────────────────────
class Bucket {
  private tokens: number
  private last = performance.now()
  constructor(private readonly rate: number, private readonly burst: number) {
    this.tokens = burst
  }
  take(): number {
    const now = performance.now()
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate)
    this.last = now
    if (this.tokens >= 1) {
      this.tokens -= 1
      return 0
    }
    return Math.ceil(((1 - this.tokens) / this.rate) * 1000)
  }
}

function truncateJSON(value: unknown, max = 600): string {
  let s: string
  try { s = JSON.stringify(value) ?? '' } catch { s = String(value) }
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function textResult(text: string, isError = false): ToolResult {
  return isError ? { content: [{ type: 'text', text }], isError: true } : { content: [{ type: 'text', text }] }
}

function isToolResult(v: unknown): v is ToolResult {
  return !!v && typeof v === 'object' && Array.isArray((v as ToolResult).content)
}

/** Plain objects become JSON text plus structuredContent; long text is cut with a marker. */
function normalize(raw: unknown): ToolResult {
  const result: ToolResult = isToolResult(raw)
    ? raw
    : { content: [{ type: 'text', text: JSON.stringify(raw ?? null, null, 1) }], structuredContent: raw && typeof raw === 'object' ? raw as Record<string, unknown> : undefined }
  let truncated = false
  for (const part of result.content) {
    if (part.type === 'text' && part.text.length > RESULT_TEXT_CAP) {
      part.text = `${part.text.slice(0, RESULT_TEXT_CAP)}\n…[truncated: result over ${RESULT_TEXT_CAP / 1024} KB]`
      truncated = true
    }
  }
  if (truncated || (result.structuredContent && JSON.stringify(result.structuredContent).length > RESULT_TEXT_CAP)) {
    delete result.structuredContent
  }
  if (!result.structuredContent) delete result.structuredContent
  return result
}

export class AgentToolRegistry {
  private tools = new Map<string, AgentTool>()
  private queue: Promise<unknown> = Promise.resolve()
  private readBucket = new Bucket(30, 60)
  private writeBucket = new Bucket(10, 30)
  private captureBucket = new Bucket(2, 2)
  private env: ToolEnv = {}
  /** The running tool's own promise, which can outlive a timeout. */
  private settling: Promise<unknown> = Promise.resolve()

  register(...tools: AgentTool<never>[]) {
    for (const t of tools) {
      if (this.tools.has(t.name)) throw new Error(`Duplicate agent tool ${t.name}`)
      this.tools.set(t.name, t as unknown as AgentTool)
    }
  }

  list(): AgentTool[] {
    return [...this.tools.values()]
  }

  get(name: string): AgentTool | undefined {
    return this.tools.get(name)
  }

  setEnv(env: ToolEnv) {
    this.env = env
  }

  /** Refill the rate limits (tests; a fresh agent session). */
  resetRateLimits() {
    this.readBucket = new Bucket(30, 60)
    this.writeBucket = new Bucket(10, 30)
    this.captureBucket = new Bucket(2, 2)
  }

  /** Run a tool call. Never throws: every failure is an `isError` result the agent can read. */
  async invoke(name: string, rawInput: unknown, opts: { transport: AgentTransport; signal?: AbortSignal }): Promise<ToolResult> {
    const agent = useAgentStore()
    const started = performance.now()
    const tool = this.tools.get(name)
    const input = rawInput === undefined || rawInput === null ? {} : rawInput
    const args = truncateJSON(input)

    const finish = (result: ToolResult, error?: string): ToolResult => {
      agent.record({
        ts: Date.now(),
        tool: name,
        title: tool?.title ?? name,
        transport: opts.transport,
        args,
        ok: !result.isError,
        ms: Math.round(performance.now() - started),
        ...(error ? { error } : {}),
      })
      return result
    }
    const fail = (msg: string) => finish(textResult(msg, true), msg)

    if (!tool) return fail(`Unknown tool "${name}". Call latch_get_guide for the tool list.`)
    if (!MODE_TIERS[agent.mode].has(tool.tier)) {
      return fail(agent.mode === 'off'
        ? 'Agent access is off in this LATCH tab. Ask the person to turn it on (the robot button in the header).'
        : `Agent access is read-only in this tab, so ${name} is not allowed. Ask the person to allow changes.`)
    }
    if (agent.paused) return fail('Paused by the person at the computer. Wait, or ask them to resume agent access.')

    const schemaError = validateSchema(tool.inputSchema, input)
    if (schemaError) return fail(schemaError)

    const bucket = tool.name === 'latch_capture_output' ? this.captureBucket : isMutating(tool.tier) ? this.writeBucket : this.readBucket
    const wait = bucket.take()
    if (wait > 0) return fail(`Rate limited: retry after ${wait} ms.`)

    const scope = consentScope(agent.mode, tool.tier)
    if (scope && !(scope === 'session' && agent.grants.includes(tool.tier))) {
      let decision: ConsentDecision
      try {
        decision = await consentResolver({ tool: name, title: tool.title, tier: tool.tier, args, transport: opts.transport, scope, signal: opts.signal })
      } catch {
        decision = 'deny'
      }
      if (decision === 'deny') return fail(opts.signal?.aborted ? 'Cancelled by the agent.' : 'The person declined this action.')
      if (decision === 'session' && scope === 'session') agent.grant(tool.tier)
    }

    // Serialise: two agent calls never interleave inside one history entry. The queue waits for
    // the tool itself to settle, not just for a timeout, so a timed-out call can't overlap the next.
    const run = this.queue.then(() => this.execute(tool, input as Record<string, unknown>, opts))
    this.queue = run.catch(() => undefined).then(() => this.settling)
    try {
      const result = await run
      return finish(result, result.isError ? (result.content[0] as { text?: string })?.text : undefined)
    } catch (e) {
      const msg = e instanceof ToolError ? e.message : `LATCH error: ${e instanceof Error ? e.message : String(e)}`
      if (!(e instanceof ToolError)) console.warn(`[agentTools] ${name} failed:`, e)
      return fail(msg)
    }
  }

  private async execute(tool: AgentTool, input: Record<string, unknown>, opts: { transport: AgentTransport; signal?: AbortSignal }): Promise<ToolResult> {
    const flows = useFlowsStore()
    const agent = useAgentStore()
    // Re-check at run time: the person may have paused agents, lowered the mode, or the agent
    // may have given up on this call while it waited for consent or in the queue.
    if (!MODE_TIERS[agent.mode].has(tool.tier)) throw new ToolError('Agent access changed while this call waited; it was not run.')
    if (agent.paused) throw new ToolError('Paused by the person at the computer. Wait, or ask them to resume agent access.')
    if (opts.signal?.aborted) throw new ToolError('Cancelled by the agent.')

    const mutating = isMutating(tool.tier)
    let checkpoint: { flowId: string; snap: ReturnType<typeof createSnapshot> } | null = null
    if (mutating) {
      // A person's in-flight slider burst commits as its own undo step first.
      useFlowHistory().flushParamEdit()
      const flow = flows.activeFlow
      if (flow && tool.tier === 'edit' && tool.touchesGraph !== false) {
        if (flow.nodes.length > MAX_FLOW_NODES) throw new ToolError(`This flow has over ${MAX_FLOW_NODES} nodes; agents can't edit it.`)
        // Snapshot now, keep it only if the call changes the flow (see below).
        if (!agent.hasCheckpoint(flow.id)) checkpoint = { flowId: flow.id, snap: createSnapshot(flow.nodes, flow.edges) }
      }
    }

    const controller = new AbortController()
    const timer = tool.waitsForPerson ? undefined : setTimeout(() => controller.abort(new Error('timed out')), CALL_TIMEOUT_MS)
    const onOuterAbort = () => controller.abort(opts.signal?.reason)
    opts.signal?.addEventListener('abort', onOuterAbort, { once: true })
    try {
      const running = Promise.resolve().then(() => tool.execute(input, { transport: opts.transport, signal: controller.signal, env: this.env }))
      this.settling = running.catch(() => undefined)
      const raw = await Promise.race([
        running,
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new ToolError(`Cancelled (${String(controller.signal.reason?.message ?? controller.signal.reason ?? 'aborted')}).`)), { once: true })
        }),
      ])
      const result = normalize(raw)
      if (mutating && !result.isError) {
        agent.noteChange()
        const flow = checkpoint && flows.getFlowById(checkpoint.flowId)
        if (checkpoint && flow && JSON.stringify([flow.nodes, flow.edges]) !== JSON.stringify([checkpoint.snap.nodes, checkpoint.snap.edges])) {
          agent.checkpoint(checkpoint.flowId, checkpoint.snap)
        }
      }
      return result
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onOuterAbort)
    }
  }
}
