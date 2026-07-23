<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { type NodeProps } from '@vue-flow/core'
import NodePorts from '@/components/nodes/NodePorts.vue'
import { Brain } from 'lucide-vue-next'
import { useRuntimeStore } from '@/stores/runtime'
import { useNodesStore } from '@/stores/nodes'
import type { MuseSnapshot } from '@/services/connections/adapters/MuseAdapter'
import { MUSE_CHANNELS, type MuseChannel } from '@/services/ble/muse/museSignal'
import PairDeviceButton from '../PairDeviceButton.vue'

const props = defineProps<NodeProps>()

// Whether a device is bound (the `deviceId` control isn't shown on this custom node body,
// so the pair button is the only way to set/change it on a hand-added node).
const bound = computed(() => !!(props.data as Record<string, unknown> | undefined)?.deviceId)
const runtimeStore = useRuntimeStore()
const nodesStore = useNodesStore()

const outputs = computed(() => nodesStore.getDefinition('muse-eeg')?.outputs ?? [])

const canvas = ref<HTMLCanvasElement | null>(null)
let cctx: CanvasRenderingContext2D | null = null
let raf: number | null = null

const W = 220
const H = 180
const HEAD = { cx: 110, cy: 88, r: 62 }
// Front-facing head; viewer's-left = TP9/AF7 (the wearer's left).
const ELECTRODES: Record<MuseChannel, { x: number; y: number }> = {
  AF7: { x: 80, y: 54 },
  AF8: { x: 140, y: 54 },
  TP9: { x: 52, y: 104 },
  TP10: { x: 168, y: 104 },
}
const BANDS = [
  { key: 'delta', label: 'δ', color: '#6366F1' },
  { key: 'theta', label: 'θ', color: '#3B82F6' },
  { key: 'alpha', label: 'α', color: '#22C55E' },
  { key: 'beta', label: 'β', color: '#F59E0B' },
  { key: 'gamma', label: 'γ', color: '#EF4444' },
] as const

const status = computed(() => (runtimeStore.nodeMetrics.get(props.id)?.outputValues?._status as string) ?? 'idle')
// The executor's guidance (e.g. "Pair a Muse via Add Bluetooth Device") — shown when
// the node can't stream, so the bare status word isn't the only cue.
const errorText = computed(() => (runtimeStore.nodeMetrics.get(props.id)?.outputValues?._error as string | null) ?? null)
const battery = computed(() => {
  const b = (runtimeStore.nodeMetrics.get(props.id)?.outputValues?._snapshot as MuseSnapshot | undefined)?.battery
  return b == null ? null : Math.round(b * 100)
})

function snapshot(): MuseSnapshot | null {
  return (runtimeStore.nodeMetrics.get(props.id)?.outputValues?._snapshot as MuseSnapshot | undefined) ?? null
}

/** contact 0→1 mapped red → amber → green. */
function contactColor(q: number): string {
  const c = Math.max(0, Math.min(1, q))
  const stops = c < 0.5
    ? mix([239, 68, 68], [245, 158, 11], c / 0.5) // red → amber
    : mix([245, 158, 11], [34, 197, 94], (c - 0.5) / 0.5) // amber → green
  return `rgb(${stops[0]},${stops[1]},${stops[2]})`
}
function mix(a: number[], b: number[], t: number): number[] {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t))
}

