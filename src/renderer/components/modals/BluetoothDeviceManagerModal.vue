<script setup lang="ts">
import { ref, computed, watch, nextTick, type Component } from 'vue'
import {
  X, Bluetooth, Search, ChevronLeft, CheckCircle2, AlertCircle, Loader2,
  Brain, Printer, HeartPulse, Battery, Info, Thermometer, Bike, Footprints,
} from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'
import { useFlowsStore } from '@/stores/flows'
import { useNodesStore } from '@/stores/nodes'
import { useDialogA11y } from '@/composables/useDialogA11y'
import { deviceProfiles } from '@/services/ble/deviceProfileRegistry'
import type { BleDeviceProfile } from '@/services/ble/defineDeviceProfile'
import { BleAdapter } from '@/services/connections/adapters/BleAdapter'
import {
  scanAllOptionalServices,
  recognizeByName,
  buildDeviceNodeChain,
  type NodeChainSpec,
} from '@/services/ble/bluetoothScan'

const uiStore = useUIStore()
const flowsStore = useFlowsStore()
const nodesStore = useNodesStore()

const dialogRef = ref<HTMLElement | null>(null)
const { onKeydown } = useDialogA11y({
  isOpen: () => uiStore.bluetoothDeviceManagerOpen,
  container: dialogRef,
  onClose: close,
})

type Phase = 'choose' | 'busy' | 'result'
const phase = ref<Phase>('choose')
const busyLabel = ref('')
const errorMsg = ref('')
const granted = ref<{ id: string; name: string } | null>(null)
const recognized = ref<BleDeviceProfile | null>(null)

const supported = computed(() => typeof navigator !== 'undefined' && 'bluetooth' in navigator)
const profiles = computed(() => deviceProfiles)

// Lucide components for the icon ids the shipped profiles use; anything else
// falls back to the generic Bluetooth glyph so a drop-in profile never breaks.
const PROFILE_ICONS: Record<string, Component> = {
  brain: Brain,
  printer: Printer,
  'heart-pulse': HeartPulse,
  battery: Battery,
  info: Info,
  thermometer: Thermometer,
  bike: Bike,
  footprints: Footprints,
  bluetooth: Bluetooth,
}
function iconFor(profile: BleDeviceProfile): Component {
  return PROFILE_ICONS[profile.icon] ?? Bluetooth
}

const hasNode = (type: string) => nodesStore.getDefinition(type) != null

// The primary suggestion for the recognized profile, and whether its dedicated
// vendor node is actually installed (else we drop the generic chain).
const suggestion = computed(() =>
  recognized.value
    ? (recognized.value.suggests.find((s) => s.primary) ?? recognized.value.suggests[0] ?? null)
    : null
)
const vendorInstalled = computed(() =>
  !!suggestion.value && !suggestion.value.nodeType.startsWith('ble-') && hasNode(suggestion.value.nodeType)
)
const primaryLabel = computed(() =>
  vendorInstalled.value ? `Add ${suggestion.value!.label} node` : 'Add BLE nodes'
)

watch(() => uiStore.bluetoothDeviceManagerOpen, (open) => {
  if (open) reset()
})

