<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import { Printer, Play } from 'lucide-vue-next'
import { useRuntimeStore } from '@/stores/runtime'
import { useNodesStore, dataTypeMeta } from '@/stores/nodes'
import { monochrome, type DitherMode } from '@/services/ble/escpos/escpos'
import { requestPrint } from './printerState'

const props = defineProps<NodeProps>()
const runtimeStore = useRuntimeStore()
const nodesStore = useNodesStore()

const def = computed(() => nodesStore.getDefinition('thermal-printer'))
const inputs = computed(() => def.value?.inputs ?? [])
const outputs = computed(() => def.value?.outputs ?? [])
const typeColor = (t: string) => (dataTypeMeta as Record<string, { color?: string }>)[t]?.color ?? 'var(--color-neutral-400)'

const metrics = () => runtimeStore.nodeMetrics.get(props.id)?.outputValues
const status = computed(() => (metrics()?.status as string) ?? 'idle')
const ready = computed(() => metrics()?.ready === true)
const printing = computed(() => metrics()?.printing === true)

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
    <!-- Input handles -->
    <div class="handles-column left">
      <div
        v-for="inp in inputs"
        :key="inp.id"
        class="handle-slot in"
      >
        <Handle
          :id="inp.id"
          type="target"
          :position="Position.Left"
          class="port-handle in"
          :aria-label="`${inp.label} input`"
          :style="{ background: typeColor(inp.type) }"
        />
        <span class="port-label">{{ inp.label }}</span>
      </div>
    </div>

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
    </div>

    <!-- Output handles -->
    <div class="handles-column right">
      <div
        v-for="out in outputs"
        :key="out.id"
        class="handle-slot out"
      >
        <span class="port-label">{{ out.label }}</span>
        <Handle
          :id="out.id"
          type="source"
          :position="Position.Right"
          class="port-handle out"
          :aria-label="`${out.label} output`"
          :style="{ background: typeColor(out.type) }"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.printer-node {
  position: relative;
  display: flex;
  align-items: flex-start;
  font-family: var(--font-mono);
}
.node-body {
  flex: 0 0 auto;
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

.handles-column { flex: 0 0 auto; display: flex; flex-direction: column; gap: 2px; padding-top: 30px; }
.handle-slot { position: relative; display: flex; align-items: center; height: 18px; }
.handle-slot.in { justify-content: flex-start; padding-left: 8px; }
.handle-slot.out { justify-content: flex-end; padding-right: 8px; }
.port-label { font-size: 8px; color: var(--color-neutral-400); white-space: nowrap; }
:deep(.port-handle) {
  width: var(--node-port-size, 10px) !important;
  height: var(--node-port-size, 10px) !important;
  border: 2px solid var(--color-neutral-900) !important;
  border-radius: 50% !important;
  position: absolute !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
}
:deep(.port-handle.in) { left: -5px !important; }
:deep(.port-handle.out) { right: -5px !important; }
</style>
