<script setup lang="ts">
/**
 * "Pair device…" button for the custom device NodeViews (Muse head-map, printer preview).
 *
 * A device node's `deviceId` control isn't visible on the canvas — the custom component owns
 * the whole node body — so a hand-added node has no way to bind a device. This button opens the
 * Bluetooth panel in "bind to this node" mode: it pairs a device and writes the id back into
 * THIS node's `deviceId` (via the panel), rather than dropping a new bound node.
 */
import { computed } from 'vue'
import { Bluetooth } from 'lucide-vue-next'
import { useUIStore } from '@/stores/ui'

const props = defineProps<{
  nodeId: string
  nodeType: string
  /** Node label used in the panel copy (e.g. 'Muse EEG'). */
  label?: string
  /** True once a device is bound — flips the button from "Pair" to "Change". */
  bound?: boolean
}>()

const uiStore = useUIStore()
const text = computed(() => (props.bound ? 'Change device…' : 'Pair device…'))

function open() {
  uiStore.openBluetoothDeviceManager({
    nodeId: props.nodeId,
    nodeType: props.nodeType,
    label: props.label,
  })
}
</script>

<template>
  <!-- No aria-label: the visible text is the accessible name (WCAG 2.5.3 Label in Name).
       The Bluetooth glyph is decorative and adds nothing to the name. -->
  <button
    class="pair-btn"
    :class="{ bound }"
    type="button"
    @click.stop="open"
    @mousedown.stop
  >
    <Bluetooth
      :size="12"
      aria-hidden="true"
    />
    <span>{{ text }}</span>
  </button>
</template>

<style scoped>
.pair-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  width: 100%;
  padding: var(--space-2);
  border: none;
  border-top: 1px solid var(--color-neutral-700);
  background: var(--color-protocol-ble);
  color: var(--color-neutral-0);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  letter-spacing: var(--letter-spacing-wide);
  cursor: pointer;
}
.pair-btn:hover {
  filter: brightness(1.1);
}
.pair-btn:focus-visible {
  outline: 2px solid var(--color-neutral-0);
  outline-offset: -3px;
}
/* Bound: a quieter, secondary treatment (it's a re-pair, not the primary call to action). */
.pair-btn.bound {
  background: var(--color-neutral-800);
  color: var(--color-neutral-300);
}
.pair-btn.bound:hover {
  background: var(--color-neutral-700);
  color: var(--color-neutral-100);
}
</style>