// useDialogA11y only moves focus in on open; the panel also swaps its whole body
// between phases (the focused card unmounts on `busy`). Re-land focus on each phase's
// primary target (or the container) so keyboard/AT users aren't dropped onto <body>.
watch(phase, () => {
  nextTick(() => {
    const el = dialogRef.value
    if (!el) return
    const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? el
    if (target === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    target.focus()
  })
})

function reset() {
  phase.value = 'choose'
  busyLabel.value = ''
  errorMsg.value = ''
  granted.value = null
  recognized.value = null
}

function close() {
  uiStore.closeBluetoothDeviceManager()
}

function backToChoose() {
  phase.value = 'choose'
  errorMsg.value = ''
  granted.value = null
  recognized.value = null
}

/** requestDevice must run inside this click handler's user gesture (Web Bluetooth). */
async function selectKnown(profile: BleDeviceProfile) {
  if (!supported.value) return
  errorMsg.value = ''
  phase.value = 'busy'
  busyLabel.value = `Waiting for ${profile.label}…`
  try {
    const device = await BleAdapter.scanDevices(profile.request)
    if (!device) { phase.value = 'choose'; return } // user cancelled the chooser
    granted.value = { id: device.id, name: device.name ?? '' }
    // We asked for exactly this profile's filters, so recognition is certain.
    recognized.value = profile
    phase.value = 'result'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Could not open the device chooser'
    phase.value = 'choose'
  }
}

async function scanAll() {
  if (!supported.value) return
  errorMsg.value = ''
  phase.value = 'busy'
  busyLabel.value = 'Waiting for a device…'
  try {
    const device = await BleAdapter.scanDevices({
      acceptAllDevices: true,
      optionalServices: scanAllOptionalServices(),
    })
    if (!device) { phase.value = 'choose'; return }
    granted.value = { id: device.id, name: device.name ?? '' }
    recognized.value = recognizeByName(device.name) // name is the always-available signal
    phase.value = 'result'
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Could not open the device chooser'
    phase.value = 'choose'
  }
}

function dropChain(spec: NodeChainSpec) {
  // Cascade successive drops so repeated "Add"s don't stack on the exact same spot.
  // (Flow-space coords; a small step keyed to the current node count is enough to
  // keep each drop visible and distinct without needing the live viewport transform.)
  const step = (flowsStore.activeFlow?.nodes.length ?? 0) % 6
  const base = { x: 320 + step * 32, y: 180 + step * 32 }
  const idMap = new Map<string, string>()
  spec.nodes.forEach((n, i) => {
    const node = flowsStore.addNode(n.nodeType, { x: base.x + i * 280, y: base.y + i * 48 }, n.data)
    if (node) idMap.set(n.key, node.id)
  })
  for (const e of spec.edges) {
    const s = idMap.get(e.from)
    const t = idMap.get(e.to)
    if (s && t) flowsStore.addEdge(s, e.fromPort, t, e.toPort)
  }
  const ids = Array.from(idMap.values())
  if (ids.length > 0) uiStore.selectNodes(ids)
  uiStore.notify(
    ids.length === 1 ? 'Added device node' : `Added ${ids.length} BLE nodes`,
    'success'
  )
}

/** Primary: the recognized/vendor node when available, else the pre-filled generic chain. */
function addSuggested() {
  if (!granted.value) return
  dropChain(buildDeviceNodeChain(recognized.value, granted.value.id, hasNode))
  close()
}

/** Escape hatch: always the generic BLE chain (recognized service still pre-filled). */
function addGeneric() {
  if (!granted.value) return
  dropChain(buildDeviceNodeChain(recognized.value, granted.value.id, () => false))
  close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="uiStore.bluetoothDeviceManagerOpen"
        class="modal-overlay"
        @click.self="close"
        @keydown="onKeydown"
      >
        <div
          ref="dialogRef"
          class="modal-container"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ble-manager-modal-title"
        >
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-title-group">
              <Bluetooth :size="18" />
              <h2
                id="ble-manager-modal-title"
                class="modal-title"
              >
                ADD BLUETOOTH DEVICE
              </h2>
            </div>
            <button
              class="close-btn"
              aria-label="Close Bluetooth device manager"
              @click="close"
            >
              <X :size="16" />
            </button>
          </div>

          <!-- Body -->
          <div class="modal-body">
            <!-- Unsupported browser -->
            <div
              v-if="!supported"
              class="notice notice-warn"
              role="alert"
            >
              <AlertCircle :size="18" />
              <div>
                <p class="notice-title">
                  Web Bluetooth isn't available in this browser
                </p>
                <p class="notice-text">
                  Use Chrome, Edge, or another Chromium browser on desktop or Android. Safari and
                  Firefox don't support Web Bluetooth.
                </p>
              </div>
            </div>

            <template v-else>
              <p
                v-if="errorMsg"
                class="notice notice-error"
                role="alert"
              >
                <AlertCircle :size="16" />
                <span>{{ errorMsg }}</span>
              </p>

              <!-- Choose a device type -->
              <div
                v-if="phase === 'choose'"
                class="choose"
              >
                <p class="intro">
                  Pick a device type to pair, or scan for any nearby device. A browser dialog will
                  ask you to choose the specific device.
                </p>

                <div
                  class="device-grid"
                  role="list"
                >
                  <button
                    v-for="profile in profiles"
                    :key="profile.id"
                    class="device-card"
                    role="listitem"
                    :data-autofocus="profile.id === profiles[0]?.id ? '' : undefined"
                    @click="selectKnown(profile)"
                  >
                    <div class="card-head">
                      <component
                        :is="iconFor(profile)"
                        :size="18"
                        class="card-icon"
                      />
                      <span class="card-label">{{ profile.label }}</span>
                    </div>
                    <p class="card-desc">
                      {{ profile.description }}
                    </p>
                    <span
                      v-if="profile.vendor"
                      class="card-vendor"
                    >{{ profile.vendor }}</span>
                  </button>
                </div>

                <button
                  class="scan-all"
                  @click="scanAll"
                >
                  <Search :size="16" />
                  <span>Scan all devices</span>
                </button>
              </div>

              <!-- Busy: native chooser is open -->
              <div
                v-else-if="phase === 'busy'"
                class="busy"
                aria-live="polite"
              >
                <Loader2
                  :size="28"
                  class="spin"
                />
                <p class="busy-label">
                  {{ busyLabel }}
                </p>
                <p class="busy-hint">
                  Choose your device in the browser dialog.
                </p>
              </div>

              <!-- Recognition result -->
              <div
                v-else
                class="result"
                aria-live="polite"
              >
                <div
                  v-if="recognized"
                  class="result-card recognized"
                >
                  <div class="result-badge">
                    <CheckCircle2 :size="18" />
                    <span>Recognized</span>
                  </div>
                  <component
                    :is="iconFor(recognized)"
                    :size="28"
                    class="result-icon"
                  />
                  <p class="result-name">
                    {{ recognized.label }}
                  </p>
                  <p class="result-sub">
                    {{ granted?.name || 'Unnamed device' }}
                  </p>
                  <p class="result-desc">
                    {{ recognized.description }}
                  </p>
                  <p
                    v-if="!vendorInstalled && suggestion"
                    class="result-note"
                  >
                    A dedicated node ships soon — for now, dropping a bound scanner + device node
                    that connects and lists this device's services.
                  </p>
                </div>

                <div
                  v-else
                  class="result-card unknown"
                >
                  <div class="result-badge muted">
                    <Bluetooth :size="18" />
                    <span>Unknown device</span>
                  </div>
                  <p class="result-name">
                    {{ granted?.name || 'Unnamed device' }}
                  </p>
                  <p class="result-desc">
                    Not a device we recognize — dropping a bound scanner + device node; add a
                    characteristic node for the services it lists.
                  </p>
                </div>

                <div class="result-actions">
                  <button
                    class="btn-primary"
                    data-autofocus
                    @click="addSuggested"
                  >
                    {{ recognized ? primaryLabel : 'Add generic BLE nodes' }}
                  </button>
                  <button
                    v-if="recognized && vendorInstalled"
                    class="btn-secondary"
                    @click="addGeneric"
                  >
                    Use generic BLE nodes
                  </button>
                  <button
                    class="btn-ghost"
                    @click="backToChoose"
                  >
                    <ChevronLeft :size="14" />
                    <span>Back</span>
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
}

.modal-container {
  width: 90vw;
  max-width: 640px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-800);
  box-shadow: 6px 6px 0 0 var(--color-neutral-800);
  font-family: var(--font-mono);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border-bottom: 2px solid var(--color-neutral-800);
  background: var(--color-neutral-50);
  color: var(--color-neutral-800);
}

