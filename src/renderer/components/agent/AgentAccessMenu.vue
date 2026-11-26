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
  { id: 'off', label: 'Off', hint: 'No tools offered.' },
  { id: 'read', label: 'Read only', hint: 'Reads flows, values and errors.' },
  { id: 'ask', label: 'Ask first', hint: 'Asks once before editing or playing.' },
  { id: 'edit', label: 'Allow edits', hint: 'Edits freely; asks before playing or capturing.' },
]

const toolCount = computed(() => {
  const all = getAgentToolRegistry().list()
  return agent.mode === 'read' ? all.filter((t) => t.tier === 'read').length : all.length
})
const recent = computed(() => agent.audit.slice(-8).reverse())
const canRevert = computed(() => agent.hasCheckpoint(flows.activeFlowId))
const command = computed(() => relayCommand())
const runtimeLabel = computed(() =>
  agent.runtime === 'native' ? 'Native WebMCP' : agent.runtime === 'polyfill' ? 'WebMCP polyfill' : 'WebMCP unavailable')
const modeLabel = computed(() => MODES.find((m) => m.id === agent.mode)?.label ?? 'Off')

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
      :title="agent.enabled ? `AI agent access: ${modeLabel}` : 'AI agent access (off)'"
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
      <header class="agent-head">
        <Bot class="agent-head-icon" />
        <h2
          id="agent-panel-title"
          class="agent-title"
        >
          AI agents
        </h2>
        <span
          class="agent-badge"
          :class="{ live: agent.enabled && !agent.paused, paused: agent.paused }"
        >
          <span
            class="agent-badge-dot"
            aria-hidden="true"
          />
          {{ !agent.enabled ? 'Off' : agent.paused ? 'Paused' : modeLabel }}
        </span>
      </header>

      <div class="agent-body">
        <p class="agent-lead">
          Let an AI agent read and build flows in this tab through WebMCP. Access ends when you close the tab.
        </p>

        <h3 class="agent-section">
          Access
        </h3>
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
              class="visually-hidden"
              type="radio"
              name="agent-mode"
              :value="m.id"
              :checked="agent.mode === m.id"
              @change="agent.setMode(m.id)"
            >
            <span class="agent-mode-label">{{ m.label }}</span>
            <span class="agent-mode-hint">{{ m.hint }}</span>
          </label>
        </div>

        <div
          v-if="!agent.enabled && canRevert"
          class="agent-actions"
        >
          <button
            class="agent-action"
            title="Put this flow back the way it was before an agent first changed it"
            @click="revert"
          >
            <RotateCcw /> Revert agent changes
          </button>
        </div>

        <template v-if="agent.enabled">
          <div class="agent-stats">
            <span class="agent-stat"><strong>{{ toolCount }}</strong> tools</span>
            <span class="agent-stat">{{ runtimeLabel }}</span>
            <span class="agent-stat"><strong>{{ agent.changeCount }}</strong> change{{ agent.changeCount === 1 ? '' : 's' }}</span>
          </div>

          <h3 class="agent-section">
            Desktop agents
          </h3>
          <label class="agent-switch">
            <input
              type="checkbox"
              role="switch"
              :checked="agent.relay"
              @change="agent.setRelay(($event.target as HTMLInputElement).checked)"
            >
            <span
              class="agent-switch-track"
              aria-hidden="true"
            ><span class="agent-switch-thumb" /></span>
            <span class="agent-switch-text">Let Claude Code, Claude Desktop and Cursor connect</span>
          </label>
          <div
            v-if="agent.relay"
            class="agent-relay-help"
          >
            <p>Add the relay to your agent once (needs Node.js), then restart the agent:</p>
            <div class="agent-cmd">
              <span
                class="agent-cmd-prompt"
                aria-hidden="true"
              >$</span>
              <code>{{ command }}</code>
              <button
                class="agent-icon-btn"
                :class="{ copied }"
                :aria-label="copied ? 'Copied' : 'Copy command'"
                :title="copied ? 'Copied' : 'Copy command'"
                @click="copyCommand"
              >
                <Check v-if="copied" />
                <Copy v-else />
              </button>
            </div>
            <p class="agent-note">
              The relay accepts only this site and listens only on this computer. Chrome may ask to allow local network access.
            </p>
            <p
              v-if="agent.relayStatus === 'error'"
              class="agent-error"
            >
              Relay widget failed: {{ agent.relayError }}
            </p>
          </div>

          <div class="agent-actions">
            <button
              class="agent-action"
              :class="{ active: agent.paused }"
              @click="agent.setPaused(!agent.paused)"
            >
              <Play v-if="agent.paused" />
              <Pause v-else />
              {{ agent.paused ? 'Resume' : 'Pause' }}
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

          <h3 class="agent-section">
            Activity
          </h3>
          <p
            v-if="recent.length === 0"
            class="agent-empty"
          >
            No agent activity yet.
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
                v-if="e.transport === 'relay'"
                class="agent-log-via"
                title="Called by a desktop agent through the relay"
              >desktop</span>
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
  </div>
</template>

<style scoped>
.agent-access {
  position: relative;
  display: flex;
}

.agent-btn { position: relative; }
.agent-btn.agent-on { color: var(--color-primary-400); }
.agent-btn.agent-paused { color: var(--color-warning-400); }

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
  top: calc(100% + 8px);
  right: 0;
  z-index: var(--z-popover);
  width: 380px;
  max-height: min(82vh, 680px);
  display: flex;
  flex-direction: column;
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-800);
  box-shadow: var(--shadow-default);
  color: var(--color-neutral-800);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  line-height: 1.45;
  text-transform: none;
  letter-spacing: normal;
}

