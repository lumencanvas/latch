<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { type NodeProps } from '@vue-flow/core'
import { Vibrate, BatteryMedium, Play } from 'lucide-vue-next'
import { useRuntimeStore } from '@/stores/runtime'
import { useNodesStore } from '@/stores/nodes'
import { requestTestBuzz } from './buzzState'
import PairDeviceButton from '../PairDeviceButton.vue'
import NodePorts from '@/components/nodes/NodePorts.vue'

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()
const nodesStore = useNodesStore()

const def = computed(() => nodesStore.getDefinition('neosensory-buzz'))
const inputs = computed(() => def.value?.inputs ?? [])
const outputs = computed(() => def.value?.outputs ?? [])

const metrics = () => runtimeStore.nodeMetrics.get(props.id)?.outputValues
const status = computed(() => (metrics()?.status as string) ?? 'idle')
const connected = computed(() => metrics()?.connected === true)
// The executor's guidance (e.g. "Pair a Buzz…") — shown when not connected so the bare status
// word isn't the only cue (mirrors the Muse head-map / printer preview).
const errorText = computed(() => (metrics()?.error as string | null) ?? null)
const battery = computed(() => (metrics()?._battery as number | null | undefined) ?? null)
const bound = computed(() => !!(props.data as Record<string, unknown> | undefined)?.deviceId)

// Live motor levels (0..1), refreshed by a rAF loop off the executor's `_motors` output.
const bars = ref<number[]>([0, 0, 0, 0])
let raf: number | null = null
function loop() {
  const motors = (metrics()?._motors as number[] | undefined) ?? [0, 0, 0, 0]
  bars.value = [0, 1, 2, 3].map((i) => Math.max(0, Math.min(1, motors[i] ?? 0)))
  raf = requestAnimationFrame(loop)
}
function start() {
  if (raf === null) loop()
}
function stop() {
  if (raf !== null) {
    cancelAnimationFrame(raf)
    raf = null
  }
  bars.value = [0, 0, 0, 0]
}

function test() {
  requestTestBuzz(props.id)
}

onMounted(() => {
  if (runtimeStore.isRunning) start()
})
onUnmounted(stop)
watch(
  () => runtimeStore.isRunning,
  (r) => {
    if (r) start()
    else stop()
  }
)
</script>

<template>
  <div
    class="buzz-node"
    :class="{ selected: props.selected }"
  >
    <NodePorts
      :inputs="inputs"
      :outputs="outputs"
      :selected="props.selected"
    />

    <div class="node-body">
      <div class="node-header">
        <Vibrate
          :size="14"
          class="head-icon"
        />
        <span class="node-title">BUZZ</span>
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

      <!-- Live 4-motor meter -->
      <div class="motor-meter">
        <div
          v-for="(v, i) in bars"
          :key="i"
          class="motor-track"
        >
          <div
            class="motor-fill"
            :style="{ height: `${Math.round(v * 100)}%` }"
          />
          <span class="motor-label">{{ i + 1 }}</span>
        </div>
      </div>

      <div class="buzz-meta">
        <BatteryMedium
          :size="12"
          aria-hidden="true"
        />
        <span>{{ battery != null ? `${battery}%` : '—' }}</span>
      </div>

      <button
        class="test-btn"
        :disabled="!connected"
        @click="test"
        @mousedown.stop
      >
        <Play :size="12" />
        <span>Test buzz</span>
      </button>
      <PairDeviceButton
        :node-id="props.id"
        node-type="neosensory-buzz"
        label="Neosensory Buzz"
        :bound="bound"
      />
    </div>
  </div>
</template>

<style scoped>
.buzz-node {
  position: relative;
  width: fit-content;
  font-family: var(--font-mono);
}
.node-body {
  width: 200px;
  background: var(--color-neutral-900);
  border: 2px solid var(--color-neutral-700);
  box-shadow: 3px 3px 0 0 var(--color-neutral-800);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  overflow: hidden;
}
.buzz-node.selected .node-body {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}
.buzz-node:hover .node-body {
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

.motor-meter {
  display: flex;
  justify-content: space-around;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-3) var(--space-2);
  background: var(--color-neutral-850, #1f1f1f);
}
.motor-track {
  position: relative;
  flex: 1 1 0;
  height: 64px;
  display: flex;
  flex-direction: column-reverse;
  align-items: stretch;
  background: var(--color-neutral-800);
  border: 1px solid var(--color-neutral-700);
}
.motor-fill {
  width: 100%;
  background: var(--color-protocol-ble);
  transition: height 60ms linear;
}
.motor-label {
  position: absolute;
  bottom: -14px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 8px;
  color: var(--color-neutral-400);
}

.buzz-meta {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) var(--space-3) var(--space-1);
  font-size: var(--font-size-xs);
  color: var(--color-neutral-300);
}

.test-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  width: 100%;
  padding: var(--space-2);
  border: none;
  border-top: 1px solid var(--color-neutral-700);
  background: var(--color-primary-500);
  color: var(--color-neutral-0);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
}
.test-btn:hover:not(:disabled) {
  background: var(--color-primary-600);
}
.test-btn:disabled {
  background: var(--color-neutral-700);
  color: var(--color-neutral-400);
  cursor: not-allowed;
}
</style>
