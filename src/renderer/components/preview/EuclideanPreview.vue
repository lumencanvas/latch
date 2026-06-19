<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { bjorklund } from '@/engine/executors/euclidean'

const props = defineProps<{ data: Record<string, unknown> }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const W = 132
const H = 20

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(typeof v === 'number' ? v : fallback)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback
}

function draw() {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, W, H)

  const steps = clampInt(props.data?.steps, 1, 64, 8)
  const pulses = clampInt(props.data?.pulses, 0, steps, 3)
  const rotation = clampInt(props.data?.rotation, -64, 64, 0)
  const base = bjorklund(steps, pulses)
  const pattern = base.map((_, i) => base[(((i - rotation) % steps) + steps) % steps])

  const gap = 2
  const cell = (W - (steps - 1) * gap) / steps
  const r = Math.max(1.5, Math.min(cell, H - 2) / 2)
  const cy = H / 2
  for (let i = 0; i < steps; i++) {
    const cx = i * (cell + gap) + cell / 2
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    if (pattern[i] === 1) {
      ctx.fillStyle = '#f97316'
      ctx.fill()
    } else {
      ctx.strokeStyle = '#9ca3af'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
}

onMounted(draw)
watch(() => [props.data?.steps, props.data?.pulses, props.data?.rotation], draw)
</script>

<template>
  <canvas
    ref="canvas"
    :width="W"
    :height="H"
    class="euclid-preview"
  />
</template>

<style scoped>
.euclid-preview {
  display: block;
  width: 100%;
  height: auto;
}
</style>