.agent-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-600) 100%);
  border-bottom: 2px solid var(--color-primary-700);
  color: #fff;
}

.agent-head-icon {
  width: 16px;
  height: 16px;
}

.agent-title {
  flex: 1;
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
}

.agent-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px var(--space-2);
  background: rgb(0 0 0 / 0.22);
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.agent-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(255 255 255 / 0.5);
}

.agent-badge.live .agent-badge-dot {
  background: #fff;
  box-shadow: 0 0 0 2px rgb(255 255 255 / 0.3);
}

.agent-badge.paused .agent-badge-dot { background: var(--color-warning-400); }

.agent-body {
  overflow-y: auto;
  padding: var(--space-3);
}

.agent-lead {
  margin: 0 0 var(--space-3);
  color: var(--color-neutral-600);
}

.agent-section {
  margin: var(--space-3) 0 var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--color-neutral-200);
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
  color: var(--color-neutral-500);
}

.agent-lead + .agent-section { margin-top: 0; }

.agent-modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.agent-mode {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2);
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-300);
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast);
}

.agent-mode:hover { border-color: var(--color-neutral-500); }

.agent-mode.selected {
  background: var(--color-primary-50);
  border-color: var(--color-primary-600);
  box-shadow: var(--shadow-offset-sm) var(--color-primary-700);
}

.agent-mode:focus-within {
  outline: 2px solid var(--color-protocol-ble);
  outline-offset: 2px;
}

.agent-mode-label {
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-800);
}

.agent-mode.selected .agent-mode-label { color: var(--color-primary-700); }

.agent-mode-hint {
  font-size: 11px;
  color: var(--color-neutral-500);
}

.agent-stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-3);
}

.agent-stat {
  padding: 2px var(--space-2);
  background: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-300);
  font-size: 11px;
  color: var(--color-neutral-600);
}

.agent-stat strong { color: var(--color-neutral-800); }

.agent-switch {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  color: var(--color-neutral-800);
}

.agent-switch input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}

.agent-switch-track {
  flex: none;
  position: relative;
  width: 30px;
  height: 16px;
  background: var(--color-neutral-300);
  border: 2px solid var(--color-neutral-800);
  transition: background var(--transition-fast);
}

.agent-switch-thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 10px;
  height: 10px;
  background: var(--color-neutral-800);
  transition: transform var(--transition-fast);
}

.agent-switch input:checked + .agent-switch-track { background: var(--color-primary-500); }
.agent-switch input:checked + .agent-switch-track .agent-switch-thumb {
  transform: translateX(14px);
  background: #fff;
}

.agent-switch input:focus-visible + .agent-switch-track {
  outline: 2px solid var(--color-protocol-ble);
  outline-offset: 2px;
}

.agent-relay-help { margin-top: var(--space-2); }

.agent-relay-help p { margin: 0 0 var(--space-2); }

.agent-cmd {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  padding: var(--space-2);
  background: #16181a;
  border: 2px solid var(--color-neutral-800);
}

.agent-cmd-prompt {
  color: var(--color-primary-400);
  font-weight: var(--font-weight-bold);
}

.agent-cmd code {
  flex: 1;
  font-size: 11px;
  overflow-wrap: anywhere;
  color: #e6e6e6;
  user-select: all;
}

.agent-note,
.agent-empty { color: var(--color-neutral-500); }

.agent-error { color: var(--color-error); }

.agent-icon-btn,
.agent-action {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-mono);
  cursor: pointer;
}

.agent-icon-btn {
  flex: none;
  padding: 3px;
  color: #e6e6e6;
  background: transparent;
  border: 1px solid #555;
}

.agent-icon-btn:hover { border-color: #e6e6e6; }
.agent-icon-btn.copied { color: var(--color-primary-400); border-color: var(--color-primary-400); }

.agent-icon-btn svg,
.agent-action svg {
  width: 14px;
  height: 14px;
}

.agent-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.agent-action {
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  color: var(--color-neutral-800);
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-800);
  box-shadow: var(--shadow-sm);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.agent-action:hover:not(:disabled) {
  transform: translate(-1px, -1px);
  box-shadow: var(--shadow-offset) var(--shadow-color);
}

.agent-action:active:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: none;
}

.agent-action.active {
  background: var(--color-warning-100);
  color: var(--color-warning-ink);
}

.agent-action:disabled {
  opacity: 0.4;
  cursor: default;
  box-shadow: none;
}

.agent-icon-btn:focus-visible,
.agent-action:focus-visible {
  outline: 2px solid var(--color-protocol-ble);
  outline-offset: 2px;
}

.agent-log {
  margin: 0;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--color-neutral-200);
}

.agent-log li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: 3px var(--space-2);
  border-left: 3px solid var(--color-primary-500);
}

.agent-log li:nth-child(even) { background: var(--color-neutral-50); }

.agent-log-time {
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}

.agent-log-title { color: var(--color-neutral-800); }

.agent-log-via {
  padding: 0 4px;
  border: 1px solid var(--color-neutral-300);
  font-size: 10px;
  text-transform: uppercase;
  color: var(--color-neutral-500);
}

.agent-log li.failed { border-left-color: var(--color-error); }
.agent-log li.failed .agent-log-title { color: var(--color-error); }

.agent-log-error {
  flex-basis: 100%;
  color: var(--color-neutral-500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  border: 0;
}
</style>