function draw() {
  const ctx = cctx
  if (!ctx) return
  const snap = snapshot()
  const blinking = runtimeStore.nodeMetrics.get(props.id)?.outputValues?.blink === true
  const clenching = runtimeStore.nodeMetrics.get(props.id)?.outputValues?.clench === true

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, W, H)

  // Head outline + nose + ears
  ctx.strokeStyle = clenching ? '#F59E0B' : '#3a3a3a'
  ctx.lineWidth = clenching ? 2.5 : 2
  ctx.beginPath()
  ctx.arc(HEAD.cx, HEAD.cy, HEAD.r, 0, Math.PI * 2)
  ctx.stroke()
  // nose
  ctx.beginPath()
  ctx.moveTo(HEAD.cx - 8, HEAD.cy - HEAD.r + 2)
  ctx.lineTo(HEAD.cx, HEAD.cy - HEAD.r - 9)
  ctx.lineTo(HEAD.cx + 8, HEAD.cy - HEAD.r + 2)
  ctx.stroke()
  // ears
  for (const ex of [HEAD.cx - HEAD.r, HEAD.cx + HEAD.r]) {
    ctx.beginPath()
    ctx.arc(ex, HEAD.cy, 8, -Math.PI / 2, Math.PI / 2, ex < HEAD.cx)
    ctx.stroke()
  }

  // Electrodes with contact halos
  for (const ch of MUSE_CHANNELS) {
    const p = ELECTRODES[ch]
    const q = snap?.contact[ch] ?? 0
    const col = q > 0 ? contactColor(q) : '#555'
    // halo
    if (q > 0) {
      const hr = 7 + q * 11
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, hr)
      g.addColorStop(0, contactColor(q))
      g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.globalAlpha = 0.12 + q * 0.35
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(p.x, p.y, hr, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
    // dot
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#0a0a0a'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // label
    ctx.fillStyle = '#888'
    ctx.font = '8px monospace'
    ctx.textAlign = 'center'
    const ly = p.y < HEAD.cy ? p.y - 9 : p.y + 15
    ctx.fillText(ch, p.x, ly)
  }

  // Blink indicator (two eyes flash)
  if (blinking) {
    ctx.fillStyle = '#22C55E'
    for (const ex of [HEAD.cx - 18, HEAD.cx + 18]) {
      ctx.beginPath()
      ctx.arc(ex, HEAD.cy + 6, 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Band bars along the bottom
  const bw = 26
  const gap = 8
  const totalW = BANDS.length * bw + (BANDS.length - 1) * gap
  const x0 = (W - totalW) / 2
  const baseY = H - 8
  const maxH = 34
  const vals = BANDS.map((b) => {
    const v = (snap?.bands as Record<string, number> | undefined)?.[b.key]
    return Number.isFinite(v) ? (v as number) : 0 // a NaN would poison peak and blank all bars
  })
  const peak = Math.max(1e-6, ...vals)
  BANDS.forEach((b, i) => {
    const x = x0 + i * (bw + gap)
    const h = Math.max(1, (vals[i] / peak) * maxH)
    ctx.fillStyle = '#222'
    ctx.fillRect(x, baseY - maxH, bw, maxH)
    ctx.fillStyle = b.color
    ctx.fillRect(x, baseY - h, bw, h)
    ctx.fillStyle = '#aaa'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(b.label, x + bw / 2, baseY + 6)
  })
}

function loop() {
  draw()
  raf = requestAnimationFrame(loop)
}
function start() { if (raf === null) loop() }
function stop() { if (raf !== null) { cancelAnimationFrame(raf); raf = null } }

onMounted(() => {
  cctx = canvas.value?.getContext('2d') ?? null
  draw() // paint an idle head immediately
  if (runtimeStore.isRunning) start()
})
onUnmounted(stop)
// Only animate while the graph runs (the visual is static when stopped); paint the
// final/idle frame once on the transition.
watch(() => runtimeStore.isRunning, (running) => {
  if (running) start()
  else { stop(); draw() }
})
</script>

<template>
  <div
    class="muse-node"
    :class="{ selected: props.selected }"
  >
    <NodePorts
      :outputs="outputs"
      :selected="props.selected"
    />

    <div class="node-body">
      <div class="node-header">
        <Brain
          :size="14"
          class="head-icon"
        />
        <span class="node-title">MUSE EEG</span>
        <span
          class="node-status"
          :data-status="status"
        >
          {{ status }}<template v-if="battery !== null"> · {{ battery }}%</template>
        </span>
      </div>
      <p
        v-if="errorText && status !== 'connected'"
        class="node-hint"
        :data-status="status"
        role="status"
      >
        {{ errorText }}
      </p>
      <canvas
        ref="canvas"
        :width="W"
        :height="H"
        class="head-canvas"
      />
      <PairDeviceButton
        :node-id="props.id"
        node-type="muse-eeg"
        label="Muse EEG"
        :bound="bound"
      />
    </div>
  </div>
</template>

<style scoped>
.muse-node {
  position: relative;
  width: fit-content;
  font-family: var(--font-mono);
}

.node-body {
  background: var(--color-neutral-900);
  border: 2px solid var(--color-neutral-700);
  box-shadow: 3px 3px 0 0 var(--color-neutral-800);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  overflow: hidden;
}
.muse-node.selected .node-body {
  border-color: var(--color-primary-400);
  box-shadow: 4px 4px 0 0 var(--color-primary-200);
}
.muse-node:hover .node-body {
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
.head-icon { color: var(--color-protocol-ble); }
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

.head-canvas {
  display: block;
  width: 220px;
  height: 180px;
}
</style>
