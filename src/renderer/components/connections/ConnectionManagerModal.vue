<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { X, Plus, Radio, Plug, Trash2, Power, PowerOff, CheckCircle2, AlertCircle, Loader, Wifi, Download, ExternalLink, Info, RefreshCw } from 'lucide-vue-next'
import { useConnectionsStore } from '@/stores/connections'
import type { BaseConnectionConfig, ConnectionTypeDefinition } from '@/services/connections/types'

// Form state type - allows base properties plus any protocol-specific ones
type ConnectionFormState = Partial<BaseConnectionConfig> & Record<string, unknown>
import { nanoid } from 'nanoid'
import { isElectron } from '@/utils/platform'

const connectionsStore = useConnectionsStore()

// Local form state
const formData = ref<ConnectionFormState>({})
const formErrors = ref<Record<string, string>>({})

// Discovery state
const isScanning = ref(false)
const discoveredServers = ref<Array<{
  id: string
  name: string
  host: string
  port: number
  address: string
  status: 'available' | 'connecting'
}>>([])

// Watch for selection changes to populate form
watch(
  () => connectionsStore.selectedConnection,
  (connection) => {
    if (connection) {
      formData.value = { ...connection }
    } else {
      formData.value = {}
    }
    formErrors.value = {}
  },
  { immediate: true }
)

// Watch for protocol selection when creating
watch(
  () => connectionsStore.selectedProtocol,
  (protocol) => {
    if (protocol && connectionsStore.isCreating) {
      const typeDef = connectionsStore.getType(protocol)
      if (typeDef) {
        formData.value = {
          id: nanoid(8),
          name: `New ${typeDef.name}`,
          protocol,
          autoConnect: true,
          autoReconnect: true,
          reconnectDelay: 5000,
          maxReconnectAttempts: 0,
          ...typeDef.defaultConfig,
        }
      }
    }
  },
  { immediate: true }
)

// Get the type definition for the current form
const currentTypeDef = computed((): ConnectionTypeDefinition | undefined => {
  const protocol = formData.value.protocol
  if (!protocol) return undefined
  return connectionsStore.getType(protocol)
})

// Check if current protocol is CLASP
const isClaspProtocol = computed(() => {
  return connectionsStore.selectedProtocol === 'clasp' || formData.value.protocol === 'clasp'
})

// Scan for CLASP servers on the network
async function scanForServers() {
  isScanning.value = true
  discoveredServers.value = []

  // Common CLASP ports
  const portsToScan = [7330, 8080, 9000]
  const hosts = ['localhost', '127.0.0.1']

  // Add local network IPs (for Electron)
  if (isElectron()) {
    // In Electron, we could call IPC to get more hosts
    // For now, scan common local addresses
    for (let i = 1; i <= 10; i++) {
      hosts.push(`192.168.1.${i}`)
      hosts.push(`192.168.0.${i}`)
      hosts.push(`10.0.0.${i}`)
    }
  }

  const probePromises: Promise<void>[] = []

  for (const host of hosts) {
    for (const port of portsToScan) {
      probePromises.push(probeServer(host, port))
    }
  }

  await Promise.allSettled(probePromises)
  isScanning.value = false
}

// Probe a single server
async function probeServer(host: string, port: number): Promise<void> {
  return new Promise((resolve) => {
    const wsUrl = `ws://${host}:${port}`
    let ws: WebSocket | null = null

    const timeout = setTimeout(() => {
      if (ws) {
        ws.close()
      }
      resolve()
    }, 2000)

    try {
      ws = new WebSocket(wsUrl, 'clasp.v2')

      ws.onopen = () => {
        clearTimeout(timeout)
        ws?.close()

        // Check if we already have this server
        const key = `${host}:${port}`
        if (!discoveredServers.value.find(s => `${s.host}:${s.port}` === key)) {
          discoveredServers.value.push({
            id: `discovered-${host}-${port}`,
            name: `CLASP Server (${host}:${port})`,
            host,
            port,
            address: wsUrl,
            status: 'available',
          })
        }
        resolve()
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        resolve()
      }

      ws.onclose = () => {
        clearTimeout(timeout)
        resolve()
      }
    } catch {
      clearTimeout(timeout)
      resolve()
    }
  })
}

