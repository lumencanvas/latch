<script setup lang="ts">
/**
 * ClaspDiscovery
 *
 * Component for discovering CLASP servers on the local network.
 * Scans common ports and displays discovered servers.
 * Also offers quick-connect presets for the public relay.
 */

import { ref, onMounted } from 'vue'
import { Loader2, Radar, AlertCircle, Server, ChevronRight, Globe, Check } from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'select', url: string): void
}>()

// The currently-configured server URL, so the chosen one is highlighted.
defineProps<{ selectedUrl?: string }>()

interface DiscoveredServer {
  url: string
  name?: string
  version?: number
  latency: number
}

interface ServerPreset {
  url: string
  label: string
  description: string
}

const PUBLIC_PRESETS: ServerPreset[] = [
  {
    url: 'wss://relay.clasp.to',
    label: 'Public Relay',
    description: 'Free public relay for cross-network streaming and collaboration',
  },
]

const isScanning = ref(false)
const hasScanned = ref(false)
const discoveredServers = ref<DiscoveredServer[]>([])
const scanError = ref<string | null>(null)
const publicRelayStatus = ref<'idle' | 'checking' | 'online' | 'offline'>('idle')

const CLASP_PORTS = [7330, 7331, 7332, 8080, 8081]
const SCAN_TIMEOUT = 3000

async function checkServer(host: string, port: number): Promise<DiscoveredServer | null> {
  const isSecure = port === 443
  const url = isSecure ? `wss://${host}` : `ws://${host}:${port}`
  const startTime = performance.now()

  return new Promise((resolve) => {
    const ws = new WebSocket(url, 'clasp')
    const timeout = setTimeout(() => {
      ws.close()
      resolve(null)
    }, SCAN_TIMEOUT)

    ws.onopen = () => {
      clearTimeout(timeout)
      const latency = Math.round(performance.now() - startTime)
      // We successfully connected, close immediately
      ws.close()
      resolve({
        url,
        latency,
      })
    }

    ws.onerror = () => {
      clearTimeout(timeout)
      resolve(null)
    }

    ws.onclose = () => {
      clearTimeout(timeout)
    }
  })
}

async function scanNetwork() {
  isScanning.value = true
  hasScanned.value = true
  scanError.value = null
  discoveredServers.value = []

  // Probe the common CLASP router ports on THIS machine (localhost) only. Opening
  // a WebSocket to localhost is what triggers the browser's local-network-access
  // permission, so this runs ONLY when the user clicks Scan — never automatically.
  try {
    const results = await Promise.all(CLASP_PORTS.map((port) => checkServer('localhost', port)))
    discoveredServers.value = results.filter((r): r is DiscoveredServer => r !== null)
  } catch (error) {
    scanError.value = error instanceof Error ? error.message : 'Scan failed'
  } finally {
    isScanning.value = false
  }
}

function selectServer(server: DiscoveredServer) {
  emit('select', server.url)
}

function selectPreset(preset: ServerPreset) {
  emit('select', preset.url)
}

async function checkPublicRelay() {
  publicRelayStatus.value = 'checking'
  try {
    const result = await checkServer('relay.clasp.to', 443)
    publicRelayStatus.value = result ? 'online' : 'offline'
  } catch {
    publicRelayStatus.value = 'offline'
  }
}

onMounted(() => {
  // Only check the EXTERNAL public relay's status (wss://relay.clasp.to) — that
  // doesn't touch the local network. Local discovery is on-demand (the Scan
  // button), so opening this panel never probes localhost / prompts for local
  // device access, and there's no background re-scan loop.
  checkPublicRelay()
})
</script>