.modal-title-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.modal-title {
  font-size: 14px;
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
  margin: 0;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: 1px solid var(--color-neutral-300);
  cursor: pointer;
  color: var(--color-neutral-600);
}
.close-btn:hover {
  background: var(--color-neutral-200);
  color: var(--color-neutral-800);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  color: var(--color-neutral-800);
}

/* Notices */
.notice {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  padding: var(--space-3);
  border: 1px solid var(--color-neutral-300);
  margin-bottom: var(--space-4);
}
.notice-warn {
  border-color: var(--color-warning);
  color: var(--color-neutral-800);
}
.notice-error {
  border-color: var(--color-error);
  color: var(--color-error);
  align-items: center;
}
.notice-title {
  margin: 0 0 var(--space-1) 0;
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-sm);
}
.notice-text {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
}

/* Choose */
.intro {
  margin: 0 0 var(--space-4) 0;
  font-size: var(--font-size-sm);
  color: var(--color-neutral-600);
}

.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--space-3);
}

.device-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-neutral-0);
  border: 2px solid var(--color-neutral-200);
  cursor: pointer;
  text-align: left;
  font-family: var(--font-mono);
  color: var(--color-neutral-800);
  transition: border-color 0.1s, box-shadow 0.1s;
}
.device-card:hover {
  border-color: var(--color-neutral-400);
  box-shadow: 3px 3px 0 0 var(--color-neutral-200);
}
.device-card:focus-visible {
  outline: 2px solid var(--color-protocol-ble);
  outline-offset: 2px;
}
.card-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.card-icon {
  color: var(--color-protocol-ble);
  flex-shrink: 0;
}
.card-label {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-sm);
}
.card-desc {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
  line-height: 1.4;
}
.card-vendor {
  font-size: var(--font-size-xs);
  color: var(--color-neutral-400);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
}