// Use a discovered server
function useDiscoveredServer(server: typeof discoveredServers.value[0]) {
  formData.value = {
    id: nanoid(8),
    name: server.name,
    protocol: 'clasp',
    autoConnect: true,
    autoReconnect: true,
    reconnectDelay: 5000,
    maxReconnectAttempts: 0,
    url: server.address,
  }
  connectionsStore.selectedProtocol = 'clasp'
}

// Download links for CLASP Bridge
const bridgeDownloads = [
  {
    platform: 'macOS',
    desc: 'Apple Silicon & Intel',
    links: [
      { label: 'Apple Silicon', url: 'https://github.com/lumencanvas/clasp/releases/latest/download/CLASP.Bridge-arm64.dmg' },
      { label: 'Intel', url: 'https://github.com/lumencanvas/clasp/releases/latest/download/CLASP.Bridge-x64.dmg' }
    ]
  },
  {
    platform: 'Windows',
    desc: 'Windows 10/11',
    links: [
      { label: 'Installer', url: 'https://github.com/lumencanvas/clasp/releases/latest/download/CLASP.Bridge-Setup.exe' }
    ]
  },
  {
    platform: 'Linux',
    desc: 'AppImage & Deb',
    links: [
      { label: 'AppImage', url: 'https://github.com/lumencanvas/clasp/releases/latest/download/CLASP.Bridge.AppImage' }
    ]
  }
]

// Validate form
function validateForm(): boolean {
  formErrors.value = {}

  if (!formData.value.name?.trim()) {
    formErrors.value.name = 'Name is required'
  }

  // Validate required controls
  const typeDef = currentTypeDef.value
  if (typeDef) {
    for (const control of typeDef.configControls) {
      if (control.props?.required) {
        const value = (formData.value as Record<string, unknown>)[control.id]
        if (value === undefined || value === null || value === '') {
          formErrors.value[control.id] = `${control.label} is required`
        }
      }
    }
  }

  return Object.keys(formErrors.value).length === 0
}

// Save connection
function saveConnection() {
  if (!validateForm()) return

  const config = formData.value as BaseConnectionConfig

  if (connectionsStore.isCreating) {
    connectionsStore.addConnection(config)
  } else if (connectionsStore.selectedConnectionId) {
    connectionsStore.updateConnection(connectionsStore.selectedConnectionId, config)
  }

  // Clear creating state
  if (connectionsStore.isCreating) {
    connectionsStore.selectConnection(config.id)
  }
}

// Delete connection
function deleteConnection() {
  if (connectionsStore.selectedConnectionId) {
    const id = connectionsStore.selectedConnectionId
    connectionsStore.removeConnection(id)
  }
}

// Get status color
function getStatusColor(status: string | undefined): string {
  switch (status) {
    case 'connected': return '#22C55E'
    case 'connecting': return '#F59E0B'
    case 'reconnecting': return '#F59E0B'
    case 'error': return '#EF4444'
    default: return '#6B7280'
  }
}

// Auto-scan when CLASP is selected
watch(isClaspProtocol, (isClasp) => {
  if (isClasp && connectionsStore.isCreating && discoveredServers.value.length === 0) {
    scanForServers()
  }
})

