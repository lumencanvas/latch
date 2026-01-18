<script setup lang="ts">
import { computed } from 'vue'
import { useRuntimeStore } from '@/stores/runtime'
import { useFlowsStore } from '@/stores/flows'
import { useUIStore } from '@/stores/ui'

const runtimeStore = useRuntimeStore()
const flowsStore = useFlowsStore()
const uiStore = useUIStore()

const statusText = computed(() => {
  switch (runtimeStore.status) {
    case 'running':
      return 'Running'
    case 'paused':
      return 'Paused'
    default:
      return 'Stopped'
  }
})

const statusClass = computed(() => ({
  'status-indicator': true,
  'status-running': runtimeStore.isRunning,
  'status-paused': runtimeStore.isPaused,
  'status-stopped': runtimeStore.isStopped,
}))

const nodeCount = computed(() => flowsStore.activeNodes.length)
const edgeCount = computed(() => flowsStore.activeEdges.length)
const errorCount = computed(() => runtimeStore.errorCount)

const zoomPercent = computed(() => Math.round(uiStore.zoom * 100))

const isElectron = computed(() => {
  return typeof globalThis.window !== 'undefined' &&
    'electronAPI' in globalThis.window
})
</script>

<template>
  <footer class="status-bar">
    <div class="status-left">
      <span :class="statusClass" />
      <span class="status-text">{{ statusText }}</span>

      <span
        v-if="runtimeStore.isRunning"
        class="status-fps"
      >
        <span class="status-value">{{ runtimeStore.fps }}</span> fps
      </span>

      <span
        v-if="errorCount > 0"
        class="status-errors"
      >
        <span class="status-value error">{{ errorCount }}</span> errors
      </span>
    </div>

    <div class="status-right">
      <span class="status-item">
        <span class="status-value">{{ nodeCount }}</span> nodes
      </span>

      <span class="status-item">
        <span class="status-value">{{ edgeCount }}</span> connections
      </span>

      <span class="status-item">
        <span class="status-value">{{ zoomPercent }}%</span> zoom
      </span>

      <span class="status-platform">
        {{ isElectron ? 'Electron' : 'Web' }}
      </span>
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--statusbar-height);
  padding: 0 var(--space-4);
  background: var(--color-neutral-200);
  border-top: 1px solid var(--color-neutral-300);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  flex-shrink: 0;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--color-neutral-400);
}

.status-indicator.status-running {
  background: var(--color-success);
  animation: pulse 1s infinite;
}

.status-indicator.status-paused {
  background: var(--color-warning);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-text {
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.status-value {
  color: var(--color-primary-400);
  font-weight: var(--font-weight-semibold);
}

.status-value.error {
  color: var(--color-error);
}

.status-fps,
.status-errors,
.status-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.status-platform {
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-400);
}
</style>
