<script setup lang="ts">
import { computed } from 'vue'
import { type NodeProps } from '@vue-flow/core'
import NodePorts from '@/components/nodes/NodePorts.vue'
import { RadioReceiver, RefreshCw } from 'lucide-vue-next'
import { useRuntimeStore } from '@/stores/runtime'
import { useNodesStore } from '@/stores/nodes'
import { useFlowsStore } from '@/stores/flows'
import { useFlowHistory } from '@/composables/useFlowHistory'
import { getServiceName, getCharacteristicName } from '@/services/ble/BleProfileRegistry'
import type { BleServiceInfo, BleCharacteristicInfo } from '@/services/connections/adapters/BleAdapter'
import { requestBleRead } from '../shared'
import PairDeviceButton from '../PairDeviceButton.vue'

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()
const nodesStore = useNodesStore()
const flowsStore = useFlowsStore()
const { recordParamEdit } = useFlowHistory()

const def = computed(() => nodesStore.getDefinition('ble-characteristic'))
const inputs = computed(() => def.value?.inputs ?? [])
const outputs = computed(() => def.value?.outputs ?? [])

const data = computed(() => (props.data as Record<string, unknown> | undefined) ?? {})
const bound = computed(() => !!data.value.deviceId)
const serviceUUID = computed(() => (data.value.serviceUUID as string) ?? '')
const characteristicUUID = computed(() => (data.value.characteristicUUID as string) ?? '')

const metrics = () => runtimeStore.nodeMetrics.get(props.id)?.outputValues
const status = computed(() => (metrics()?._status as string) ?? 'idle')
const connected = computed(() => status.value === 'connected')
const errorText = computed(() => (metrics()?._error as string | null) ?? null)
const formatted = computed(() => (metrics()?._formatted as string) ?? '')
const notified = computed(() => metrics()?._notified === true)

const services = computed<BleServiceInfo[]>(() => (metrics()?._services as BleServiceInfo[] | undefined) ?? [])
const serviceOptions = computed(() =>
  services.value.map((s) => ({ uuid: s.uuid, name: getServiceName(s.uuid) }))
)
// Characteristics for the chosen service (or all discovered chars if no service picked yet).
const charOptions = computed<BleCharacteristicInfo[]>(() => {
  const svc = services.value.find((s) => s.uuid === serviceUUID.value)
  const list = svc ? svc.characteristics : services.value.flatMap((s) => s.characteristics)
  return list
})

function badges(c: BleCharacteristicInfo): string {
  const p = c.properties
  const b: string[] = []
  if (p.read) b.push('R')
  if (p.write || p.writeWithoutResponse) b.push('W')
  if (p.notify || p.indicate) b.push('N')
  return b.join('')
}

function set(patch: Record<string, unknown>, label: string) {
  recordParamEdit(props.id, label, () => flowsStore.updateNodeData(props.id, patch))
}

function onServiceChange(e: Event) {
  const uuid = (e.target as HTMLSelectElement).value
  // Changing the service clears the characteristic (it belonged to the old service).
  set({ serviceUUID: uuid, characteristicUUID: '' }, 'Select BLE service')
}
function onCharChange(e: Event) {
  const uuid = (e.target as HTMLSelectElement).value
  // Backfill the owning service so the two dropdowns stay consistent.
  const owner = services.value.find((s) => s.characteristics.some((c) => c.uuid === uuid))
  set({ characteristicUUID: uuid, serviceUUID: owner?.uuid ?? serviceUUID.value }, 'Select BLE characteristic')
}
function read() {
  requestBleRead(props.id)
}
</script>