// Cleanup on unmount
onUnmounted(() => {
  discoveredServers.value = []
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="connectionsStore.modalOpen"
        class="connection-modal-overlay"
        @click.self="connectionsStore.closeModal"
      >
        <div class="connection-modal">
          <!-- Header -->
          <div class="modal-header">
            <div class="header-left">
              <Plug
                :size="20"
                class="header-icon"
              />
              <h2 class="modal-title">
                Connections
              </h2>
              <span class="connection-count">{{ connectionsStore.connections.length }} configured</span>
            </div>
            <button
              class="close-btn"
              @click="connectionsStore.closeModal"
            >
              <X :size="20" />
            </button>
          </div>

          <div class="modal-body">
            <!-- Sidebar: Connection List -->
            <div class="connection-sidebar">
              <div class="sidebar-header">
                <span class="sidebar-title">Connections</span>
                <div class="add-connection">
                  <button
                    class="btn btn-sm btn-primary add-btn"
                    @click="connectionsStore.startCreate()"
                  >
                    <Plus :size="14" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              <!-- Connection List -->
              <div class="connection-list">
                <template v-if="connectionsStore.connections.length === 0">
                  <div class="empty-state">
                    <Plug
                      :size="32"
                      class="empty-icon"
                    />
                    <p>No connections configured</p>
                    <button
                      class="btn btn-sm btn-primary"
                      @click="connectionsStore.startCreate()"
                    >
                      Add Connection
                    </button>
                  </div>
                </template>

                <template v-else>
                  <div
                    v-for="conn in connectionsStore.connections"
                    :key="conn.id"
                    class="connection-item"
                    :class="{ active: connectionsStore.selectedConnectionId === conn.id }"
                    @click="connectionsStore.selectConnection(conn.id)"
                  >
                    <div
                      class="connection-status-dot"
                      :style="{ background: getStatusColor(connectionsStore.getStatus(conn.id)?.status) }"
                    />
                    <div class="connection-info">
                      <span class="connection-name">{{ conn.name }}</span>
                      <span class="connection-protocol">{{ conn.protocol }}</span>
                    </div>
                    <button
                      class="connection-toggle"
                      :title="connectionsStore.getStatus(conn.id)?.status === 'connected' ? 'Disconnect' : 'Connect'"
                      @click.stop="connectionsStore.toggleConnection(conn.id)"
                    >
                      <Power
                        v-if="connectionsStore.getStatus(conn.id)?.status === 'connected'"
                        :size="14"
                      />
                      <PowerOff
                        v-else
                        :size="14"
                      />
                    </button>
                  </div>
                </template>
              </div>
            </div>

            <!-- Main Content: Editor -->
            <div class="connection-editor">
              <!-- No selection state -->
              <div
                v-if="!connectionsStore.selectedConnection && !connectionsStore.isCreating"
                class="editor-placeholder"
              >
                <Plug
                  :size="48"
                  class="placeholder-icon"
                />
                <p>Select a connection to edit or create a new one</p>
              </div>

              <!-- Protocol selector when creating -->
              <div
                v-else-if="connectionsStore.isCreating && !connectionsStore.selectedProtocol"
                class="protocol-selector"
              >
                <h3 class="selector-title">
                  Choose Connection Type
                </h3>

                <!-- CLASP Featured Card -->
                <div class="featured-protocol">
                  <div class="featured-header">
                    <div class="featured-icon clasp-gradient">
                      <Wifi :size="28" />
                    </div>
                    <div class="featured-info">
                      <h4>CLASP Protocol</h4>
                      <p>Recommended for Latch flow designer</p>
                    </div>
                    <button
                      class="btn btn-primary btn-sm"
                      @click="connectionsStore.selectedProtocol = 'clasp'"
                    >
                      Use CLASP
                    </button>
                  </div>

                  <div class="clasp-explainer">
                    <Info
                      :size="14"
                      class="explainer-icon"
                    />
                    <div class="explainer-content">
                      <p><strong>CLASP</strong> (Creative Low-latency Application Streaming Protocol) unifies all your creative software and hardware into a single, efficient data stream.</p>
                      <ul>
                        <li><strong>Universal Adapter:</strong> The CLASP Router translates OSC, MIDI, DMX, Art-Net, MQTT, and more into a unified format</li>
                        <li><strong>Zero Config:</strong> Servers announce themselves via mDNS for automatic discovery</li>
                        <li><strong>Pattern Matching:</strong> Subscribe to data using glob patterns like <code>/lights/**</code></li>
                      </ul>
                    </div>
                  </div>

                  <!-- Bridge Download Section -->
                  <div class="bridge-section">
                    <div class="bridge-header">
                      <Download :size="16" />
                      <span>CLASP Bridge Desktop App</span>
                    </div>
                    <p class="bridge-desc">
                      To bridge OSC, MIDI, DMX, and other protocols to CLASP, download the Bridge app:
                    </p>
                    <div class="download-buttons">
                      <a
                        v-for="dl in bridgeDownloads"
                        :key="dl.platform"
                        :href="dl.links[0].url"
                        target="_blank"
                        class="download-btn"
                      >
                        <span class="dl-platform">{{ dl.platform }}</span>
                      </a>
                    </div>
                    <a
                      href="https://clasp.to/#downloads"
                      target="_blank"
                      class="all-downloads-link"
                    >
                      <ExternalLink :size="12" />
                      All download options
                    </a>
                  </div>
                </div>

                <div class="protocol-divider">
                  <span>Other Protocols</span>
                </div>

                <div class="protocol-grid">
                  <button
                    v-for="type in connectionsStore.availableTypes.filter(t => t.id !== 'clasp')"
                    :key="type.id"
                    class="protocol-card"
                    @click="connectionsStore.selectedProtocol = type.id"
                  >
                    <div
                      class="protocol-icon"
                      :style="{ background: type.color }"
                    >
                      <Radio
                        v-if="type.icon === 'radio'"
                        :size="24"
                      />
                      <Plug
                        v-else
                        :size="24"
                      />
                    </div>
                    <span class="protocol-name">{{ type.name }}</span>
                    <span class="protocol-desc">{{ type.description }}</span>
                  </button>
                </div>
              </div>

              <!-- Connection form -->
              <div
                v-else
                class="editor-form"
              >
                <div class="form-header">
                  <h3 class="form-title">
                    {{ connectionsStore.isCreating ? 'New Connection' : 'Edit Connection' }}
                  </h3>
                  <div
                    v-if="!connectionsStore.isCreating && connectionsStore.selectedConnectionId"
                    class="form-status"
                  >
                    <CheckCircle2
                      v-if="connectionsStore.getStatus(connectionsStore.selectedConnectionId)?.status === 'connected'"
                      :size="16"
                      class="status-connected"
                    />
                    <Loader
                      v-else-if="connectionsStore.getStatus(connectionsStore.selectedConnectionId)?.status === 'connecting'"
                      :size="16"
                      class="status-connecting"
                    />
                    <AlertCircle
                      v-else-if="connectionsStore.getStatus(connectionsStore.selectedConnectionId)?.status === 'error'"
                      :size="16"
                      class="status-error"
                    />
                    <span>{{ connectionsStore.getStatus(connectionsStore.selectedConnectionId)?.status || 'disconnected' }}</span>
                  </div>
                </div>

                <!-- CLASP Discovery Section -->
                <div
                  v-if="isClaspProtocol && connectionsStore.isCreating"
                  class="discovery-section"
                >
                  <div class="discovery-header">
                    <Wifi :size="16" />
                    <span>Discover CLASP Servers</span>
                    <button
                      class="scan-btn"
                      :class="{ scanning: isScanning }"
                      :disabled="isScanning"
                      @click="scanForServers"
                    >
                      <RefreshCw
                        :size="14"
                        :class="{ spinning: isScanning }"
                      />
                      {{ isScanning ? 'Scanning...' : 'Scan' }}
                    </button>
                  </div>

                  <div
                    v-if="discoveredServers.length > 0"
                    class="discovered-list"
                  >
                    <div
                      v-for="server in discoveredServers"
                      :key="server.id"
                      class="discovered-server"
                      @click="useDiscoveredServer(server)"
                    >
                      <div class="server-status-dot available" />
                      <div class="server-info">
                        <span class="server-name">{{ server.name }}</span>
                        <span class="server-address">{{ server.address }}</span>
                      </div>
                      <span class="use-label">Use</span>
                    </div>
                  </div>
                  <div
                    v-else-if="!isScanning"
                    class="no-servers"
                  >
                    <p>No CLASP servers found on local network.</p>
                    <p class="hint">
                      Make sure CLASP Bridge is running, or enter a server URL manually below.
                    </p>
                  </div>
                </div>

                <!-- Base fields -->
                <div class="form-section">
                  <div class="form-group">
                    <label class="form-label">Name</label>
                    <input
                      v-model="formData.name"
                      type="text"
                      class="form-input"
                      :class="{ error: formErrors.name }"
                      placeholder="Connection name"
                    >
                    <span
                      v-if="formErrors.name"
                      class="form-error"
                    >{{ formErrors.name }}</span>
                  </div>
                </div>

                <!-- Protocol-specific fields -->
                <div
                  v-if="currentTypeDef"
                  class="form-section"
                >
                  <div class="section-title">
                    {{ currentTypeDef.name }} Settings
                  </div>

                  <div
                    v-for="control in currentTypeDef.configControls"
                    :key="control.id"
                    class="form-group"
                  >
                    <label class="form-label">{{ control.label }}</label>

                    <!-- Text input -->
                    <input
                      v-if="control.type === 'text'"
                      v-model="(formData as Record<string, unknown>)[control.id]"
                      type="text"
                      class="form-input"
                      :class="{ error: formErrors[control.id] }"
                      :placeholder="control.description"
                    >

                    <!-- Number input -->
                    <input
                      v-else-if="control.type === 'number'"
                      v-model.number="(formData as Record<string, unknown>)[control.id]"
                      type="number"
                      class="form-input"
                      :class="{ error: formErrors[control.id] }"
                      :min="(control.props as Record<string, unknown>)?.min as number"
                      :max="(control.props as Record<string, unknown>)?.max as number"
                      :step="(control.props as Record<string, unknown>)?.step as number"
                    >

                    <!-- Checkbox -->
                    <label
                      v-else-if="control.type === 'checkbox'"
                      class="checkbox-label"
                    >
                      <input
                        v-model="(formData as Record<string, unknown>)[control.id]"
                        type="checkbox"
                      >
                      <span class="checkbox-text">{{ control.description }}</span>
                    </label>

                    <span
                      v-if="formErrors[control.id]"
                      class="form-error"
                    >{{ formErrors[control.id] }}</span>
                  </div>
                </div>

                <!-- Connection options -->
                <div class="form-section">
                  <div class="section-title">
                    Connection Options
                  </div>

                  <label class="checkbox-label">
                    <input
                      v-model="formData.autoConnect"
                      type="checkbox"
                    >
                    <span class="checkbox-text">Auto-connect on flow start</span>
                  </label>

                  <label class="checkbox-label">
                    <input
                      v-model="formData.autoReconnect"
                      type="checkbox"
                    >
                    <span class="checkbox-text">Auto-reconnect on disconnect</span>
                  </label>

                  <div
                    v-if="formData.autoReconnect"
                    class="form-group"
                  >
                    <label class="form-label">Reconnect Delay (ms)</label>
                    <input
                      v-model.number="formData.reconnectDelay"
                      type="number"
                      class="form-input"
                      min="1000"
                      max="60000"
                      step="1000"
                    >
                  </div>
                </div>

                <!-- Error display -->
                <div
                  v-if="connectionsStore.selectedConnectionId && connectionsStore.getStatus(connectionsStore.selectedConnectionId)?.error"
                  class="error-display"
                >
                  <AlertCircle :size="16" />
                  <span>{{ connectionsStore.getStatus(connectionsStore.selectedConnectionId)?.error }}</span>
                </div>

                <!-- Form actions -->
                <div class="form-actions">
                  <button
                    v-if="!connectionsStore.isCreating"
                    class="btn btn-danger btn-sm"
                    @click="deleteConnection"
                  >
                    <Trash2 :size="14" />
                    <span>Delete</span>
                  </button>
                  <div class="actions-right">
                    <button
                      class="btn btn-secondary btn-sm"
                      @click="connectionsStore.closeModal"
                    >
                      Cancel
                    </button>
                    <button
                      class="btn btn-primary btn-sm"
                      @click="saveConnection"
                    >
                      {{ connectionsStore.isCreating ? 'Create' : 'Save' }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.connection-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-6);
}

.connection-modal {
  width: 100%;
  max-width: 960px;
  max-height: 90vh;
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-300);
  box-shadow: 8px 8px 0 0 var(--color-neutral-400);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  border-bottom: 2px solid #4f46e5;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.header-icon {
  color: white;
}

.modal-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: white;
}

.connection-count {
  font-size: var(--font-size-xs);
  color: rgba(255, 255, 255, 0.8);
  padding: 2px var(--space-2);
  background: rgba(255, 255, 255, 0.2);
  border-radius: 2px;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.close-btn:hover {
  color: white;
}

.modal-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Sidebar */
.connection-sidebar {
  width: 260px;
  border-right: 1px solid var(--color-neutral-200);
  display: flex;
  flex-direction: column;
  background: var(--color-neutral-50);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-neutral-200);
}

.sidebar-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-700);
}

