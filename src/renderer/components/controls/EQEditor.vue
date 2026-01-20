<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'

export interface EQBand {
  frequency: number  // 20-20000 Hz
  gain: number       // -24 to +24 dB
  q: number          // 0.1 to 10
}

export interface EQData {
  bands: EQBand[]
}

const props = withDefaults(defineProps<{
  modelValue: EQData
  width?: number
  height?: number
  accentColor?: string
}>(), {
  width: 240,
  height: 120,
  accentColor: '#a855f7',
})

const emit = defineEmits<{
  'update:modelValue': [value: EQData]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const isDragging = ref<number | null>(null)

// Frequency range (log scale)
const MIN_FREQ = 20
const MAX_FREQ = 20000
const MIN_GAIN = -24
const MAX_GAIN = 24

// Band colors
const bandColors = ['#ef4444', '#22c55e', '#3b82f6']

// Convert frequency to X position (log scale)
function freqToX(freq: number): number {
  const padding = 10
  const logMin = Math.log10(MIN_FREQ)
  const logMax = Math.log10(MAX_FREQ)
  const logFreq = Math.log10(freq)
  return padding + ((logFreq - logMin) / (logMax - logMin)) * (props.width - padding * 2)
}

// Convert X position to frequency (log scale)
function xToFreq(x: number): number {
  const padding = 10
  const logMin = Math.log10(MIN_FREQ)
  const logMax = Math.log10(MAX_FREQ)
  const norm = (x - padding) / (props.width - padding * 2)
  return Math.pow(10, logMin + norm * (logMax - logMin))
}

// Convert gain to Y position
function gainToY(gain: number): number {
  const padding = 10
  const norm = (gain - MIN_GAIN) / (MAX_GAIN - MIN_GAIN)
  return props.height - padding - norm * (props.height - padding * 2)
}

// Convert Y position to gain
function yToGain(y: number): number {
  const padding = 10
  const norm = (props.height - padding - y) / (props.height - padding * 2)
  return MIN_GAIN + norm * (MAX_GAIN - MIN_GAIN)
}

// Calculate frequency response at a given frequency
function calculateResponse(freq: number): number {
  let totalGain = 0
  for (const band of props.modelValue.bands) {
    // Simplified bell filter response approximation
    const logRatio = Math.log2(freq / band.frequency)
    const bandwidth = 1 / band.q
    const response = band.gain * Math.exp(-(logRatio * logRatio) / (2 * bandwidth * bandwidth))
    totalGain += response
  }
  return totalGain
}

function draw() {
  if (!canvas.value) return
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return

  const w = props.width
  const h = props.height
  const dpr = window.devicePixelRatio || 1

  canvas.value.width = w * dpr
  canvas.value.height = h * dpr
  canvas.value.style.width = w + 'px'
  canvas.value.style.height = h + 'px'
  ctx.scale(dpr, dpr)

  ctx.clearRect(0, 0, w, h)

  // Background
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, 0, w, h)

  const padding = 10

  // Draw grid lines
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 1

  // Horizontal grid (gain)
  for (let gain = -24; gain <= 24; gain += 12) {
    const y = gainToY(gain)
    ctx.beginPath()
    ctx.moveTo(padding, y)
    ctx.lineTo(w - padding, y)
    ctx.stroke()
  }

  // Zero line
  ctx.strokeStyle = '#333'
  const zeroY = gainToY(0)
  ctx.beginPath()
  ctx.moveTo(padding, zeroY)
  ctx.lineTo(w - padding, zeroY)
  ctx.stroke()

  // Vertical grid (frequency markers)
  ctx.strokeStyle = '#1a1a1a'
  for (const freq of [100, 1000, 10000]) {
    const x = freqToX(freq)
    ctx.beginPath()
    ctx.moveTo(x, padding)
    ctx.lineTo(x, h - padding)
    ctx.stroke()
  }

  // Draw combined frequency response curve
  ctx.beginPath()
  let firstPoint = true
  for (let x = padding; x <= w - padding; x += 2) {
    const freq = xToFreq(x)
    const gain = calculateResponse(freq)
    const y = gainToY(gain)
    if (firstPoint) {
      ctx.moveTo(x, y)
      firstPoint = false
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.strokeStyle = props.accentColor
  ctx.lineWidth = 2
  ctx.stroke()

  // Fill under curve
  ctx.lineTo(w - padding, zeroY)
  ctx.lineTo(padding, zeroY)
  ctx.closePath()
  ctx.fillStyle = props.accentColor + '15'
  ctx.fill()

  // Draw individual band curves (lighter)
  for (let i = 0; i < props.modelValue.bands.length; i++) {
    const band = props.modelValue.bands[i]
    ctx.beginPath()
    let first = true
    for (let x = padding; x <= w - padding; x += 2) {
      const freq = xToFreq(x)
      const logRatio = Math.log2(freq / band.frequency)
      const bandwidth = 1 / band.q
      const response = band.gain * Math.exp(-(logRatio * logRatio) / (2 * bandwidth * bandwidth))
      const y = gainToY(response)
      if (first) {
        ctx.moveTo(x, y)
        first = false
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.strokeStyle = bandColors[i] + '60'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Draw band control points
  for (let i = 0; i < props.modelValue.bands.length; i++) {
    const band = props.modelValue.bands[i]
    const x = freqToX(band.frequency)
    const y = gainToY(band.gain)
    const isActive = isDragging.value === i

    ctx.beginPath()
    ctx.arc(x, y, isActive ? 8 : 6, 0, Math.PI * 2)
    ctx.fillStyle = isActive ? bandColors[i] : '#1a1a1a'
    ctx.fill()
    ctx.strokeStyle = bandColors[i]
    ctx.lineWidth = 2
    ctx.stroke()

    // Band label
    ctx.fillStyle = '#666'
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(`${i + 1}`, x, y + 3)
  }

  // Frequency labels
  ctx.fillStyle = '#444'
  ctx.font = '8px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('100', freqToX(100), h - 2)
  ctx.fillText('1k', freqToX(1000), h - 2)
  ctx.fillText('10k', freqToX(10000), h - 2)
}

function hitTest(x: number, y: number): number | null {
  const threshold = 15
  for (let i = 0; i < props.modelValue.bands.length; i++) {
    const band = props.modelValue.bands[i]
    const bx = freqToX(band.frequency)
    const by = gainToY(band.gain)
    if (Math.sqrt((x - bx) ** 2 + (y - by) ** 2) < threshold) {
      return i
    }
  }
  return null
}

function onPointerDown(e: PointerEvent) {
  if (!canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  // Scale from CSS display size to canvas internal resolution
  const scaleX = props.width / rect.width
  const scaleY = props.height / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY

  const hit = hitTest(x, y)
  if (hit !== null) {
    isDragging.value = hit
    // Capture pointer for reliable drag tracking even outside element
    canvas.value.setPointerCapture(e.pointerId)
    e.preventDefault()
    e.stopPropagation()
  }
}

function onPointerMove(e: PointerEvent) {
  if (isDragging.value === null || !canvas.value) return

  const rect = canvas.value.getBoundingClientRect()
  // Scale from CSS display size to canvas internal resolution
  const scaleX = props.width / rect.width
  const scaleY = props.height / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY

  const newBands = [...props.modelValue.bands]
  newBands[isDragging.value] = {
    ...newBands[isDragging.value],
    frequency: Math.max(MIN_FREQ, Math.min(MAX_FREQ, xToFreq(x))),
    gain: Math.max(MIN_GAIN, Math.min(MAX_GAIN, yToGain(y))),
  }

  emit('update:modelValue', { bands: newBands })
  e.preventDefault()
  e.stopPropagation()
}

function onPointerUp(e: PointerEvent) {
  if (isDragging.value !== null && canvas.value) {
    canvas.value.releasePointerCapture(e.pointerId)
  }
  isDragging.value = null
}

// Wheel to adjust Q
function onWheel(e: WheelEvent) {
  if (!canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  // Scale from CSS display size to canvas internal resolution
  const scaleX = props.width / rect.width
  const scaleY = props.height / rect.height
  const x = (e.clientX - rect.left) * scaleX
  const y = (e.clientY - rect.top) * scaleY

  const hit = hitTest(x, y)
  if (hit !== null) {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 0.2 : -0.2
    const newBands = [...props.modelValue.bands]
    newBands[hit] = {
      ...newBands[hit],
      q: Math.max(0.1, Math.min(10, newBands[hit].q + delta)),
    }
    emit('update:modelValue', { bands: newBands })
  }
}

watch(() => props.modelValue, draw, { deep: true })

onMounted(() => {
  draw()
})

onUnmounted(() => {
  // Pointer capture is automatically released when element is unmounted
})
</script>

<template>
  <div class="eq-editor">
    <canvas
      ref="canvas"
      class="eq-canvas"
      @pointerdown.stop="onPointerDown"
      @pointermove.stop="onPointerMove"
      @pointerup.stop="onPointerUp"
      @pointercancel.stop="onPointerUp"
      @wheel.stop.prevent="onWheel"
      @mousedown.stop
      @touchstart.stop
    />
    <div class="eq-values">
      <span
        v-for="(band, i) in modelValue.bands"
        :key="i"
        :style="{ color: bandColors[i] }"
      >
        {{ Math.round(band.frequency) }}Hz {{ band.gain > 0 ? '+' : '' }}{{ band.gain.toFixed(1) }}dB
      </span>
    </div>
  </div>
</template>

<style scoped>
.eq-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eq-canvas {
  border: 1px solid #333;
  border-radius: 4px;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}

.eq-values {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 8px;
}
</style>
