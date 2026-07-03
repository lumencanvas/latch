<script setup lang="ts">
/**
 * XYPad — a reusable 2-axis pad control (Phase 3 bullet 2, Tier B). One draggable point over a square
 * area, bound to a normalized `{ x, y }` (both 0..1, y up). Presentational: it emits `update:modelValue`
 * and owns no node state — the host (NodeView's `xy` aggregate, which fans x/y out to two flat controls)
 * keeps the write/undo path. Extracted from the bespoke `xy-pad` node's pad so a future migration to
 * `ui` keeps the same look. Range mapping (min/max) stays outside this widget, as separate controls.
 */
import { ref, computed, onUnmounted } from 'vue'

export interface XYValue {
  x: number // 0..1
  y: number // 0..1 (up)
}

const props = withDefaults(defineProps<{
  modelValue: XYValue
  width?: number
  height?: number
  accentColor?: string
  label?: string
}>(), {
  width: 150,
  height: 120,
  accentColor: '#EC4899',
  label: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: XYValue]
}>()

const padRef = ref<HTMLDivElement | null>(null)

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n))

// Point position as CSS percentages — y is inverted so 1 sits at the top edge.
const pointStyle = computed(() => ({
  left: `${clamp01(props.modelValue.x) * 100}%`,
  top: `${(1 - clamp01(props.modelValue.y)) * 100}%`,
}))

// Screen-reader value text (both axes, since one aria-valuenow can't carry 2D).
const valueText = computed(
  () => `X ${(clamp01(props.modelValue.x) * 100).toFixed(0)}%, Y ${(clamp01(props.modelValue.y) * 100).toFixed(0)}%`
)

// Keyboard (WCAG 2.1.1 / 2.5.7) — a non-pointer path emitting the SAME atomic {x,y} as the drag path.
const STEP = 0.05
const BIG_STEP = 0.2

function emitXY(x: number, y: number): void {
  emit('update:modelValue', { x: clamp01(x), y: clamp01(y) })
}

function onKeydown(e: KeyboardEvent): void {
  const { x, y } = props.modelValue
  const s = e.shiftKey ? BIG_STEP : STEP
  switch (e.key) {
    case 'ArrowRight': emitXY(x + s, y); break
    case 'ArrowLeft': emitXY(x - s, y); break
    case 'ArrowUp': emitXY(x, y + s); break // y is up: ArrowUp increases y
    case 'ArrowDown': emitXY(x, y - s); break
    case 'PageUp': emitXY(x, y + BIG_STEP); break
    case 'PageDown': emitXY(x, y - BIG_STEP); break
    case 'Home': emit('update:modelValue', { x: 0.5, y: 0.5 }); break // center
    case 'End': emit('update:modelValue', { x: 1, y: 1 }); break // top-right
    default: return
  }
  e.preventDefault()
  e.stopPropagation() // keep arrows from reaching the Vue Flow canvas
}

function updateFromEvent(event: MouseEvent): void {
  if (!padRef.value) return
  const rect = padRef.value.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return
  const x = (event.clientX - rect.left) / rect.width
  const y = 1 - (event.clientY - rect.top) / rect.height
  emit('update:modelValue', { x: clamp01(x), y: clamp01(y) })
}

// The move/up listeners exist ONLY for the duration of a drag — attached on mousedown, removed on
// mouseup — so `onMouseMove` needs no is-dragging guard (that flag would be a redundant second stop
// mechanism, hiding a teardown regression behind belt-and-suspenders).
function onMouseMove(event: MouseEvent): void {
  updateFromEvent(event)
}

function onMouseUp(): void {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

function onMouseDown(event: MouseEvent): void {
  updateFromEvent(event)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
})
</script>

<template>
  <div
    ref="padRef"
    class="xy-pad"
    role="application"
    tabindex="0"
    aria-roledescription="2D pad"
    :aria-label="label ? `${label} (X Y pad)` : 'X Y pad'"
    :aria-valuetext="valueText"
    :style="{ width: `${width}px`, height: `${height}px` }"
    @mousedown.stop="onMouseDown"
    @keydown="onKeydown"
  >
    <div class="xy-grid">
      <div class="xy-line-h" />
      <div class="xy-line-v" />
    </div>
    <div
      class="xy-point"
      :style="{ ...pointStyle, background: accentColor }"
    />
    <span
      class="sr-only"
      aria-live="polite"
    >{{ valueText }}</span>
  </div>
</template>

<style scoped>
.xy-pad {
  position: relative;
  background: linear-gradient(135deg, #e9e4f0 0%, #d3cce3 100%);
  border-radius: var(--radius-xs);
  cursor: crosshair;
  user-select: none;
}

/* Focus ring for keyboard users only. */
.xy-pad:focus {
  outline: none;
}

.xy-pad:focus-visible {
  outline: 2px solid var(--color-primary-400, #ec4899);
  outline-offset: 2px;
}

/* Visually hidden but read by screen readers (the live value announcement). */
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

.xy-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.xy-line-h {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(236, 72, 153, 0.3);
}

.xy-line-v {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(236, 72, 153, 0.3);
}

.xy-point {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}
</style>
