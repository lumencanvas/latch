<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

export interface WaveformData {
  samples: number[]  // 64-256 samples, normalized -1 to 1
  preset?: 'sine' | 'square' | 'sawtooth' | 'triangle' | 'custom'
}

const props = withDefaults(defineProps<{
  modelValue: WaveformData
  width?: number
  height?: number
  accentColor?: string
  sampleCount?: number
}>(), {
  width: 200,
  height: 80,
  accentColor: '#22c55e',
  sampleCount: 64,
})

const emit = defineEmits<{
  'update:modelValue': [value: WaveformData]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const isDrawing = ref(false)
const lastDrawX = ref<number | null>(null)

// Keyboard a11y (WCAG 2.1.1 / 4.1.2). Freehand curve-drawing is inherently pointer-driven, but the editor
// must still be keyboard-OPERABLE — like the other canvas editors (XYPad/Envelope/EQ), one focusable
// role="application" host with an internally SELECTED sample. Adapted to a long sample sequence: the
// horizontal (index) axis is navigated with Left/Right (±1), PageUp/Down (±8), Home/End (first/last); the
// vertical (value) axis is adjusted with Up/Down (±step, Shift = coarse). Announced via aria-valuetext.
// (The 4 preset buttons were already keyboard-accessible and cover the common shapes.)
const selectedIndex = ref(0)
const focused = ref(false)
const VALUE_STEP = 0.05

function clampIndex(i: number): number {
  return Math.max(0, Math.min(props.sampleCount - 1, i))
}

/** Announced to screen readers: which sample is selected + its value (e.g. "sample 12/64: 0.35"). */
const valueText = computed(() => {
  const i = clampIndex(selectedIndex.value)
  return `sample ${i + 1}/${props.sampleCount}: ${(samples.value[i] ?? 0).toFixed(2)}`
})

function adjustSelectedValue(delta: number): void {
  const i = clampIndex(selectedIndex.value)
  const newSamples = [...samples.value]
  let v = newSamples[i] + delta
  v = Math.max(-1, Math.min(1, v))
  newSamples[i] = Number(v.toFixed(4)) // kill float dust
  emit('update:modelValue', { samples: newSamples, preset: 'custom' })
}

function onKeydown(e: KeyboardEvent): void {
  const step = e.shiftKey ? VALUE_STEP * 4 : VALUE_STEP
  switch (e.key) {
    case 'ArrowRight': selectedIndex.value = clampIndex(selectedIndex.value + 1); break
    case 'ArrowLeft': selectedIndex.value = clampIndex(selectedIndex.value - 1); break
    case 'PageDown': selectedIndex.value = clampIndex(selectedIndex.value + 8); break
    case 'PageUp': selectedIndex.value = clampIndex(selectedIndex.value - 8); break
    case 'Home': selectedIndex.value = 0; break
    case 'End': selectedIndex.value = props.sampleCount - 1; break
    case 'ArrowUp': adjustSelectedValue(step); break
    case 'ArrowDown': adjustSelectedValue(-step); break
    default: return
  }
  e.preventDefault()
  e.stopPropagation()
}

// Presets
const presets: Record<string, (index: number, total: number) => number> = {
  sine: (i, t) => Math.sin((i / t) * Math.PI * 2),
  square: (i, t) => i < t / 2 ? 1 : -1,
  sawtooth: (i, t) => 2 * (i / t) - 1,
  triangle: (i, t) => {
    const x = i / t
    return x < 0.5 ? 4 * x - 1 : 3 - 4 * x
  },
}

function generatePreset(preset: string): number[] {
  const fn = presets[preset]
  if (!fn) return props.modelValue.samples
  return Array.from({ length: props.sampleCount }, (_, i) => fn(i, props.sampleCount))
}

// Ensure samples array is correct size
const samples = computed(() => {
  if (props.modelValue.samples.length === props.sampleCount) {
    return props.modelValue.samples
  }
  // Resample if needed
  const result: number[] = []
  for (let i = 0; i < props.sampleCount; i++) {
    const srcIndex = (i / props.sampleCount) * props.modelValue.samples.length
    const lowIndex = Math.floor(srcIndex)
    const highIndex = Math.min(lowIndex + 1, props.modelValue.samples.length - 1)
    const t = srcIndex - lowIndex
    result.push(props.modelValue.samples[lowIndex] * (1 - t) + props.modelValue.samples[highIndex] * t)
  }
  return result
})

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

  const padding = 4
  const drawW = w - padding * 2
  const drawH = h - padding * 2
  const centerY = h / 2

  // Grid lines
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 1

  // Center line
  ctx.beginPath()
  ctx.moveTo(padding, centerY)
  ctx.lineTo(w - padding, centerY)
  ctx.stroke()

  // Quarter lines
  ctx.strokeStyle = '#151515'
  for (const y of [0.25, 0.75]) {
    ctx.beginPath()
    ctx.moveTo(padding, padding + y * drawH)
    ctx.lineTo(w - padding, padding + y * drawH)
    ctx.stroke()
  }

  // Draw waveform
  ctx.beginPath()
  const sampleData = samples.value
  for (let i = 0; i < sampleData.length; i++) {
    const x = padding + (i / (sampleData.length - 1)) * drawW
    const y = centerY - sampleData[i] * (drawH / 2)

    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  ctx.strokeStyle = props.accentColor
  ctx.lineWidth = 2
  ctx.stroke()

  // Fill under waveform
  ctx.lineTo(w - padding, centerY)
  ctx.lineTo(padding, centerY)
  ctx.closePath()
  ctx.fillStyle = props.accentColor + '20'
  ctx.fill()

  // Draw sample points when hovering
  if (isDrawing.value) {
    for (let i = 0; i < sampleData.length; i++) {
      const x = padding + (i / (sampleData.length - 1)) * drawW
      const y = centerY - sampleData[i] * (drawH / 2)
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fillStyle = props.accentColor
      ctx.fill()
    }
  }

  // Highlight the keyboard-selected sample while focused (mirrors the other editors' active handle).
  if (focused.value) {
    const i = Math.max(0, Math.min(sampleData.length - 1, selectedIndex.value))
    const x = padding + (i / (sampleData.length - 1)) * drawW
    const y = centerY - sampleData[i] * (drawH / 2)
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fillStyle = props.accentColor
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function xToSampleIndex(x: number): number {
  const padding = 4
  const drawW = props.width - padding * 2
  const norm = (x - padding) / drawW
  return Math.max(0, Math.min(props.sampleCount - 1, Math.round(norm * (props.sampleCount - 1))))
}

function yToSampleValue(y: number): number {
  const centerY = props.height / 2
  const halfHeight = (props.height - 8) / 2
  return Math.max(-1, Math.min(1, (centerY - y) / halfHeight))
}

function updateSample(x: number, y: number) {
  const index = xToSampleIndex(x)
  const value = yToSampleValue(y)

  const newSamples = [...samples.value]

  // Interpolate if we skipped samples
  if (lastDrawX.value !== null) {
    const lastIndex = xToSampleIndex(lastDrawX.value)
    if (lastIndex !== index) {
      const step = index > lastIndex ? 1 : -1
      for (let i = lastIndex; i !== index; i += step) {
        const t = (i - lastIndex) / (index - lastIndex)
        newSamples[i] = newSamples[lastIndex] * (1 - t) + value * t
      }
    }
  }

  newSamples[index] = value
  lastDrawX.value = x

  emit('update:modelValue', { samples: newSamples, preset: 'custom' })
}

function onMouseDown(e: MouseEvent) {
  if (!canvas.value) return
  const rect = canvas.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  isDrawing.value = true
  lastDrawX.value = null
  updateSample(x, y)

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  e.preventDefault()
}

function onMouseMove(e: MouseEvent) {
  if (!isDrawing.value || !canvas.value) return

  const rect = canvas.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top

  updateSample(x, y)
}

function onMouseUp() {
  isDrawing.value = false
  lastDrawX.value = null
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

function selectPreset(preset: string) {
  const newSamples = generatePreset(preset)
  emit('update:modelValue', { samples: newSamples, preset: preset as WaveformData['preset'] })
}

watch([() => props.modelValue, selectedIndex, focused], draw, { deep: true })

onMounted(() => {
  draw()
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
})
</script>

<template>
  <div class="waveform-editor">
    <canvas
      ref="canvas"
      class="waveform-canvas"
      role="application"
      tabindex="0"
      aria-roledescription="waveform"
      aria-label="Waveform"
      :aria-valuetext="valueText"
      @mousedown="onMouseDown"
      @keydown="onKeydown"
      @focus="focused = true"
      @blur="focused = false"
    />
    <span
      class="sr-only"
      aria-live="polite"
    >{{ valueText }}</span>
    <div class="waveform-presets">
      <button
        v-for="preset in ['sine', 'square', 'sawtooth', 'triangle']"
        :key="preset"
        class="preset-btn"
        :class="{ active: modelValue.preset === preset }"
        :aria-label="preset"
        :aria-pressed="modelValue.preset === preset"
        @click="selectPreset(preset)"
      >
        {{ preset.charAt(0).toUpperCase() }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.waveform-editor {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.waveform-canvas {
  border: 1px solid #333;
  border-radius: 4px;
  cursor: crosshair;
}

.waveform-canvas:focus {
  outline: none;
}

.waveform-canvas:focus-visible {
  outline: 2px solid var(--color-primary-400, #22c55e);
  outline-offset: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.waveform-presets {
  display: flex;
  gap: 4px;
}

.preset-btn {
  flex: 1;
  padding: 4px 8px;
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 9px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 2px;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
}

.preset-btn:hover {
  background: #222;
  color: #888;
}

.preset-btn.active {
  background: #22c55e20;
  border-color: #22c55e;
  color: #22c55e;
}
</style>
