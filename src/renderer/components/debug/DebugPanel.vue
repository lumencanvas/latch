<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import {
  Trash2,
  AlertCircle,
  Activity,
  Terminal,
  MessageSquare,
} from 'lucide-vue-next'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore } from '@/stores/nodes'
import { useUIStore } from '@/stores/ui'

const runtimeStore = useRuntimeStore()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()
const uiStore = useUIStore()

// Console message capture
interface ConsoleMessage {
  id: number
  type: 'log' | 'warn' | 'error' | 'info'
  message: string
  timestamp: Date
}

const consoleMessages = ref<ConsoleMessage[]>([])
const maxMessages = 100
let messageId = 0

// Store original console methods
let originalLog: typeof console.log
let originalWarn: typeof console.warn
let originalError: typeof console.error
let originalInfo: typeof console.info

function addMessage(type: ConsoleMessage['type'], args: unknown[]) {
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2)
      } catch {
        return String(arg)
      }
    }
    return String(arg)
  }).join(' ')

  consoleMessages.value.push({
    id: messageId++,
    type,
    message,
    timestamp: new Date(),
  })

  if (consoleMessages.value.length > maxMessages) {
    consoleMessages.value = consoleMessages.value.slice(-maxMessages)
  }
}

onMounted(() => {
  // Capture console methods
  originalLog = console.log
  originalWarn = console.warn
  originalError = console.error
  originalInfo = console.info

  console.log = (...args) => {
    originalLog.apply(console, args)
    addMessage('log', args)
  }
  console.warn = (...args) => {
    originalWarn.apply(console, args)
    addMessage('warn', args)
  }
  console.error = (...args) => {
    originalError.apply(console, args)
    addMessage('error', args)
  }
  console.info = (...args) => {
    originalInfo.apply(console, args)
    addMessage('info', args)
  }
})

onUnmounted(() => {
  // Restore original console methods
  if (originalLog) console.log = originalLog
  if (originalWarn) console.warn = originalWarn
  if (originalError) console.error = originalError
  if (originalInfo) console.info = originalInfo
})

// Runtime status
const statusColor = computed(() => {
  switch (runtimeStore.status) {
    case 'running':
      return 'var(--color-success)'
    case 'paused':
      return 'var(--color-warning)'
    default:
      return 'var(--color-neutral-400)'
  }
})

const statusLabel = computed(() => {
  switch (runtimeStore.status) {
    case 'running':
      return 'Running'
    case 'paused':
      return 'Paused'
    default:
      return 'Stopped'
  }
})

// Monitor values from runtime store
const monitorValues = computed(() => {
  void runtimeStore.nodeMetricsVersion
  const values: Array<{ nodeId: string; name: string; value: unknown; timestamp: number }> = []

  for (const [nodeId, metrics] of runtimeStore.nodeMetrics) {
    const node = flowsStore.activeNodes.find(n => n.id === nodeId)
    if (!node) continue

    const nodeType = node.data?.nodeType as string
    if (nodeType === 'monitor') {
      const display = metrics.outputValues?.display ?? metrics.outputValues?.value
      if (display !== undefined && display !== null) {
        const label = node.data?.label as string | undefined
        const def = nodesStore.getDefinition(nodeType)
        values.push({
          nodeId,
          name: label || def?.name || 'Monitor',
          value: display,
          timestamp: Date.now(),
        })
      }
    }
  }

  return values
})

// Format value for display
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toString()
    return value.toFixed(4)
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Format timestamp
function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// Clear functions
function clearConsole() {
  consoleMessages.value = []
}

function clearErrors() {
  runtimeStore.clearErrors()
}

// Highlight node in canvas
function highlightNode(nodeId: string) {
  uiStore.selectNodes([nodeId])
  uiStore.setInspectedNode(nodeId)
}

// Error count
const errorCount = computed(() => {
  return consoleMessages.value.filter(m => m.type === 'error').length + runtimeStore.errors.length
})

const warnCount = computed(() => {
  return consoleMessages.value.filter(m => m.type === 'warn').length
})
</script>

