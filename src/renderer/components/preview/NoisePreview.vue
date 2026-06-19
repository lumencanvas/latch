<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { fbmNoise } from '@/engine/executors/noise'

const props = defineProps<{ data: Record<string, unknown> }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const W = 120
const H = 48
const PAD = 4

function draw() {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, W, H)

  const frequency = (props.data?.frequency as number) ?? 1
  const octaves = (props.data?.octaves as number) ?? 1
  const seed = (props.data?.seed as number) ?? 0
  const off = seed * 137.13

  // midline
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, H / 2 + 0.5)
  ctx.lineTo(W - PAD, H / 2 + 0.5)
  ctx.stroke()

  // sample fbm noise across ~4 units of the X axis (value ∈ [-1,1])
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 2
  ctx.beginPath()
  const N = W - 2 * PAD
  const span = 4
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * span
    const v = fbmNoise(x * frequency + off, 0, 0, octaves)
    const px = PAD + i
    const py = H / 2 - v * (H / 2 - PAD)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.stroke()
}

onMounted(draw)
watch(() => [props.data?.frequency, props.data?.octaves, props.data?.seed], draw)
</script>

<template>
  <canvas
    ref="canvas"
    :width="W"
    :height="H"
    class="noise-preview"
  />
</template>

<style scoped>
.noise-preview {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-neutral-200);
  background: var(--color-neutral-50);
}
</style>
