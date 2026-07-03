<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  label?: string
  accentColor?: string
  size?: 'small' | 'medium' | 'large'
  showValue?: boolean
  valueFormat?: (v: number) => string
}>(), {
  min: 0,
  max: 1,
  step: 0.01,
  accentColor: '#ff6b35',
  size: 'medium',
  showValue: true,
  valueFormat: (v: number) => v.toFixed(2),
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const isDragging = ref(false)
const dragStartY = ref(0)
const dragStartValue = ref(0)

// Size configuration
const sizeConfig = computed(() => {
  switch (props.size) {
    case 'small': return { canvas: 40, stroke: 2, arcStroke: 2.5, centerRadius: 12 }
    case 'large': return { canvas: 72, stroke: 2.5, arcStroke: 4, centerRadius: 24 }
    default: return { canvas: 56, stroke: 2, arcStroke: 3, centerRadius: 18 }
  }
})

// Normalized value 0-1
const normalizedValue = computed(() => {
  return (props.modelValue - props.min) / (props.max - props.min)
})

// Angle calculation (270 degree sweep, gap at bottom)
const START_ANGLE = Math.PI * 0.75  // 135 degrees (bottom-left)
const END_ANGLE = Math.PI * 2.25    // 405 degrees (bottom-right)
const SWEEP = END_ANGLE - START_ANGLE // 270 degrees

const valueAngle = computed(() => {
  return START_ANGLE + normalizedValue.value * SWEEP
})

// Drawing function
function draw() {
  if (!canvas.value) return
  const ctx = canvas.value.getContext('2d')
  if (!ctx) return

  const size = sizeConfig.value.canvas
  const dpr = window.devicePixelRatio || 1

  // Set canvas size for HiDPI
  canvas.value.width = size * dpr
  canvas.value.height = size * dpr
  canvas.value.style.width = size + 'px'
  canvas.value.style.height = size + 'px'
  ctx.scale(dpr, dpr)

  const cx = size / 2
  const cy = size / 2
  const outerRadius = (size / 2) - 4
  const { stroke, arcStroke, centerRadius } = sizeConfig.value

  ctx.clearRect(0, 0, size, size)

  // Draw outer ring (background track)
  ctx.beginPath()
  ctx.arc(cx, cy, outerRadius, START_ANGLE, END_ANGLE)
  ctx.strokeStyle = '#333'
  ctx.lineWidth = stroke
  ctx.lineCap = 'round'
  ctx.stroke()

  // Draw arc indicator (current value)
  if (normalizedValue.value > 0.001) {
    ctx.beginPath()
    ctx.arc(cx, cy, outerRadius, START_ANGLE, valueAngle.value)
    ctx.strokeStyle = props.accentColor
    ctx.lineWidth = arcStroke
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  // Draw center circle
  ctx.beginPath()
  ctx.arc(cx, cy, centerRadius, 0, Math.PI * 2)
  ctx.fillStyle = '#1a1a1a'
  ctx.fill()
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 1
  ctx.stroke()

  // Draw notch indicator (position line from center)
  const notchLength = centerRadius - 4
  const notchAngle = valueAngle.value
  const notchStartX = cx + Math.cos(notchAngle) * 4
  const notchStartY = cy + Math.sin(notchAngle) * 4
  const notchEndX = cx + Math.cos(notchAngle) * notchLength
  const notchEndY = cy + Math.sin(notchAngle) * notchLength

  ctx.beginPath()
  ctx.moveTo(notchStartX, notchStartY)
  ctx.lineTo(notchEndX, notchEndY)
  ctx.strokeStyle = props.accentColor
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.stroke()

  // Draw center dot
  ctx.beginPath()
  ctx.arc(cx, cy, 2, 0, Math.PI * 2)
  ctx.fillStyle = '#666'
  ctx.fill()
}

// Mouse handlers
function onMouseDown(e: MouseEvent) {
  isDragging.value = true
  dragStartY.value = e.clientY
  dragStartValue.value = props.modelValue

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
  e.preventDefault()
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return

  const deltaY = dragStartY.value - e.clientY
  const sensitivity = (props.max - props.min) / 150 // 150px for full range

  let newValue = dragStartValue.value + deltaY * sensitivity

  // Snap to step
  newValue = Math.round(newValue / props.step) * props.step
  // Clamp to range
  newValue = Math.max(props.min, Math.min(props.max, newValue))

  emit('update:modelValue', newValue)
}

function onMouseUp() {
  isDragging.value = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

// Wheel handler
function onWheel(e: WheelEvent) {
  e.preventDefault()

  const direction = e.deltaY < 0 ? 1 : -1
  const multiplier = e.shiftKey ? 10 : 1

  let newValue = props.modelValue + direction * props.step * multiplier
  newValue = Math.round(newValue / props.step) * props.step
  newValue = Math.max(props.min, Math.min(props.max, newValue))

  emit('update:modelValue', newValue)
}

// Double-click to reset to center
function onDoubleClick() {
  const centerValue = (props.min + props.max) / 2
  emit('update:modelValue', centerValue)
}

// Keyboard (WCAG 2.1.1 / 2.5.7 — a non-pointer path). Same snap+clamp+emit as the wheel/drag path.
function applyDelta(delta: number) {
  let newValue = props.modelValue + delta
  newValue = Math.round(newValue / props.step) * props.step
  newValue = Math.max(props.min, Math.min(props.max, newValue))
  emit('update:modelValue', newValue)
}

function onKeydown(e: KeyboardEvent) {
  const big = props.step * 10 // coarse step, matching the wheel's shiftKey multiplier
  switch (e.key) {
    case 'ArrowUp': case 'ArrowRight': applyDelta(e.shiftKey ? big : props.step); break
    case 'ArrowDown': case 'ArrowLeft': applyDelta(e.shiftKey ? -big : -props.step); break
    case 'PageUp': applyDelta(big); break
    case 'PageDown': applyDelta(-big); break
    case 'Home': emit('update:modelValue', props.min); break // exact bound, no snapping
    case 'End': emit('update:modelValue', props.max); break
    default: return // leave Tab/Enter/Space/app shortcuts alone
  }
  e.preventDefault()
  e.stopPropagation() // keep arrows/Home/End from reaching the Vue Flow canvas
}

// Redraw on value or config changes
watch([() => props.modelValue, () => props.accentColor, () => props.size], draw)

onMounted(() => {
  draw()
})

// Clean up window event listeners if component unmounts while dragging
onUnmounted(() => {
  if (isDragging.value) {
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }
})
</script>

<template>
  <div
    class="rotary-knob"
    :class="[size, { dragging: isDragging }]"
  >
    <span
      v-if="label"
      class="knob-label"
    >{{ label }}</span>
    <canvas
      ref="canvas"
      class="knob-canvas"
      role="slider"
      tabindex="0"
      aria-orientation="vertical"
      :aria-label="label || 'Value'"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuenow="modelValue"
      :aria-valuetext="valueFormat(modelValue)"
      @mousedown="onMouseDown"
      @wheel="onWheel"
      @dblclick="onDoubleClick"
      @keydown="onKeydown"
    />
    <span
      v-if="showValue"
      class="knob-value"
    >{{ valueFormat(modelValue) }}</span>
  </div>
</template>

<style scoped>
.rotary-knob {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  user-select: none;
}

.knob-label {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #666;
  white-space: nowrap;
}

.knob-canvas {
  cursor: grab;
  touch-action: none;
}

/* Focus ring for keyboard users only (not after a mouse grab). */
.knob-canvas:focus {
  outline: none;
}

.knob-canvas:focus-visible {
  outline: 2px solid var(--color-primary-400, #ff6b35);
  outline-offset: 2px;
  border-radius: 50%;
}

.rotary-knob.dragging .knob-canvas {
  cursor: grabbing;
}

.knob-value {
  font-family: var(--font-mono, 'SF Mono', Monaco, monospace);
  font-size: 11px;
  color: #888;
  white-space: nowrap;
}

.rotary-knob.small .knob-label {
  font-size: 8px;
}

.rotary-knob.small .knob-value {
  font-size: 10px;
}

.rotary-knob.large .knob-label {
  font-size: 10px;
}

.rotary-knob.large .knob-value {
  font-size: 12px;
}
</style>