.add-btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  font-size: var(--font-size-xs);
  background: #6366f1;
  color: white;
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.add-btn:hover {
  background: #4f46e5;
}

.connection-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  text-align: center;
  color: var(--color-neutral-400);
}

.empty-icon {
  margin-bottom: var(--space-3);
}

.empty-state p {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-sm);
}

.connection-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-1);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.connection-item:hover {
  border-color: var(--color-neutral-300);
}

.connection-item.active {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.05);
}

.connection-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.connection-info {
  flex: 1;
  min-width: 0;
}

.connection-name {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-800);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.connection-protocol {
  display: block;
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
}

.connection-toggle {
  padding: var(--space-1);
  background: none;
  border: none;
  color: var(--color-neutral-400);
  cursor: pointer;
  border-radius: var(--radius-xs);
}

.connection-toggle:hover {
  background: var(--color-neutral-100);
  color: var(--color-neutral-600);
}

/* Editor */
.connection-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-neutral-400);
  text-align: center;
  padding: var(--space-6);
}

.placeholder-icon {
  margin-bottom: var(--space-3);
}

.editor-placeholder p {
  margin: 0;
  font-size: var(--font-size-sm);
}

/* Protocol Selector */
.protocol-selector {
  padding: var(--space-4);
  overflow-y: auto;
}

