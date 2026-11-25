<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { Bot, Copy, Check, Pause, Play, RotateCcw } from 'lucide-vue-next'
import { useAgentStore } from '@/stores/agent'
import { useFlowsStore } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'
import { getAgentToolRegistry, relayCommand, revertAgentChanges } from '@/services/agentTools'
import type { AgentMode } from '@/services/agentTools/types'

/**
 * Header control for AI agent access (WebMCP): choose the mode, let desktop agents in through
 * the local relay, see what agents did, pause them or revert their changes.
 */
const agent = useAgentStore()
const flows = useFlowsStore()
const ui = useUIStore()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const copied = ref(false)

const MODES: Array<{ id: AgentMode; label: string; hint: string }> = [
  { id: 'off', label: 'Off', hint: 'No tools are offered to agents.' },
  { id: 'read', label: 'Read only', hint: 'Agents can read flows, nodes, values and errors.' },
  { id: 'ask', label: 'Ask before changes', hint: 'Agents ask once before editing, and before playing.' },
  { id: 'edit', label: 'Allow edits', hint: 'Agents edit freely; they still ask before playing or reading the output image.' },
]

const toolCount = computed(() => {
  const all = getAgentToolRegistry().list()
  return agent.mode === 'read' ? all.filter((t) => t.tier === 'read').length : all.length
})
const recent = computed(() => agent.audit.slice(-8).reverse())
const canRevert = computed(() => agent.hasCheckpoint(flows.activeFlowId))
const command = computed(() => relayCommand())
const runtimeLabel = computed(() =>
  agent.runtime === 'native' ? "the browser's WebMCP" : agent.runtime === 'polyfill' ? 'WebMCP (built in)' : 'not available here')

function time(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

async function copyCommand() {
  try {
    await navigator.clipboard.writeText(command.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    ui.notify('Could not copy: select the command and copy it by hand.', 'warning')
  }
}

function revert() {
  if (revertAgentChanges()) ui.notify('Reverted the agent’s changes to this flow (you can undo this).', 'success')
}

function onDocPointer(e: PointerEvent) {
  if (open.value && rootRef.value && !rootRef.value.contains(e.target as Node)) open.value = false
}
function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer)
  document.addEventListener('keydown', onDocKey)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer)
  document.removeEventListener('keydown', onDocKey)
})
</script>

<template>
  <div
    ref="rootRef"
    class="agent-access"
  >
    <button
      class="btn btn-icon btn-ghost agent-btn"
      :class="{ 'agent-on': agent.enabled, 'agent-paused': agent.paused }"
      :title="agent.enabled ? `AI agent access: ${MODES.find(m => m.id === agent.mode)?.label}` : 'AI agent access (off)'"
      aria-label="AI agent access"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Bot />
      <span
        v-if="agent.enabled"
        class="agent-dot"
        aria-hidden="true"
      />
    </button>

    <div
      v-if="open"
      class="agent-panel"
      role="dialog"
      aria-labelledby="agent-panel-title"
    >
      <h2
        id="agent-panel-title"
        class="agent-title"
      >
        AI agent access
      </h2>
      <p class="agent-lead">
        Let an AI agent read and build flows in this tab through WebMCP. It lasts until you close the tab.
      </p>

      <div
        class="agent-modes"
        role="radiogroup"
        aria-label="Agent access mode"
      >
        <label
          v-for="m in MODES"
          :key="m.id"
          class="agent-mode"
          :class="{ selected: agent.mode === m.id }"
        >
          <input
            type="radio"
            name="agent-mode"
            :value="m.id"
            :checked="agent.mode === m.id"
            @change="agent.setMode(m.id)"
          >
          <span class="agent-mode-text">
            <span class="agent-mode-label">{{ m.label }}</span>
            <span class="agent-mode-hint">{{ m.hint }}</span>
          </span>
        </label>
      </div>

      <template v-if="agent.enabled">
        <p class="agent-status">
          {{ toolCount }} tools offered through {{ runtimeLabel }}.
          <template v-if="agent.changeCount">
            {{ agent.changeCount }} change{{ agent.changeCount === 1 ? '' : 's' }} by agents so far.
          </template>
        </p>

        <label class="agent-relay">
          <input
            type="checkbox"
            :checked="agent.relay"
            @change="agent.setRelay(($event.target as HTMLInputElement).checked)"
          >
          <span>Let desktop agents connect (Claude Code, Claude Desktop, Cursor)</span>
        </label>
        <div
          v-if="agent.relay"
          class="agent-relay-help"
        >
          <p>Add the relay to your agent once (it needs Node.js), then restart the agent:</p>
          <div class="agent-cmd">
            <code>{{ command }}</code>
            <button
              class="agent-icon-btn"
              :aria-label="copied ? 'Copied' : 'Copy command'"
              :title="copied ? 'Copied' : 'Copy command'"
              @click="copyCommand"
            >
              <Check v-if="copied" />
              <Copy v-else />
            </button>
          </div>
          <p class="agent-note">
            The relay only accepts this site and only listens on this computer. Chrome may ask to allow
            local network access. <span v-if="agent.relayStatus === 'error'">Relay widget failed: {{ agent.relayError }}</span>
          </p>
        </div>

        <div class="agent-actions">
          <button
            class="agent-action"
            @click="agent.setPaused(!agent.paused)"
          >
            <Play v-if="agent.paused" />
            <Pause v-else />
            {{ agent.paused ? 'Resume agents' : 'Pause agents' }}
          </button>
          <button
            class="agent-action"
            :disabled="!canRevert"
            title="Put this flow back the way it was before an agent first changed it"
            @click="revert"
          >
            <RotateCcw /> Revert agent changes
          </button>
        </div>

        <h3 class="agent-subtitle">
          Activity
        </h3>
        <p
          v-if="recent.length === 0"
          class="agent-empty"
        >
          Nothing yet.
        </p>
        <ol
          v-else
          class="agent-log"
          aria-live="polite"
        >
          <li
            v-for="e in recent"
            :key="e.id"
            :class="{ failed: !e.ok }"
          >
            <span class="agent-log-time">{{ time(e.ts) }}</span>
            <span class="agent-log-title">{{ e.title }}</span>
            <span
              v-if="!e.ok"
              class="agent-log-error"
              :title="e.error"
            >{{ e.error }}</span>
          </li>
        </ol>
      </template>
    </div>
  </div>
