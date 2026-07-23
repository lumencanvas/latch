<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { type NodeProps } from '@vue-flow/core'
import NodePorts from '@/components/nodes/NodePorts.vue'
import { Printer, Play } from 'lucide-vue-next'
import { useRuntimeStore } from '@/stores/runtime'
import { useNodesStore } from '@/stores/nodes'
import { monochrome, type DitherMode } from '@/services/ble/escpos/escpos'
import { requestPrint } from './printerState'
import PairDeviceButton from '../PairDeviceButton.vue'

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()
const nodesStore = useNodesStore()

const def = computed(() => nodesStore.getDefinition('thermal-printer'))
const inputs = computed(() => def.value?.inputs ?? [])
const outputs = computed(() => def.value?.outputs ?? [])

const metrics = () => runtimeStore.nodeMetrics.get(props.id)?.outputValues
const status = computed(() => (metrics()?.status as string) ?? 'idle')
const ready = computed(() => metrics()?.ready === true)
const printing = computed(() => metrics()?.printing === true)
// The executor's guidance (e.g. "Pair a printer via Add Bluetooth Device") — shown when not
// connected so the bare status word isn't the only cue (mirrors the Muse head-map).
const errorText = computed(() => (metrics()?.error as string | null) ?? null)
const bound = computed(() => !!(props.data as Record<string, unknown> | undefined)?.deviceId)

const canvas = ref<HTMLCanvasElement | null>(null)
let cctx: CanvasRenderingContext2D | null = null
let raf: number | null = null
let lastAt = 0
// Dither is O(pixels); only recompute when the source ref or dither settings actually change.
let cacheSrc: ImageData | null = null
let cacheDither: DitherMode | null = null
let cacheThreshold = -1

/** Read the composed source, dither it exactly as it will print, and paint the 1-bit result. */
function draw(force = false) {
  const c = canvas.value
  if (!c || !cctx) return
  const now = performance.now()
  if (!force && now - lastAt < 80) return // ~12 fps is plenty for a preview; force bypasses (repaint-on-stop)
  lastAt = now

  const m = metrics()
  const src = m?._source as ImageData | undefined
  const dither = (m?._dither as DitherMode) ?? 'floyd'
  const threshold = (m?._threshold as number) ?? 128

  if (!src || src.width === 0 || src.height === 0) {
    cacheSrc = null
    c.width = 200; c.height = 120
    cctx.fillStyle = '#f4f4f4'; cctx.fillRect(0, 0, c.width, c.height)
    cctx.fillStyle = '#9a9a9a'; cctx.font = '11px monospace'; cctx.textAlign = 'center'
    cctx.fillText('no image / text', c.width / 2, c.height / 2)
    return
  }

  // Skip the dither + repaint when nothing changed since the last paint.
  if (!force && src === cacheSrc && dither === cacheDither && threshold === cacheThreshold) return
  cacheSrc = src; cacheDither = dither; cacheThreshold = threshold

  const mono = monochrome(src.data, src.width, src.height, dither, threshold)
  // Paint at source resolution, then let CSS scale the canvas down to the node width.
  c.width = src.width
  c.height = src.height
  const out = cctx.createImageData(src.width, src.height)
  for (let i = 0; i < mono.length; i++) {
    const v = mono[i] ? 0 : 255 // 1 = black
    out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = v
    out.data[i * 4 + 3] = 255
  }
  cctx.putImageData(out, 0, 0)
}

function loop() { draw(); raf = requestAnimationFrame(loop) }
function start() { if (raf === null) loop() }
function stop() { if (raf !== null) { cancelAnimationFrame(raf); raf = null } }

function print() { requestPrint(props.id) }

onMounted(() => { cctx = canvas.value?.getContext('2d') ?? null; draw(true); if (runtimeStore.isRunning) start() })
onUnmounted(stop)
watch(() => runtimeStore.isRunning, (r) => { if (r) start(); else { stop(); draw(true) } })
</script>

<template>
  <div
    class="printer-node"
    :class="{ selected: props.selected }"
  >
    <NodePorts
      :inputs="inputs"
      :outputs="outputs"
      :selected="props.selected"
    />

    <div class="node-body">
      <div class="node-header">
        <Printer
          :size="14"
          class="head-icon"
        />
        <span class="node-title">THERMAL PRINTER</span>
        <span
          class="node-status"
          :data-status="status"
        >{{ printing ? 'printing' : status }}</span>
      </div>
      <p
        v-if="errorText && status !== 'connected'"
        class="node-hint"
        :data-status="status"
        role="status"
      >
        {{ errorText }}
      </p>
      <div class="preview-wrap">
        <canvas
          ref="canvas"
          class="preview-canvas"
        />
      </div>
      <button
        class="print-btn"
        :disabled="!ready || printing"
        @click="print"
        @mousedown.stop
      >
        <Play :size="12" />
        <span>{{ printing ? 'Printing…' : 'Print' }}</span>
      </button>
      <PairDeviceButton
        :node-id="props.id"
        node-type="thermal-printer"
        label="Thermal Printer"
        :bound="bound"
      />
    </div>
  </div>
</template>

<style scoped>
.printer-node {
  position: relative;
  width: fit-content;
  font-family: var(--font-mono);
}
.node-body {
  width: 220px;
  background: var(--color-neutral-900);
  border: 2px solid var(--color-neutral-700);
  box-shadow: 3px 3px 0 0 var(--color-neutral-800);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  overflow: hidden;
}
.printer-node.selected .node-body { border-color: var(--color-primary-400); box-shadow: 4px 4px 0 0 var(--color-primary-200); }
.printer-node:hover .node-body { box-shadow: 4px 4px 0 0 var(--color-neutral-600); }

.node-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-neutral-800);
  border-bottom: 1px solid var(--color-neutral-700);
  color: var(--color-neutral-100);
}
.head-icon { color: var(--color-protocol-ble); }
.node-title { font-size: var(--font-size-xs); font-weight: var(--font-weight-bold); letter-spacing: var(--letter-spacing-wider); }
.node-status { margin-left: auto; font-size: var(--font-size-xs); color: var(--color-neutral-400); text-transform: uppercase; }
.node-status[data-status='connected'] { color: var(--color-success); }
.node-status[data-status='error'] { color: var(--color-error); }
.node-status[data-status='awaiting-pairing'],
.node-status[data-status='no device'] { color: var(--color-warning); }
.node-status[data-status='connecting'],
.node-status[data-status='reconnecting'] { color: var(--color-primary-400); }

.node-hint {
  margin: 0;
  padding: 2px 8px 4px;
  font-size: 10px;
  line-height: 1.3;
  color: var(--color-warning);
}
.node-hint[data-status='error'],
.node-hint[data-status='unsupported'] { color: var(--color-error); }

.preview-wrap {
  display: flex;
  justify-content: center;
  padding: var(--space-2);
  background:
    repeating-conic-gradient(var(--color-neutral-800) 0% 25%, var(--color-neutral-850, #1f1f1f) 0% 50%) 0 / 12px 12px;
}
.preview-canvas {
  width: 200px;
  height: auto;
  max-height: 260px;
  object-fit: contain;
  image-rendering: pixelated;
  background: #fff;
  border: 1px solid var(--color-neutral-700);
}

.print-btn {
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
.print-btn:hover:not(:disabled) { background: var(--color-primary-600); }
.print-btn:disabled { background: var(--color-neutral-700); color: var(--color-neutral-400); cursor: not-allowed; }
</style>