.selector-title {
  margin: 0 0 var(--space-4);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-800);
}

/* Featured CLASP Card */
.featured-protocol {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%);
  border: 2px solid rgba(99, 102, 241, 0.3);
  border-radius: var(--radius-sm);
  padding: var(--space-4);
  margin-bottom: var(--space-4);
}

.featured-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.featured-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-sm);
  color: white;
}

.clasp-gradient {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
}

.featured-info {
  flex: 1;
}

.featured-info h4 {
  margin: 0 0 var(--space-1);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-800);
}

.featured-info p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-600);
}

/* CLASP Explainer */
.clasp-explainer {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  margin-bottom: var(--space-3);
}

.explainer-icon {
  flex-shrink: 0;
  color: #6366f1;
  margin-top: 2px;
}

.explainer-content {
  flex: 1;
}

.explainer-content p {
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
  line-height: 1.5;
}

.explainer-content ul {
  margin: 0;
  padding: 0 0 0 var(--space-4);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
  line-height: 1.6;
}

.explainer-content li {
  margin-bottom: var(--space-1);
}

.explainer-content code {
  background: var(--color-neutral-100);
  padding: 1px 4px;
  border-radius: 2px;
  font-family: monospace;
  font-size: 0.9em;
}

/* Bridge Download Section */
.bridge-section {
  padding: var(--space-3);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
}