</template>

<style scoped>
.agent-access {
  position: relative;
  display: flex;
}

.agent-btn { position: relative; }

.agent-btn.agent-on { color: var(--color-primary-400); }
.agent-btn.agent-paused { color: var(--color-neutral-400); }

.agent-dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}

.agent-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1000;
  width: 360px;
  max-height: min(80vh, 640px);
  overflow-y: auto;
  padding: var(--space-3);
  background: var(--color-neutral-800);
  border: 1px solid var(--color-neutral-600);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
  color: var(--color-neutral-200);
  font-size: var(--font-size-xs);
  line-height: 1.45;
  text-transform: none;
}

.agent-title {
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-0);
}

.agent-lead,
.agent-status,
.agent-relay-help p { margin: 0 0 var(--space-2); }

.agent-modes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: var(--space-3);
}

.agent-mode {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.agent-mode:hover,
.agent-mode.selected { background: var(--color-neutral-700); }

.agent-mode input { margin-top: 3px; }

.agent-mode-text {
  display: flex;
  flex-direction: column;
}

.agent-mode-label {
  color: var(--color-neutral-0);
  font-weight: var(--font-weight-bold);
}

.agent-mode-hint,
.agent-note,
.agent-empty { color: var(--color-neutral-400); }

.agent-relay {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  cursor: pointer;
  color: var(--color-neutral-0);
}

.agent-relay input { margin-top: 3px; }

.agent-relay-help {
  margin: 0 0 var(--space-3) var(--space-4);
}

.agent-cmd {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
  padding: var(--space-2);
  background: var(--color-neutral-900);
  border: 1px solid var(--color-neutral-600);
  border-radius: var(--radius-xs);
}

.agent-cmd code {
  flex: 1;
  font-size: 11px;
  overflow-wrap: anywhere;
  color: var(--color-neutral-100);
  user-select: all;
}

.agent-icon-btn,
.agent-action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font: inherit;
  color: var(--color-neutral-100);
  background: var(--color-neutral-700);
  border: 1px solid var(--color-neutral-600);
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.agent-icon-btn { padding: 2px; }
.agent-action { padding: var(--space-1) var(--space-2); }

.agent-icon-btn svg,
.agent-action svg {
  width: 14px;
  height: 14px;
}

.agent-icon-btn:hover,
.agent-action:hover:not(:disabled) { background: var(--color-neutral-600); }

.agent-action:disabled {
  opacity: 0.5;
  cursor: default;
}

.agent-icon-btn:focus-visible,
.agent-action:focus-visible,
.agent-mode:focus-within {
  outline: 2px solid var(--color-protocol-ble);
  outline-offset: 1px;
}

.agent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.agent-subtitle {
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
  color: var(--color-neutral-400);
}

.agent-log {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-log li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.agent-log-time {
  color: var(--color-neutral-400);
  font-variant-numeric: tabular-nums;
}

.agent-log-title { color: var(--color-neutral-100); }

.agent-log li.failed .agent-log-title { color: var(--color-error); }

.agent-log-error {
  flex-basis: 100%;
  padding-left: 64px;
  color: var(--color-neutral-400);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
