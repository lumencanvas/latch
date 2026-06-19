<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'

const props = defineProps<{ data: Record<string, unknown> }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const W = 120
const H = 56
const PAD = 6

/** Simulate a unit step (0→1) with the node's spring params; mirrors spring.ts. */
function simulate(tension: number, friction: number, mass: number, n: number): number[] {
  const dt = 1 / 60
  let pos = 0
  let vel = 0
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const accel = (tension * (1 - pos) - friction * vel) / mass
    vel += accel * dt
    pos += vel * dt
    out.push(pos)
  }
  return out
}

function draw() {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, W, H)

  const tension = Math.max(1, (props.data?.tension as number) ?? 120)
  const friction = Math.max(0, (props.data?.friction as number) ?? 14)
  const mass = Math.max(0.1, (props.data?.mass as number) ?? 1)

  const N = W - 2 * PAD
  const series = simulate(tension, friction, mass, N + 1)
  // y-range padded for overshoot
  let lo = 0, hi = 1
  for (const v of series) { lo = Math.min(lo, v); hi = Math.max(hi, v) }
  lo = Math.min(lo, -0.05); hi = Math.max(hi, 1.05)
  const toY = (v: number) => H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD)

  // target line (1)
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 1
  const ty = Math.round(toY(1)) + 0.5
  ctx.beginPath(); ctx.moveTo(PAD, ty); ctx.lineTo(W - PAD, ty); ctx.stroke()

  // response curve
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i <= N; i++) {
    const x = PAD + i
    const y = toY(series[i])
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

onMounted(draw)
watch(() => [props.data?.tension, props.data?.friction, props.data?.mass], draw)
</script>

<template>
  <canvas
    ref="canvas"
    :width="W"
    :height="H"
    class="spring-preview"
  />
</template>

<style scoped>
.spring-preview {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-neutral-200);
  background: var(--color-neutral-50);
}
</style>