.bridge-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-800);
  margin-bottom: var(--space-2);
}

.bridge-desc {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
}

.download-buttons {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.download-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2);
  background: #6366f1;
  color: white;
  text-decoration: none;
  border-radius: var(--radius-xs);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  transition: background var(--transition-fast);
}

.download-btn:hover {
  background: #4f46e5;
}

.all-downloads-link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  font-size: var(--font-size-xs);
  color: #6366f1;
  text-decoration: none;
}

.all-downloads-link:hover {
  text-decoration: underline;
}

/* Protocol divider */
.protocol-divider {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-4) 0;
  color: var(--color-neutral-400);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
}

.protocol-divider::before,
.protocol-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-neutral-200);
}

.protocol-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-3);
}

.protocol-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-4);
  background: var(--color-neutral-50);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: center;
}

.protocol-card:hover {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.05);
}

.protocol-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  color: white;
  margin-bottom: var(--space-2);
}

.protocol-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-800);
  margin-bottom: var(--space-1);
}

.protocol-desc {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
}

/* Discovery Section */
.discovery-section {
  margin-bottom: var(--space-4);
  padding: var(--space-3);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: var(--radius-sm);
}

.discovery-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-700);
}

.scan-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: #6366f1;
  color: white;
  border: none;
  border-radius: var(--radius-xs);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.scan-btn:hover:not(:disabled) {
  background: #4f46e5;
}

