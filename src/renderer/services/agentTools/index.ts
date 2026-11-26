import { watch } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { AgentToolRegistry } from './registry'
import { readTools } from './tools/read'
import { editTools } from './tools/edit'
import { flowTools } from './tools/flows'
import { registerWebMCP } from './adapters/webmcp'
import { nudgeRelayWidget, startRelayWidget, stopRelayWidget } from './adapters/relay'
import type { ToolEnv } from './types'

export { setAgentConsentResolver, annotationsFor } from './registry'
export { revertAgentChanges } from './tools/edit'
export { relayCommand } from './adapters/relay'

let registry: AgentToolRegistry | null = null

/** The process-wide registry with every LATCH agent tool. */
export function getAgentToolRegistry(): AgentToolRegistry {
  if (!registry) {
    registry = new AgentToolRegistry()
    registry.register(...readTools, ...editTools, ...flowTools)
  }
  return registry
}

let baseEnv: ToolEnv = {}
let editorEnv: Pick<ToolEnv, 'viewCenter' | 'frame' | 'dimensions'> = {}

/**
 * The editor lends its canvas helpers (where the view is centred, framing new nodes) while it is
 * mounted; pass null on unmount. Tools still work without it (e.g. from the Controls view).
 */
export function setAgentEditorEnv(env: Pick<ToolEnv, 'viewCenter' | 'frame' | 'dimensions'> | null): void {
  editorEnv = env ?? {}
  getAgentToolRegistry().setEnv({ ...baseEnv, ...editorEnv })
}

/**
 * Install agent tools for the app (once, from App.vue, so they work on every route). Tools are
 * registered with WebMCP only while the person has agent access on, and the relay widget only
 * runs while they also turned it on. Returns the teardown.
 */
export function installAgentTools(env: ToolEnv): () => void {
  const reg = getAgentToolRegistry()
  baseEnv = env
  reg.setEnv({ ...baseEnv, ...editorEnv })
  const agent = useAgentStore()
  let controller: AbortController | null = null
  let disposed = false
  // Serialised, so a fast on/off/on never registers the same tool names twice at once.
  let chain: Promise<void> = Promise.resolve()
  let registeredReadOnly = false

  async function sync() {
    if (disposed) return
    const on = agent.mode !== 'off'
    const readOnly = agent.mode === 'read'
    // Read-only lists only read tools, so re-register when switching to or from it.
    if (controller && on && readOnly !== registeredReadOnly) {
      controller.abort()
      controller = null
    }
    if (on && !controller) {
      registeredReadOnly = readOnly
      const r = await registerWebMCP(reg, readOnly ? (t) => t.tier === 'read' : undefined).catch((e) => {
        console.warn('[agentTools] WebMCP registration failed:', e)
        return null
      })
      if (disposed) { r?.controller.abort(); return }
      controller = r?.controller ?? null
      agent.runtime = r?.runtime ?? null
    } else if (!on && controller) {
      controller.abort()
      controller = null
      agent.runtime = null
    }
    if (on && agent.relay && controller) {
      agent.relayStatus = 'connecting'
      try {
        await startRelayWidget()
        if (disposed) { stopRelayWidget(); return }
        agent.relayStatus = 'on'
        agent.relayError = null
      } catch (e) {
        agent.relayStatus = 'error'
        agent.relayError = e instanceof Error ? e.message : String(e)
      }
    } else {
      stopRelayWidget()
      agent.relayStatus = 'off'
    }
  }

  const stop = watch(() => [agent.mode, agent.relay] as const, () => { chain = chain.then(sync) }, { immediate: true })
  const onVisible = () => { if (document.visibilityState === 'visible') nudgeRelayWidget() }
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    stop()
    disposed = true
    document.removeEventListener('visibilitychange', onVisible)
    controller?.abort()
    controller = null
    stopRelayWidget()
    agent.runtime = null
    agent.relayStatus = 'off'
    baseEnv = {}
    reg.setEnv({ ...editorEnv })
  }
}