<template>
  <div class="debug-panel">
    <!-- Compact Status Bar -->
    <div class="status-bar">
      <div class="status-item">
        <Activity
          :size="12"
          :style="{ color: statusColor }"
        />
        <span class="status-label">{{ statusLabel }}</span>
      </div>
      <div class="status-item">
        <span class="stat-label">FPS</span>
        <span
          class="stat-value"
          :class="{ warning: runtimeStore.fps < 30 }"
        >{{ runtimeStore.fps }}</span>
      </div>
      <div class="status-item">
        <span class="stat-label">Nodes</span>
        <span class="stat-value">{{ flowsStore.activeNodes.length }}</span>
      </div>
      <div
        v-if="errorCount > 0"
        class="status-item error"
      >
        <AlertCircle :size="12" />
        <span>{{ errorCount }}</span>
      </div>
    </div>

    <!-- Console Messages -->
    <div class="section">
      <div class="section-header">
        <Terminal :size="12" />
        <span class="section-title">Console</span>
        <span
          v-if="warnCount > 0"
          class="warn-badge"
        >{{ warnCount }}</span>
        <span
          v-if="errorCount > 0"
          class="error-badge"
        >{{ errorCount }}</span>
        <button
          v-if="consoleMessages.length > 0"
          class="clear-btn"
          title="Clear console"
          @click="clearConsole"
        >
          <Trash2 :size="10" />
        </button>
      </div>
      <div class="console-content">
        <div
          v-if="consoleMessages.length === 0"
          class="empty-state"
        >
          No messages
        </div>
        <div
          v-for="msg in consoleMessages.slice().reverse()"
          :key="msg.id"
          class="console-message"
          :class="msg.type"
        >
          <div class="msg-header">
            <span class="msg-type">{{ msg.type }}</span>
            <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
          </div>
          <pre class="msg-text">{{ msg.message }}</pre>
        </div>
      </div>
    </div>

    <!-- Runtime Errors -->
    <div
      v-if="runtimeStore.errors.length > 0"
      class="section"
    >
      <div class="section-header">
        <AlertCircle
          :size="12"
          class="error-icon"
        />
        <span class="section-title">Runtime Errors</span>
        <button
          class="clear-btn"
          title="Clear errors"
          @click="clearErrors"
        >
          <Trash2 :size="10" />
        </button>
      </div>
      <div class="errors-content">
        <div
          v-for="error in runtimeStore.recentErrors.slice().reverse()"
          :key="error.id"
          class="error-item"
          @click="highlightNode(error.nodeId)"
        >
          <span class="error-node">{{ error.nodeName }}</span>
          <span class="error-msg">{{ error.message }}</span>
        </div>
      </div>
    </div>

    <!-- Monitor Values -->
    <div
      v-if="monitorValues.length > 0"
      class="section"
    >
      <div class="section-header">
        <MessageSquare :size="12" />
        <span class="section-title">Monitors</span>
      </div>
      <div class="monitors-content">
        <div
          v-for="monitor in monitorValues"
          :key="monitor.nodeId"
          class="monitor-item"
          @click="highlightNode(monitor.nodeId)"
        >
          <span class="monitor-name">{{ monitor.name }}</span>
          <span class="monitor-value">{{ formatValue(monitor.value) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.debug-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  font-size: var(--font-size-xs);
}

/* Status Bar */
.status-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-100);
  border-bottom: 1px solid var(--color-neutral-200);
}

.status-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.status-item.error {
  color: var(--color-error);
}

.status-label {
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-label {
  color: var(--color-neutral-500);
}

.stat-value {
  font-family: var(--font-mono);
  font-weight: var(--font-weight-semibold);
}

.stat-value.warning {
  color: var(--color-warning);
}

/* Section */
.section {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--color-neutral-100);
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
}

.section-title {
  flex: 1;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-600);
}

.error-icon {
  color: var(--color-error);
}

.warn-badge,
.error-badge {
  padding: 0 var(--space-1);
  font-size: 10px;
  font-weight: var(--font-weight-bold);
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
}

.warn-badge {
  background: var(--color-warning);
  color: var(--color-neutral-900);
}

.error-badge {
  background: var(--color-error);
  color: white;
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: var(--color-neutral-200);
  border: none;
  border-radius: var(--radius-xs);
  color: var(--color-neutral-500);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.clear-btn:hover {
  background: var(--color-neutral-300);
  color: var(--color-neutral-700);
}

/* Console */
.console-content {
  flex: 1;
  overflow-y: auto;
  max-height: 320px;
  background: var(--color-neutral-900);
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Each log renders as its own card so entries never blur together. */
.console-message {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--color-neutral-800);
  border-left: 3px solid var(--color-neutral-600);
  border-radius: var(--radius-sm);
}

.console-message.log {
  color: var(--color-neutral-300);
  border-left-color: var(--color-neutral-500);
}

.console-message.info {
  color: #7dd3fc;
  border-left-color: #7dd3fc;
}

.console-message.warn {
  color: #fbbf24;
  border-left-color: #fbbf24;
  background: rgba(251, 191, 36, 0.1);
}

.console-message.error {
  color: #f87171;
  border-left-color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}

.msg-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.msg-type {
  text-transform: uppercase;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
}

.msg-time {
  color: var(--color-neutral-500);
  font-size: 10px;
  flex-shrink: 0;
}

.msg-text {
  margin: 0;
  word-break: break-word;
  white-space: pre-wrap;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.4;
}

/* Errors */
.errors-content {
  max-height: 120px;
  overflow-y: auto;
}

.error-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  border-bottom: 1px solid var(--color-neutral-100);
  transition: background var(--transition-fast);
}

.error-item:hover {
  background: var(--color-error-light, #fef2f2);
}

.error-node {
  font-weight: var(--font-weight-semibold);
  color: var(--color-error);
}

.error-msg {
  color: var(--color-neutral-600);
  font-size: 11px;
}

/* Monitors */
.monitors-content {
  max-height: 150px;
  overflow-y: auto;
}

.monitor-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  border-bottom: 1px solid var(--color-neutral-100);
  transition: background var(--transition-fast);
}

.monitor-item:hover {
  background: var(--color-neutral-50);
}

.monitor-name {
  color: var(--color-neutral-700);
}

.monitor-value {
  font-family: var(--font-mono);
  color: var(--color-primary-600);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Empty State */
.empty-state {
  padding: var(--space-3);
  text-align: center;
  color: var(--color-neutral-500);
  font-style: italic;
  background: var(--color-neutral-900);
}
</style>