.scan-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.scan-btn .spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.discovered-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.discovered-server {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.discovered-server:hover {
  border-color: #6366f1;
  background: rgba(99, 102, 241, 0.05);
}

.server-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.server-status-dot.available {
  background: #22C55E;
}

.server-info {
  flex: 1;
}

.server-name {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-800);
}

.server-address {
  display: block;
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  font-family: monospace;
}

.use-label {
  font-size: var(--font-size-xs);
  color: #6366f1;
  font-weight: var(--font-weight-medium);
}

.no-servers {
  text-align: center;
  padding: var(--space-3);
}

.no-servers p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-600);
}

.no-servers .hint {
  margin-top: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
}

/* Editor Form */
.editor-form {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

.form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.form-title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-800);
}

.form-status {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-500);
  text-transform: capitalize;
}

.status-connected {
  color: #22C55E;
}

.status-connecting {
  color: #F59E0B;
  animation: spin 1s linear infinite;
}

.status-error {
  color: #EF4444;
}

.form-section {
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-neutral-100);
}

.form-section:last-of-type {
  border-bottom: none;
}

.section-title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-neutral-500);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  margin-bottom: var(--space-3);
}

.form-group {
  margin-bottom: var(--space-3);
}

.form-label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-neutral-700);
  margin-bottom: var(--space-1);
}

.form-input {
  width: 100%;
  padding: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-800);
  background: var(--color-neutral-0);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-xs);
}

.form-input:focus {
  outline: none;
  border-color: #6366f1;
}

.form-input.error {
  border-color: #EF4444;
}

.form-error {
  display: block;
  margin-top: var(--space-1);
  font-size: var(--font-size-xs);
  color: #EF4444;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  margin-bottom: var(--space-2);
}

.checkbox-label input {
  width: 16px;
  height: 16px;
  accent-color: #6366f1;
}

.checkbox-text {
  font-size: var(--font-size-sm);
  color: var(--color-neutral-700);
}

.error-display {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-xs);
  color: #EF4444;
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-4);
}

.form-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-neutral-200);
}

.actions-right {
  display: flex;
  gap: var(--space-2);
}

.form-actions .btn {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
}

.btn-primary {
  background: #6366f1;
  color: white;
}

.btn-primary:hover {
  background: #4f46e5;
}

.btn-secondary {
  background: var(--color-neutral-200);
  color: var(--color-neutral-700);
}

.btn-secondary:hover {
  background: var(--color-neutral-300);
}

.btn-danger {
  background: #EF4444;
  color: white;
}

.btn-danger:hover {
  background: #DC2626;
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .connection-modal,
.modal-leave-to .connection-modal {
  transform: scale(0.95);
}
</style>
