<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { PALETTES, sampleStops } from '@/engine/executors/color-ramp'

const props = defineProps<{ data: Record<string, unknown> }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const W = 132
const H = 18

function draw() {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  if (!ctx) return
  const preset = (props.data?.preset as string) ?? 'viridis'
  const reverse = (props.data?.reverse as boolean) ?? false
  const stops = PALETTES[preset]
  for (let x = 0; x < W; x++) {
    let t = x / (W - 1)
    if (reverse) t = 1 - t
    // 'custom' interpolates the Color A/B inputs at runtime — show a neutral ramp.
    let r = t, g = t, b = t
    if (stops) {
      const rgb = sampleStops(stops, t)
      r = rgb[0]
      g = rgb[1]
      b = rgb[2]
    }
    ctx.fillStyle = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`
    ctx.fillRect(x, 0, 1, H)
  }
}

onMounted(draw)
watch(() => [props.data?.preset, props.data?.reverse], draw)
</script>

<template>
  <canvas
    ref="canvas"
    :width="W"
    :height="H"
    class="ramp-preview"
  />
</template>

<style scoped>
.ramp-preview {
  display: block;
  width: 100%;
  height: 18px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-neutral-200);
  image-rendering: pixelated;
}
</style>