.scan-all {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  margin-top: var(--space-4);
  padding: var(--space-3);
  background: var(--color-neutral-50);
  border: 1px dashed var(--color-neutral-300);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-neutral-600);
}
.scan-all:hover {
  border-color: var(--color-neutral-400);
  color: var(--color-neutral-800);
}

/* Busy */
.busy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--color-neutral-600);
}
.busy-label {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-800);
}
.busy-hint {
  margin: 0;
  font-size: var(--font-size-xs);
}
.spin {
  animation: ble-spin 1s linear infinite;
  color: var(--color-protocol-ble);
}
@keyframes ble-spin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .spin { animation: none; }
}

/* Result */
.result-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-4);
  text-align: center;
  border: 2px solid var(--color-neutral-200);
  margin-bottom: var(--space-4);
}
.result-card.recognized {
  border-color: var(--color-success);
}
.result-badge {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
  font-weight: var(--font-weight-bold);
  color: var(--color-success);
}
.result-badge.muted {
  color: var(--color-neutral-600);
}
.result-icon {
  color: var(--color-protocol-ble);
}
.result-name {
  margin: 0;
  font-size: 15px;
  font-weight: var(--font-weight-bold);
  color: var(--color-neutral-800);
}
.result-sub {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
}
.result-desc {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
  max-width: 40ch;
  line-height: 1.5;
}
.result-note {
  margin: var(--space-1) 0 0 0;
  font-size: var(--font-size-xs);
  color: var(--color-neutral-600);
  font-style: italic;
}

.result-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.btn-primary,
.btn-secondary,
.btn-ghost {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  padding: var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  cursor: pointer;
  border: 2px solid var(--color-neutral-800);
}
.btn-primary {
  background: var(--color-primary-500);
  color: var(--color-neutral-0);
  font-weight: var(--font-weight-bold);
}
.btn-primary:hover {
  background: var(--color-primary-600);
}
.btn-secondary {
  background: var(--color-neutral-0);
  color: var(--color-neutral-800);
}
.btn-secondary:hover {
  background: var(--color-neutral-50);
}
.btn-ghost {
  background: none;
  border-color: transparent;
  color: var(--color-neutral-600);
}
.btn-ghost:hover {
  color: var(--color-neutral-800);
}

/* Transitions (match the app's modal shell) */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;
}
.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.15s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-container {
  transform: translateY(20px);
}
.modal-leave-to .modal-container {
  transform: translateY(20px);
}
</style>