<template>
  <div
    class="blechar-node"
    :class="{ selected: props.selected }"
  >
    <NodePorts
      :inputs="inputs"
      :outputs="outputs"
      :selected="props.selected"
    />

    <div class="node-body">
      <div class="node-header">
        <RadioReceiver
          :size="14"
          class="head-icon"
        />
        <span class="node-title">BLE CHARACTERISTIC</span>
        <span
          class="node-status"
          :data-status="status"
        >{{ status }}</span>
      </div>
      <p
        v-if="errorText && !connected"
        class="node-hint"
        :data-status="status"
        role="status"
      >
        {{ errorText }}
      </p>

      <div
        v-if="connected"
        class="picker"
      >
        <label class="field">
          <span class="field-label">Service</span>
          <select
            class="field-select"
            :value="serviceUUID"
            @change="onServiceChange"
            @mousedown.stop
          >
            <option value="">
              — choose service —
            </option>
            <option
              v-for="s in serviceOptions"
              :key="s.uuid"
              :value="s.uuid"
            >
              {{ s.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">Characteristic</span>
          <select
            class="field-select"
            :value="characteristicUUID"
            @change="onCharChange"
            @mousedown.stop
          >
            <option value="">
              — choose characteristic —
            </option>
            <option
              v-for="c in charOptions"
              :key="c.uuid"
              :value="c.uuid"
            >
              {{ getCharacteristicName(c.uuid) }} · {{ badges(c) || '—' }}
            </option>
          </select>
        </label>

        <div class="value-row">
          <span
            class="notify-dot"
            :class="{ pulse: notified }"
            aria-hidden="true"
          />
          <span class="value-text">{{ formatted || '—' }}</span>
          <button
            class="read-btn"
            :disabled="!characteristicUUID"
            title="Read once"
            @click="read"
            @mousedown.stop
          >
            <RefreshCw :size="11" />
            <span>Read</span>
          </button>
        </div>
      </div>

      <PairDeviceButton
        :node-id="props.id"
        node-type="ble-characteristic"
        label="BLE Characteristic"
        :bound="bound"
      />
    </div>
  </div>
</template>

<style scoped>
.blechar-node {
  position: relative;
  width: fit-content;
  font-family: var(--font-mono);
}
.node-body {
  width: 230px;
  background: var(--color-neutral-900);
  border: 2px solid var(--color-neutral-700);
  box-shadow: 3px 3px 0 0 var(--color-neutral-800);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  overflow: hidden;
}
.blechar-node.selected .node-body {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}
.blechar-node:hover .node-body {
  box-shadow: 4px 4px 0 0 var(--color-neutral-600);
}

.node-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-800);
  border-bottom: 1px solid var(--color-neutral-700);
  color: var(--color-neutral-100);
}
.head-icon {
  color: var(--color-protocol-ble);
}
.node-title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-wider);
}
.node-status {
  margin-left: auto;
  font-size: var(--font-size-xs);
  color: var(--color-neutral-400);
  text-transform: uppercase;
}
.node-status[data-status='connected'] {
  color: var(--color-success);
}
.node-status[data-status='error'] {
  color: var(--color-error);
}
.node-status[data-status='awaiting-pairing'],
.node-status[data-status='no device'],
.node-status[data-status='unsupported'] {
  color: var(--color-warning);
}
.node-status[data-status='connecting'],
.node-status[data-status='reconnecting'] {
  color: var(--color-primary-400);
}

.node-hint {
  margin: 0;
  padding: 2px 8px 4px;
  font-size: 10px;
  line-height: 1.3;
  color: var(--color-warning);
}
.node-hint[data-status='error'],
.node-hint[data-status='unsupported'] {
  color: var(--color-error);
}

.picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.field-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  color: var(--color-neutral-400);
}
.field-select {
  width: 100%;
  padding: 4px 6px;
  background: var(--color-neutral-800);
  color: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-700);
  border-radius: var(--radius-sm, 3px);
  font-family: var(--font-mono);
  font-size: 11px;
}
.field-select:focus-visible {
  outline: 2px solid var(--color-primary-400);
  outline-offset: -1px;
}

.value-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-top: 2px;
}
.notify-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-neutral-700);
  flex: 0 0 auto;
  transition: background 120ms ease-out;
}
.notify-dot.pulse {
  background: var(--color-success);
}
.value-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11px;
  color: var(--color-neutral-100);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.read-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  flex: 0 0 auto;
  padding: 3px 8px;
  border: 1px solid var(--color-neutral-700);
  background: var(--color-neutral-800);
  color: var(--color-neutral-100);
  font-family: var(--font-mono);
  font-size: 10px;
  cursor: pointer;
}
.read-btn:hover:not(:disabled) {
  background: var(--color-neutral-700);
}
.read-btn:disabled {
  color: var(--color-neutral-500);
  cursor: not-allowed;
}
</style>