<template>
  <div class="clasp-discovery">
    <!-- Public relay presets -->
    <div class="preset-section">
      <span class="discovery-title">Quick Connect</span>
      <div class="server-list">
        <button
          v-for="preset in PUBLIC_PRESETS"
          :key="preset.url"
          class="server-item preset-item"
          :class="{ selected: selectedUrl === preset.url }"
          @click="selectPreset(preset)"
        >
          <Check
            v-if="selectedUrl === preset.url"
            class="server-icon selected-check"
            :size="18"
          />
          <Globe
            v-else
            class="server-icon preset-icon"
            :size="18"
          />
          <div class="server-info">
            <div class="preset-label-row">
              <span class="server-url">{{ preset.label }}</span>
              <span
                v-if="publicRelayStatus === 'online'"
                class="status-dot online"
                title="Online"
              />
              <span
                v-else-if="publicRelayStatus === 'offline'"
                class="status-dot offline"
                title="Offline"
              />
              <Loader2
                v-else-if="publicRelayStatus === 'checking'"
                :size="10"
                class="spinning status-spinner"
              />
            </div>
            <span class="preset-url">{{ preset.url }}</span>
            <span class="server-latency">{{ preset.description }}</span>
          </div>
          <ChevronRight
            class="server-arrow"
            :size="14"
          />
        </button>
      </div>
    </div>

    <!-- Local discovery -->
    <div class="discovery-section">
      <div class="discovery-header">
        <span class="discovery-title">Local Servers</span>
        <button
          v-if="discoveredServers.length > 0 || isScanning"
          class="scan-btn"
          :disabled="isScanning"
          @click="scanNetwork"
        >
          <Loader2
            v-if="isScanning"
            :size="12"
            class="spinning"
          />
          <Radar
            v-else
            :size="12"
          />
          {{ isScanning ? 'Scanning…' : 'Rescan' }}
        </button>
      </div>

      <div
        v-if="scanError"
        class="discovery-error"
      >
        <AlertCircle :size="14" />
        {{ scanError }}
      </div>

      <!-- Discovered servers -->
      <div
        v-if="discoveredServers.length > 0"
        class="server-list"
      >
        <button
          v-for="server in discoveredServers"
          :key="server.url"
          class="server-item"
          :class="{ selected: selectedUrl === server.url }"
          @click="selectServer(server)"
        >
          <Check
            v-if="selectedUrl === server.url"
            class="server-icon selected-check"
            :size="16"
          />
          <Server
            v-else
            class="server-icon"
            :size="16"
          />
          <div class="server-info">
            <span class="server-url">{{ server.url }}</span>
            <span class="server-latency">{{ server.latency }}ms</span>
          </div>
          <ChevronRight
            class="server-arrow"
            :size="14"
          />
        </button>
      </div>

      <!-- Compact, clickable scan row (pre-scan or empty result). -->
      <button
        v-else
        class="scan-row"
        :disabled="isScanning"
        @click="scanNetwork"
      >
        <Loader2
          v-if="isScanning"
          :size="16"
          class="spinning"
        />
        <Radar
          v-else
          :size="16"
        />
        <span class="scan-row-text">
          <template v-if="isScanning">Scanning localhost…</template>
          <template v-else-if="hasScanned">No routers found — scan again</template>
          <template v-else>Scan localhost for CLASP routers</template>
          <span class="scan-row-hint">
            <template v-if="hasScanned">Start a CLASP router or Bridge, then rescan.</template>
            <template v-else>Your browser may ask to allow local-network access.</template>
          </span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.clasp-discovery {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.discovery-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.discovery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.discovery-title {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-neutral-500);
}

.scan-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
  cursor: pointer;
}

.scan-btn:hover:not(:disabled) {
  border-color: var(--color-primary-500);
  color: var(--color-primary-500);
}

.scan-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.discovery-error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  background: rgba(239, 68, 68, 0.1);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--color-error);
}

/* Compact, clickable scan affordance — replaces the old large empty box. */
.scan-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-50);
  border: 1px dashed var(--color-neutral-300);
  border-radius: var(--radius-sm);
  color: var(--color-neutral-600);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.scan-row:hover:not(:disabled) {
  border-color: var(--color-primary-400);
  border-style: solid;
  background: var(--color-primary-50);
  color: var(--color-primary-600);
}

.scan-row:disabled {
  cursor: progress;
}

.scan-row svg {
  flex-shrink: 0;
}

.scan-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--font-size-sm);
}

.scan-row-hint {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  line-height: 1.4;
}

.server-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.server-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  background: white;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.server-item:hover {
  border-color: var(--color-primary-500);
  background: var(--color-neutral-50);
}

.server-item.selected {
  border-color: var(--color-primary-500);
  background: var(--color-primary-50);
  box-shadow: inset 0 0 0 1px var(--color-primary-500);
}

.server-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--color-primary-500);
}

.selected-check {
  color: var(--color-primary-600);
}

.server-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.server-url {
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  color: var(--color-neutral-800);
}

.server-latency {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
}

.server-arrow {
  width: 14px;
  height: 14px;
  color: var(--color-neutral-400);
}

.preset-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-neutral-200);
}

.preset-item {
  border-color: var(--color-primary-200);
  background: var(--color-primary-50);
}

.preset-item:hover {
  border-color: var(--color-primary-400);
  background: var(--color-primary-100);
}

.preset-icon {
  color: var(--color-primary-600);
}

.preset-label-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.preset-url {
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  color: var(--color-neutral-500);
}

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.online {
  background: var(--color-success, #22c55e);
  box-shadow: 0 0 4px var(--color-success, #22c55e);
}

.status-dot.offline {
  background: var(--color-neutral-400);
}

.status-spinner {
  color: var(--color-neutral-400);
}
</style>
