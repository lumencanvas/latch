<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { EASINGS } from '@/engine/executors/easing'

const props = defineProps<{ data: Record<string, unknown> }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const W = 120
const H = 56
const PAD = 6

// Map an easing output (may overshoot below 0 / above 1 for back/elastic) to canvas y.
const LO = -0.4
const HI = 1.4
function toY(v: number): number {
  const n = (v - LO) / (HI - LO)
  return H - PAD - n * (H - 2 * PAD)
}

function draw() {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, W, H)
  const fn = EASINGS[(props.data?.curve as string) ?? 'in-out-cubic'] ?? EASINGS.linear

  // baseline (0) and top (1) reference lines
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 1
  for (const ref of [0, 1]) {
    const y = Math.round(toY(ref)) + 0.5
    ctx.beginPath()
    ctx.moveTo(PAD, y)
    ctx.lineTo(W - PAD, y)
    ctx.stroke()
  }

  // the curve
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 2
  ctx.beginPath()
  const N = W - 2 * PAD
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const x = PAD + i
    const y = toY(fn(t))
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

onMounted(draw)
watch(() => props.data?.curve, draw)
</script>

<template>
  <canvas
    ref="canvas"
    :width="W"
    :height="H"
    class="easing-preview"
  />
</template>

<style scoped>
.easing-preview {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-neutral-200);
  background: var(--color-neutral-50);
}
</style>
