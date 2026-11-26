import { defineStore } from 'pinia'
import { markRaw, type Raw } from 'vue'
import type { AgentMode, AuditEntry, ToolTier } from '@/services/agentTools/types'
import type { FlowSnapshot } from './history'

/**
 * AI agent access for this tab: the mode the person chose, whether the desktop relay is on,
 * what agents did (the activity log) and a snapshot of each flow from before an agent first
 * changed it ("Revert agent changes"; undo only keeps 20 steps).
 *
 * Mode and relay are stored in sessionStorage, so they survive a reload of this tab but a tab
 * opened later (or the browser restarted) starts with agents off.
 */

const MODE_KEY = 'latch.agent.mode'
const RELAY_KEY = 'latch.agent.relay'
const AUDIT_MAX = 200
const MODES: AgentMode[] = ['off', 'read', 'ask', 'edit']

function readSession(key: string): string | null {
  try { return sessionStorage.getItem(key) } catch { return null }
}
function writeSession(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch { /* storage unavailable: the setting just won't survive a reload */ }
}

function initialMode(): AgentMode {
  const m = readSession(MODE_KEY) as AgentMode | null
  return m && MODES.includes(m) ? m : 'off'
}

interface AgentState {
  mode: AgentMode
  relay: boolean
  paused: boolean
  /** Tiers the person allowed for the rest of this session. */
  grants: ToolTier[]
  audit: AuditEntry[]
  /** Calls that changed something, this session. */
  changeCount: number
  checkpoints: Map<string, Raw<FlowSnapshot>>
  /** Set by the WebMCP adapter: 'native' | 'polyfill' | null (not registered). */
  runtime: 'native' | 'polyfill' | null
  /** The relay widget's state, as far as the page can tell. */
  relayStatus: 'off' | 'connecting' | 'on' | 'error'
  relayError: string | null
}

let nextAuditId = 1

export const useAgentStore = defineStore('agent', {
  state: (): AgentState => ({
    mode: initialMode(),
    relay: readSession(RELAY_KEY) === '1',
    paused: false,
    grants: [],
    audit: [],
    changeCount: 0,
    checkpoints: new Map(),
    runtime: null,
    relayStatus: 'off',
    relayError: null,
  }),

  getters: {
    enabled: (s): boolean => s.mode !== 'off',
    lastActivity: (s): AuditEntry | null => s.audit[s.audit.length - 1] ?? null,
    hasCheckpoint: (s) => (flowId: string | null): boolean => !!flowId && s.checkpoints.has(flowId),
  },

  actions: {
    setMode(mode: AgentMode) {
      if (!MODES.includes(mode)) return
      this.mode = mode
      writeSession(MODE_KEY, mode === 'off' ? null : mode)
      if (mode === 'off') {
        this.endSession()
      }
    },

    setRelay(on: boolean) {
      this.relay = on
      writeSession(RELAY_KEY, on ? '1' : null)
    },

    setPaused(paused: boolean) {
      this.paused = paused
    },

    grant(tier: ToolTier) {
      if (!this.grants.includes(tier)) this.grants.push(tier)
    },

    record(entry: Omit<AuditEntry, 'id'>) {
      this.audit.push({ ...entry, id: nextAuditId++ })
      if (this.audit.length > AUDIT_MAX) this.audit.splice(0, this.audit.length - AUDIT_MAX)
    },

    noteChange() {
      this.changeCount++
    },

    /** Keep the first pre-agent snapshot of a flow (later ones would lose the person's version). */
    checkpoint(flowId: string, snapshot: FlowSnapshot) {
      if (!this.checkpoints.has(flowId)) this.checkpoints.set(flowId, markRaw(snapshot))
    },

    takeCheckpoint(flowId: string): FlowSnapshot | null {
      const snap = this.checkpoints.get(flowId) ?? null
      this.checkpoints.delete(flowId)
      return snap
    },

    /**
     * Forget grants (agents turned off). Revert checkpoints stay until the tab closes or the
     * person reverts: "turn the agent off, then undo what it did" must still work.
     */
    endSession() {
      this.grants = []
      this.paused = false
      this.changeCount = 0
    },
  },
})
