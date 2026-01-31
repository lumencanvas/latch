<script setup lang="ts">
/**
 * ClaspDiscovery
 *
 * Component for discovering CLASP servers on the local network.
 * Scans common ports and displays discovered servers.
 * Also offers quick-connect presets for the public relay.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { Loader2, Radar, AlertCircle, Radio, Server, ChevronRight, Globe } from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'select', url: string): void
}>()

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
  scanError.value = null
  discoveredServers.value = []

  const hosts = ['localhost', '127.0.0.1']

  // Add common local network addresses
  for (let i = 1; i <= 254; i++) {
    hosts.push(`192.168.1.${i}`)
    hosts.push(`192.168.0.${i}`)
  }

  // For performance, we'll just scan localhost for now
  const scanHosts = ['localhost']

  try {
    const promises: Promise<DiscoveredServer | null>[] = []

    for (const host of scanHosts) {
      for (const port of CLASP_PORTS) {
        promises.push(checkServer(host, port))
      }
    }

    const results = await Promise.all(promises)
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
  // Auto-scan on mount
  scanNetwork()
  checkPublicRelay()
})

let scanInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  // Rescan every 10 seconds
  scanInterval = setInterval(() => {
    if (!isScanning.value) {
      scanNetwork()
    }
  }, 10000)
})

onUnmounted(() => {
  if (scanInterval) {
    clearInterval(scanInterval)
  }
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
          @click="selectPreset(preset)"
        >
          <Globe
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
    <div class="discovery-header">
      <span class="discovery-title">Local Servers</span>
      <button
        class="scan-btn"
        :disabled="isScanning"
        @click="scanNetwork"
      >
        <Loader2
          v-if="isScanning"
          :size="14"
          class="spinning"
        />
        <Radar
          v-else
          :size="14"
        />
        {{ isScanning ? 'Scanning...' : 'Scan' }}
      </button>
    </div>

    <div
      v-if="scanError"
      class="discovery-error"
    >
      <AlertCircle :size="16" />
      {{ scanError }}
    </div>

    <div
      v-if="discoveredServers.length === 0 && !isScanning"
      class="discovery-empty"
    >
      <Radio :size="24" />
      <span>No CLASP servers found on localhost</span>
      <span class="discovery-hint">Start a CLASP router or CLASP Bridge</span>
    </div>

    <div
      v-if="discoveredServers.length > 0"
      class="server-list"
    >
      <button
        v-for="server in discoveredServers"
        :key="server.url"
        class="server-item"
        @click="selectServer(server)"
      >
        <Server
          class="server-icon"
          :size="18"
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
  </div>
</template>

<style scoped>
.clasp-discovery {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-neutral-50);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-neutral-200);
}

.discovery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.discovery-title {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-neutral-600);
}

.scan-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: white;
  border: 1px solid var(--color-neutral-300);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--color-neutral-700);
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
  background: var(--color-error-bg);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-error);
}

.discovery-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-4);
  color: var(--color-neutral-500);
  font-size: var(--text-sm);
  text-align: center;
}

.discovery-empty svg {
  width: 24px;
  height: 24px;
  opacity: 0.5;
}

.discovery-hint {
  font-size: var(--text-xs);
  opacity: 0.7;
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

.server-icon {
  width: 18px;
  height: 18px;
  color: var(--color-primary-500);
}

.server-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.server-url {
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  color: var(--color-neutral-800);
}

.server-latency {
  font-size: var(--text-xs);
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
  font-size: var(--text-xs);
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
