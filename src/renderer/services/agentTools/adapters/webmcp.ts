/// <reference types="webmcp-types" />
import { takeRelayCall } from './relay'
import { annotationsFor, type AgentToolRegistry } from '../registry'
import type { AgentTool } from '../types'

/**
 * WebMCP adapter: registers every agent tool on `document.modelContext` (the current draft; the
 * older `navigator.modelContext` is the fallback). Without a native implementation the W3C
 * polyfill provides one, so the relay widget and in-page agents see the same tools.
 *
 * Tools stay same-origin (no `exposedTo`). Aborting the returned controller unregisters them:
 * the draft removed `unregisterTool`.
 */

type LooseModelContext = {
  registerTool(tool: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<void>
}

export function getModelContext(): LooseModelContext | null {
  const doc = document as unknown as { modelContext?: LooseModelContext }
  const nav = navigator as unknown as { modelContext?: LooseModelContext }
  return doc.modelContext ?? nav.modelContext ?? null
}

/** Make sure a modelContext exists. Returns which kind, or null outside a secure context. */
export async function ensureModelContext(): Promise<'native' | 'polyfill' | null> {
  if (getModelContext()) return 'native'
  if (!window.isSecureContext) return null
  const { installWebMCP } = await import('@w3c/webmcp-polyfill')
  installWebMCP()
  return getModelContext() ? 'polyfill' : null
}

export async function registerWebMCP(registry: AgentToolRegistry, filter?: (tool: AgentTool) => boolean): Promise<{ controller: AbortController; runtime: 'native' | 'polyfill' } | null> {
  const runtime = await ensureModelContext()
  const mc = getModelContext()
  if (!runtime || !mc) return null
  const controller = new AbortController()
  const results = await Promise.allSettled(
    registry.list().filter((t) => !filter || filter(t)).map((tool) =>
      mc.registerTool(
        {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: annotationsFor(tool),
          execute: (input: unknown, options?: { signal?: AbortSignal }) =>
            registry.invoke(tool.name, input, { transport: takeRelayCall(tool.name) ? 'relay' : 'webmcp', signal: options?.signal }),
        },
        { signal: controller.signal },
      ),
    ),
  )
  const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
  if (failed.length) console.warn(`[agentTools] ${failed.length} tool(s) failed to register:`, failed[0].reason)
  return { controller, runtime }
}
