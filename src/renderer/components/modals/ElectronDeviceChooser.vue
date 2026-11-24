<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Bluetooth, Usb, Loader2 } from 'lucide-vue-next'
import { useDialogA11y } from '@/composables/useDialogA11y'

/**
 * Desktop (Electron) device chooser for Web Bluetooth `requestDevice()` and Web
 * Serial `requestPort()`. Electron has no native picker, so the main process
 * (src/main/deviceChooser.ts) streams the live device list here and waits for the
 * user's pick. Renders nothing in the web build (no `electronAPI.deviceChooser`).
 */
interface ChooserDevice {
  id: string
  name: string
  detail?: string
}

const requestId = ref<number | null>(null)
const kind = ref<'bluetooth' | 'serial'>('bluetooth')
const devices = ref<ChooserDevice[]>([])

const isOpen = computed(() => requestId.value !== null)
const title = computed(() => (kind.value === 'bluetooth' ? 'Pair Bluetooth device' : 'Select serial port'))

const dialogRef = ref<HTMLElement | null>(null)
const { onKeydown } = useDialogA11y({
  isOpen: () => isOpen.value,
  container: dialogRef,
  onClose: () => respond(null),
})

function respond(deviceId: string | null) {
  const id = requestId.value
  const api = window.electronAPI?.deviceChooser
  requestId.value = null
  devices.value = []
  if (id !== null && api) void api.respond(id, deviceId)
}

let unsubscribe: (() => void) | null = null

onMounted(() => {
  const api = window.electronAPI?.deviceChooser
  if (!api) return
  unsubscribe = api.onUpdate((update) => {
    if (update.closed) {
      if (requestId.value === update.requestId) {
        requestId.value = null
        devices.value = []
      }
      return
    }
    requestId.value = update.requestId
    kind.value = update.kind
    devices.value = update.devices
  })
})

onUnmounted(() => {
  if (requestId.value !== null) respond(null)
  unsubscribe?.()
  unsubscribe = null
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="modal-overlay"
      @keydown="onKeydown"
    >
      <div
        ref="dialogRef"
        class="modal-container"
        role="dialog"
        aria-modal="true"
        aria-labelledby="device-chooser-title"
      >
        <div class="modal-header">
          <Bluetooth
            v-if="kind === 'bluetooth'"
            :size="18"
          />
          <Usb
            v-else
            :size="18"
          />
          <h2
            id="device-chooser-title"
            class="modal-title"
          >
            {{ title }}
          </h2>
        </div>

        <div
          class="modal-body"
          aria-live="polite"
        >
          <p
            v-if="devices.length === 0"
            class="scanning"
          >
            <Loader2
              :size="14"
              class="spin"
            />
            {{ kind === 'bluetooth' ? 'Scanning for nearby devices…' : 'Looking for serial ports…' }}
          </p>
          <ul
            v-else
            class="device-list"
          >
            <li
              v-for="d in devices"
              :key="d.id"
            >
              <button
                class="device-item"
                @click="respond(d.id)"
              >
                <span class="device-name">{{ d.name }}</span>
                <span
                  v-if="d.detail && d.detail !== d.name"
                  class="device-detail"
                >{{ d.detail }}</span>
              </button>
            </li>
          </ul>
        </div>

        <div class="modal-actions">
          <button
            class="btn btn-ghost"
            data-autofocus
            @click="respond(null)"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgba(0, 0, 0, 0.5);
  z-index: 10001;
}

.modal-container {
  width: 100%;
  max-width: 440px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-800);
  box-shadow: 6px 6px 0 0 var(--color-neutral-800);
  font-family: var(--font-mono);
  color: var(--color-neutral-800);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-bottom: 2px solid var(--color-neutral-800);
  background: var(--color-neutral-50);
}

.modal-title {
  margin: 0;
  font-size: 14px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.scanning {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  color: var(--color-neutral-600);
}

.spin { animation: spin 1s linear infinite; }

@keyframes spin {
  to { transform: rotate(360deg); }
}

.device-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.device-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-align: left;
  color: var(--color-neutral-800);
  background: var(--color-neutral-50);
  border: 1px solid var(--color-neutral-300);
  cursor: pointer;
}

.device-item:hover {
  border-color: var(--color-protocol-ble);
  background: var(--color-neutral-0);
}

.device-item:focus-visible,
.btn:focus-visible {
  outline: 2px solid var(--color-protocol-ble);
  outline-offset: 2px;
}

.device-name { font-weight: var(--font-weight-bold); }

.device-detail {
  color: var(--color-neutral-600);
  overflow-wrap: anywhere;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-top: 2px solid var(--color-neutral-800);
}

.btn {
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  cursor: pointer;
  border: 2px solid var(--color-neutral-800);
}

.btn-ghost {
  background: none;
  border-color: transparent;
  color: var(--color-neutral-600);
}
</style>
